import time
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse
from loguru import logger
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.dependencies import get_admin_user
from app.models.product import Category, Product
from app.models.user import User
from app.schemas.schemas_product import CategoryCreate, CategoryResponse, ProductCreate, ProductResponse
from app.services.rate_limiter import limiter
from app.services.storage_service import delete_file as storage_delete
from app.services.storage_service import get_display_url
from app.services.storage_service import upload_file as storage_upload

router = APIRouter()

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_SIZE      = 5 * 1024 * 1024

# ─── Cache produits/catégories (in-process, TTL simple) ──────────────────────
# Les données produits changent peu (admin les modifie) → on cache agressivement.
# Invalidation explicite dans toutes les routes d'écriture admin.
_PCACHE: dict = {}

def _pc_get(key: str):
    e = _PCACHE.get(key)
    return e["v"] if e and time.monotonic() < e["exp"] else None

def _pc_set(key: str, value, ttl: int):
    _PCACHE[key] = {"v": value, "exp": time.monotonic() + ttl}

def invalidate_products_cache():
    """Appeler après toute écriture admin (produit ou catégorie)."""
    _PCACHE.clear()

# TTL courts car mieux vaut une légère staleness que pas de cache du tout.
_TTL_CATS    = 600   # 10 min — catégories bougent très peu
_TTL_SHOP    = 180   # 3 min  — produits (stock, prix) peuvent changer
_TTL_PRODUCT = 60    # 1 min  — page produit individuelle


# ─── Helpers ──────────────────────────────────────────────────────────────────

