import random
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from loguru import logger
from passlib.context import CryptContext
from sqlalchemy import func as sql_func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, _session_id_from_request
from app.models.otp import OTPCode
from app.models.session import Session as SessionModel
from app.models.user import User
from app.schemas.user import UserLogin, UserRegister, UserResponse, UserSessionResponse, UserUpdate
from app.services.mail_service import send_otp_email
from app.services.rate_limiter import limiter

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
is_dev = settings.ENVIRONMENT == "dev"

# ── Helpers ───────────────────────────────────────────────────────────────────

def _send_otp(user: User, db: Session) -> None:
    code = str(secrets.randbelow(900000) + 100000)
    code_hash = pwd_context.hash(code)

    db.query(OTPCode).filter(
        OTPCode.user_id == user.id,
        OTPCode.used    == False
    ).update({"used": True})

    otp = OTPCode(
        user_id    = user.id,
        code_hash  = code_hash,
        expires_at = datetime.utcnow() + timedelta(minutes=10),
    )
    db.add(otp)
    db.commit()

    send_otp_email(user.email, code)


def _purge_expired_sessions(db: Session) -> None:
    db.query(SessionModel).filter(
        SessionModel.expires_at <= datetime.utcnow()
    ).delete(synchronize_session=False)
    db.commit()


def _username_taken(db: Session, username: str) -> bool:
    """Vérifie l'unicité du pseudo en case-insensitive."""
    return db.query(User.id).filter(
        sql_func.lower(User.username) == username.lower()
    ).first() is not None


def _set_session_cookie(response: Response, session_id: str, max_age: int) -> None:
    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        secure=not is_dev,
        samesite="lax" if is_dev else "none",
        max_age=max_age,
        path="/",
    )


