import datetime

from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.db.models import ProtectedError
from django.test import TestCase

from cards.models import Card, Set
from horoscope.models import HoroscopeCard, HoroscopePull

User = get_user_model()


class HoroscopePullModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        self.today = datetime.date(2026, 1, 1)

    def test_create_pull(self):
        pull = HoroscopePull.objects.create(user=self.user, pull_date=self.today)
        self.assertIsNotNone(pull.pulled_at)

    def test_second_pull_same_user_same_day_is_rejected(self):
        HoroscopePull.objects.create(user=self.user, pull_date=self.today)
        with self.assertRaises(IntegrityError):
            HoroscopePull.objects.create(user=self.user, pull_date=self.today)

    def test_same_user_different_day_is_allowed(self):
        HoroscopePull.objects.create(user=self.user, pull_date=self.today)
        tomorrow = self.today + datetime.timedelta(days=1)
        HoroscopePull.objects.create(user=self.user, pull_date=tomorrow)
        self.assertEqual(HoroscopePull.objects.filter(user=self.user).count(), 2)

    def test_different_user_same_day_is_allowed(self):
        HoroscopePull.objects.create(user=self.user, pull_date=self.today)
        other_user = User.objects.create_user(email="other@example.com", password="s3cret-pass!")
        HoroscopePull.objects.create(user=other_user, pull_date=self.today)
        self.assertEqual(HoroscopePull.objects.filter(pull_date=self.today).count(), 2)

    def test_deleting_user_cascades_to_pulls(self):
        HoroscopePull.objects.create(user=self.user, pull_date=self.today)
        self.user.delete()
        self.assertEqual(HoroscopePull.objects.count(), 0)


class HoroscopeCardModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        self.set_obj = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        self.card = Card.objects.create(
            tcg_id="base1-4",
            set=self.set_obj,
            name="Charizard",
            number="4",
            supertype="Pokémon",
            rarity="Rare Holo",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.pull = HoroscopePull.objects.create(
            user=self.user, pull_date=datetime.date(2026, 1, 1)
        )

    def test_create_card(self):
        card = HoroscopeCard.objects.create(
            pull=self.pull, card=self.card, supertype="Pokémon", rarity_tier="mid", order=0
        )
        self.assertEqual(self.pull.cards.count(), 1)
        self.assertEqual(card.card, self.card)

    def test_deleting_pull_cascades_to_cards(self):
        HoroscopeCard.objects.create(
            pull=self.pull, card=self.card, supertype="Pokémon", rarity_tier="mid", order=0
        )
        self.pull.delete()
        self.assertEqual(HoroscopeCard.objects.count(), 0)

    def test_deleting_card_is_protected(self):
        HoroscopeCard.objects.create(
            pull=self.pull, card=self.card, supertype="Pokémon", rarity_tier="mid", order=0
        )
        with self.assertRaises(ProtectedError):
            self.card.delete()
