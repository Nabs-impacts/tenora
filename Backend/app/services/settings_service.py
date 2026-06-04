"""
Service d'accès aux paramètres du site (table site_settings).
Usage : get_setting(db, "payment_methods", DEFAULT_PAYMENT_METHODS)
        set_setting(db, "maintenance_mode", True)
"""
from __future__ import annotations

from typing import Any

# ── Valeurs par défaut ────────────────────────────────────────────────────────

DEFAULT_PAYMENT_METHODS: list[dict] = [
    {
        "id": "wave", "name": "Wave", "enabled": True, "icon": "🌊",
        "instructions": (
            "Envoyez {amount} au +227 XX XX XX XX via Wave.\n"
            "Référence obligatoire : commande #{order_id}."
        ),
    },
    {
        "id": "airtel", "name": "Airtel Money", "enabled": True, "icon": "📱",
        "instructions": (
            "Envoyez {amount} au +227 XX XX XX XX via Airtel Money.\n"
            "Référence obligatoire : commande #{order_id}."
        ),
    },
    {
        "id": "mynita", "name": "Mynita", "enabled": True, "icon": "💳",
        "instructions": (
            "Effectuez un paiement de {amount} via Mynita au compte XXXX.\n"
            "Référence : commande #{order_id}.\n"
            "Contactez-nous sur WhatsApp après paiement."
        ),
    },
    {
        "id": "amanata", "name": "Amanata", "enabled": True, "icon": "💰",
        "instructions": (
            "Envoyez {amount} via Amanata au compte XXXX.\n"
            "Référence : commande #{order_id}.\n"
            "Contactez-nous sur WhatsApp après paiement."
        ),
    },
    {
        "id": "usdt", "name": "USDT TRC20", "enabled": True, "icon": "₮",
        "instructions": (
            "Envoyez l'équivalent de {amount} en USDT via le réseau TRC20.\n"
            "Adresse : TXet9CxZ8ihR3Cqu32nbShKABRf2FTUqXxd\n"
            "Mémo : #{order_id}\n\n"
            "⚠ Réseau TRC20 uniquement — toute erreur de réseau est irréversible."
        ),
    },
    {
        "id": "zcash", "name": "ZCash", "enabled": False, "icon": "Ⓩ",
        "instructions": (
            "Envoyez l'équivalent de {amount} en ZCash.\n"
            "Adresse : zXXet9CxZ8ihR3Cqu32nbShKABRf2FTUqXxd\n"
            "Mémo : commande #{order_id}."
        ),
    },
]

DEFAULT_ANNOUNCEMENT = {"enabled": False, "text": ""}


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_all_settings(db: Any) -> dict:
    """
    Charge TOUS les paramètres du site en UNE SEULE requête DB.
    À utiliser à la place de N appels get_setting() successifs.
    """
    from app.models.site_settings import SiteSettings
    rows = db.query(SiteSettings).all()
    return {row.setting_key: row.value for row in rows}


def get_setting(db: Any, key: str, default: Any = None) -> Any:
    from app.models.site_settings import SiteSettings
    row = db.query(SiteSettings).filter(SiteSettings.setting_key == key).first()
    return row.value if row is not None else default


def set_setting(db: Any, key: str, value: Any) -> None:
    from app.models.site_settings import SiteSettings
    row = db.query(SiteSettings).filter(SiteSettings.setting_key == key).first()
    if row:
        row.value = value
    else:
        row = SiteSettings(setting_key=key, value=value)
        db.add(row)
    db.commit()
