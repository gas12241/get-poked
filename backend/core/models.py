from django.contrib.auth.models import AbstractUser
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.db import models

from .managers import UserManager


class User(AbstractUser):
    username = models.CharField(
        max_length=150, unique=True, validators=[UnicodeUsernameValidator()]
    )
    email = models.EmailField(unique=True)
    is_verified = models.BooleanField(default=False)
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    # Google's own stable per-account ID (the `sub` claim) — null for every
    # account that's never signed in with Google. Matched on first, with a
    # fallback to email for pre-existing accounts (see docs/decisions.md
    # #074) — email alone isn't a safe long-term link, since it can change.
    google_sub = models.CharField(max_length=255, unique=True, null=True, blank=True)
    # Soft-delete marker (see docs/decisions.md #076) — null means active.
    # `is_active` is deliberately left untouched: the account must still be
    # able to log in normally, since logging in is the restore action.
    deleted_at = models.DateTimeField(null=True, blank=True)

    # Login identifier stays email — username is a separate, unique display
    # attribute, not a credential. Google account-linking (#069) and password
    # reset (#068) are already keyed by email; neither changes here.
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email
