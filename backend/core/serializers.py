from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)

from .avatars import process_avatar

User = get_user_model()


class CookieTokenRefreshSerializer(TokenRefreshSerializer):
    """Reads the refresh token from an httpOnly cookie instead of the request body."""

    refresh = None

    def validate(self, attrs):
        request = self.context["request"]
        refresh_token = request.COOKIES.get(settings.REFRESH_TOKEN_COOKIE_NAME)
        if not refresh_token:
            raise serializers.ValidationError("No refresh token cookie found.")
        attrs["refresh"] = refresh_token
        return super().validate(attrs)


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Same as the default, but rejects an unverified account after credentials check out."""

    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.is_verified:
            raise serializers.ValidationError(
                {"detail": "Please verify your email before logging in."}
            )
        if self.user.deleted_at is not None:
            # Logging in is the restore action for a soft-deleted account
            # (see docs/decisions.md #076).
            self.user.deleted_at = None
            self.user.save(update_fields=["deleted_at"])
        return data


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["email", "username", "password"]

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        validate_password(value)
        return value


class UserSerializer(serializers.ModelSerializer):
    has_usable_password = serializers.SerializerMethodField()
    avatar = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            "email",
            "username",
            "first_name",
            "last_name",
            "avatar",
            "is_verified",
            "date_joined",
            "has_usable_password",
            "auto_remove_favorite_on_collect",
        ]
        read_only_fields = ["email", "is_verified", "date_joined"]

    def get_has_usable_password(self, obj):
        return obj.has_usable_password()

    def validate_avatar(self, value):
        if value is None:
            return value
        if value.size > settings.MAX_AVATAR_UPLOAD_SIZE:
            raise serializers.ValidationError("Image must be 5MB or smaller.")
        if value.content_type not in settings.ALLOWED_AVATAR_CONTENT_TYPES:
            raise serializers.ValidationError("Please upload a JPEG, PNG, or WebP image.")
        return process_avatar(value)

    def update(self, instance, validated_data):
        # Enabling the setting also does a one-time cleanup of cards that
        # are *already* both owned and favorited, not just future adds —
        # see docs/decisions.md #084. Only the actual False->True
        # transition triggers it: a PATCH that already has it True (or
        # omits it entirely, e.g. editing just the username) never
        # re-runs the cleanup query.
        turning_on = (
            validated_data.get("auto_remove_favorite_on_collect") is True
            and not instance.auto_remove_favorite_on_collect
        )
        instance = super().update(instance, validated_data)
        if turning_on:
            # Reverse accessors from Favorite/CollectionEntry's `user` FK
            # (backend/collection/models.py) — no cross-app import needed,
            # same approach #079 already established.
            instance.favorites.filter(card__in=instance.collection_entries.values("card")).delete()
        return instance


class RequestEmailChangeSerializer(serializers.Serializer):
    new_email = serializers.EmailField()
    current_password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def validate_new_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("That email is already in use.")
        return value


class ConfirmEmailChangeSerializer(serializers.Serializer):
    token = serializers.CharField()


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value
