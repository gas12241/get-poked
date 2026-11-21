import random
from datetime import date

from cards.models import Set

GUESS_SET_ICON = "guess_set_icon"

EASY_CHOICES = 4
MEDIUM_CHOICES = 8

# Base Set predates the printed set symbol entirely — both image_symbol and
# image_logo are just the generic "Pokémon Trading Card Game" wordmark, not
# a set-specific icon, so it can never be a fair question or distractor here.
# release_date is nullable at the schema level even though no synced set
# has a null one today; excluded defensively since the date math below
# would otherwise break on one. See docs/decisions.md #096.
ELIGIBLE_SETS = Set.objects.exclude(tcg_id="base1").exclude(release_date__isnull=True)

# Scarlet & Violet onward prints a literal 3-letter set code in place of a
# pictogram (confirmed: "SVI", "PAL", "OBF") — details["ptcgoCode"] holds
# that same code as data for plenty of older, pictogram-only sets too
# (e.g. Jungle is "JU"), where it's never actually shown on the card. Only
# a set released in/after this era has a code a player can actually see
# and be confused by. See docs/decisions.md #096.
TEXT_CODE_ERA_START = date(2023, 1, 1)


def _ptcgo_code(set_obj):
    return (set_obj.details or {}).get("ptcgoCode") or ""


def era_group(target_set, pool_size):
    """Pick `pool_size - 1` distractor sets that plausibly look like
    target_set's own icon — same-series first (a series usually keeps one
    consistent symbol style), falling back to the nearest sets by release
    date when the series is too thin to fill a round on its own, or isn't
    a real visual era at all (e.g. "Other"'s cross-era promo grab-bag).

    For a text-code-era target (see TEXT_CODE_ERA_START) with a known
    code, candidates sharing the code's first letter (e.g. "PAL" vs
    "PAF") are preferred within whatever pool was already assembled —
    genuinely more confusable than two random codes from the same era —
    but this is only a preference: it reorders the pool, it never shrinks
    it below `pool_size - 1`. See docs/decisions.md #096.
    """
    needed = pool_size - 1
    same_series = list(ELIGIBLE_SETS.filter(series=target_set.series).exclude(pk=target_set.pk))

    if len(same_series) >= needed:
        pool = same_series
    else:
        used_ids = {s.pk for s in same_series} | {target_set.pk}
        remaining_by_date = sorted(
            ELIGIBLE_SETS.exclude(pk__in=used_ids),
            key=lambda s: abs((s.release_date - target_set.release_date).days),
        )
        # A window wider than `needed` so the letter-match preference below
        # has real candidates to prefer among, not just the single nearest
        # few.
        pool = same_series + remaining_by_date[: needed * 3]

    random.shuffle(pool)

    target_code = _ptcgo_code(target_set)
    if target_set.release_date >= TEXT_CODE_ERA_START and target_code:
        target_letter = target_code[0]
        pool.sort(key=lambda s: _ptcgo_code(s)[:1] != target_letter)

    return pool[:needed]


def build_set_icon_question(target, difficulty):
    """Mirrors questions.py's build_question in spirit: the field being
    guessed is never present in the payload. For easy/medium, `choices`
    carries every option's id and name with no marker for which is
    correct; for hard, `choices` is omitted entirely and the player types
    the name, same as every other free-text mode.

    `target` is picked by the caller (QuizQuestionsView samples distinct
    targets across a quiz's questions the same way it already does for
    card-based modes), not chosen here.
    """
    payload = {"set": target.id, "image": target.image_symbol}

    if difficulty == "hard":
        return payload

    pool_size = EASY_CHOICES if difficulty == "easy" else MEDIUM_CHOICES
    distractors = era_group(target, pool_size)
    choices = [{"id": target.id, "name": target.name}] + [
        {"id": s.id, "name": s.name} for s in distractors
    ]
    random.shuffle(choices)
    payload["choices"] = choices
    return payload


def check_set_icon_answer(target_set, guess):
    """The multiple-choice UI submits the chosen set's name as `guess`,
    not its id — the same human-readable string shape every other mode's
    guess already is, so this is a plain case-insensitive name match
    regardless of whether the round was multiple-choice or free-text.
    """
    guess = (guess or "").strip().lower()
    return guess == target_set.name.strip().lower(), target_set.name
