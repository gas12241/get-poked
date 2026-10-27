from datetime import timedelta
from io import StringIO

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from horoscope.models import HoroscopePull
from quiz.models import QuizAttempt

User = get_user_model()


class PurgeDeletedAccountsTests(TestCase):
    def run_command(self):
        out = StringIO()
        call_command("purge_deleted_accounts", stdout=out)
        return out.getvalue()

    def test_purges_an_account_past_the_grace_period(self):
        past_cutoff = timezone.now() - timedelta(
            days=settings.ACCOUNT_DELETION_GRACE_PERIOD_DAYS + 1
        )
        user = User.objects.create_user(email="old@example.com", password="s3cret-pass!")
        User.objects.filter(pk=user.pk).update(deleted_at=past_cutoff)

        output = self.run_command()

        self.assertFalse(User.objects.filter(pk=user.pk).exists())
        self.assertIn("Purged 1 account(s).", output)

    def test_leaves_an_account_still_within_the_grace_period(self):
        recent = timezone.now() - timedelta(days=1)
        user = User.objects.create_user(email="recent@example.com", password="s3cret-pass!")
        User.objects.filter(pk=user.pk).update(deleted_at=recent)

        self.run_command()

        self.assertTrue(User.objects.filter(pk=user.pk).exists())

    def test_leaves_an_account_that_was_never_deleted(self):
        user = User.objects.create_user(email="active@example.com", password="s3cret-pass!")

        self.run_command()

        self.assertTrue(User.objects.filter(pk=user.pk).exists())

    def test_purge_cascades_to_quiz_and_horoscope_history(self):
        past_cutoff = timezone.now() - timedelta(
            days=settings.ACCOUNT_DELETION_GRACE_PERIOD_DAYS + 1
        )
        user = User.objects.create_user(email="old@example.com", password="s3cret-pass!")
        User.objects.filter(pk=user.pk).update(deleted_at=past_cutoff)
        QuizAttempt.objects.create(user=user, quiz_mode="guess_hp", score=3, total_questions=5)
        HoroscopePull.objects.create(user=user, pull_date="2026-01-01")

        self.run_command()

        self.assertEqual(QuizAttempt.objects.filter(user_id=user.pk).count(), 0)
        self.assertEqual(HoroscopePull.objects.filter(user_id=user.pk).count(), 0)
