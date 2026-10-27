from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from horoscope.models import HoroscopePull
from quiz.models import QuizAttempt

User = get_user_model()


class MeViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="tester@example.com",
            password="s3cret-pass!",
            username="ash",
            is_verified=True,
            first_name="Ash",
            last_name="Ketchum",
        )

    def test_requires_authentication(self):
        response = self.client.get(reverse("me"))
        self.assertEqual(response.status_code, 401)

    def test_get_returns_expected_fields(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("me"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["email"], "tester@example.com")
        self.assertEqual(response.data["username"], "ash")
        self.assertEqual(response.data["first_name"], "Ash")
        self.assertEqual(response.data["last_name"], "Ketchum")
        self.assertTrue(response.data["is_verified"])
        self.assertTrue(response.data["has_usable_password"])

    def test_patch_updates_name(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            reverse("me"), {"first_name": "Misty", "last_name": "Waterflower"}
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Misty")
        self.assertEqual(self.user.last_name, "Waterflower")

    def test_patch_updates_username(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(reverse("me"), {"username": "ketchum"})

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "ketchum")

    def test_patch_rejects_username_already_taken_by_another_account(self):
        User.objects.create_user(
            email="other@example.com", password="s3cret-pass!", username="misty"
        )
        self.client.force_authenticate(self.user)

        response = self.client.patch(reverse("me"), {"username": "misty"})

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.username, "ash")

    def test_patch_with_own_unchanged_username_succeeds(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(reverse("me"), {"username": "ash", "first_name": "Ash"})

        self.assertEqual(response.status_code, 200)

    def test_patch_cannot_change_email_or_verification(self):
        self.client.force_authenticate(self.user)

        self.client.patch(reverse("me"), {"email": "hijacked@example.com", "is_verified": False})

        self.user.refresh_from_db()
        self.assertEqual(self.user.email, "tester@example.com")
        self.assertTrue(self.user.is_verified)

    def test_has_usable_password_false_for_google_only_account(self):
        google_user = User.objects.create_user(
            email="google@example.com", password=None, is_verified=True
        )
        self.client.force_authenticate(google_user)

        response = self.client.get(reverse("me"))

        self.assertFalse(response.data["has_usable_password"])


class ChangePasswordViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="tester@example.com", password="old-pass123!", is_verified=True
        )

    def test_requires_authentication(self):
        response = self.client.post(reverse("change-password"), {})
        self.assertEqual(response.status_code, 401)

    def test_success_changes_password(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            reverse("change-password"),
            {"current_password": "old-pass123!", "new_password": "a-new-strong-passw0rd!"},
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("a-new-strong-passw0rd!"))

        # The new password actually works on a subsequent login.
        login_response = self.client.post(
            reverse("token_obtain_pair"),
            {"email": "tester@example.com", "password": "a-new-strong-passw0rd!"},
        )
        self.assertEqual(login_response.status_code, 200)

    def test_wrong_current_password_rejected(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            reverse("change-password"),
            {"current_password": "wrong-password", "new_password": "a-new-strong-passw0rd!"},
        )

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("old-pass123!"))

    def test_weak_new_password_rejected(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            reverse("change-password"),
            {"current_password": "old-pass123!", "new_password": "password"},
        )

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("old-pass123!"))

    def test_blacklists_other_sessions_but_keeps_current_one_working(self):
        # A session obtained independently of self.client — stands in for
        # "another device/browser" holding a refresh token at the time of
        # the change.
        other_session_refresh = str(RefreshToken.for_user(self.user))

        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse("change-password"),
            {"current_password": "old-pass123!", "new_password": "a-new-strong-passw0rd!"},
        )
        self.assertEqual(response.status_code, 200)
        # Captured immediately — response.cookies is the *same* SimpleCookie
        # object the test client reuses as its own jar, so reading this back
        # after mutating self.client.cookies below would silently read the
        # mutated value instead of the one this response actually set.
        new_cookie = response.cookies[settings.REFRESH_TOKEN_COOKIE_NAME].value

        # The other session's refresh token is now blacklisted.
        self.client.cookies[settings.REFRESH_TOKEN_COOKIE_NAME] = other_session_refresh
        other_refresh_response = self.client.post(reverse("token_refresh"), {})
        self.assertEqual(other_refresh_response.status_code, 401)

        # This request's own newly-issued cookie still works.
        self.client.cookies[settings.REFRESH_TOKEN_COOKIE_NAME] = new_cookie
        own_refresh_response = self.client.post(reverse("token_refresh"), {})
        self.assertEqual(own_refresh_response.status_code, 200)


class DeleteAccountViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="tester@example.com", password="s3cret-pass!", is_verified=True
        )

    def test_requires_authentication(self):
        response = self.client.delete(reverse("me"))
        self.assertEqual(response.status_code, 401)

    def test_soft_deletes_marks_but_does_not_remove_the_row(self):
        self.client.force_authenticate(self.user)

        response = self.client.delete(reverse("me"))

        self.assertEqual(response.status_code, 200)
        self.assertIn("30 days", response.data["detail"])
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.deleted_at)
        # Still exists as a row — a real removal only happens via the purge
        # command, past the grace period.
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_quiz_and_horoscope_history_untouched_immediately_after_deletion(self):
        QuizAttempt.objects.create(user=self.user, quiz_mode="guess_hp", score=3, total_questions=5)
        HoroscopePull.objects.create(user=self.user, pull_date="2026-01-01")
        self.client.force_authenticate(self.user)

        self.client.delete(reverse("me"))

        self.assertEqual(QuizAttempt.objects.filter(user=self.user).count(), 1)
        self.assertEqual(HoroscopePull.objects.filter(user=self.user).count(), 1)

    def test_blacklists_tokens_and_clears_cookie(self):
        refresh = str(RefreshToken.for_user(self.user))
        self.client.cookies[settings.REFRESH_TOKEN_COOKIE_NAME] = refresh
        self.client.force_authenticate(self.user)

        response = self.client.delete(reverse("me"))

        self.assertEqual(response.status_code, 200)
        # The cookie-clearing instruction is present on the response...
        self.assertEqual(response.cookies[settings.REFRESH_TOKEN_COOKIE_NAME].value, "")
        # ...and the blacklisted refresh token can no longer be used.
        self.client.cookies[settings.REFRESH_TOKEN_COOKIE_NAME] = refresh
        refresh_response = self.client.post(reverse("token_refresh"), {})
        self.assertEqual(refresh_response.status_code, 401)

    def test_logging_back_in_restores_the_account(self):
        self.client.force_authenticate(self.user)
        self.client.delete(reverse("me"))
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.deleted_at)

        response = self.client.post(
            reverse("token_obtain_pair"),
            {"email": "tester@example.com", "password": "s3cret-pass!"},
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.deleted_at)

    @patch("core.views.id_token.verify_oauth2_token")
    def test_logging_back_in_via_google_restores_the_account(self, mock_verify):
        google_user = User.objects.create_user(
            email="google@example.com",
            password=None,
            is_verified=True,
            google_sub="sub-restore",
        )
        self.client.force_authenticate(google_user)
        self.client.delete(reverse("me"))
        google_user.refresh_from_db()
        self.assertIsNotNone(google_user.deleted_at)

        mock_verify.return_value = {
            "email": "google@example.com",
            "email_verified": True,
            "given_name": "Ash",
            "family_name": "Ketchum",
            "sub": "sub-restore",
        }
        response = self.client.post(reverse("google-login"), {"credential": "fake-token"})

        self.assertEqual(response.status_code, 200)
        google_user.refresh_from_db()
        self.assertIsNone(google_user.deleted_at)
