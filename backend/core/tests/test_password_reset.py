from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from core.tokens import make_password_reset_token, make_verification_token

User = get_user_model()


class PasswordResetRequestViewTests(APITestCase):
    def test_sends_email_for_existing_account(self):
        User.objects.create_user(email="tester@example.com", password="s3cret-pass!")

        response = self.client.post(reverse("password-reset"), {"email": "tester@example.com"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("tester@example.com", mail.outbox[0].to)
        self.assertIn("reset-password?token=", mail.outbox[0].body)

    def test_generic_response_for_nonexistent_account(self):
        response = self.client.post(reverse("password-reset"), {"email": "nobody@example.com"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_sends_email_even_for_unverified_account(self):
        # Branching on verification status here would leak it via a response
        # difference — unlike resend-verification, this isn't scoped to
        # is_verified=False.
        User.objects.create_user(email="tester@example.com", password="s3cret-pass!")

        response = self.client.post(reverse("password-reset"), {"email": "tester@example.com"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_throttled_after_limit(self):
        cache.clear()
        User.objects.create_user(email="tester@example.com", password="s3cret-pass!")

        for _ in range(3):
            response = self.client.post(reverse("password-reset"), {"email": "tester@example.com"})
            self.assertEqual(response.status_code, 200)

        throttled_response = self.client.post(
            reverse("password-reset"), {"email": "tester@example.com"}
        )
        self.assertEqual(throttled_response.status_code, 429)


class PasswordResetConfirmViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="tester@example.com", password="old-pass123!", is_verified=True
        )

    def test_valid_token_resets_password_and_logs_in(self):
        token = make_password_reset_token(self.user)

        response = self.client.post(
            reverse("password-reset-confirm"),
            {"token": token, "password": "a-new-strong-passw0rd!"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("a-new-strong-passw0rd!"))
        self.assertFalse(self.user.check_password("old-pass123!"))

    def test_garbage_token_rejected(self):
        response = self.client.post(
            reverse("password-reset-confirm"),
            {"token": "not-a-real-token", "password": "a-new-strong-passw0rd!"},
        )
        self.assertEqual(response.status_code, 400)

    def test_expired_token_rejected(self):
        token = make_password_reset_token(self.user)

        with override_settings(PASSWORD_RESET_TOKEN_MAX_AGE=-1):
            response = self.client.post(
                reverse("password-reset-confirm"),
                {"token": token, "password": "a-new-strong-passw0rd!"},
            )

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("old-pass123!"))

    def test_weak_new_password_rejected(self):
        token = make_password_reset_token(self.user)

        response = self.client.post(
            reverse("password-reset-confirm"), {"token": token, "password": "password"}
        )

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("old-pass123!"))

    def test_verification_token_cannot_be_used_as_a_reset_token(self):
        verification_token = make_verification_token(self.user)

        response = self.client.post(
            reverse("password-reset-confirm"),
            {"token": verification_token, "password": "a-new-strong-passw0rd!"},
        )

        self.assertEqual(response.status_code, 400)

    def test_reset_invalidates_existing_refresh_tokens(self):
        obtain_response = self.client.post(
            reverse("token_obtain_pair"),
            {"email": "tester@example.com", "password": "old-pass123!"},
        )
        old_refresh_cookie = obtain_response.cookies[settings.REFRESH_TOKEN_COOKIE_NAME].value

        token = make_password_reset_token(self.user)
        confirm_response = self.client.post(
            reverse("password-reset-confirm"),
            {"token": token, "password": "a-new-strong-passw0rd!"},
        )
        self.assertEqual(confirm_response.status_code, 200)

        self.client.cookies[settings.REFRESH_TOKEN_COOKIE_NAME] = old_refresh_cookie
        refresh_after_reset = self.client.post(reverse("token_refresh"), {})
        self.assertEqual(refresh_after_reset.status_code, 401)