def get_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def save_image(file: UploadFile, subfolder: str) -> str:
    ext = (file.filename or "").split(".")[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Format non supporté. JPG, PNG ou WEBP uniquement.")
    content = file.file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Image trop lourde (max 5MB)")
    return storage_upload(content, ext, subfolder)


def delete_old_image(image_path: str | None) -> None:
    storage_delete(image_path)


def get_ratings(db: Session, product_ids: list[int]) -> dict[int, tuple[float, int]]:
    """Reviews désactivées — retourne dict vide."""
    return {}


def _fallback_image(product: Product, base_url: str) -> str | None:
    """Image de fallback = image de la catégorie parente (déjà chargée via joinedload)."""
    if product.category and product.category.image_path:
        return get_display_url(product.category.image_path, base_url)
    return None


def _serialize_products(products: list[Product], base_url: str) -> list[ProductResponse]:
    """Sérialise une liste de produits avec leur image de catégorie en fallback."""
    ratings = get_ratings(None, [p.id for p in products])
    return [
        ProductResponse.from_orm_with_url(
            p, base_url, *ratings.get(p.id, (None, 0)),
            fallback_image=_fallback_image(p, base_url),
        )
        for p in products
    ]


# ─── CATEGORIES ──────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryResponse])
def get_categories(request: Request, db: Session = Depends(get_db)):
    cached = _pc_get("categories_flat")
    if cached is not None:
        return cached
    cats = db.query(Category).filter(
        Category.is_active == True,
        Category.parent_id == None
    ).all()
    base   = get_base_url(request)
    result = [CategoryResponse.from_orm_with_url(c, base) for c in cats]
    _pc_set("categories_flat", result, _TTL_CATS)
    return result


@router.get("/categories/tree", response_model=list[dict])
def get_categories_tree(request: Request, db: Session = Depends(get_db)):
    """
    Arbre catégories — fortement mis en cache (10 min).
    Coût : 1 requête DB au lieu de N. Invalidé à chaque écriture admin catégorie.
    """
    base      = get_base_url(request)
    cache_key = f"cats_tree_{base}"
    cached    = _pc_get(cache_key)
    if cached is not None:
        return cached

    all_cats = (
        db.query(Category)
        .filter(Category.is_active == True)
        .order_by(Category.name)
        .all()
    )
    parents: list[Category]               = []
    subs_by_parent: dict[int, list[Category]] = {}
    for cat in all_cats:
        if cat.parent_id is None:
            parents.append(cat)
        else:
            subs_by_parent.setdefault(cat.parent_id, []).append(cat)

    result = [
        {
            "id":           p.id,
            "name":         p.name,
            "slug":         p.slug,
            "service_type": p.service_type,
            "image_url":    get_display_url(p.image_path, base),
            "subcategories": [
                {
                    "id":        s.id,
                    "name":      s.name,
                    "slug":      s.slug,
                    "image_url": get_display_url(s.image_path, base),
                }
                for s in subs_by_parent.get(p.id, [])
            ],
        }
        for p in parents
    ]
    _pc_set(cache_key, result, _TTL_CATS)
    return result


@router.get("/categories/{category_id}/sub", response_model=list[CategoryResponse])
def get_subcategories(category_id: int, request: Request, db: Session = Depends(get_db)):
    subs = db.query(Category).filter(
        Category.parent_id == category_id,
        Category.is_active == True
    ).all()
    base = get_base_url(request)
    return [CategoryResponse.from_orm_with_url(s, base) for s in subs]


@router.get("/categories/{category_id}/products", response_model=list[ProductResponse])
def get_products_by_category(category_id: int, request: Request, db: Session = Depends(get_db)):
    base      = get_base_url(request)
    cache_key = f"cat_prods_{category_id}_{base}"
    cached    = _pc_get(cache_key)
    if cached is not None:
        return cached

    # joinedload évite la 2ème requête get_category_images()
    products = (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(
            Product.category_id == category_id,
            Product.is_active   == True,
            Product.is_ebook    == False,
        )
        .all()
    )
    result = _serialize_products(products, base)
    _pc_set(cache_key, result, _TTL_SHOP)
    return result


@router.post("/categories", response_model=CategoryResponse)
def create_category(data: CategoryCreate, request: Request,
                    db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    cat = Category(**data.model_dump())
    db.add(cat); db.commit(); db.refresh(cat)
    invalidate_products_cache()
    logger.success(f"Catégorie créée | id={cat.id} | name={cat.name}")
    return CategoryResponse.from_orm_with_url(cat, get_base_url(request))


@router.post("/categories/{category_id}/image", response_model=CategoryResponse)
async def upload_category_image(category_id: int, request: Request,
    file: UploadFile = File(...), db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    delete_old_image(cat.image_path)
    cat.image_path = save_image(file, "categories")
    db.commit(); db.refresh(cat)
    invalidate_products_cache()
    return CategoryResponse.from_orm_with_url(cat, get_base_url(request))


@router.delete("/categories/{category_id}/image", response_model=CategoryResponse)
def delete_category_image(category_id: int, request: Request,
    db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    delete_old_image(cat.image_path)
    cat.image_path = None
    db.commit(); db.refresh(cat)
    invalidate_products_cache()
    return CategoryResponse.from_orm_with_url(cat, get_base_url(request))


@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db),
                    admin: User = Depends(get_admin_user)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    delete_old_image(cat.image_path)
    db.delete(cat); db.commit()
    invalidate_products_cache()
    return {"message": "Catégorie supprimée"}


# ─── PRODUCTS ─────────────────────────────────────────────────────────────────

@router.get("/shop", response_model=list[ProductResponse])
def shop_products(
    request: Request,
    db: Session = Depends(get_db),
    category_id: int | None = None,
    q: str | None = None,
    sort: str = "newest",
):
    base = get_base_url(request)

    # On ne cache que les listings sans recherche textuelle (trop de clés uniques sinon)
    cache_key = f"shop_{category_id}_{sort}_{base}" if not q else None
    if cache_key:
        cached = _pc_get(cache_key)
        if cached is not None:
            return cached

    query = db.query(Product).options(joinedload(Product.category)).filter(
        Product.is_active == True,
        Product.is_ebook  == False,
    )

    if category_id is not None:
        sub_ids = [r.id for r in db.query(Category.id).filter(Category.parent_id == category_id).all()]
        all_ids = [category_id] + sub_ids
        query = query.filter(Product.category_id.in_(all_ids))

    if q:
        query = query.filter(Product.name.ilike(f"%{q}%"))

    if sort == "price_asc":
        query = query.order_by(Product.price.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.price.desc())
    else:
        query = query.order_by(Product.created_at.desc())

    products = query.limit(100).all()
    result   = _serialize_products(products, base)

    if sort == "rating":
        result.sort(key=lambda x: (x.avg_rating or 0), reverse=True)

    if cache_key:
        _pc_set(cache_key, result, _TTL_SHOP)
    return result


@router.get("/search", response_model=list[ProductResponse])
def search_products(q: str, request: Request, db: Session = Depends(get_db)):
    # Pas de cache pour la recherche (clés trop variables)
    products = (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(
            Product.name.ilike(f"%{q}%"),
            Product.is_active == True,
            Product.is_ebook  == False,
        )
        .limit(20)
        .all()
    )
    return _serialize_products(products, get_base_url(request))


@router.get("/", response_model=list[ProductResponse])
def get_products(request: Request, db: Session = Depends(get_db)):
    base      = get_base_url(request)
    cache_key = f"all_products_{base}"
    cached    = _pc_get(cache_key)
    if cached is not None:
        return cached
    products = (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(Product.is_active == True, Product.is_ebook == False)
        .all()
    )
    result = _serialize_products(products, base)
    _pc_set(cache_key, result, _TTL_SHOP)
    return result


@router.get("/by-ids", response_model=list[ProductResponse])
def get_products_by_ids(ids: str, request: Request, db: Session = Depends(get_db)):
    """
    Récupère plusieurs produits actifs en une seule requête.
    Utilisé par la section « Hot Now » de la page d'accueil.
    """
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Liste d'IDs invalide.")
    if not id_list:
        return []
    id_list = id_list[:50]

    base      = get_base_url(request)
    cache_key = f"by_ids_{'_'.join(map(str, sorted(id_list)))}_{base}"
    cached    = _pc_get(cache_key)
    if cached is not None:
        return cached

    products = (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(Product.id.in_(id_list), Product.is_active == True)
        .all()
    )
    result = _serialize_products(products, base)
    _pc_set(cache_key, result, _TTL_SHOP)
    return result


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, request: Request, db: Session = Depends(get_db)):
    base      = get_base_url(request)
    cache_key = f"product_{product_id}_{base}"
    cached    = _pc_get(cache_key)
    if cached is not None:
        return cached

    p = (
        db.query(Product)
        .options(joinedload(Product.category))
        .filter(Product.id == product_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    result = ProductResponse.from_orm_with_url(
        p, base, fallback_image=_fallback_image(p, base)
    )
    _pc_set(cache_key, result, _TTL_PRODUCT)
    return result


@router.get("/{product_id}/whatsapp")
@limiter.limit("20/minute")
def whatsapp_redirect(product_id: int, request: Request, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id, Product.is_active == True).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    if not p.whatsapp_redirect:
        raise HTTPException(status_code=400, detail="Ce produit ne supporte pas la redirection WhatsApp")

    price_str = f"{int(p.final_price):,} FCFA".replace(",", " ")
    lines = [
        f"Bonjour {settings.APP_NAME} !",
        "",
        f"Je suis interesse(e) par *{p.name}* a {price_str}.",
    ]
    custom_fields = []
    if p.required_fields:
        for field in p.required_fields:
            value = request.query_params.get(field.get("key", ""), "").strip()
            if value:
                custom_fields.append(f"- {field.get('label', field.get('key'))}: {value}")
    if custom_fields:
        lines.append("")
        lines.append("*Details de ma commande :*")
        lines.extend(custom_fields)
    lines += [
        "",
        "Pouvez-vous me confirmer la disponibilite et le delai de livraison ?",
        "",
        "Merci !",
    ]
    message = quote("\n".join(lines), safe="")
    from app.services.settings_service import get_setting
    raw_number = get_setting(db, "whatsapp_number", None) or settings.WHATSAPP_NUMBER or ""
    number = raw_number.strip().replace("+", "").replace(" ", "")
    if not number:
        raise HTTPException(status_code=500, detail="Numéro WhatsApp non configuré.")
    return RedirectResponse(f"https://wa.me/{number}?text={message}", status_code=302)


@router.post("/", response_model=ProductResponse)
def create_product(data: ProductCreate, request: Request,
                   db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    fields = [f.model_dump() for f in data.required_fields] if data.required_fields else None
    p = Product(
        category_id=data.category_id, name=data.name,
        description=data.description, price=data.price,
        discount_percent=data.discount_percent,
        stock=data.stock, required_fields=fields,
        whatsapp_redirect=data.whatsapp_redirect
    )
    db.add(p); db.commit(); db.refresh(p)
    invalidate_products_cache()
    logger.success(f"Produit créé | id={p.id} | name={p.name}")
    base = get_base_url(request)
    return ProductResponse.from_orm_with_url(p, base)


@router.post("/{product_id}/image", response_model=ProductResponse)
async def upload_product_image(product_id: int, request: Request,
    file: UploadFile = File(...), db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    delete_old_image(p.image_path)
    p.image_path = save_image(file, "products")
    db.commit(); db.refresh(p)
    invalidate_products_cache()
    return ProductResponse.from_orm_with_url(p, get_base_url(request))


@router.delete("/{product_id}/image", response_model=ProductResponse)
def delete_product_image(product_id: int, request: Request,
    db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    delete_old_image(p.image_path)
    p.image_path = None
    db.commit(); db.refresh(p)
    invalidate_products_cache()
    return ProductResponse.from_orm_with_url(p, get_base_url(request))


@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db),
                   admin: User = Depends(get_admin_user)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    delete_old_image(p.image_path)
    db.delete(p); db.commit()
    invalidate_products_cache()
    return {"message": "Produit supprimé"}
