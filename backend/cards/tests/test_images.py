import responses
from django.core.management import call_command
from django.test import TestCase
from requests.exceptions import ConnectionError as RequestsConnectionError

from cards.images import check_and_fix_card_images
from cards.models import Card, Set


class CheckAndFixCardImagesTests(TestCase):
    def setUp(self):
        self.set_a = Set.objects.create(tcg_id="mcd14", name="McDonald's Collection 2014", series="Promo")

    def make_card(self, tcg_id, image_small, image_large):
        return Card.objects.create(
            tcg_id=tcg_id,
            set=self.set_a,
            name=tcg_id,
            number="1",
            supertype="Pokémon",
            image_small=image_small,
            image_large=image_large,
        )

    @responses.activate
    def test_leaves_a_working_small_image_untouched(self):
        card = self.make_card(
            "ok1", "https://images.pokemontcg.io/ok1.png", "https://images.pokemontcg.io/ok1_hires.png"
        )
        responses.add(responses.HEAD, card.image_small, status=200)

        results = check_and_fix_card_images(Card.objects.all())

        self.assertEqual(results["ok"], 1)
        self.assertEqual(results["fallback"], [])
        self.assertEqual(results["unavailable"], [])
        card.refresh_from_db()
        self.assertEqual(card.image_small, "https://images.pokemontcg.io/ok1.png")

    @responses.activate
    def test_falls_back_to_image_large_when_only_that_one_works(self):
        card = self.make_card(
            "broken1", "https://images.pokemontcg.io/broken1.png", "https://images.pokemontcg.io/broken1_hires.png"
        )
        responses.add(responses.HEAD, card.image_small, status=404)
        responses.add(responses.HEAD, card.image_large, status=200)

        results = check_and_fix_card_images(Card.objects.all())

        self.assertEqual(len(results["fallback"]), 1)
        self.assertEqual(results["unavailable"], [])
        card.refresh_from_db()
        self.assertEqual(card.image_small, "https://images.pokemontcg.io/broken1_hires.png")
        self.assertEqual(card.image_large, "https://images.pokemontcg.io/broken1_hires.png")

    @responses.activate
    def test_blanks_both_when_neither_image_works(self):
        card = self.make_card(
            "dead1", "https://images.pokemontcg.io/dead1.png", "https://images.pokemontcg.io/dead1_hires.png"
        )
        responses.add(responses.HEAD, card.image_small, status=404)
        responses.add(responses.HEAD, card.image_large, status=404)

        results = check_and_fix_card_images(Card.objects.all())

        self.assertEqual(results["fallback"], [])
        self.assertEqual(len(results["unavailable"]), 1)
        card.refresh_from_db()
        self.assertEqual(card.image_small, "")
        self.assertEqual(card.image_large, "")

    @responses.activate
    def test_a_network_error_is_treated_the_same_as_unreachable(self):
        card = self.make_card(
            "err1", "https://images.pokemontcg.io/err1.png", "https://images.pokemontcg.io/err1_hires.png"
        )
        responses.add(
            responses.HEAD,
            card.image_small,
            body=RequestsConnectionError("simulated network failure"),
        )
        responses.add(responses.HEAD, card.image_large, status=200)

        results = check_and_fix_card_images(Card.objects.all())

        self.assertEqual(len(results["fallback"]), 1)

    @responses.activate
    def test_management_command_runs_and_reports(self):
        card = self.make_card(
            "cmd1", "https://images.pokemontcg.io/cmd1.png", "https://images.pokemontcg.io/cmd1_hires.png"
        )
        responses.add(responses.HEAD, card.image_small, status=404)
        responses.add(responses.HEAD, card.image_large, status=200)

        call_command("check_card_images")

        card.refresh_from_db()
        self.assertEqual(card.image_small, "https://images.pokemontcg.io/cmd1_hires.png")
