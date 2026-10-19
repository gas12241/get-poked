from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

User = get_user_model()


def _fake_payload(
    email, email_verified=True, given_name="Ash", family_name="Ketchum", sub="1234567890"
):
    return {
        "email": email,
        "email_verified": email_verified,
        "given_name": given_name,
        "family_name": family_name,
        "sub": sub,
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
        self.assertEqual(user.google_sub, "1234567890")

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

    @patch("core.views.id_token.verify_oauth2_token")
    def test_preexisting_account_without_google_sub_is_backfilled_on_next_sign_in(
        self, mock_verify
    ):
        existing = User.objects.create_user(
            email="tester@example.com", password="s3cret-pass!", is_verified=True
        )
        self.assertIsNone(existing.google_sub)
        mock_verify.return_value = _fake_payload("tester@example.com", sub="sub-abc")

        response = self.client.post(reverse("google-login"), {"credential": "fake-token"})

        self.assertEqual(response.status_code, 200)
        existing.refresh_from_db()
        self.assertEqual(existing.google_sub, "sub-abc")

    @patch("core.views.id_token.verify_oauth2_token")
    def test_account_still_found_by_google_sub_after_its_email_changes(self, mock_verify):
        # Sign up via Google — backfills a google_sub.
        mock_verify.return_value = _fake_payload("original@example.com", sub="sub-xyz")
        self.client.post(reverse("google-login"), {"credential": "fake-token"})
        user = User.objects.get(google_sub="sub-xyz")

        # Email changes by some other means (the upcoming email-change
        # feature, or a direct admin edit) — the account no longer matches
        # what Google will assert on the next sign-in.
        user.email = "changed@example.com"
        user.save(update_fields=["email"])

        # Signing in via Google again still asserts the *original* email —
        # without the google_sub match, this would silently create a
        # duplicate, orphaning the real account's history.
        mock_verify.return_value = _fake_payload("original@example.com", sub="sub-xyz")
        response = self.client.post(reverse("google-login"), {"credential": "fake-token"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.filter(google_sub="sub-xyz").count(), 1)
        same_user = User.objects.get(google_sub="sub-xyz")
        self.assertEqual(same_user.pk, user.pk)
        self.assertEqual(same_user.email, "changed@example.com")

    @patch("core.views.id_token.verify_oauth2_token")
    def test_two_different_google_accounts_never_collide(self, mock_verify):
        mock_verify.return_value = _fake_payload("one@example.com", sub="sub-one")
        self.client.post(reverse("google-login"), {"credential": "fake-token"})

        mock_verify.return_value = _fake_payload("two@example.com", sub="sub-two")
        self.client.post(reverse("google-login"), {"credential": "fake-token"})

        self.assertEqual(User.objects.get(google_sub="sub-one").email, "one@example.com")
        self.assertEqual(User.objects.get(google_sub="sub-two").email, "two@example.com")
