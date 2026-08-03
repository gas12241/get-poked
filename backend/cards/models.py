from django.contrib.postgres.fields import ArrayField
from django.db import models


class Set(models.Model):
    tcg_id = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=100)
    series = models.CharField(max_length=100)
    release_date = models.DateField(null=True, blank=True)
    language = models.CharField(max_length=5, default="en")
    imported = models.BooleanField(default=False)
    image_symbol = models.URLField(max_length=255, blank=True, default="")
    image_logo = models.URLField(max_length=255, blank=True, default="")
    details = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.name


class Type(models.Model):
    name = models.CharField(max_length=30, unique=True)

    def __str__(self):
        return self.name


class Card(models.Model):
    tcg_id = models.CharField(max_length=50, unique=True)
    set = models.ForeignKey(Set, on_delete=models.PROTECT, related_name="cards")
    name = models.CharField(max_length=255)
    number = models.CharField(max_length=20)
    rarity = models.CharField(max_length=50, blank=True, default="")
    hp = models.CharField(max_length=10, blank=True, default="")
    supertype = models.CharField(max_length=20)
    language = models.CharField(max_length=5, default="en")
    image_small = models.URLField(max_length=255)
    image_large = models.URLField(max_length=255)
    artist = models.CharField(max_length=255, blank=True, default="")
    national_pokedex_numbers = ArrayField(
        models.PositiveSmallIntegerField(), default=list, blank=True
    )
    subtypes = ArrayField(models.CharField(max_length=50), default=list, blank=True)
    evolves_from = models.CharField(max_length=255, blank=True, default="")
    evolves_to = ArrayField(models.CharField(max_length=255), default=list, blank=True)
    tcgplayer_url = models.URLField(max_length=255, blank=True, default="")
    cardmarket_url = models.URLField(max_length=255, blank=True, default="")
    details = models.JSONField(default=dict, blank=True)
    types = models.ManyToManyField(Type, related_name="cards", blank=True)

    class Meta:
        # No (set, number, language) uniqueness constraint: real data disproves the
        # assumption that a printed number is unique within a set (e.g. Celebrations:
        # Classic Collection's card #15 is 4 distinct cards; Black Bolt's #60 is too).
        # tcg_id (already unique) is the real identity guarantee. See docs/decisions.md #026.
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["rarity"]),
            models.Index(fields=["supertype"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.set.name} #{self.number})"


class Attack(models.Model):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="attacks")
    name = models.CharField(max_length=100)
    cost = models.JSONField(default=list, blank=True)
    converted_energy_cost = models.PositiveSmallIntegerField(null=True, blank=True)
    damage = models.CharField(max_length=20, blank=True, default="")
    text = models.TextField(blank=True, default="")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.name} ({self.card.name})"


class Weakness(models.Model):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="weaknesses")
    type = models.ForeignKey(Type, on_delete=models.PROTECT, related_name="weakness_entries")
    value = models.CharField(max_length=10)

    def __str__(self):
        return f"{self.card.name} weak to {self.type.name} ({self.value})"


class Resistance(models.Model):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="resistances")
    type = models.ForeignKey(Type, on_delete=models.PROTECT, related_name="resistance_entries")
    value = models.CharField(max_length=10)

    def __str__(self):
        return f"{self.card.name} resists {self.type.name} ({self.value})"
