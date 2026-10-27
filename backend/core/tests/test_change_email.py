from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from core.tokens import make_email_change_token, make_password_reset_token

User = get_user_model()


class RequestEmailChangeViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="tester@example.com", password="s3cret-pass!", is_verified=True
        )
        self.client.force_authenticate(self.user)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)

        response = self.client.post(
            reverse("email-change"),
            {"new_email": "new@example.com", "current_password": "s3cret-pass!"},
        )

        self.assertEqual(response.status_code, 401)

    def test_sends_email_to_the_new_address(self):
        response = self.client.post(
            reverse("email-change"),
            {"new_email": "new@example.com", "current_password": "s3cret-pass!"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("new@example.com", mail.outbox[0].to)
        self.assertIn("confirm-email-change?token=", mail.outbox[0].body)
        # Nothing's changed yet — only confirming actually updates it.
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "tester@example.com")

    def test_wrong_current_password_rejected(self):
        response = self.client.post(
            reverse("email-change"),
            {"new_email": "new@example.com", "current_password": "wrong-password"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_already_taken_new_email_rejected(self):
        User.objects.create_user(email="taken@example.com", password="s3cret-pass!")

        response = self.client.post(
            reverse("email-change"),
            {"new_email": "taken@example.com", "current_password": "s3cret-pass!"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_google_only_account_can_request_with_no_password(self):
        google_user = User.objects.create_user(
            email="google@example.com", password=None, is_verified=True
        )
        self.client.force_authenticate(google_user)

        response = self.client.post(
            reverse("email-change"), {"new_email": "new-for-google@example.com"}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_throttled_after_limit(self):
        cache.clear()

        for _ in range(3):
            response = self.client.post(
                reverse("email-change"),
                {"new_email": "new@example.com", "current_password": "s3cret-pass!"},
            )
            self.assertEqual(response.status_code, 200)

        throttled_response = self.client.post(
            reverse("email-change"),
            {"new_email": "new@example.com", "current_password": "s3cret-pass!"},
        )
        self.assertEqual(throttled_response.status_code, 429)


class ConfirmEmailChangeViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="tester@example.com", password="s3cret-pass!", is_verified=True
        )

    def test_valid_token_updates_the_email(self):
        token = make_email_change_token(self.user, "new@example.com")

        response = self.client.post(reverse("email-change-confirm"), {"token": token})

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "new@example.com")

    def test_garbage_token_rejected(self):
        response = self.client.post(reverse("email-change-confirm"), {"token": "not-a-real-token"})

        self.assertEqual(response.status_code, 400)

    def test_expired_token_rejected(self):
        token = make_email_change_token(self.user, "new@example.com")

        with override_settings(EMAIL_CHANGE_TOKEN_MAX_AGE=-1):
            response = self.client.post(reverse("email-change-confirm"), {"token": token})

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "tester@example.com")

    def test_password_reset_token_cannot_be_used_as_an_email_change_token(self):
        reset_token = make_password_reset_token(self.user)

        response = self.client.post(reverse("email-change-confirm"), {"token": reset_token})

        self.assertEqual(response.status_code, 400)

    def test_email_taken_in_the_meantime_is_rejected_at_confirm_time(self):
        token = make_email_change_token(self.user, "new@example.com")
        User.objects.create_user(email="new@example.com", password="s3cret-pass!")

        response = self.client.post(reverse("email-change-confirm"), {"token": token})

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "tester@example.com")

    def test_does_not_issue_new_tokens(self):
        token = make_email_change_token(self.user, "new@example.com")

        response = self.client.post(reverse("email-change-confirm"), {"token": token})

        self.assertNotIn("access", response.data)

    @patch("core.views.id_token.verify_oauth2_token")
    def test_google_only_account_still_signs_in_after_changing_its_email(self, mock_verify):
        # The actual end-to-end safety claim this slice depends on: a
        # Google-only account can use this feature at all only because
        # GoogleLoginView now matches by google_sub, not email (see
        # test_google_login.py). Proven here against the real flow, not a
        # simulated DB edit.
        google_user = User.objects.create_user(
            email="google@example.com", password=None, is_verified=True
        )
        mock_verify.return_value = {
            "email": "google@example.com",
            "email_verified": True,
            "given_name": "Ash",
            "family_name": "Ketchum",
            "sub": "google-sub-123",
        }
        self.client.post(reverse("google-login"), {"credential": "fake-token"})
        google_user.refresh_from_db()
        self.assertEqual(google_user.google_sub, "google-sub-123")

        token = make_email_change_token(google_user, "renamed@example.com")
        confirm_response = self.client.post(reverse("email-change-confirm"), {"token": token})
        self.assertEqual(confirm_response.status_code, 200)

        # Google still asserts the *original* email — without the sub match,
        # this would silently create a duplicate account.
        response = self.client.post(reverse("google-login"), {"credential": "fake-token"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.filter(google_sub="google-sub-123").count(), 1)
        same_user = User.objects.get(google_sub="google-sub-123")
        self.assertEqual(same_user.pk, google_user.pk)
        self.assertEqual(same_user.email, "renamed@example.com")
