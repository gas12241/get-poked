import shutil
import tempfile
from datetime import UTC, date, datetime
from io import BytesIO

import responses
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from cards.models import Card, Set
from quiz.models import QuizAttempt, QuizAttemptAnswer

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


def _set_completed_at(attempt, when):
    # completed_at is auto_now_add — only settable like this via a queryset
    # update, which (unlike Model.save()) doesn't re-stamp it to now().
    QuizAttempt.objects.filter(pk=attempt.pk).update(completed_at=when)
    attempt.refresh_from_db()
    return attempt


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

    def test_invalid_difficulty_returns_400(self):
        response = self.client.get(
            reverse("quiz-questions"), {"mode": "guess_card", "difficulty": "extreme"}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @responses.activate
    def test_hard_difficulty_only_returns_common_uncommon_rare_cards(self):
        # See docs/decisions.md #047 — "hard" is Common/Uncommon/Rare.
        # self.pokemon_card is Rare Holo, so it's excluded here even though
        # nothing else disqualifies it for guess_card.
        common_card = Card.objects.create(
            tcg_id="base1-5",
            set=self.set_obj,
            name="Squirtle",
            number="5",
            rarity="Common",
            hp="40",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        responses.add(responses.GET, common_card.image_large, body=make_test_image_bytes())

        response = self.client.get(
            reverse("quiz-questions"),
            {"mode": "guess_card", "difficulty": "hard", "count": 5},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        card_ids = [q["card"] for q in response.data["questions"]]
        self.assertEqual(card_ids, [common_card.id])

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


class QuizAttemptCreateViewTests(QuizTestBase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")

    def test_requires_authentication(self):
        response = self.client.post(reverse("quiz-attempt-create"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_computes_score_from_the_real_guesses_not_a_client_total(self):
        self.client.force_authenticate(self.user)
        payload = {
            "quiz_mode": "guess_card",
            "difficulty": "medium",
            "answers": [
                {
                    "card": self.pokemon_card.id,
                    "guess": "charizard",
                    "time_taken_seconds": 3.5,
                    "order": 0,
                },
                {
                    "card": self.trainer_common_card.id,
                    "guess": "totally the wrong name",
                    "time_taken_seconds": 5.0,
                    "order": 1,
                },
            ],
        }

        response = self.client.post(reverse("quiz-attempt-create"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        attempt = QuizAttempt.objects.get(user=self.user)
        self.assertEqual(attempt.score, 1)
        self.assertEqual(attempt.total_questions, 2)
        self.assertEqual(attempt.difficulty, "medium")
        self.assertEqual(attempt.answers.count(), 2)
        # The response is the rich detail shape, not a flat echo.
        self.assertEqual(response.data["score"], 1)
        answers_by_guess = {a["guess"]: a for a in response.data["answers"]}
        self.assertTrue(answers_by_guess["charizard"]["is_correct"])
        self.assertFalse(answers_by_guess["totally the wrong name"]["is_correct"])

    def test_a_dishonest_is_correct_from_the_client_is_ignored(self):
        # The actual security fix: submitting a guess that's really wrong,
        # while also claiming is_correct=True, must not be trusted.
        self.client.force_authenticate(self.user)
        payload = {
            "quiz_mode": "guess_card",
            "difficulty": "easy",
            "answers": [
                {
                    "card": self.pokemon_card.id,
                    "guess": "definitely not charizard",
                    "is_correct": True,
                    "time_taken_seconds": 1.0,
                    "order": 0,
                },
            ],
        }

        response = self.client.post(reverse("quiz-attempt-create"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        attempt = QuizAttempt.objects.get(user=self.user)
        self.assertEqual(attempt.score, 0)
        self.assertFalse(attempt.answers.get().is_correct)
        self.assertFalse(response.data["answers"][0]["is_correct"])

    def test_response_includes_the_real_card_and_correct_answer_not_just_the_id(self):
        self.client.force_authenticate(self.user)
        payload = {
            "quiz_mode": "guess_hp",
            "difficulty": "hard",
            "answers": [
                {
                    "card": self.pokemon_card.id,
                    "guess": "999",
                    "time_taken_seconds": 2.0,
                    "order": 0,
                },
            ],
        }

        response = self.client.post(reverse("quiz-attempt-create"), payload, format="json")

        answer = response.data["answers"][0]
        self.assertEqual(answer["card"]["id"], self.pokemon_card.id)
        self.assertEqual(answer["card"]["name"], "Charizard")
        self.assertEqual(answer["correct_answer"], "120")


class QuizAttemptDatesViewTests(QuizTestBase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        self.other_user = User.objects.create_user(
            email="other@example.com", password="s3cret-pass!"
        )

    def _attempt(self, user, when):
        attempt = QuizAttempt.objects.create(
            user=user, quiz_mode="guess_card", difficulty="medium", score=1, total_questions=1
        )
        return _set_completed_at(attempt, when)

    def test_requires_authentication(self):
        response = self.client.get(reverse("quiz-attempt-dates"), {"month": "2026-09"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_malformed_month_returns_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("quiz-attempt-dates"), {"month": "not-a-month"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_out_of_range_month_returns_400(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(reverse("quiz-attempt-dates"), {"month": "2026-13"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_returns_only_dates_within_the_requested_month_deduplicated(self):
        self._attempt(self.user, datetime(2026, 9, 5, 10, 0, tzinfo=UTC))
        # A second attempt the same day must not duplicate the date.
        self._attempt(self.user, datetime(2026, 9, 5, 18, 0, tzinfo=UTC))
        self._attempt(self.user, datetime(2026, 9, 20, 12, 0, tzinfo=UTC))
        # A different month, and a different year sharing the same month
        # number — both must be excluded.
        self._attempt(self.user, datetime(2026, 10, 1, 12, 0, tzinfo=UTC))
        self._attempt(self.user, datetime(2025, 9, 5, 12, 0, tzinfo=UTC))
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("quiz-attempt-dates"), {"month": "2026-09"})

        self.assertEqual(response.data["dates"], ["2026-09-05", "2026-09-20"])

    def test_scoped_to_the_requesting_user_only(self):
        self._attempt(self.user, datetime(2026, 9, 5, 10, 0, tzinfo=UTC))
        self._attempt(self.other_user, datetime(2026, 9, 6, 10, 0, tzinfo=UTC))
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("quiz-attempt-dates"), {"month": "2026-09"})

        self.assertEqual(response.data["dates"], ["2026-09-05"])


class QuizAttemptsByDateViewTests(QuizTestBase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        self.other_user = User.objects.create_user(
            email="other@example.com", password="s3cret-pass!"
        )

    def test_requires_authentication(self):
        response = self.client.get(reverse("quiz-attempts-by-date", kwargs={"date": "2026-09-05"}))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_an_empty_list_rather_than_404_for_a_date_with_nothing(self):
        # Unlike a Horoscope pull, there's no one-per-day limit, so "nothing
        # happened that day" is a normal empty state, not a 404.
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("quiz-attempts-by-date", kwargs={"date": "2026-09-05"}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_returns_every_attempt_that_day_with_summary_fields(self):
        attempt = QuizAttempt.objects.create(
            user=self.user,
            quiz_mode="guess_hp",
            difficulty="hard",
            score=4,
            total_questions=5,
        )
        _set_completed_at(attempt, datetime(2026, 9, 5, 9, 0, tzinfo=UTC))
        second = QuizAttempt.objects.create(
            user=self.user,
            quiz_mode="guess_set",
            difficulty="easy",
            score=2,
            total_questions=5,
        )
        _set_completed_at(second, datetime(2026, 9, 5, 20, 0, tzinfo=UTC))
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("quiz-attempts-by-date", kwargs={"date": "2026-09-05"}))

        self.assertEqual(len(response.data), 2)
        modes = {row["quiz_mode"] for row in response.data}
        self.assertEqual(modes, {"guess_hp", "guess_set"})
        self.assertNotIn("answers", response.data[0])

    def test_does_not_include_another_users_attempts_for_the_same_date(self):
        mine = QuizAttempt.objects.create(
            user=self.user, quiz_mode="guess_card", difficulty="medium", score=1, total_questions=1
        )
        _set_completed_at(mine, datetime(2026, 9, 5, 9, 0, tzinfo=UTC))
        theirs = QuizAttempt.objects.create(
            user=self.other_user,
            quiz_mode="guess_card",
            difficulty="medium",
            score=1,
            total_questions=1,
        )
        _set_completed_at(theirs, datetime(2026, 9, 5, 9, 0, tzinfo=UTC))
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("quiz-attempts-by-date", kwargs={"date": "2026-09-05"}))

        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], mine.id)

    def test_malformed_date_returns_404(self):
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("quiz-attempts-by-date", kwargs={"date": "not-a-date"}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class QuizAttemptDetailViewTests(QuizTestBase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        self.other_user = User.objects.create_user(
            email="other@example.com", password="s3cret-pass!"
        )

    def _attempt_with_answer(self, user):
        attempt = QuizAttempt.objects.create(
            user=user, quiz_mode="guess_card", difficulty="medium", score=1, total_questions=1
        )
        QuizAttemptAnswer.objects.create(
            quiz_attempt=attempt,
            card=self.pokemon_card,
            guess="charizard",
            is_correct=True,
            time_taken_seconds=2.5,
            order=0,
        )
        return attempt

    def test_requires_authentication(self):
        attempt = self._attempt_with_answer(self.user)
        response = self.client.get(reverse("quiz-attempt-detail", kwargs={"pk": attempt.pk}))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_full_per_question_detail(self):
        attempt = self._attempt_with_answer(self.user)
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("quiz-attempt-detail", kwargs={"pk": attempt.pk}))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        answer = response.data["answers"][0]
        self.assertEqual(answer["guess"], "charizard")
        self.assertEqual(answer["correct_answer"], "Charizard")
        self.assertTrue(answer["is_correct"])
        self.assertEqual(answer["card"]["name"], "Charizard")

    def test_returns_404_rather_than_another_users_attempt(self):
        theirs = self._attempt_with_answer(self.other_user)
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("quiz-attempt-detail", kwargs={"pk": theirs.pk}))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
