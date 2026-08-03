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

    def test_unique_constraint_blocks_duplicate_set_number_language(self):
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
                tcg_id="base1-1-dup",
                set=self.set_obj,
                name="Card A Duplicate",
                number="1",
                supertype="Pokémon",
                image_small="https://example.com/small.png",
                image_large="https://example.com/large.png",
            )

    def test_unique_constraint_allows_same_number_different_set(self):
        other_set = Set.objects.create(tcg_id="base2", name="Jungle", series="Base")
        Card.objects.create(
            tcg_id="base1-1",
            set=self.set_obj,
            name="Card A",
            number="1",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        # Should not raise: different set, same number.
        Card.objects.create(
            tcg_id="base2-1",
            set=other_set,
            name="Card B",
            number="1",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.assertEqual(Card.objects.count(), 2)


class TypeModelTests(TestCase):
    def test_name_unique(self):
        Type.objects.create(name="Fire")
        with self.assertRaises(IntegrityError):
            Type.objects.create(name="Fire")
