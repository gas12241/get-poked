"""
Django settings for config project.

See docs/decisions.md and ARCHITECTURE.md in the repo root for the reasoning
behind the choices below (JWT via httpOnly refresh cookie, explicit CORS
allowlist, Postgres, env-var-driven config).
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")  # no-op if absent (e.g. CI sets real env vars)

SECRET_KEY = env("SECRET_KEY")
DEBUG = env.bool("DEBUG", default=False)

ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

AUTH_USER_MODEL = "core.User"


# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "corsheaders",
    "rest_framework_simplejwt.token_blacklist",
    "core",
    "cards",
    "quiz",
    "horoscope",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Database — Postgres always, even in local dev (see docs/decisions.md #019).

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME"),
        "USER": env("DB_USER"),
        "PASSWORD": env("DB_PASSWORD", default=""),
        "HOST": env("DB_HOST", default="localhost"),
        "PORT": env("DB_PORT", default="5432"),
    }
}


# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]


# Internationalization

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True


# Static files

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# Media files — generated quiz images (see docs/decisions.md #029)

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"


# Django REST Framework — JWT auth (see docs/decisions.md #010)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "cards.pagination.StandardPagination",
    "PAGE_SIZE": 24,
    "DEFAULT_THROTTLE_CLASSES": ("rest_framework.throttling.ScopedRateThrottle",),
    "DEFAULT_THROTTLE_RATES": {
        "registration": "10/hour",
        "email-verification": "3/hour",
        "password-reset": "3/hour",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# Refresh token cookie (set by the custom views in core/views.py, not simplejwt's
# default JSON-body refresh token — see docs/decisions.md #010).
REFRESH_TOKEN_COOKIE_NAME = "refresh_token"
REFRESH_TOKEN_COOKIE_SECURE = not DEBUG
REFRESH_TOKEN_COOKIE_SAMESITE = "None" if not DEBUG else "Lax"


# CORS — explicit allowlist, no wildcard (see docs/decisions.md #023)

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])
CORS_ALLOW_CREDENTIALS = True


# Email — registration/password-reset links (see docs/decisions.md #014, #067).
# Console backend in dev prints the email instead of sending it; Django's test
# runner always uses its own in-memory backend regardless of this setting, so
# `django.core.mail.outbox` works in tests either way. Production SMTP is
# deferred to Phase 7 deployment, same as other deployment-only config.
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="noreply@getpoked.local")

# The frontend's own origin, used to build links sent by email (e.g. the
# email-verification link) — distinct from CORS_ALLOWED_ORIGINS, which is a
# list of origins allowed to call the API, not a single canonical frontend URL.
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173")

EMAIL_VERIFICATION_TOKEN_MAX_AGE = 60 * 60 * 24  # 24 hours

# Shorter than email verification — a leaked password-reset link is a more
# immediate account-takeover risk than a leaked verification link.
PASSWORD_RESET_TOKEN_MAX_AGE = 60 * 60  # 1 hour


# Pokémon TCG API (see docs/decisions.md #022)

POKEMON_TCG_API_KEY = env("POKEMON_TCG_API_KEY", default="")

# Proactive pacing delay (seconds) between sync requests, on top of reactive
# retry/backoff — the authenticated per-minute rate limit isn't documented
# anywhere (see docs/decisions.md #022). Same value in every environment;
# tests override it via override_settings to avoid real sleeps.
SYNC_REQUEST_DELAY_SECONDS = 0.25
SYNC_RETRY_BACKOFF_FACTOR = 1
