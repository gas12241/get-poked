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


def eligible_card_ids(mode, rarities=None):
    """Return eligible Card ids for a quiz mode, per ARCHITECTURE.md's
    "Quiz Eligibility & Rarity Filtering". `rarities` narrows within this
    baseline — it can never widen it.
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

    return list(queryset.values_list("id", flat=True))
