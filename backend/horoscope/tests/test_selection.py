import datetime
import random
from collections import Counter

from django.contrib.auth import get_user_model
from django.test import TestCase

from cards.models import Card, Set
from horoscope.models import HoroscopeCard
from horoscope.selection import (
    ENERGY,
    POKEMON,
    TRAINER,
    HoroscopeSelectionError,
    build_daily_pull,
    eligible_card_ids_for_tier,
    pick_slot,
)

User = get_user_model()


class SelectionTestBase(TestCase):
    def setUp(self):
        self.set_obj = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        self._counter = 0

    def make_card(self, supertype, rarity):
        self._counter += 1
        return Card.objects.create(
            tcg_id=f"base1-{self._counter}",
            set=self.set_obj,
            name=f"Card {self._counter}",
            number=str(self._counter),
            supertype=supertype,
            rarity=rarity,
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )


class EligibleCardIdsForTierTests(SelectionTestBase):
    def test_returns_only_the_requested_supertype_and_tier(self):
        chase = self.make_card(POKEMON, "Rare Secret")
        common = self.make_card(POKEMON, "Common")
        mid = self.make_card(POKEMON, "Rare Holo")
        other_supertype_chase = self.make_card(TRAINER, "Rare Secret")

        ids = eligible_card_ids_for_tier(POKEMON, "chase")

        self.assertIn(chase.id, ids)
        self.assertNotIn(common.id, ids)
        self.assertNotIn(mid.id, ids)
        self.assertNotIn(other_supertype_chase.id, ids)

    def test_mid_tier_excludes_chase_and_common(self):
        mid = self.make_card(POKEMON, "Rare Holo")
        chase = self.make_card(POKEMON, "Rare Secret")
        common = self.make_card(POKEMON, "Common")

        ids = eligible_card_ids_for_tier(POKEMON, "mid")

        self.assertIn(mid.id, ids)
        self.assertNotIn(chase.id, ids)
        self.assertNotIn(common.id, ids)


class PickSlotFallbackTests(SelectionTestBase):
    def test_falls_back_from_chase_to_mid_when_chase_is_empty(self):
        mid = self.make_card(ENERGY, "Rare Holo")
        random.seed(0)  # a seed that rolls "chase" at least once below

        # Roll enough times that a "chase" roll is virtually guaranteed
        # (5% per roll, so ~1000 rolls makes "never once" astronomically
        # unlikely) — every single result must fall back to the only card
        # that actually exists, since Energy has no chase/common cards here.
        for _ in range(1000):
            card_id, tier = pick_slot(ENERGY)
            self.assertEqual(card_id, mid.id)
            self.assertEqual(tier, "mid")

    def test_falls_back_from_chase_through_mid_to_common_when_both_are_empty(self):
        common = self.make_card(ENERGY, "Common")
        for _ in range(1000):
            card_id, tier = pick_slot(ENERGY)
            self.assertEqual(card_id, common.id)
            self.assertEqual(tier, "common")

    def test_raises_when_no_eligible_cards_exist_for_any_tier(self):
        with self.assertRaises(HoroscopeSelectionError):
            pick_slot(ENERGY)


class PickSlotDistributionTests(SelectionTestBase):
    def test_tier_distribution_is_close_to_70_25_5(self):
        # All three tiers populated, so no fallback ever triggers — this
        # isolates the weighting itself. Fixed seed for a deterministic,
        # non-flaky assertion rather than a statistical one.
        self.make_card(POKEMON, "Common")
        self.make_card(POKEMON, "Rare Holo")
        self.make_card(POKEMON, "Rare Secret")
        random.seed(42)

        tiers = Counter(pick_slot(POKEMON)[1] for _ in range(20000))

        total = sum(tiers.values())
        self.assertAlmostEqual(tiers["common"] / total, 0.70, delta=0.02)
        self.assertAlmostEqual(tiers["mid"] / total, 0.25, delta=0.02)
        self.assertAlmostEqual(tiers["chase"] / total, 0.05, delta=0.02)


class BuildDailyPullTests(SelectionTestBase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        # At least one eligible card per supertype so every slot resolves.
        self.make_card(POKEMON, "Common")
        self.make_card(TRAINER, "Common")
        self.make_card(ENERGY, "Common")

    def test_creates_seven_cards_in_the_right_slot_order(self):
        pull = build_daily_pull(self.user, datetime.date(2026, 1, 1))

        cards = list(pull.cards.all())
        self.assertEqual(len(cards), 7)
        self.assertEqual([c.order for c in cards], [0, 1, 2, 3, 4, 5, 6])
        self.assertEqual([c.supertype for c in cards[:5]], [POKEMON] * 5)
        self.assertEqual(cards[5].supertype, TRAINER)
        self.assertEqual(cards[6].supertype, ENERGY)

    def test_duplicate_cards_are_allowed_across_pokemon_slots(self):
        # Only one eligible Pokémon card exists in this fixture, so all 5
        # Pokémon slots must resolve to the very same card — proving
        # pick_slot never excludes a card already picked earlier in the
        # same pull, by design (confirmed with the user).
        pull = build_daily_pull(self.user, datetime.date(2026, 1, 1))

        pokemon_card_ids = {c.card_id for c in pull.cards.filter(supertype=POKEMON)}
        self.assertEqual(len(pokemon_card_ids), 1)

    def test_rarity_tier_is_stored_per_card(self):
        pull = build_daily_pull(self.user, datetime.date(2026, 1, 1))
        for card in pull.cards.all():
            self.assertIn(card.rarity_tier, ("common", "mid", "chase"))

    def test_all_seven_cards_belong_to_the_same_pull(self):
        build_daily_pull(self.user, datetime.date(2026, 1, 1))
        self.assertEqual(HoroscopeCard.objects.count(), 7)
