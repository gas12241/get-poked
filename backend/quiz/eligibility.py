from cards.models import Card

# "Chase" rarities distinctive enough for Trainer cards to be recognizable by name/set/HP
# alone. Built from the actual rarity strings present in the synced catalog, not idealized
# ones — both "Rare Ultra" and "Ultra Rare" appear (older vs. newer API naming for the same
# tier). See docs/decisions.md #017/#029.
SPECIAL_TIER_RARITIES = {
    "Rare Ultra",
    "Ultra Rare",
    "Rare Secret",
    "Rare Rainbow",
    "Special Illustration Rare",
    "Illustration Rare",
    "Hyper Rare",
    "ACE SPEC Rare",
    "Rare ACE",
    "Rare Prism Star",
    "Classic Collection",
}

GUESS_CARD = "guess_card"
GUESS_SET = "guess_set"
GUESS_HP = "guess_hp"

EASY = "easy"
MEDIUM = "medium"
HARD = "hard"
DIFFICULTIES = (EASY, MEDIUM, HARD)

# Difficulty picker rarity buckets (docs/decisions.md #047). Deliberately
# the reverse of what "rare" suggests: the more distinctive a card's
# rarity, the easier most players find it to place by name/set on sight, so
# Easy reuses the existing chase tier and Hard is the plain baseline most
# players see too many of to tell apart. Confirmed directly with the user
# rather than assumed.
EASY_RARITIES = SPECIAL_TIER_RARITIES
HARD_RARITIES = {"Common", "Uncommon", "Rare"}
# Medium has no enumerated list of its own — it's "whatever's eligible and
# isn't Easy or Hard" (Rare Holo, Promo, EX/V/GX/VMAX/VSTAR holos, Shiny
# variants, ...). An exclusion, not its own inclusion list, so a rarity
# string a future sync introduces falls into Medium by default instead of
# silently being excluded from every difficulty until someone remembers to
# add it somewhere.


def eligible_card_ids(mode, rarities=None, difficulty=None):
    """Return eligible Card ids for a quiz mode, per ARCHITECTURE.md's
    "Quiz Eligibility & Rarity Filtering". `rarities` and `difficulty` each
    narrow within this baseline — neither can ever widen it. Composable in
    principle, though the frontend only ever sends one at a time.
    """
    if mode == GUESS_HP:
        queryset = Card.objects.filter(supertype="Pokémon")
    elif mode in (GUESS_CARD, GUESS_SET):
        queryset = Card.objects.filter(supertype="Pokémon") | Card.objects.filter(
            supertype="Trainer", rarity__in=SPECIAL_TIER_RARITIES
        )
    else:
        raise ValueError(f"Unknown quiz mode: {mode}")

    if rarities:
        queryset = queryset.filter(rarity__in=rarities)

    if difficulty == EASY:
        queryset = queryset.filter(rarity__in=EASY_RARITIES)
    elif difficulty == HARD:
        queryset = queryset.filter(rarity__in=HARD_RARITIES)
    elif difficulty == MEDIUM:
        queryset = queryset.exclude(rarity__in=EASY_RARITIES | HARD_RARITIES)

    return list(queryset.values_list("id", flat=True))
