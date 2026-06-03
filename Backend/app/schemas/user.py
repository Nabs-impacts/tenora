import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,20}$")


def _validate_username(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if v == "":
        return None
    if not USERNAME_RE.match(v):
        raise ValueError(
            "Pseudo invalide : 3 à 20 caractères, lettres, chiffres, _ ou - uniquement."
        )
    return v


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    phone: str | None = None
    username: str | None = None  # optionnel à l'inscription

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Minimum 8 caractères")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Doit contenir une majuscule")
        if not re.search(r"[0-9]", v):
            raise ValueError("Doit contenir un chiffre")
        return v

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v):
        if not v:
            return v
        # Supprimer les espaces, tirets et points saisis par l'utilisateur
        cleaned = re.sub(r"[\s\-\.]", "", v)
        # Accepte : +22712345678 | 22712345678 | 12345678 (8 chiffres locaux)
        if not re.match(r"^(\+?227)?[0-9]{8}$", cleaned):
            raise ValueError("Numéro invalide. Utilisez +227XXXXXXXX ou 8 chiffres")
        return cleaned

    @field_validator("username")
    @classmethod
    def username_format(cls, v):
        return _validate_username(v)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    phone: str | None
    username: str | None
    is_verified: bool
    is_admin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserSessionResponse(UserResponse):
    access_token: str


class UserUpdate(BaseModel):
    phone: str | None = None
    # Acceptation conditionnelle : la route refusera la mise à jour si déjà défini.
    username: str | None = None

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v):
        if not v:
            return v
        cleaned = re.sub(r"[\s\-\.]", "", v)
        if not re.match(r"^(\+?227)?[0-9]{8}$", cleaned):
            raise ValueError("Numéro invalide. Utilisez +227XXXXXXXX ou 8 chiffres")
        return cleaned

    @field_validator("username")
    @classmethod
    def username_format(cls, v):
        return _validate_username(v)
