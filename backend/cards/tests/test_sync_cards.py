import json
from pathlib import Path

import responses
from django.core.management import call_command
from django.test import TestCase, override_settings

from cards.api_client import BASE_URL, build_session
from cards.models import Attack, Card, Resistance, Set, Weakness
from cards.sync import get_type_cache, sets_to_sync, sync_cards_for_set, sync_sets

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name):
    return json.loads((FIXTURES / name).read_text())


@override_settings(SYNC_REQUEST_DELAY_SECONDS=0, SYNC_RETRY_BACKOFF_FACTOR=0)
class SyncSetsTests(TestCase):
    @responses.activate
    def test_creates_sets_from_fixture(self):
        responses.add(responses.GET, f"{BASE_URL}/sets", json=load_fixture("sets_page.json"))

        sync_sets(build_session())

        self.assertEqual(Set.objects.count(), 2)
        base = Set.objects.get(tcg_id="base1")
        self.assertEqual(base.name, "Base")
        self.assertEqual(base.series, "Base")
        self.assertEqual(str(base.release_date), "1999-01-09")
        self.assertEqual(base.image_symbol, "https://images.pokemontcg.io/base1/symbol.png")
        self.assertEqual(base.image_logo, "https://images.pokemontcg.io/base1/logo.png")
        self.assertEqual(base.details["ptcgoCode"], "BS")
        self.assertFalse(base.imported)

    @responses.activate
    def test_update_preserves_imported_flag(self):
        Set.objects.create(tcg_id="base1", name="Old Name", series="Base", imported=True)
        responses.add(responses.GET, f"{BASE_URL}/sets", json=load_fixture("sets_page.json"))

        sync_sets(build_session())

        base = Set.objects.get(tcg_id="base1")
        self.assertEqual(base.name, "Base")
        self.assertTrue(base.imported)
        self.assertEqual(Set.objects.filter(tcg_id="base1").count(), 1)


class SetsToSyncTests(TestCase):
    def setUp(self):
        self.done = Set.objects.create(tcg_id="base1", name="Base", series="Base", imported=True)
        self.pending = Set.objects.create(
            tcg_id="base2", name="Jungle", series="Base", imported=False
        )

    def test_default_only_returns_unimported(self):
        result = list(sets_to_sync())
        self.assertEqual(result, [self.pending])

    def test_force_returns_all(self):
        result = list(sets_to_sync(force=True))
        self.assertEqual(set(result), {self.done, self.pending})

    def test_target_set_returns_only_that_one(self):
        result = list(sets_to_sync(target_tcg_id="base1"))
        self.assertEqual(result, [self.done])


@override_settings(SYNC_REQUEST_DELAY_SECONDS=0, SYNC_RETRY_BACKOFF_FACTOR=0)
class SyncCardsForSetTests(TestCase):
    def setUp(self):
        self.set_obj = Set.objects.create(tcg_id="base1", name="Base", series="Base")

    @responses.activate
    def test_creates_cards_with_relations(self):
        responses.add(responses.GET, f"{BASE_URL}/cards", json=load_fixture("cards_page.json"))

        sync_cards_for_set(build_session(), self.set_obj, get_type_cache())

        self.assertEqual(Card.objects.count(), 3)
        self.set_obj.refresh_from_db()
        self.assertTrue(self.set_obj.imported)

        aggron = Card.objects.get(tcg_id="hgss4-1")
        self.assertEqual(aggron.hp, "140")
        self.assertEqual(list(aggron.types.values_list("name", flat=True)), ["Metal"])
        self.assertEqual(aggron.artist, "Kagemaru Himeno")
        self.assertEqual(aggron.national_pokedex_numbers, [306])
        self.assertEqual(aggron.tcgplayer_url, "https://prices.pokemontcg.io/tcgplayer/hgss4-1")
        self.assertNotIn("attacks", aggron.details)
        self.assertNotIn("tcgplayer", aggron.details)
        self.assertIn("retreatCost", aggron.details)
        self.assertEqual(aggron.attacks.count(), 2)
        self.assertEqual(aggron.weaknesses.count(), 1)
        self.assertEqual(aggron.weaknesses.first().type.name, "Fire")
        self.assertEqual(aggron.weaknesses.first().value, "×2")
        self.assertEqual(aggron.resistances.count(), 1)
        self.assertEqual(aggron.resistances.first().type.name, "Psychic")

        trainer = Card.objects.get(tcg_id="dpp-DP05")
        self.assertEqual(trainer.hp, "")
        self.assertEqual(trainer.types.count(), 0)
        self.assertEqual(trainer.attacks.count(), 0)
        self.assertIn("rules", trainer.details)

        eevee = Card.objects.get(tcg_id="base1-e1")
        self.assertEqual(
            eevee.evolves_to,
            [
                "Vaporeon",
                "Jolteon",
                "Flareon",
                "Sylveon",
                "Espeon",
                "Umbreon",
                "Leafeon",
                "Glaceon",
            ],
        )
        self.assertEqual(eevee.evolves_from, "")

    @responses.activate
    def test_resync_replaces_not_duplicates_related_rows(self):
        responses.add(responses.GET, f"{BASE_URL}/cards", json=load_fixture("cards_page.json"))
        session = build_session()
        type_cache = get_type_cache()

        sync_cards_for_set(session, self.set_obj, type_cache)
        sync_cards_for_set(session, self.set_obj, type_cache)

        self.assertEqual(Card.objects.count(), 3)
        aggron = Card.objects.get(tcg_id="hgss4-1")
        self.assertEqual(Attack.objects.filter(card=aggron).count(), 2)
        self.assertEqual(Weakness.objects.filter(card=aggron).count(), 1)
        self.assertEqual(Resistance.objects.filter(card=aggron).count(), 1)


