from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase

User = get_user_model()


class UserManagerTests(TestCase):
    def test_create_user_requires_email(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email="", password="s3cret-pass!")

    def test_create_user_sets_usable_password(self):
        user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        self.assertTrue(user.check_password("s3cret-pass!"))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertFalse(user.is_verified)

    def test_create_superuser_is_staff_and_verified(self):
        user = User.objects.create_superuser(email="admin@example.com", password="s3cret-pass!")
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_verified)

    def test_email_is_unique(self):
        User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user(email="tester@example.com", password="other-pass!")

    def test_str_is_email(self):
        user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        self.assertEqual(str(user), "tester@example.com")

    def test_create_user_without_username_generates_one_from_email(self):
        user = User.objects.create_user(email="ash.ketchum@example.com", password="s3cret-pass!")
        self.assertEqual(user.username, "ash.ketchum")

    def test_create_user_username_collision_gets_numeric_suffix(self):
        User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        other = User.objects.create_user(email="tester@other.com", password="s3cret-pass!")
        self.assertEqual(other.username, "tester1")

    def test_create_user_explicit_username_is_respected(self):
        user = User.objects.create_user(
            email="tester@example.com", password="s3cret-pass!", username="pikachu"
        )
        self.assertEqual(user.username, "pikachu")

    def test_generated_username_is_unique(self):
        User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        with self.assertRaises(IntegrityError), transaction.atomic():
            User.objects.create_user(
                email="other@example.com", password="s3cret-pass!", username="tester"
            )
