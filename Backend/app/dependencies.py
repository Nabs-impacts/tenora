from datetime import datetime

from fastapi import Depends, HTTPException, Request
from loguru import logger
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.session import Session as SessionModel
from app.models.user import User


USER_SESSION_TTL_DAYS = 7
ADMIN_SESSION_TTL_HOURS = 24 * 7


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


def get_current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    session_id = _session_id_from_request(request)

    if not session_id:
        raise HTTPException(status_code=401, detail="Non connecté")

    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.expires_at > datetime.utcnow()
    ).first()

    if not session:
        raise HTTPException(status_code=401, detail="Session expirée")

    user = db.query(User).filter(User.id == session.user_id).first()

    if not user:
        logger.error(f"Session orpheline | user_id={session.user_id} introuvable | ip={request.client.host}")
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")

    return user


def get_admin_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    """
    Vérifie une session admin. Pas de sliding window : à expiration (12h),
    l'admin doit se reconnecter complètement (logout total).
    La durée elle-même est appliquée au moment du login dans routes/auth.py.
    """
    session_id = _session_id_from_request(request)

    if not session_id:
        raise HTTPException(status_code=401, detail="Non connecté")

    session = db.query(SessionModel).filter(
        SessionModel.id == session_id,
        SessionModel.expires_at > datetime.utcnow()
    ).first()

    if not session:
        raise HTTPException(status_code=401, detail="Session expirée")

    user = db.query(User).filter(User.id == session.user_id).first()

    if not user:
        logger.error(f"Session orpheline (admin) | user_id={session.user_id} introuvable | ip={request.client.host}")
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")

    if not user.is_admin:
        logger.warning(f"Accès admin refusé | user_id={user.id} | email={user.email}")
        raise HTTPException(status_code=403, detail="Accès refusé")

    return user


def get_verified_user(
    user: User = Depends(get_current_user)
) -> User:
    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Veuillez vérifier votre email avant de commander"
        )
    return user
