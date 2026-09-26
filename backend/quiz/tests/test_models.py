from django.contrib.auth import get_user_model
from django.db import IntegrityError
from django.db.models import ProtectedError
from django.test import TestCase

from cards.models import Card, Set
from quiz.models import QuizAttempt, QuizAttemptAnswer

User = get_user_model()


class QuizAttemptModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="s3cret-pass!")

    def test_create_attempt(self):
        attempt = QuizAttempt.objects.create(
            user=self.user, quiz_mode="guess_card", score=7, total_questions=10
        )
        self.assertIsNotNone(attempt.completed_at)

    def test_deleting_user_cascades_to_attempts(self):
        QuizAttempt.objects.create(
            user=self.user, quiz_mode="guess_card", score=7, total_questions=10
        )
        self.user.delete()
        self.assertEqual(QuizAttempt.objects.count(), 0)

    def test_user_required(self):
        with self.assertRaises(IntegrityError):
            QuizAttempt.objects.create(quiz_mode="guess_card", score=1, total_questions=1)


class QuizAttemptAnswerModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="s3cret-pass!")
        self.set_obj = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        self.card = Card.objects.create(
            tcg_id="base1-4",
            set=self.set_obj,
            name="Charizard",
            number="4",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.attempt = QuizAttempt.objects.create(
            user=self.user, quiz_mode="guess_card", score=1, total_questions=1
        )

    def test_create_answer(self):
        answer = QuizAttemptAnswer.objects.create(
            quiz_attempt=self.attempt,
            card=self.card,
            is_correct=True,
            time_taken_seconds=4.2,
            order=0,
        )
        self.assertEqual(self.attempt.answers.count(), 1)
        self.assertEqual(answer.card, self.card)

    def test_deleting_attempt_cascades_to_answers(self):
        QuizAttemptAnswer.objects.create(
            quiz_attempt=self.attempt,
            card=self.card,
            is_correct=True,
            time_taken_seconds=4.2,
            order=0,
        )
        self.attempt.delete()
        self.assertEqual(QuizAttemptAnswer.objects.count(), 0)

    def test_deleting_card_is_protected(self):
        QuizAttemptAnswer.objects.create(
            quiz_attempt=self.attempt,
            card=self.card,
            is_correct=True,
            time_taken_seconds=4.2,
            order=0,
        )
        with self.assertRaises(ProtectedError):
            self.card.delete()
