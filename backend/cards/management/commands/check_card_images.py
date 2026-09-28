from django.core.management.base import BaseCommand

from cards.images import check_and_fix_card_images
from cards.models import Card


class Command(BaseCommand):
    help = (
        "Checks every card's image URLs against the real image host and fixes "
        "broken ones — falls back image_small to image_large where only the "
        "large one works, blanks both where neither does. See docs/decisions.md #039."
    )

    def handle(self, *args, **options):
        self.stdout.write(f"Checking images for {Card.objects.count()} card(s)...")
        results = check_and_fix_card_images(Card.objects.all())

        self.stdout.write(f"OK: {results['ok']}")
        if results["fallback"]:
            self.stdout.write(f"Fell back to image_large ({len(results['fallback'])}):")
            for card in results["fallback"]:
                self.stdout.write(f"  {card.id} {card.name} ({card.set.name})")
        if results["unavailable"]:
            self.stdout.write(f"No working image at all ({len(results['unavailable'])}):")
            for card in results["unavailable"]:
                self.stdout.write(f"  {card.id} {card.name} ({card.set.name})")
