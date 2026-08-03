from django.db import IntegrityError
from django.test import TestCase

from cards.models import Card, Set, Type


class SetModelTests(TestCase):
    def test_imported_defaults_false(self):
        set_obj = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        self.assertFalse(set_obj.imported)


class CardModelTests(TestCase):
    def setUp(self):
        self.set_obj = Set.objects.create(tcg_id="base1", name="Base", series="Base")

    def test_card_accepts_zero_types(self):
        card = Card.objects.create(
            tcg_id="base1-1",
            set=self.set_obj,
            name="Trainer Card",
            number="1",
            supertype="Trainer",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.assertEqual(card.types.count(), 0)

    def test_tcg_id_is_the_uniqueness_guarantee(self):
        Card.objects.create(
            tcg_id="base1-1",
            set=self.set_obj,
            name="Card A",
            number="1",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        with self.assertRaises(IntegrityError):
            Card.objects.create(
                tcg_id="base1-1",
                set=self.set_obj,
                name="Card A Duplicate",
                number="99",
                supertype="Pokémon",
                image_small="https://example.com/small.png",
                image_large="https://example.com/large.png",
            )

    def test_allows_multiple_cards_sharing_a_number(self):
        # No (set, number, language) uniqueness — real data disproves that
        # assumption (e.g. Celebrations: Classic Collection's #15 is 4 distinct
        # cards; Black Bolt's #60 is too). tcg_id is the real identity guarantee.
        Card.objects.create(
            tcg_id="cel25c-15_A1",
            set=self.set_obj,
            name="Venusaur",
            number="15",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        Card.objects.create(
            tcg_id="cel25c-15_A2",
            set=self.set_obj,
            name="Here Comes Team Rocket!",
            number="15",
            supertype="Trainer",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.assertEqual(Card.objects.filter(set=self.set_obj, number="15").count(), 2)


class TypeModelTests(TestCase):
    def test_name_unique(self):
        Type.objects.create(name="Fire")
        with self.assertRaises(IntegrityError):
            Type.objects.create(name="Fire")
