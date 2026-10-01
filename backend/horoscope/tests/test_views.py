import datetime

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from cards.models import Card, Set
from horoscope.models import HoroscopePull

User = get_user_model()


class HoroscopeTestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="s3cret-pass!")
        self.other_user = User.objects.create_user(username="other", password="s3cret-pass!")
        self.set_obj = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        # At least one Common card per supertype so every slot can always
        # resolve without hitting HoroscopeSelectionError.
        for i, supertype in enumerate(["Pokémon", "Trainer", "Energy"]):
            Card.objects.create(
                tcg_id=f"base1-{i}",
                set=self.set_obj,
                name=f"Card {i}",
                number=str(i),
                supertype=supertype,
                rarity="Common",
                image_small="https://example.com/small.png",
                image_large="https://example.com/large.png",
            )


class HoroscopeTodayViewTests(HoroscopeTestBase):
    def test_requires_authentication(self):
        response = self.client.post(reverse("horoscope-today"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_first_pull_of_the_day_creates_one_pull_with_seven_cards(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(reverse("horoscope-today"))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(HoroscopePull.objects.filter(user=self.user).count(), 1)
        self.assertEqual(len(response.data["cards"]), 7)

    def test_second_pull_same_day_returns_200_and_does_not_create_a_second_pull(self):
        self.client.force_authenticate(self.user)
        self.client.post(reverse("horoscope-today"))

        response = self.client.post(reverse("horoscope-today"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(HoroscopePull.objects.filter(user=self.user).count(), 1)

    def test_pulling_on_a_new_day_creates_a_second_pull(self):
        # Seeds yesterday's pull directly via the ORM rather than mocking
        # timezone.now() (no time-mocking dependency exists in this project
        # — see docs/decisions.md #061) — this exercises "keyed by date, not
        # wall-clock" directly: a pull dated anything other than today must
        # not satisfy today's uniqueness check.
        yesterday = datetime.date.today() - datetime.timedelta(days=1)
        HoroscopePull.objects.create(user=self.user, pull_date=yesterday)
        self.client.force_authenticate(self.user)

        response = self.client.post(reverse("horoscope-today"))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(HoroscopePull.objects.filter(user=self.user).count(), 2)

    def test_response_cards_include_supertype_rarity_tier_and_order(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(reverse("horoscope-today"))

        first_card = response.data["cards"][0]
        self.assertIn("card", first_card)
        self.assertIn("supertype", first_card)
        self.assertIn("rarity_tier", first_card)
        self.assertEqual(first_card["order"], 0)


class HoroscopePullListViewTests(HoroscopeTestBase):
    def test_requires_authentication(self):
        response = self.client.get(reverse("horoscope-pull-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_only_returns_the_requesting_users_pulls(self):
        HoroscopePull.objects.create(user=self.user, pull_date=datetime.date.today())
        HoroscopePull.objects.create(
            user=self.other_user, pull_date=datetime.date.today() - datetime.timedelta(days=1)
        )

        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("horoscope-pull-list"))

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
