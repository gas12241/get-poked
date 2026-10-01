import random

from django.db import transaction

from cards.models import Card
from quiz.eligibility import EASY_RARITIES, HARD_RARITIES

from .models import HoroscopeCard, HoroscopePull

POKEMON = "Pokémon"
TRAINER = "Trainer"
ENERGY = "Energy"

# Fixed 7-slot layout, in order — 5 Pokémon, 1 Trainer, 1 Energy. Revised
# from an original 3/1/1 split: Pokémon cards have by far the richest
# rarity-tier spread of the three supertypes, so weighted odds have more to
# work with there. See docs/decisions.md #061.
SLOT_SUPERTYPES = [POKEMON, POKEMON, POKEMON, POKEMON, POKEMON, TRAINER, ENERGY]

# Deliberately designed odds, not derived from the real catalog's own
# proportions (which skew common-heavy already, but as an emergent
# accident of 25+ years of reprints, not a chosen scarcity) — same
# percentages for every slot regardless of supertype. At 5% chase per slot
# across 7 independent slots, a pull includes at least one chase-tier card
# on ~30% of days (1 - 0.95**7). Named and isolated here so they're easy to
# retune later without touching selection logic. See docs/decisions.md #061.
TIERS = ["common", "mid", "chase"]
TIER_WEIGHTS = [70, 25, 5]

# Fallback order when the *rolled* tier has zero eligible cards for a
# supertype — tries the other two tiers, most-likely-to-be-populated first,
# before giving up. Each tier needs its own full fallback list, not a
# single "next" tier: since "common" is rolled 70% of the time, a fallback
# chain that only ever moves chase->mid->common (with no escape from
# common) would mean any supertype with zero common-tier cards hard-fails
# on the large majority of rolls, even when mid/chase cards clearly exist.
# Real data confirms every supertype's common tier is well-populated today
# (e.g. Energy: 67%), so this is a rare edge case in practice — but the
# fallback should actually be robust, not just usually-not-triggered.
TIER_FALLBACK_ORDER = {
    "chase": ["mid", "common"],
    "mid": ["common", "chase"],
    "common": ["mid", "chase"],
}

TIER_RARITY_FILTERS = {
    "chase": lambda qs: qs.filter(rarity__in=EASY_RARITIES),
    "common": lambda qs: qs.filter(rarity__in=HARD_RARITIES),
    "mid": lambda qs: qs.exclude(rarity__in=EASY_RARITIES | HARD_RARITIES),
}


class HoroscopeSelectionError(Exception):
    """Raised only if a supertype has zero eligible cards across all three tiers."""


def eligible_card_ids_for_tier(supertype, tier):
    queryset = Card.objects.filter(supertype=supertype)
    return list(TIER_RARITY_FILTERS[tier](queryset).values_list("id", flat=True))


def pick_slot(supertype):
    """Rolls a tier for this slot per TIER_WEIGHTS, then picks a random
    eligible card of that supertype+tier. Falls back through the rolled
    tier's TIER_FALLBACK_ORDER if it has no eligible cards. Returns
    (card_id, tier_used).
    """
    rolled_tier = random.choices(TIERS, weights=TIER_WEIGHTS, k=1)[0]
    for tier in [rolled_tier, *TIER_FALLBACK_ORDER[rolled_tier]]:
        ids = eligible_card_ids_for_tier(supertype, tier)
        if ids:
            return random.choice(ids), tier
    raise HoroscopeSelectionError(f"No eligible cards for supertype {supertype!r}.")


@transaction.atomic
def build_daily_pull(user, pull_date):
    # Each slot (including each of the 5 Pokémon slots) is picked fully
    # independently — the same card can legitimately be drawn more than
    # once in one pull. Confirmed deliberately, not a bug. See
    # docs/decisions.md #061.
    picks = [(supertype, *pick_slot(supertype)) for supertype in SLOT_SUPERTYPES]
    pull = HoroscopePull.objects.create(user=user, pull_date=pull_date)
    HoroscopeCard.objects.bulk_create(
        HoroscopeCard(pull=pull, card_id=card_id, supertype=supertype, rarity_tier=tier, order=i)
        for i, (supertype, card_id, tier) in enumerate(picks)
    )
    return pull
