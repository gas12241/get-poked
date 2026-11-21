from datetime import date

from django.test import TestCase

from cards.models import Set
from quiz.sets_quiz import (
    ELIGIBLE_SETS,
    build_set_icon_question,
    check_set_icon_answer,
    era_group,
)


class SetsQuizTestBase(TestCase):
    def make_set(self, tcg_id, name, series, release_date, ptcgo_code=None):
        return Set.objects.create(
            tcg_id=tcg_id,
            name=name,
            series=series,
            release_date=release_date,
            details={"ptcgoCode": ptcgo_code} if ptcgo_code else {},
        )


class EraGroupTests(SetsQuizTestBase):
    def test_prefers_same_series_distractors_when_enough_exist(self):
        target = self.make_set("swsh1", "Sword & Shield", "Sword & Shield", date(2020, 2, 7))
        same_series = [
            self.make_set(f"swsh{i}", f"SWSH Set {i}", "Sword & Shield", date(2020, 2, 7 + i))
            for i in range(2, 6)
        ]
        # A different era entirely — should never be picked while the
        # target's own series already has enough members.
        self.make_set("xy1", "XY", "XY", date(2014, 2, 5))

        distractors = era_group(target, pool_size=4)

        self.assertEqual(len(distractors), 3)
        same_series_ids = {s.id for s in same_series}
        self.assertTrue(all(d.id in same_series_ids for d in distractors))

    def test_falls_back_to_nearest_release_date_for_a_thin_series(self):
        target = self.make_set("neo1", "Neo Genesis", "Neo", date(2000, 12, 16))
        # Same series, but only one other member — not enough to fill a
        # 4-choice round (needs 3 distractors) on its own.
        self.make_set("neo2", "Neo Discovery", "Neo", date(2001, 6, 1))
        # Plenty of near candidates (more than the needed*3=9 window), so a
        # deliberately far outlier reliably falls outside it rather than
        # leaking in just because too few candidates exist overall.
        for i in range(10):
            self.make_set(f"gym{i}", f"Gym Set {i}", "Gym", date(2000, 8, 14 + i))
        far = self.make_set("swsh1", "Sword & Shield", "Sword & Shield", date(2020, 2, 7))

        distractors = era_group(target, pool_size=4)

        self.assertEqual(len(distractors), 3)
        distractor_ids = {d.id for d in distractors}
        # The date-proximity fallback should reach for the nearby Gym sets
        # (or the same-series Neo Discovery) well before a set released 20
        # years later.
        self.assertNotIn(far.id, distractor_ids)

    def test_never_returns_base_set_as_a_distractor(self):
        target = self.make_set("jungle", "Jungle", "Base", date(1999, 6, 16))
        self.make_set("base1", "Base", "Base", date(1999, 1, 9))
        for i in range(5):
            self.make_set(f"other{i}", f"Other Set {i}", "Other", date(2001, 1, 1))

        distractors = era_group(target, pool_size=4)

        self.assertNotIn("base1", {d.tcg_id for d in distractors})
        self.assertNotIn("base1", set(ELIGIBLE_SETS.values_list("tcg_id", flat=True)))

    def test_prefers_a_same_first_letter_ptcgo_code_for_a_scarlet_violet_era_target(self):
        target = self.make_set(
            "sv2", "Paldea Evolved", "Scarlet & Violet", date(2023, 6, 9), ptcgo_code="PAL"
        )
        letter_match = self.make_set(
            "sv4pt5", "Paldean Fates", "Scarlet & Violet", date(2024, 1, 26), ptcgo_code="PAF"
        )
        # Same series, released close in time, but a different first letter —
        # should be passed over in favor of the letter match above.
        for i in range(6):
            self.make_set(
                f"svobf{i}",
                f"Some Other Set {i}",
                "Scarlet & Violet",
                date(2023, 1, 1),
                ptcgo_code="OBF",
            )

        distractors = era_group(target, pool_size=4)

        self.assertEqual(distractors[0].id, letter_match.id)

    def test_still_fills_a_full_round_when_no_letter_match_exists(self):
        target = self.make_set(
            "sv1", "Scarlet & Violet", "Scarlet & Violet", date(2023, 3, 31), ptcgo_code="SVI"
        )
        for i in range(5):
            self.make_set(
                f"sv{i + 2}",
                f"Some Other Set {i}",
                "Scarlet & Violet",
                date(2023, 1, 1),
                ptcgo_code="OBF",
            )

        distractors = era_group(target, pool_size=4)

        self.assertEqual(len(distractors), 3)


class BuildSetIconQuestionTests(SetsQuizTestBase):
    def setUp(self):
        self.target = self.make_set("swsh1", "Sword & Shield", "Sword & Shield", date(2020, 2, 7))
        for i in range(2, 10):
            self.make_set(f"swsh{i}", f"SWSH Set {i}", "Sword & Shield", date(2020, 2, 7 + i))

    def test_hard_difficulty_has_no_choices_and_never_leaks_the_name(self):
        payload = build_set_icon_question(self.target, "hard")

        self.assertNotIn("choices", payload)
        self.assertNotIn("name", payload)
        self.assertEqual(payload["set"], self.target.id)
        self.assertEqual(payload["image"], self.target.image_symbol)

    def test_easy_difficulty_has_four_choices_including_the_correct_one_unflagged(self):
        payload = build_set_icon_question(self.target, "easy")

        self.assertEqual(len(payload["choices"]), 4)
        choice_ids = {c["id"] for c in payload["choices"]}
        self.assertIn(self.target.id, choice_ids)
        for choice in payload["choices"]:
            self.assertEqual(set(choice.keys()), {"id", "name"})

    def test_medium_difficulty_has_eight_choices(self):
        payload = build_set_icon_question(self.target, "medium")

        self.assertEqual(len(payload["choices"]), 8)


class CheckSetIconAnswerTests(SetsQuizTestBase):
    def test_accepts_a_case_insensitive_name_match(self):
        target = self.make_set("swsh1", "Sword & Shield", "Sword & Shield", date(2020, 2, 7))

        correct, answer = check_set_icon_answer(target, "sword & shield")

        self.assertTrue(correct)
        self.assertEqual(answer, "Sword & Shield")

    def test_rejects_a_wrong_name(self):
        target = self.make_set("swsh1", "Sword & Shield", "Sword & Shield", date(2020, 2, 7))

        correct, _ = check_set_icon_answer(target, "Scarlet & Violet")

        self.assertFalse(correct)
