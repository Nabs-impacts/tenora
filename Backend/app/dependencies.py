from datetime import datetime

from fastapi import Depends, HTTPException, Request
from loguru import logger
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.session import Session as SessionModel
from app.models.user import User


USER_SESSION_TTL_DAYS = 7
ADMIN_SESSION_TTL_HOURS = 5  # session admin courte — pas de sliding window


def _session_id_from_request(request: Request) -> str | None:
    session_id = request.cookies.get("session_id")
    if session_id:
        return session_id
    token = request.query_params.get("access_token")
    if token:
        return token
    authorization = request.headers.get("Authorization", "")
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() == "bearer" and value.strip():
        return value.strip()
    return None


def _resolve_user_from_session(session_id: str | None, db: Session) -> User | None:
    """
    Résout session → user en UN SEUL JOIN (au lieu de 2 requêtes séparées).
    Retourne None si session absente / expirée / user introuvable.
    """
    if not session_id:
        return None
    result = (
        db.query(User)
        .join(SessionModel, SessionModel.user_id == User.id)
        .filter(
            SessionModel.id == session_id,
            SessionModel.expires_at > datetime.utcnow(),
        )
        .first()
    )
    return result


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    session_id = _session_id_from_request(request)
    user = _resolve_user_from_session(session_id, db)
    if not session_id:
        raise HTTPException(status_code=401, detail="Non connecté")
    if user is None:
        raise HTTPException(status_code=401, detail="Session expirée")
    return user


def get_admin_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    """
    Vérifie une session admin en un seul JOIN session+user.
    Pas de sliding window : à expiration, l'admin doit se reconnecter.
    """
    session_id = _session_id_from_request(request)
    if not session_id:
        raise HTTPException(status_code=401, detail="Non connecté")
    user = _resolve_user_from_session(session_id, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Session expirée")
    if not user.is_admin:
        logger.warning(f"Accès admin refusé | user_id={user.id} | email={user.email}")
        raise HTTPException(status_code=403, detail="Accès refusé")
    return user


def get_verified_user(
    user: User = Depends(get_current_user),
) -> User:
    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Veuillez vérifier votre email avant de commander",
        )
    return user
