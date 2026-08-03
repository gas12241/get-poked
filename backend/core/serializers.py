from django.conf import settings
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenRefreshSerializer


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