@override_settings(SYNC_REQUEST_DELAY_SECONDS=0, SYNC_RETRY_BACKOFF_FACTOR=0)
class RetryBackoffTests(TestCase):
    @responses.activate
    def test_retries_after_429_then_succeeds(self):
        responses.add(responses.GET, f"{BASE_URL}/sets", status=429)
        responses.add(responses.GET, f"{BASE_URL}/sets", json=load_fixture("sets_page.json"))

        sync_sets(build_session())

        self.assertEqual(Set.objects.count(), 2)
        self.assertEqual(len(responses.calls), 2)


@override_settings(SYNC_REQUEST_DELAY_SECONDS=0, SYNC_RETRY_BACKOFF_FACTOR=0)
class SyncCardsCommandTests(TestCase):
    @responses.activate
    def test_force_reimports_already_imported_set(self):
        Set.objects.create(tcg_id="base1", name="Stale Name", series="Base", imported=True)
        responses.add(responses.GET, f"{BASE_URL}/sets", json=load_fixture("sets_page.json"))
        responses.add(responses.GET, f"{BASE_URL}/cards", json=load_fixture("cards_page.json"))

        call_command("sync_cards", set_tcg_id="base1", force=True)

        base = Set.objects.get(tcg_id="base1")
        self.assertEqual(base.name, "Base")
        self.assertTrue(base.imported)
        self.assertEqual(Card.objects.count(), 3)

    @responses.activate
    def test_set_flag_targets_only_that_set(self):
        responses.add(responses.GET, f"{BASE_URL}/sets", json=load_fixture("sets_page.json"))
        responses.add(responses.GET, f"{BASE_URL}/cards", json=load_fixture("cards_page.json"))

        call_command("sync_cards", set_tcg_id="base1")

        base = Set.objects.get(tcg_id="base1")
        jungle = Set.objects.get(tcg_id="base2")
        self.assertTrue(base.imported)
        self.assertFalse(jungle.imported)

    @responses.activate
    def test_one_failing_set_does_not_block_others_but_command_reports_error(self):
        from django.core.management.base import CommandError

        responses.add(responses.GET, f"{BASE_URL}/sets", json=load_fixture("sets_page.json"))
        # base1's card fetch fails every retry attempt; base2 (registered second) succeeds.
        responses.add(responses.GET, f"{BASE_URL}/cards", status=500)
        responses.add(responses.GET, f"{BASE_URL}/cards", status=500)
        responses.add(responses.GET, f"{BASE_URL}/cards", status=500)
        responses.add(responses.GET, f"{BASE_URL}/cards", status=500)
        responses.add(responses.GET, f"{BASE_URL}/cards", status=500)
        responses.add(responses.GET, f"{BASE_URL}/cards", status=500)
        responses.add(responses.GET, f"{BASE_URL}/cards", json=load_fixture("cards_page.json"))

        with self.assertRaises(CommandError):
            call_command("sync_cards")

        base = Set.objects.get(tcg_id="base1")
        jungle = Set.objects.get(tcg_id="base2")
        self.assertFalse(base.imported)
        self.assertTrue(jungle.imported)
