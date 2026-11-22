from django.db.models import Count, Sum

from .models import QuizMode


def _accuracy(correct, total_questions):
    return (correct / total_questions) if total_questions else None


def summarize_attempts(queryset):
    """Aggregate a QuizAttempt queryset into totals plus a per-mode breakdown.

    Sums raw correct/total_questions rather than averaging each attempt's
    own percentage, so attempts of different lengths (3/5/7 questions)
    combine correctly without needing a separate bucket per length — see
    docs/decisions.md #097. Every mode in QuizMode.values is always present
    in by_mode, even at zero, since four rows is short enough to list in
    full rather than omit.
    """
    totals = queryset.aggregate(
        attempts=Count("id"), correct=Sum("score"), total_questions=Sum("total_questions")
    )
    correct = totals["correct"] or 0
    total_questions = totals["total_questions"] or 0

    by_mode_rows = {
        row["quiz_mode"]: row
        for row in queryset.values("quiz_mode").annotate(
            attempts=Count("id"), correct=Sum("score"), total_questions=Sum("total_questions")
        )
    }
    by_mode = []
    for mode in QuizMode.values:
        row = by_mode_rows.get(mode)
        mode_correct = (row["correct"] or 0) if row else 0
        mode_total_questions = (row["total_questions"] or 0) if row else 0
        by_mode.append(
            {
                "mode": mode,
                "attempts": row["attempts"] if row else 0,
                "correct": mode_correct,
                "total_questions": mode_total_questions,
                "accuracy": _accuracy(mode_correct, mode_total_questions),
            }
        )

    return {
        "attempts": totals["attempts"],
        "correct": correct,
        "total_questions": total_questions,
        "accuracy": _accuracy(correct, total_questions),
        "by_mode": by_mode,
    }
