from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import ProtectedError
from django.test import TestCase

from cards.models import Card, Set
from collection.models import CollectionEntry, Favorite

User = get_user_model()


class CollectionConstraintTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        set_obj = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        self.card = Card.objects.create(
            tcg_id="base1-4",
            set=set_obj,
            name="Charizard",
            number="4",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )

    def test_collection_entry_unique_per_user_and_card(self):
        CollectionEntry.objects.create(user=self.user, card=self.card, quantity=1)

        with self.assertRaises(IntegrityError), transaction.atomic():
            CollectionEntry.objects.create(user=self.user, card=self.card, quantity=1)

    def test_favorite_unique_per_user_and_card(self):
        Favorite.objects.create(user=self.user, card=self.card)

        with self.assertRaises(IntegrityError), transaction.atomic():
            Favorite.objects.create(user=self.user, card=self.card)

    def test_card_cannot_be_deleted_while_owned(self):
        CollectionEntry.objects.create(user=self.user, card=self.card, quantity=1)

        with self.assertRaises(ProtectedError), transaction.atomic():
            self.card.delete()

    def test_card_cannot_be_deleted_while_favorited(self):
        Favorite.objects.create(user=self.user, card=self.card)

        with self.assertRaises(ProtectedError), transaction.atomic():
            self.card.delete()

    def test_collection_entry_str(self):
        entry = CollectionEntry.objects.create(user=self.user, card=self.card, quantity=2)
        self.assertEqual(str(entry), f"{self.user} owns 2x Charizard")

    def test_favorite_str(self):
        favorite = Favorite.objects.create(user=self.user, card=self.card)
        self.assertEqual(str(favorite), f"{self.user} favorited Charizard")
