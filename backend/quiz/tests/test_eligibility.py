from django.test import TestCase

from cards.models import Card, Set
from quiz.eligibility import eligible_card_ids


class EligibilityTests(TestCase):
    def setUp(self):
        self.set_obj = Set.objects.create(tcg_id="base1", name="Base", series="Base")

        self.pokemon_common = self._make_card("p1", "Squirtle", "Pokémon", "Common", hp="40")
        self.pokemon_no_hp = self._make_card("p2", "Weird Pokémon", "Pokémon", "Common", hp="")
        self.trainer_common = self._make_card("t1", "Bill", "Trainer", "Common")
        self.trainer_secret_rare = self._make_card(
            "t2", "Professor's Research", "Trainer", "Rare Secret"
        )
        self.energy = self._make_card("e1", "Fire Energy", "Energy", "Common")
        self.pokemon_rare_holo = self._make_card(
            "p3", "Charizard", "Pokémon", "Rare Holo", hp="120"
        )

    def _make_card(self, tcg_id, name, supertype, rarity, hp=""):
        return Card.objects.create(
            tcg_id=tcg_id,
            set=self.set_obj,
            name=name,
            number="1",
            supertype=supertype,
            rarity=rarity,
            hp=hp,
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )

    def test_guess_card_includes_pokemon_any_rarity(self):
        ids = eligible_card_ids("guess_card")
        self.assertIn(self.pokemon_common.id, ids)

    def test_guess_card_includes_trainer_only_at_special_tier(self):
        ids = eligible_card_ids("guess_card")
        self.assertIn(self.trainer_secret_rare.id, ids)
        self.assertNotIn(self.trainer_common.id, ids)

    def test_guess_card_excludes_energy(self):
        ids = eligible_card_ids("guess_card")
        self.assertNotIn(self.energy.id, ids)

    def test_guess_hp_is_pokemon_only(self):
        ids = eligible_card_ids("guess_hp")
        self.assertIn(self.pokemon_common.id, ids)
        self.assertNotIn(self.trainer_secret_rare.id, ids)
        self.assertNotIn(self.energy.id, ids)

    def test_guess_set_has_no_era_restriction(self):
        # Same asymmetric rule as guess_card — every card stays eligible regardless
        # of its set's release date (see docs/decisions.md #029).
        ids = eligible_card_ids("guess_set")
        self.assertIn(self.pokemon_common.id, ids)
        self.assertIn(self.trainer_secret_rare.id, ids)
        self.assertNotIn(self.trainer_common.id, ids)
        self.assertNotIn(self.energy.id, ids)

    def test_rarities_param_narrows_but_does_not_widen(self):
        ids = eligible_card_ids("guess_card", rarities=["Common"])
        self.assertIn(self.pokemon_common.id, ids)
        # A common Trainer card is still ineligible even when "Common" is requested —
        # rarities narrows within the baseline, it can't make an otherwise-ineligible
        # card eligible.
        self.assertNotIn(self.trainer_common.id, ids)

    def test_easy_difficulty_is_the_chase_tier(self):
        # Reversed from what "rare" suggests, per explicit user direction —
        # a distinctive chase-tier card is easier for most players to place
        # by set than a common. See docs/decisions.md #047.
        ids = eligible_card_ids("guess_card", difficulty="easy")
        self.assertIn(self.trainer_secret_rare.id, ids)
        self.assertNotIn(self.pokemon_common.id, ids)
        self.assertNotIn(self.pokemon_rare_holo.id, ids)

    def test_hard_difficulty_is_common_uncommon_rare(self):
        ids = eligible_card_ids("guess_card", difficulty="hard")
        self.assertIn(self.pokemon_common.id, ids)
        self.assertNotIn(self.trainer_secret_rare.id, ids)
        self.assertNotIn(self.pokemon_rare_holo.id, ids)

    def test_medium_difficulty_is_everything_between(self):
        ids = eligible_card_ids("guess_card", difficulty="medium")
        self.assertIn(self.pokemon_rare_holo.id, ids)
        self.assertNotIn(self.pokemon_common.id, ids)
        self.assertNotIn(self.trainer_secret_rare.id, ids)

    def test_hard_difficulty_narrows_but_does_not_widen(self):
        # A common Trainer card is still ineligible under "hard" even though
        # "Common" is one of hard's rarities — difficulty narrows within the
        # mode's baseline, same as the plain rarities param above.
        ids = eligible_card_ids("guess_card", difficulty="hard")
        self.assertNotIn(self.trainer_common.id, ids)
