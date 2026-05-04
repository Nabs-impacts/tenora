import os
import sys
import time
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
from slowapi.errors import RateLimitExceeded
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.routes.auth import router as auth_router
from app.routes.ebooks import router as ebooks_router
from app.routes.imports import router as imports_router
from app.routes.orders import router as orders_router
from app.routes.panel import router as panel_router
from app.routes.order_claim import router as claim_router
from app.routes.products import router as products_router
from app.routes.coupons import router as coupons_router
from app.routes.site import router as site_router
from app.services.rate_limiter import limiter
from app.services.scheduler import start_scheduler

# ─── Logging ──────────────────────────────────────────────────────────────────
logger.remove()
logger.add(sys.stdout, level="DEBUG" if settings.DEBUG else "INFO")
if settings.DEBUG:
    logger.add("logs/api.log", rotation="2 hours", retention="7 days", level="INFO")

# ─── Sentry (prod uniquement) ─────────────────────────────────────────────────
if not settings.DEBUG and settings.SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            release=f"{settings.APP_NAME}@{settings.APP_VERSION}",
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            profiles_sample_rate=settings.SENTRY_PROFILES_SAMPLE_RATE,
            send_default_pii=False,
            integrations=[StarletteIntegration(), FastApiIntegration()],
        )
        logger.info("Sentry initialisé")
    except Exception as e:
        logger.warning(f"Sentry init failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    logger.info(f"{settings.APP_NAME} v{settings.APP_VERSION} démarré | env={settings.ENVIRONMENT}")
    yield
    logger.info("Application arrêtée")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.state.limiter = limiter


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": f"Trop de requêtes. Limite : {exc.detail}"},
    )


app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)


class CachedStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=86400, immutable"
        return response


app.mount("/uploads", CachedStaticFiles(directory=settings.UPLOAD_FOLDER), name="uploads")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception | {request.method} {request.url.path}")
    if settings.DEBUG:
        return JSONResponse(status_code=500, content={"detail": str(exc), "type": type(exc).__name__})
    return JSONResponse(
        status_code=500,
        content={"detail": "Une erreur interne est survenue. Veuillez réessayer plus tard."},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    if settings.DEBUG:
        return JSONResponse(status_code=422, content={"detail": exc.errors()})
    errors = exc.errors()
    messages = []
    for e in errors:
        loc = " → ".join(str(l) for l in e.get("loc", []) if l != "body")
        msg = e.get("msg", "Valeur invalide")
        messages.append(f"{loc} : {msg}" if loc else msg)
    detail = " | ".join(messages) if messages else "Données invalides. Vérifiez votre saisie."
    logger.warning(f"Validation error | {request.method} {request.url.path} | {exc.errors()}")
    return JSONResponse(status_code=422, content={"detail": detail})


@app.middleware("http")
async def security_headers(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)

    # Ignorer les preflight OPTIONS : pas de headers sécurité ni de log perf
    # (4.4 — ne pas polluer les logs avec les requêtes OPTIONS du navigateur)
    if request.method == "OPTIONS":
        return response

    process_time = time.time() - start_time
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    response.headers["X-Process-Time"] = f"{process_time:.4f}"
    if not settings.DEBUG:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if process_time > 1.0:
        logger.warning(f"SLOW {request.method} {request.url.path} | {process_time:.2f}s")
    return response


app.add_middleware(GZipMiddleware, minimum_size=500, compresslevel=6)

app.add_middleware(SessionMiddleware, secret_key=settings.SECRET_KEY, https_only=not settings.DEBUG, same_site="lax")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/robots.txt", include_in_schema=False)
async def robots():
    path = os.path.join(os.path.dirname(__file__), "..", "static", "robots.txt")
    if os.path.exists(path):
        return FileResponse(path, media_type="text/plain")
    return FileResponse("robots.txt", media_type="text/plain")


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap():
    path = os.path.join(os.path.dirname(__file__), "..", "static", "sitemap.xml")
    if os.path.exists(path):
        return FileResponse(path, media_type="application/xml")
    return FileResponse("sitemap.xml", media_type="application/xml")


@app.get("/health", include_in_schema=False)
async def health_check():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/health/db", include_in_schema=False)
async def health_db():
    from sqlalchemy import text
    from app.database import SessionLocal
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "ok", "db": "up"}
    except Exception as e:
        logger.error(f"DB health check failed: {e}")
        return JSONResponse(status_code=503, content={"status": "error", "db": "down"})


app.include_router(auth_router,     prefix="/auth",     tags=["Auth"])
app.include_router(products_router, prefix="/products", tags=["Products"])
app.include_router(orders_router,   prefix="/orders",   tags=["Orders"])
app.include_router(imports_router,  prefix="/imports",  tags=["Import/Export"])
app.include_router(ebooks_router,   prefix="/ebooks",   tags=["Ebooks"])
app.include_router(site_router,                         tags=["Site"])
app.include_router(panel_router,                        tags=["Admin Panel"])
app.include_router(claim_router,    prefix="/panel",    tags=["panel"])
app.include_router(coupons_router, prefix="/coupons",   tags=["Coupons"])


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
