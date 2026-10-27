from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

User = get_user_model()


class Command(BaseCommand):
    help = (
        "Permanently deletes accounts soft-deleted more than "
        "ACCOUNT_DELETION_GRACE_PERIOD_DAYS ago. See docs/decisions.md #076 — "
        "not yet wired to a scheduler (deployment is deferred to Phase 7), "
        "run manually until then."
    )

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=settings.ACCOUNT_DELETION_GRACE_PERIOD_DAYS)
        queryset = User.objects.filter(deleted_at__isnull=False, deleted_at__lt=cutoff)
        count = queryset.count()
        queryset.delete()
        self.stdout.write(f"Purged {count} account(s).")
