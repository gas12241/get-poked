from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

User = get_user_model()


class HealthCheckTests(APITestCase):
    def test_health_check_returns_ok(self):
        response = self.client.get(reverse("health"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "ok"})


class CookieJWTAuthFlowTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="s3cret-pass!")

    def test_obtain_token_returns_only_access_and_sets_refresh_cookie(self):
        response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "tester", "password": "s3cret-pass!"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertNotIn("refresh", response.data)

        cookie = response.cookies.get(settings.REFRESH_TOKEN_COOKIE_NAME)
        self.assertIsNotNone(cookie)
        self.assertTrue(cookie["httponly"])

    def test_refresh_uses_cookie_not_body(self):
        obtain_response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "tester", "password": "s3cret-pass!"},
        )
        refresh_cookie = obtain_response.cookies[settings.REFRESH_TOKEN_COOKIE_NAME].value
        self.client.cookies[settings.REFRESH_TOKEN_COOKIE_NAME] = refresh_cookie

        refresh_response = self.client.post(reverse("token_refresh"), {})

        self.assertEqual(refresh_response.status_code, 200)
        self.assertIn("access", refresh_response.data)
        # Rotation issues a new refresh token, re-set as a cookie, not in the body.
        self.assertNotIn("refresh", refresh_response.data)
        self.assertIn(settings.REFRESH_TOKEN_COOKIE_NAME, refresh_response.cookies)

    def test_refresh_without_cookie_fails(self):
        response = self.client.post(reverse("token_refresh"), {})
        self.assertEqual(response.status_code, 400)

    def test_logout_blacklists_refresh_token_and_clears_cookie(self):
        obtain_response = self.client.post(
            reverse("token_obtain_pair"),
            {"username": "tester", "password": "s3cret-pass!"},
        )
        refresh_cookie = obtain_response.cookies[settings.REFRESH_TOKEN_COOKIE_NAME].value
        self.client.cookies[settings.REFRESH_TOKEN_COOKIE_NAME] = refresh_cookie

        logout_response = self.client.post(reverse("token_logout"))
        self.assertEqual(logout_response.status_code, 205)

        # The blacklisted refresh token can no longer be used.
        self.client.cookies[settings.REFRESH_TOKEN_COOKIE_NAME] = refresh_cookie
        refresh_after_logout = self.client.post(reverse("token_refresh"), {})
        self.assertEqual(refresh_after_logout.status_code, 401)
