from django.urls import path

from .views import (
    ChangePasswordView,
    ConfirmEmailChangeView,
    CookieTokenObtainPairView,
    CookieTokenRefreshView,
    GoogleLoginView,
    HealthCheckView,
    LogoutView,
    MeView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
    RequestEmailChangeView,
    ResendVerificationView,
    VerifyEmailView,
)

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health"),
    path("token/", CookieTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("google/", GoogleLoginView.as_view(), name="google-login"),
    path("token/refresh/", CookieTokenRefreshView.as_view(), name="token_refresh"),
    path("token/logout/", LogoutView.as_view(), name="token_logout"),
    path("register/", RegisterView.as_view(), name="register"),
    path("verify-email/", VerifyEmailView.as_view(), name="verify-email"),
    path(
        "verify-email/resend/",
        ResendVerificationView.as_view(),
        name="verify-email-resend",
    ),
    path(
        "password-reset/",
        PasswordResetRequestView.as_view(),
        name="password-reset",
    ),
    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),
    path("me/", MeView.as_view(), name="me"),
    path(
        "me/change-password/",
        ChangePasswordView.as_view(),
        name="change-password",
    ),
    path(
        "me/email-change/",
        RequestEmailChangeView.as_view(),
        name="email-change",
    ),
    path(
        "email-change/confirm/",
        ConfirmEmailChangeView.as_view(),
        name="email-change-confirm",
    ),
]
