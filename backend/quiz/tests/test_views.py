import shutil
import tempfile
from datetime import date
from io import BytesIO

import responses
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from cards.models import Card, Set
from quiz.models import QuizAttempt

User = get_user_model()


def make_test_image_bytes():
    image = Image.new("RGB", (600, 825), color=(200, 200, 200))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class QuizTestBase(APITestCase):
    def setUp(self):
        media_dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media_dir, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=media_dir)
        override.enable()
        self.addCleanup(override.disable)

        self.set_obj = Set.objects.create(
            tcg_id="base1", name="Base", series="Base", release_date=date(1999, 1, 9)
        )
        self.pokemon_card = Card.objects.create(
            tcg_id="base1-4",
            set=self.set_obj,
            name="Charizard",
            number="4",
            rarity="Rare Holo",
            hp="120",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.trainer_common_card = Card.objects.create(
            tcg_id="base1-88",
            set=self.set_obj,
            name="Professor Oak",
            number="88",
            rarity="Common",
            supertype="Trainer",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )


class QuizQuestionsViewTests(QuizTestBase):
    @responses.activate
    def test_returns_questions_without_the_guessed_field(self):
        responses.add(responses.GET, self.pokemon_card.image_large, body=make_test_image_bytes())

        response = self.client.get(reverse("quiz-questions"), {"mode": "guess_card", "count": 1})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        question = response.data["questions"][0]
        self.assertNotIn("name", question)
        self.assertIn("hp", question)
        self.assertIn("set", question)
        self.assertIn("image", question)

    @responses.activate
    def test_guess_hp_hides_hp_but_shows_name(self):
        responses.add(responses.GET, self.pokemon_card.image_large, body=make_test_image_bytes())

        response = self.client.get(reverse("quiz-questions"), {"mode": "guess_hp", "count": 1})

        question = response.data["questions"][0]
        self.assertNotIn("hp", question)
        self.assertIn("name", question)

    @responses.activate
    def test_guess_set_hides_set_but_shows_name_and_hp(self):
        responses.add(responses.GET, self.pokemon_card.image_large, body=make_test_image_bytes())

        response = self.client.get(reverse("quiz-questions"), {"mode": "guess_set", "count": 1})

        question = response.data["questions"][0]
        self.assertNotIn("set", question)
        self.assertIn("name", question)
        self.assertIn("hp", question)

    def test_invalid_mode_returns_400(self):
        response = self.client.get(reverse("quiz-questions"), {"mode": "not_a_real_mode"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @responses.activate
    def test_does_not_require_authentication(self):
        responses.add(responses.GET, self.pokemon_card.image_large, body=make_test_image_bytes())

        response = self.client.get(reverse("quiz-questions"), {"mode": "guess_hp", "count": 1})

        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @responses.activate
    def test_count_is_capped_at_twenty(self):
        for i in range(25):
            card = Card.objects.create(
                tcg_id=f"base1-extra-{i}",
                set=self.set_obj,
                name=f"Extra Pokémon {i}",
                number=str(100 + i),
                supertype="Pokémon",
                hp="50",
                image_small="https://example.com/small.png",
                image_large="https://example.com/large.png",
            )
            responses.add(responses.GET, card.image_large, body=make_test_image_bytes())
        responses.add(responses.GET, self.pokemon_card.image_large, body=make_test_image_bytes())

        response = self.client.get(reverse("quiz-questions"), {"mode": "guess_hp", "count": 999})

        self.assertEqual(len(response.data["questions"]), 20)


class QuizCheckViewTests(QuizTestBase):
    def test_correct_guess_for_guess_card(self):
        response = self.client.post(
            reverse("quiz-check"),
            {"card": self.pokemon_card.id, "mode": "guess_card", "guess": "charizard"},
        )
        self.assertTrue(response.data["correct"])
        self.assertEqual(response.data["answer"], "Charizard")

    def test_accepts_the_plain_pokemon_name_for_a_trainers_pokemon_card(self):
        card = Card.objects.create(
            tcg_id="base1-99",
            set=self.set_obj,
            name="Ethan's Typhlosion",
            number="99",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        response = self.client.post(
            reverse("quiz-check"),
            {"card": card.id, "mode": "guess_card", "guess": "Typhlosion"},
        )
        self.assertTrue(response.data["correct"])
        self.assertEqual(response.data["answer"], "Ethan's Typhlosion")

    def test_accepts_the_plain_pokemon_name_for_a_dark_or_light_variant_card(self):
        card = Card.objects.create(
            tcg_id="base1-98",
            set=self.set_obj,
            name="Dark Charizard",
            number="98",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        response = self.client.post(
            reverse("quiz-check"),
            {"card": card.id, "mode": "guess_card", "guess": "charizard"},
        )
        self.assertTrue(response.data["correct"])

    def test_still_accepts_the_full_name_for_a_trainers_pokemon_card(self):
        card = Card.objects.create(
            tcg_id="base1-97",
            set=self.set_obj,
            name="Ethan's Typhlosion",
            number="97",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        response = self.client.post(
            reverse("quiz-check"),
            {"card": card.id, "mode": "guess_card", "guess": "Ethan's Typhlosion"},
        )
        self.assertTrue(response.data["correct"])

    def test_does_not_loosen_a_genuine_two_word_species_name(self):
        # "Tapu Koko" is a single, indivisible species name — not a
        # prefix + Pokémon — so only the full name should be accepted.
        card = Card.objects.create(
            tcg_id="base1-96",
            set=self.set_obj,
            name="Tapu Koko",
            number="96",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        response = self.client.post(
            reverse("quiz-check"),
            {"card": card.id, "mode": "guess_card", "guess": "Koko"},
        )
        self.assertFalse(response.data["correct"])

    def test_rejects_a_genuinely_wrong_guess(self):
        response = self.client.post(
            reverse("quiz-check"),
            {"card": self.pokemon_card.id, "mode": "guess_card", "guess": "Blastoise"},
        )
        self.assertFalse(response.data["correct"])

    def test_incorrect_guess_for_guess_hp(self):
        response = self.client.post(
            reverse("quiz-check"),
            {"card": self.pokemon_card.id, "mode": "guess_hp", "guess": "999"},
        )
        self.assertFalse(response.data["correct"])
        self.assertEqual(response.data["answer"], "120")

    def test_correct_guess_for_guess_set_case_insensitive(self):
        response = self.client.post(
            reverse("quiz-check"),
            {"card": self.pokemon_card.id, "mode": "guess_set", "guess": "  BASE  "},
        )
        self.assertTrue(response.data["correct"])

    def test_does_not_require_authentication(self):
        response = self.client.post(
            reverse("quiz-check"),
            {"card": self.pokemon_card.id, "mode": "guess_hp", "guess": "120"},
        )
        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class QuizAttemptViewTests(QuizTestBase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(username="tester", password="s3cret-pass!")
        self.other_user = User.objects.create_user(username="other", password="s3cret-pass!")

    def test_requires_authentication(self):
        response = self.client.get(reverse("quiz-attempt-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_computes_score_from_answers(self):
        self.client.force_authenticate(self.user)
        payload = {
            "quiz_mode": "guess_card",
            "answers": [
                {
                    "card": self.pokemon_card.id,
                    "is_correct": True,
                    "time_taken_seconds": 3.5,
                    "order": 0,
                },
                {
                    "card": self.trainer_common_card.id,
                    "is_correct": False,
                    "time_taken_seconds": 5.0,
                    "order": 1,
                },
            ],
        }

        response = self.client.post(reverse("quiz-attempt-list"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        attempt = QuizAttempt.objects.get(user=self.user)
        self.assertEqual(attempt.score, 1)
        self.assertEqual(attempt.total_questions, 2)
        self.assertEqual(attempt.answers.count(), 2)

    def test_list_only_returns_the_requesting_users_attempts(self):
        QuizAttempt.objects.create(
            user=self.user, quiz_mode="guess_card", score=1, total_questions=1
        )
        QuizAttempt.objects.create(
            user=self.other_user, quiz_mode="guess_card", score=1, total_questions=1
        )

        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("quiz-attempt-list"))

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
