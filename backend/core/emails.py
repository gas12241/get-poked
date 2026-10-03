from django.conf import settings
from django.core.mail import send_mail

from .tokens import make_password_reset_token, make_verification_token


def send_verification_email(user) -> None:
    token = make_verification_token(user)
    link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    send_mail(
        subject="Verify your Get Poked account",
        message=f"Click to verify your account: {link}",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )


def send_password_reset_email(user) -> None:
    token = make_password_reset_token(user)
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    send_mail(
        subject="Reset your Get Poked password",
        message=f"Click to reset your password: {link}",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
    )
