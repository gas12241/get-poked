import re

from django.contrib.auth.base_user import BaseUserManager


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _generate_username(self, email):
        base = re.sub(r"[^\w.@+-]", "", email.split("@")[0].lower()) or "user"
        username = base
        suffix = 0
        while self.model.objects.filter(username=username).exists():
            suffix += 1
            username = f"{base}{suffix}"
        return username

    def _create_user(self, email, password, username=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        if not username:
            username = self._generate_username(email)
        user = self.model(email=email, username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, username=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, username, **extra_fields)

    def create_superuser(self, email, password=None, username=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_verified", True)
        return self._create_user(email, password, username, **extra_fields)
