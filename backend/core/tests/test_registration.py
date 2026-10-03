from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from core.tokens import make_verification_token

User = get_user_model()


class RegisterViewTests(APITestCase):
    def test_register_creates_unverified_user_and_sends_email(self):
        response = self.client.post(
            reverse("register"),
            {"email": "new@example.com", "password": "a-strong-passw0rd!"},
        )

        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="new@example.com")
        self.assertFalse(user.is_verified)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("new@example.com", mail.outbox[0].to)
        self.assertIn("verify-email?token=", mail.outbox[0].body)

    def test_register_rejects_duplicate_email(self):
        User.objects.create_user(email="existing@example.com", password="s3cret-pass!")

        response = self.client.post(
            reverse("register"),
            {"email": "existing@example.com", "password": "a-strong-passw0rd!"},
        )

        self.assertEqual(response.status_code, 400)

    def test_register_rejects_weak_password(self):
        response = self.client.post(
            reverse("register"), {"email": "new@example.com", "password": "password"}
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email="new@example.com").exists())

    def test_throttled_after_limit(self):
        # Throttle counters live in Django's cache, shared across test methods
        # in this run (same client "IP"), not reset automatically between tests.
        cache.clear()
        for i in range(10):
            response = self.client.post(
                reverse("register"),
                {"email": f"user{i}@example.com", "password": "a-strong-passw0rd!"},
            )
            self.assertEqual(response.status_code, 201)

        throttled_response = self.client.post(
            reverse("register"),
            {"email": "one-too-many@example.com", "password": "a-strong-passw0rd!"},
        )
        self.assertEqual(throttled_response.status_code, 429)


class VerifyEmailViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")

    def test_valid_token_verifies_and_logs_in(self):
        token = make_verification_token(self.user)

        response = self.client.post(reverse("verify-email"), {"token": token})

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_verified)

    def test_garbage_token_rejected(self):
        response = self.client.post(reverse("verify-email"), {"token": "not-a-real-token"})
        self.assertEqual(response.status_code, 400)

    def test_expired_token_rejected(self):
        token = make_verification_token(self.user)

        with override_settings(EMAIL_VERIFICATION_TOKEN_MAX_AGE=-1):
            response = self.client.post(reverse("verify-email"), {"token": token})

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_verified)


class ResendVerificationViewTests(APITestCase):
    def test_sends_email_for_existing_unverified_account(self):
        User.objects.create_user(email="tester@example.com", password="s3cret-pass!")

        response = self.client.post(reverse("verify-email-resend"), {"email": "tester@example.com"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_generic_response_for_nonexistent_account(self):
        response = self.client.post(reverse("verify-email-resend"), {"email": "nobody@example.com"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_generic_response_for_already_verified_account(self):
        User.objects.create_user(
            email="verified@example.com", password="s3cret-pass!", is_verified=True
        )

        response = self.client.post(
            reverse("verify-email-resend"), {"email": "verified@example.com"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_throttled_after_limit(self):
        cache.clear()
        User.objects.create_user(email="tester@example.com", password="s3cret-pass!")

        for _ in range(3):
            response = self.client.post(
                reverse("verify-email-resend"), {"email": "tester@example.com"}
            )
            self.assertEqual(response.status_code, 200)

        throttled_response = self.client.post(
            reverse("verify-email-resend"), {"email": "tester@example.com"}
        )
        self.assertEqual(throttled_response.status_code, 429)
