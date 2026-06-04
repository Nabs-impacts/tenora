from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from loguru import logger
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.otp import OTPCode
from app.models.session import Session as SessionModel

scheduler = BackgroundScheduler()


def clean_expired_sessions():
    db: Session = SessionLocal()
    try:
        deleted = db.query(SessionModel).filter(
            SessionModel.expires_at < datetime.utcnow()
        ).delete(synchronize_session=False)
        db.commit()
        if deleted > 0:
            logger.info(f"Nettoyage sessions | {deleted} sessions expirées supprimées")
    except Exception as e:
        logger.error(f"Erreur nettoyage sessions | {e}")
        db.rollback()
    finally:
        db.close()


def clean_expired_otps():
    db: Session = SessionLocal()
    try:
        deleted = db.query(OTPCode).filter(
            OTPCode.expires_at < datetime.utcnow()
        ).delete(synchronize_session=False)
        db.commit()
        if deleted > 0:
            logger.info(f"Nettoyage OTP | {deleted} codes expirés supprimés")
    except Exception as e:
        logger.error(f"Erreur nettoyage OTP | {e}")
        db.rollback()
    finally:
        db.close()


def generate_report():
    db: Session = SessionLocal()
    try:
        from app.models.import_request import ImportRequest
        from app.models.order import Order, OrderStatus
        from app.models.user import User

        total_users          = db.query(User).count()
        new_orders           = db.query(Order).filter(Order.status == OrderStatus.pending).count()
        processing_orders    = db.query(Order).filter(Order.status == OrderStatus.processing).count()
        completed_orders     = db.query(Order).filter(Order.status == OrderStatus.completed).count()
        pending_imports      = db.query(ImportRequest).filter(ImportRequest.status == "pending").count()

        logger.info(
            f"📊 RAPPORT 2H | "
            f"users={total_users} | "
            f"commandes_pending={new_orders} | "
            f"commandes_processing={processing_orders} | "
            f"commandes_completed={completed_orders} | "
            f"imports_pending={pending_imports}"
        )
    except Exception as e:
        logger.error(f"Erreur génération rapport | {e}")
    finally:
        db.close()


def start_scheduler():
    scheduler.add_job(clean_expired_sessions, "interval", hours=1,   id="clean_sessions")
    scheduler.add_job(clean_expired_otps,     "interval", hours=1,   id="clean_otps")
    scheduler.add_job(generate_report,        "interval", hours=2,   id="report")
    scheduler.start()
    logger.success("Scheduler démarré | nettoyage sessions/OTP toutes les heures | rapport toutes les 2h")
