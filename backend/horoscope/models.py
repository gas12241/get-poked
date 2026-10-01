from django.conf import settings
from django.db import models

from cards.models import Card


class RarityTier(models.TextChoices):
    COMMON = "common", "Common"
    MID = "mid", "Mid"
    CHASE = "chase", "Chase"


class HoroscopePull(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="horoscope_pulls"
    )
    # UTC calendar date this pull belongs to, set once at creation — the
    # once-per-day guarantee is a DB-level constraint on this plain column
    # rather than a `__date` lookup against `pulled_at`, so it's enforced
    # even if application logic has a bug. See docs/decisions.md #061.
    pull_date = models.DateField()
    pulled_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "pull_date"], name="unique_horoscope_pull_per_user_per_day"
            )
        ]
        ordering = ["-pulled_at"]

    def __str__(self):
        return f"{self.user} — {self.pull_date}"


class HoroscopeCard(models.Model):
    pull = models.ForeignKey(HoroscopePull, on_delete=models.CASCADE, related_name="cards")
    card = models.ForeignKey(Card, on_delete=models.PROTECT, related_name="horoscope_appearances")
    # The slot's intended role — "Pokémon" / "Trainer" / "Energy" — not
    # derived from `card.supertype` at read time, since it's what the slot
    # was drawn *as*, which happens to always match the card's own
    # supertype today but is conceptually the slot's identity.
    supertype = models.CharField(max_length=20)
    # Stored rather than re-derived from `card.rarity` via tier_for_rarity()
    # at read time — cheap, and keeps a historical pull showing what was
    # actually rolled even if tier classification rules ever change later.
    rarity_tier = models.CharField(max_length=10, choices=RarityTier.choices)
    order = models.PositiveSmallIntegerField()  # 0-4 = the 5 Pokémon slots, 5 = Trainer, 6 = Energy

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.card.name} ({self.supertype}, {self.rarity_tier})"
