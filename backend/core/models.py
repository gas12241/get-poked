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

    # Login identifier stays email — username is a separate, unique display
    # attribute, not a credential. Google account-linking (#069) and password
    # reset (#068) are already keyed by email; neither changes here.
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email
