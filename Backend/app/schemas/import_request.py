from datetime import datetime

from pydantic import BaseModel

from app.models.import_request import ImportStatus


class ImportRequestCreate(BaseModel):
    category_id: int
    article_url: str
    article_description: str | None = None


class ImportRequestResponse(BaseModel):
    id: int
    user_id: int
    category_id: int
    article_url: str
    article_description: str | None
    screenshot_path: str | None
    status: ImportStatus
    staff_note: str | None
    created_at: datetime

    # use_enum_values=True : sérialise l'enum en sa valeur ("pending"…)
    # plutôt que "ImportStatus.pending", indispensable pour que le panel
    # puisse filtrer/comparer les statuts côté front.
    model_config = {"from_attributes": True, "use_enum_values": True}


class ImportStatusUpdate(BaseModel):
    status: ImportStatus
    staff_note: str | None = None

    model_config = {"use_enum_values": True}
