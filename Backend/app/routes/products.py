from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse
from loguru import logger
from sqlalchemy.orm import Session

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


def get_category_images(db: Session, cat_ids: set[int], base_url: str) -> dict[int, str | None]:
    cats = db.query(Category).filter(Category.id.in_(cat_ids)).all()
    return {
        c.id: get_display_url(c.image_path, base_url)
        for c in cats
    }


# ─── CATEGORIES ──────────────────────────────

@router.get("/categories", response_model=list[CategoryResponse])
def get_categories(request: Request, db: Session = Depends(get_db)):
    cats = db.query(Category).filter(
        Category.is_active == True,
        Category.parent_id == None
    ).all()
    base = get_base_url(request)
    return [CategoryResponse.from_orm_with_url(c, base) for c in cats]


@router.get("/categories/tree", response_model=list[dict])
def get_categories_tree(request: Request, db: Session = Depends(get_db)):
    base = get_base_url(request)

    all_cats = (
        db.query(Category)
        .filter(Category.is_active == True)
        .order_by(Category.name)
        .all()
    )

    parents: list[Category] = []
    subs_by_parent: dict[int, list[Category]] = {}

    for cat in all_cats:
        if cat.parent_id is None:
            parents.append(cat)
        else:
            subs_by_parent.setdefault(cat.parent_id, []).append(cat)

    return [
        {
            "id":           p.id,
            "name":         p.name,
            "slug":         p.slug,
            "service_type": p.service_type,
            "image_url":    get_display_url(p.image_path, base),
            "subcategories": [
                {
                    "id":       s.id,
                    "name":     s.name,
                    "slug":     s.slug,
                    "image_url": get_display_url(s.image_path, base),
                }
                for s in subs_by_parent.get(p.id, [])
            ],
        }
        for p in parents
    ]


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
    # ✅ FIX — exclure les ebooks de la boutique principale
    products = db.query(Product).filter(
        Product.category_id == category_id,
        Product.is_active == True,
        Product.is_ebook == False,  # noqa: E712
    ).all()
    base       = get_base_url(request)
    cat_images = get_category_images(db, {p.category_id for p in products}, base)
    ratings    = get_ratings(db, [p.id for p in products])
    return [
        ProductResponse.from_orm_with_url(
            p, base, *ratings.get(p.id, (None, 0)),
            fallback_image=cat_images.get(p.category_id)
        )
        for p in products
    ]


@router.post("/categories", response_model=CategoryResponse)
def create_category(data: CategoryCreate, request: Request,
                    db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    cat = Category(**data.model_dump())
    db.add(cat); db.commit(); db.refresh(cat)
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
    return CategoryResponse.from_orm_with_url(cat, get_base_url(request))


@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db),
                    admin: User = Depends(get_admin_user)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")
    delete_old_image(cat.image_path)
    db.delete(cat); db.commit()
    return {"message": "Catégorie supprimée"}


# ─── PRODUCTS ────────────────────────────────

