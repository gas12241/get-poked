from django.conf import settings
from django.db import models

from cards.models import Card


class CollectionEntry(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="collection_entries"
    )
    card = models.ForeignKey(Card, on_delete=models.PROTECT, related_name="collection_entries")
    quantity = models.PositiveSmallIntegerField(default=1)
    date_added = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "card"], name="unique_collection_entry_per_user_per_card"
            )
        ]
        ordering = ["-date_added"]

    def __str__(self):
        return f"{self.user} owns {self.quantity}x {self.card.name}"


class Favorite(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="favorites"
    )
    card = models.ForeignKey(Card, on_delete=models.PROTECT, related_name="favorited_by")
    date_added = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "card"], name="unique_favorite_per_user_per_card"
            )
        ]
        ordering = ["-date_added"]

    def __str__(self):
        return f"{self.user} favorited {self.card.name}"
