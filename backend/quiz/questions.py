import re

from .imaging import get_or_create_masked_image

_TRAINER_PREFIX_RE = re.compile(r"^.+'s ")
_VARIANT_PREFIXES = ("Dark ", "Light ")


def build_question(card, mode, request):
    """The field being guessed is never present in the payload — including it
    alongside the masked image would make the quiz trivially solvable by
    reading the network response. See docs/decisions.md #029.

    `image` is made absolute via `request.build_absolute_uri` — the frontend
    is a separate origin from Django, so a storage-relative path (as
    FileSystemStorage returns locally) would otherwise resolve against the
    frontend's own origin and 404. A cloud storage backend that already
    returns an absolute URL passes through unchanged. See docs/decisions.md
    #030.
    """
    payload = {
        "card": card.id,
        "image": request.build_absolute_uri(get_or_create_masked_image(card, mode)),
        "rarity": card.rarity,
        "supertype": card.supertype,
        "types": [t.name for t in card.types.all()],
    }
    if mode != "guess_card":
        payload["name"] = card.name
    if mode != "guess_hp":
        payload["hp"] = card.hp
    if mode != "guess_set":
        payload["set"] = {"id": card.set_id, "name": card.set.name}
    return payload


def _accepted_card_names(name):
    """A card's full printed name is always accepted. Some cards carry a
    prefix that identifies context rather than the Pokémon itself — an
    owning trainer ("Ethan's Typhlosion") or a classic Team Rocket variant
    ("Dark Charizard", "Light Espeon") — and for those, the plain name
    after the prefix is accepted too. Requiring the prefix would test
    card-naming trivia rather than "can you recognize this Pokémon," which
    is what this mode is actually for. Deliberately narrow (a regex for the
    possessive pattern, a two-item literal list for the historical
    Dark/Light convention) rather than a general "last word" heuristic,
    which would also wrongly accept e.g. "Koko" for "Tapu Koko" — a genuine
    two-word species name, not a prefix. See docs/decisions.md #036.
    """
    names = {name}
    match = _TRAINER_PREFIX_RE.match(name)
    if match:
        names.add(name[match.end() :])
    for prefix in _VARIANT_PREFIXES:
        if name.startswith(prefix):
            names.add(name[len(prefix) :])
    return names


def check_answer(card, mode, guess):
    guess = (guess or "").strip().lower()
    if mode == "guess_card":
        accepted = {name.strip().lower() for name in _accepted_card_names(card.name)}
        return guess in accepted, card.name
    elif mode == "guess_hp":
        answer = card.hp
    elif mode == "guess_set":
        answer = card.set.name
    else:
        raise ValueError(f"Unknown quiz mode: {mode}")

    correct = guess == answer.strip().lower()
    return correct, answer
