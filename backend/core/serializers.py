from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import (
    TokenObtainPairSerializer,
    TokenRefreshSerializer,
)

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
        return data


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["email", "password"]

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)
