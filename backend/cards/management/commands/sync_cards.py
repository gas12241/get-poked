from django.core.management.base import BaseCommand, CommandError

from cards.api_client import build_session
from cards.sync import get_type_cache, sets_to_sync, sync_cards_for_set, sync_sets


class Command(BaseCommand):
    help = "Sync sets and cards from the Pokémon TCG API (diff-by-set upsert)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--set",
            dest="set_tcg_id",
            help="Only sync this one set (by its TCG API id, e.g. 'base1').",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-sync sets even if already marked imported (errata escape hatch).",
        )

    def handle(self, *args, **options):
        session = build_session()

        self.stdout.write("Syncing set list...")
        sync_sets(session)

        targets = sets_to_sync(target_tcg_id=options["set_tcg_id"], force=options["force"])
        total = targets.count()
        self.stdout.write(f"{total} set(s) to sync.")

        type_cache = get_type_cache()
        failures = []

        for index, set_obj in enumerate(targets, start=1):
            self.stdout.write(
                f"[{index}/{total}] Syncing cards for {set_obj.name} ({set_obj.tcg_id})..."
            )
            try:
                sync_cards_for_set(session, set_obj, type_cache)
            except Exception as exc:  # noqa: BLE001 - one bad set shouldn't abort the run
                failures.append(set_obj.tcg_id)
                self.stderr.write(f"  Failed to sync {set_obj.tcg_id}: {exc}")

        succeeded = total - len(failures)
        self.stdout.write(f"Done. {succeeded}/{total} set(s) synced successfully.")

        if failures:
            raise CommandError(
                f"{len(failures)} set(s) failed: {', '.join(failures)}. Re-run to retry."
            )
