from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .emails import send_password_reset_email, send_verification_email
from .serializers import (
    ChangePasswordSerializer,
    CookieTokenRefreshSerializer,
    EmailTokenObtainPairSerializer,
    PasswordResetConfirmSerializer,
    RegisterSerializer,
    UserSerializer,
)
from .tokens import read_password_reset_token, read_verification_token

User = get_user_model()


def _set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        key=settings.REFRESH_TOKEN_COOKIE_NAME,
        value=str(refresh_token),
        httponly=True,
        secure=settings.REFRESH_TOKEN_COOKIE_SECURE,
        samesite=settings.REFRESH_TOKEN_COOKIE_SAMESITE,
    )


def _blacklist_outstanding_tokens(user):
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)


class CookieTokenObtainPairView(TokenObtainPairView):
    """Returns only the access token in the body; the refresh token goes in an httpOnly cookie."""

    serializer_class = EmailTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        refresh = response.data.pop("refresh", None)
        if refresh is not None:
            _set_refresh_cookie(response, refresh)
        return response


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        credential = request.data.get("credential", "")
        try:
            payload = id_token.verify_oauth2_token(
                credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID
            )
        except ValueError:
            return Response(
                {"detail": "Google sign-in failed. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not payload.get("email_verified"):
            return Response(
                {"detail": "Google sign-in failed. Please try again."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = payload["email"]
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            # password=None -> set_password(None) -> an unusable password
            # (Django's own convention), not a special case we handle
            # ourselves. check_password() always fails against it, so this
            # account can't log in via email/password until a real one is
            # set — e.g. through the password-reset flow (decisions.md #068).
            user = User.objects.create_user(
                email=email,
                password=None,
                first_name=payload.get("given_name", ""),
                last_name=payload.get("family_name", ""),
                is_verified=True,
            )
        elif not user.is_verified:
            user.is_verified = True
            user.save(update_fields=["is_verified"])

        refresh = RefreshToken.for_user(user)
        response = Response({"access": str(refresh.access_token)})
        _set_refresh_cookie(response, refresh)
        return response


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_scope = "registration"

    def perform_create(self, serializer):
        user = serializer.save()
        send_verification_email(user)


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        token = request.data.get("token", "")
        try:
            payload = read_verification_token(token)
        except signing.BadSignature:
            return Response(
                {"detail": "This verification link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user = User.objects.get(pk=payload["user_id"])
        except User.DoesNotExist:
            return Response(
                {"detail": "This verification link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_verified = True
        user.save(update_fields=["is_verified"])

        refresh = RefreshToken.for_user(user)
        response = Response({"access": str(refresh.access_token)})
        _set_refresh_cookie(response, refresh)
        return response


class ResendVerificationView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "email-verification"

    def post(self, request, *args, **kwargs):
        email = request.data.get("email", "")
        user = User.objects.filter(email__iexact=email, is_verified=False).first()
        if user:
            send_verification_email(user)
        return Response({"detail": "If that account exists, a verification email has been sent."})


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_scope = "password-reset"

    def post(self, request, *args, **kwargs):
        email = request.data.get("email", "")
        # Any account, verified or not — branching on verification status
        # here would leak it via a response difference.
        user = User.objects.filter(email__iexact=email).first()
        if user:
            send_password_reset_email(user)
        return Response({"detail": "If that account exists, a password reset email has been sent."})


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.validated_data["token"]

        try:
            payload = read_password_reset_token(token)
        except signing.BadSignature:
            return Response(
                {"detail": "This password reset link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user = User.objects.get(pk=payload["user_id"])
        except User.DoesNotExist:
            return Response(
                {"detail": "This password reset link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data["password"])
        user.save(update_fields=["password"])

        # A password reset should end any session someone else might be
        # holding on this account, not just the one completing the reset.
        _blacklist_outstanding_tokens(user)

        refresh = RefreshToken.for_user(user)
        response = Response({"access": str(refresh.access_token)})
        _set_refresh_cookie(response, refresh)
        return response


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    def post(self, request, *args, **kwargs):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if not request.user.check_password(serializer.validated_data["current_password"]):
            return Response(
                {"detail": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])

        # Ends every other session (same reasoning as PasswordResetConfirmView
        # above) — but re-issues a fresh refresh cookie for *this* one, so the
        # person who just changed their password isn't logged out of their
        # own request for doing it.
        _blacklist_outstanding_tokens(request.user)
        refresh = RefreshToken.for_user(request.user)
        response = Response({"detail": "Password changed."})
        _set_refresh_cookie(response, refresh)
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """Reads the refresh token from the cookie and re-sets it on rotation."""

    serializer_class = CookieTokenRefreshSerializer

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        refresh = response.data.pop("refresh", None)
        if refresh is not None:
            _set_refresh_cookie(response, refresh)
        return response


class LogoutView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        cookie_name = settings.REFRESH_TOKEN_COOKIE_NAME
        refresh_token = request.COOKIES.get(cookie_name)
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                pass
        response = Response(status=205)
        response.delete_cookie(cookie_name)
        return response


class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        return Response({"status": "ok"})
