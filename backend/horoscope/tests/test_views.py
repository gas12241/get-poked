import datetime

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from cards.models import Card, Set
from horoscope.models import HoroscopePull
from horoscope.selection import build_daily_pull

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


class HoroscopePullDatesViewTests(HoroscopeTestBase):
    def test_requires_authentication(self):
        response = self.client.get(reverse("horoscope-pull-dates"), {"month": "2026-09"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_month_returns_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("horoscope-pull-dates"))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_malformed_month_returns_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("horoscope-pull-dates"), {"month": "not-a-month"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_out_of_range_month_returns_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("horoscope-pull-dates"), {"month": "2026-13"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_returns_only_dates_within_the_requested_month(self):
        HoroscopePull.objects.create(user=self.user, pull_date=datetime.date(2026, 9, 5))
        HoroscopePull.objects.create(user=self.user, pull_date=datetime.date(2026, 9, 20))
        # A different month, and a different year sharing the same month
        # number — both must be excluded.
        HoroscopePull.objects.create(user=self.user, pull_date=datetime.date(2026, 10, 1))
        HoroscopePull.objects.create(user=self.user, pull_date=datetime.date(2025, 9, 5))
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("horoscope-pull-dates"), {"month": "2026-09"})

        self.assertEqual(response.data["dates"], ["2026-09-05", "2026-09-20"])

    def test_scoped_to_the_requesting_user_only(self):
        HoroscopePull.objects.create(user=self.user, pull_date=datetime.date(2026, 9, 5))
        HoroscopePull.objects.create(user=self.other_user, pull_date=datetime.date(2026, 9, 6))
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("horoscope-pull-dates"), {"month": "2026-09"})

        self.assertEqual(response.data["dates"], ["2026-09-05"])


class HoroscopePullDetailViewTests(HoroscopeTestBase):
    def test_requires_authentication(self):
        response = self.client.get(reverse("horoscope-pull-detail", kwargs={"date": "2026-09-05"}))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_the_pull_for_that_date_with_nested_cards(self):
        self.client.force_authenticate(self.user)
        build_daily_pull(self.user, datetime.date(2026, 9, 5))

        response = self.client.get(reverse("horoscope-pull-detail", kwargs={"date": "2026-09-05"}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["pull_date"], "2026-09-05")
        self.assertEqual(len(response.data["cards"]), 7)

    def test_returns_404_for_a_date_with_no_pull(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("horoscope-pull-detail", kwargs={"date": "2026-09-05"}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_returns_404_rather_than_another_users_pull_for_the_same_date(self):
        # The security-relevant case: a date can't be probed across
        # accounts just by guessing it, even though this endpoint has no
        # other per-user secret in its URL.
        build_daily_pull(self.other_user, datetime.date(2026, 9, 5))
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("horoscope-pull-detail", kwargs={"date": "2026-09-05"}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_malformed_date_returns_404(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("horoscope-pull-detail", kwargs={"date": "not-a-date"}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
