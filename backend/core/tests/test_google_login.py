from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

User = get_user_model()


def _fake_payload(email, email_verified=True, given_name="Ash", family_name="Ketchum"):
    return {
        "email": email,
        "email_verified": email_verified,
        "given_name": given_name,
        "family_name": family_name,
        "sub": "1234567890",
    }


class GoogleLoginViewTests(APITestCase):
    @patch("core.views.id_token.verify_oauth2_token")
    def test_new_email_creates_a_verified_unusable_password_account(self, mock_verify):
        mock_verify.return_value = _fake_payload("new@example.com")

        response = self.client.post(reverse("google-login"), {"credential": "fake-token"})

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        user = User.objects.get(email="new@example.com")
        self.assertTrue(user.is_verified)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.first_name, "Ash")
        self.assertEqual(user.last_name, "Ketchum")
        # No username comes from Google — one is auto-generated so the
        # account isn't left without one (decisions.md, username slice).
        self.assertEqual(user.username, "new")

    @patch("core.views.id_token.verify_oauth2_token")
    def test_existing_unverified_account_becomes_verified_and_logs_in(self, mock_verify):
        existing = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        self.assertFalse(existing.is_verified)
        mock_verify.return_value = _fake_payload("tester@example.com")

        response = self.client.post(reverse("google-login"), {"credential": "fake-token"})

        self.assertEqual(response.status_code, 200)
        existing.refresh_from_db()
        self.assertTrue(existing.is_verified)
        # Same account, not a duplicate.
        self.assertEqual(User.objects.filter(email__iexact="tester@example.com").count(), 1)

    @patch("core.views.id_token.verify_oauth2_token")
    def test_existing_verified_account_just_logs_in(self, mock_verify):
        User.objects.create_user(
            email="tester@example.com", password="s3cret-pass!", is_verified=True
        )
        mock_verify.return_value = _fake_payload("tester@example.com")

        response = self.client.post(reverse("google-login"), {"credential": "fake-token"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.filter(email__iexact="tester@example.com").count(), 1)

    @patch("core.views.id_token.verify_oauth2_token")
    def test_unverified_email_rejected(self, mock_verify):
        mock_verify.return_value = _fake_payload("new@example.com", email_verified=False)

        response = self.client.post(reverse("google-login"), {"credential": "fake-token"})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email="new@example.com").exists())

    @patch("core.views.id_token.verify_oauth2_token")
    def test_invalid_token_rejected(self, mock_verify):
        mock_verify.side_effect = ValueError("Invalid token")

        response = self.client.post(reverse("google-login"), {"credential": "not-a-real-token"})

        self.assertEqual(response.status_code, 400)

    @patch("core.views.id_token.verify_oauth2_token")
    def test_google_only_account_cannot_log_in_via_password(self, mock_verify):
        mock_verify.return_value = _fake_payload("new@example.com")
        self.client.post(reverse("google-login"), {"credential": "fake-token"})

        response = self.client.post(
            reverse("token_obtain_pair"),
            {"email": "new@example.com", "password": "anything-at-all"},
        )

        self.assertEqual(response.status_code, 401)
