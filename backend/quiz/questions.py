from .imaging import get_or_create_masked_image


def build_question(card, mode):
    """The field being guessed is never present in the payload — including it
    alongside the masked image would make the quiz trivially solvable by
    reading the network response. See docs/decisions.md #029.
    """
    payload = {
        "card": card.id,
        "image": get_or_create_masked_image(card, mode),
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


def check_answer(card, mode, guess):
    guess = (guess or "").strip().lower()
    if mode == "guess_card":
        answer = card.name
    elif mode == "guess_hp":
        answer = card.hp
    elif mode == "guess_set":
        answer = card.set.name
    else:
        raise ValueError(f"Unknown quiz mode: {mode}")

    correct = guess == answer.strip().lower()
    return correct, answer