def _user_session_payload(user: User, session_id: str) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "phone": user.phone,
        "username": user.username,
        "is_verified": user.is_verified,
        "is_admin": user.is_admin,
        "created_at": user.created_at,
        "access_token": session_id,
    }


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=UserSessionResponse)
@limiter.limit("5/minute")
def register(data: UserRegister, response: Response, request: Request, db: Session = Depends(get_db)):
    logger.info(f"Tentative d'inscription | email={data.email} | ip={request.client.host}")

    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        logger.warning(f"Inscription échouée | email déjà utilisé | email={data.email}")
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")

    if data.username and _username_taken(db, data.username):
        raise HTTPException(status_code=400, detail="Ce pseudo est déjà pris.")

    hashed = pwd_context.hash(data.password)
    user   = User(
        email         = data.email,
        password_hash = hashed,
        phone         = data.phone,
        username      = data.username,
        is_verified   = False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    try:
        _send_otp(user, db)
    except Exception as e:
        logger.error(f"Échec envoi OTP à l'inscription | user_id={user.id} | {e}")

    session_duration = timedelta(days=7)
    cookie_max_age   = 7 * 24 * 60 * 60
    session_id = secrets.token_hex(32)
    session = SessionModel(
        id         = session_id,
        user_id    = user.id,
        expires_at = datetime.utcnow() + session_duration,
    )
    db.add(session)
    db.commit()

    _set_session_cookie(response, session_id, cookie_max_age)

    logger.success(f"Inscription réussie + session créée | email={data.email} | id={user.id}")
    return _user_session_payload(user, session_id)


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=UserSessionResponse)
@limiter.limit("10/minute")
def login(data: UserLogin, response: Response, request: Request, db: Session = Depends(get_db)):
    logger.info(f"Tentative de connexion | email={data.email} | ip={request.client.host}")

    user = db.query(User).filter(User.email == data.email).first()
    if not user or not pwd_context.verify(data.password, user.password_hash):
        logger.warning(f"Connexion échouée | email={data.email} | ip={request.client.host}")
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")

    try:
        _purge_expired_sessions(db)
    except Exception:
        pass

    if user.is_admin:
        session_duration = timedelta(days=7)
        cookie_max_age   = 7 * 24 * 60 * 60
    else:
        session_duration = timedelta(days=7)
        cookie_max_age   = 7 * 24 * 60 * 60

    session_id = secrets.token_hex(32)
    session    = SessionModel(
        id         = session_id,
        user_id    = user.id,
        expires_at = datetime.utcnow() + session_duration,
    )
    db.add(session)
    db.commit()

    _set_session_cookie(response, session_id, cookie_max_age)

    logger.success(f"Connexion réussie | email={data.email} | id={user.id}")
    return _user_session_payload(user, session_id)


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    session_id = _session_id_from_request(request)
    if session_id:
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if session:
            logger.info(f"Déconnexion | user_id={session.user_id} | ip={request.client.host}")
        db.query(SessionModel).filter(SessionModel.id == session_id).delete()
        db.commit()
    else:
        logger.warning(f"Déconnexion sans session active | ip={request.client.host}")

    response.delete_cookie(
        key      = "session_id",
        secure   = not is_dev,                      # Doit correspondre aux flags du set_cookie
        samesite = "lax" if is_dev else "none",
        httponly = True,
        path     = "/",
    )
    return {"message": "Déconnecté"}


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserSessionResponse)
def me(request: Request, response: Response, db: Session = Depends(get_db)):
    session_id = _session_id_from_request(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Non connecté.")

    session = db.query(SessionModel).filter(
        SessionModel.id         == session_id,
        SessionModel.expires_at >  datetime.utcnow(),
    ).first()
    if not session:
        raise HTTPException(status_code=401, detail="Session expirée, veuillez vous reconnecter.")

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        logger.error(f"Session orpheline détectée | session_id={session_id} | user_id={session.user_id}")
        db.query(SessionModel).filter(SessionModel.id == session_id).delete()
        db.commit()
        raise HTTPException(status_code=401, detail="Compte introuvable. Veuillez vous reconnecter.")

    cookie_max_age = 7 * 24 * 60 * 60
    session.expires_at = datetime.utcnow() + timedelta(seconds=cookie_max_age)
    db.commit()
    _set_session_cookie(response, session_id, cookie_max_age)

    logger.info(f"Accès /me | user_id={user.id} | email={user.email}")
    return _user_session_payload(user, session_id)


# ── Verify email ──────────────────────────────────────────────────────────────

@router.post("/verify-email")
@limiter.limit("5/minute")
def verify_email(
    request: Request,
    code: str = Query(...),
    db: Session   = Depends(get_db),
    user: User    = Depends(get_current_user),
):
    if user.is_verified:
        return {"message": "Email déjà vérifié."}

    otp = db.query(OTPCode).filter(
        OTPCode.user_id    == user.id,
        OTPCode.used       == False,
        OTPCode.expires_at >  datetime.utcnow(),
    ).first()

    if not otp:
        logger.warning(f"Vérification OTP échouée | code expiré ou introuvable | user_id={user.id}")
        raise HTTPException(status_code=400, detail="Code expiré ou invalide. Demandez un nouveau code.")

    if not pwd_context.verify(code, otp.code_hash):
        logger.warning(f"Vérification OTP échouée | mauvais code | user_id={user.id}")
        raise HTTPException(status_code=400, detail="Code incorrect.")

    otp.used        = True
    user.is_verified = True
    db.commit()

    logger.success(f"Email vérifié | user_id={user.id} | email={user.email}")
    return {"message": "Email vérifié avec succès."}


# ── Resend OTP ────────────────────────────────────────────────────────────────

@router.post("/resend-otp")
@limiter.limit("3/minute")
def resend_otp(
    request: Request,
    db: Session = Depends(get_db),
    user: User  = Depends(get_current_user),
):
    if user.is_verified:
        return {"message": "Email déjà vérifié."}

    try:
        _send_otp(user, db)
    except Exception as e:
        logger.error(f"Échec renvoi OTP | user_id={user.id} | {e}")
        raise HTTPException(status_code=500, detail="Impossible d'envoyer le code. Réessayez dans quelques instants.")

    logger.info(f"OTP renvoyé | user_id={user.id} | email={user.email}")
    return {"message": "Code renvoyé, vérifiez votre boîte mail."}


# ── Update profile ────────────────────────────────────────────────────────────

@router.put("/profile", response_model=UserResponse)
def update_profile(
    data: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user: User  = Depends(get_current_user),
):
    changed = False

    if data.phone is not None:
        user.phone = data.phone
        changed = True

    if data.username is not None:
        if user.username:
            raise HTTPException(
                status_code=400,
                detail="Votre pseudo est déjà défini et ne peut plus être modifié.",
            )
        if _username_taken(db, data.username):
            raise HTTPException(status_code=400, detail="Ce pseudo est déjà pris.")
        user.username = data.username
        changed = True
        logger.info(f"Pseudo défini | user_id={user.id} | username={data.username}")

    if changed:
        db.commit()
        db.refresh(user)
        logger.info(f"Profil mis à jour | user_id={user.id}")

    return user
