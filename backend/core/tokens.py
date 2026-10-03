from django.conf import settings
from django.core import signing

VERIFICATION_SALT = "email-verification"


def make_verification_token(user) -> str:
    return signing.dumps({"user_id": user.pk}, salt=VERIFICATION_SALT)


def read_verification_token(token: str) -> dict:
    """Raises signing.BadSignature (expired or tampered) if the token is invalid."""
    return signing.loads(
        token,
        salt=VERIFICATION_SALT,
        max_age=settings.EMAIL_VERIFICATION_TOKEN_MAX_AGE,
    )