@router.get("/shop", response_model=list[ProductResponse])
def shop_products(
    request: Request,
    db: Session = Depends(get_db),
    category_id: int | None = None,
    q: str | None = None,
    sort: str = "newest"
):
    # ✅ FIX — exclure les ebooks de la boutique principale
    query = db.query(Product).filter(
        Product.is_active == True,
        Product.is_ebook == False,  # noqa: E712
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

    products   = query.limit(100).all()
    base       = get_base_url(request)
    cat_images = get_category_images(db, {p.category_id for p in products}, base)
    ratings    = get_ratings(db, [p.id for p in products])

    result = [
        ProductResponse.from_orm_with_url(
            p, base, *ratings.get(p.id, (None, 0)),
            fallback_image=cat_images.get(p.category_id)
        )
        for p in products
    ]

    if sort == "rating":
        result.sort(key=lambda x: (x.avg_rating or 0), reverse=True)

    return result


@router.get("/search", response_model=list[ProductResponse])
def search_products(q: str, request: Request, db: Session = Depends(get_db)):
    # ✅ FIX — exclure les ebooks de la recherche boutique principale
    products = db.query(Product).filter(
        Product.name.ilike(f"%{q}%"),
        Product.is_active == True,
        Product.is_ebook == False,  # noqa: E712
    ).limit(20).all()
    base       = get_base_url(request)
    cat_images = get_category_images(db, {p.category_id for p in products}, base)
    ratings    = get_ratings(db, [p.id for p in products])
    return [
        ProductResponse.from_orm_with_url(
            p, base, *ratings.get(p.id, (None, 0)),
            fallback_image=cat_images.get(p.category_id)
        )
        for p in products
    ]


@router.get("/", response_model=list[ProductResponse])
def get_products(request: Request, db: Session = Depends(get_db)):
    # ✅ FIX — exclure les ebooks du listing général
    products = db.query(Product).filter(
        Product.is_active == True,
        Product.is_ebook == False,  # noqa: E712
    ).all()
    base       = get_base_url(request)
    cat_images = get_category_images(db, {p.category_id for p in products}, base)
    ratings    = get_ratings(db, [p.id for p in products])
    return [
        ProductResponse.from_orm_with_url(
            p, base, *ratings.get(p.id, (None, 0)),
            fallback_image=cat_images.get(p.category_id)
        )
        for p in products
    ]


@router.get("/by-ids", response_model=list[ProductResponse])
def get_products_by_ids(
    ids: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Récupère plusieurs produits actifs en une requête, à partir d'une liste
    d'IDs séparés par des virgules. Utilisé notamment par la section
    "Hot Now" de la page d'accueil (produits mis en avant via le panel admin).
    Les ebooks peuvent apparaître ici s'ils sont explicitement mis en avant
    par l'admin — ce comportement est intentionnel.
    """
    try:
        id_list = [int(x) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="Liste d'IDs invalide.")
    if not id_list:
        return []
    id_list = id_list[:50]

    products = (
        db.query(Product)
          .filter(Product.id.in_(id_list), Product.is_active == True)
          .all()
    )
    base       = get_base_url(request)
    cat_images = get_category_images(db, {p.category_id for p in products}, base)
    ratings    = get_ratings(db, [p.id for p in products])
    return [
        ProductResponse.from_orm_with_url(
            p, base, *ratings.get(p.id, (None, 0)),
            fallback_image=cat_images.get(p.category_id)
        )
        for p in products
    ]


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, request: Request, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    base       = get_base_url(request)
    cat_images = get_category_images(db, {p.category_id}, base)
    ratings    = get_ratings(db, [p.id])
    return ProductResponse.from_orm_with_url(
        p, base, *ratings.get(p.id, (None, 0)),
        fallback_image=cat_images.get(p.category_id)
    )


@router.get("/{product_id}/whatsapp")
@limiter.limit("20/minute")
def whatsapp_redirect(product_id: int, request: Request, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id, Product.is_active == True).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    if not p.whatsapp_redirect:
        raise HTTPException(status_code=400, detail="Ce produit ne supporte pas la redirection WhatsApp")

    # ── Ligne d'accroche ──────────────────────────────────────────────────────
    price_str = f"{int(p.final_price):,} FCFA".replace(",", " ")
    lines = [
        f"Bonjour {settings.APP_NAME} !",
        "",
        f"Je suis interesse(e) par *{p.name}* a {price_str}.",
    ]

    # ── Champs personnalisés (ex: taille, quantité…) ──────────────────────────
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

    # ── Encodage strict : safe='' pour encoder aussi les slashes ─────────────
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
    logger.success(f"Produit créé | id={p.id} | name={p.name}")
    base       = get_base_url(request)
    cat_images = get_category_images(db, {p.category_id}, base)
    return ProductResponse.from_orm_with_url(
        p, base, fallback_image=cat_images.get(p.category_id)
    )


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
    base       = get_base_url(request)
    cat_images = get_category_images(db, {p.category_id}, base)
    return ProductResponse.from_orm_with_url(
        p, base, fallback_image=cat_images.get(p.category_id)
    )


@router.delete("/{product_id}/image", response_model=ProductResponse)
def delete_product_image(product_id: int, request: Request,
    db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    delete_old_image(p.image_path)
    p.image_path = None
    db.commit(); db.refresh(p)
    base       = get_base_url(request)
    cat_images = get_category_images(db, {p.category_id}, base)
    return ProductResponse.from_orm_with_url(
        p, base, fallback_image=cat_images.get(p.category_id)
    )


@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db),
                   admin: User = Depends(get_admin_user)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Produit introuvable")
    delete_old_image(p.image_path)
    db.delete(p); db.commit()
    return {"message": "Produit supprimé"}
