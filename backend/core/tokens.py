from django.conf import settings
from django.core import signing

VERIFICATION_SALT = "email-verification"
PASSWORD_RESET_SALT = "password-reset"


def _make_token(payload: dict, salt: str) -> str:
    return signing.dumps(payload, salt=salt)


def _read_token(token: str, salt: str, max_age: int) -> dict:
    """Raises signing.BadSignature (expired, tampered, or wrong salt) if invalid."""
    return signing.loads(token, salt=salt, max_age=max_age)


def make_verification_token(user) -> str:
    return _make_token({"user_id": user.pk}, VERIFICATION_SALT)


def read_verification_token(token: str) -> dict:
    return _read_token(token, VERIFICATION_SALT, settings.EMAIL_VERIFICATION_TOKEN_MAX_AGE)


def make_password_reset_token(user) -> str:
    return _make_token({"user_id": user.pk}, PASSWORD_RESET_SALT)


def read_password_reset_token(token: str) -> dict:
    return _read_token(token, PASSWORD_RESET_SALT, settings.PASSWORD_RESET_TOKEN_MAX_AGE)
