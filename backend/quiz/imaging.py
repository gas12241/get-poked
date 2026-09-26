import re
from datetime import date
from io import BytesIO

import requests
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageDraw

# Regions are fractions of (width, height): (left, top, right, bottom).
# Deliberately generous, not pixel-exact — the goal is reliably obscuring the
# answer, not surgical redaction. See docs/decisions.md #029 for how these were
# derived from real card images across eras.
NAME_REGIONS = {
    "Pokémon": (0.0, 0.0, 0.65, 0.12),  # name, top-left
    "Trainer": (0.0, 0.0, 1.0, 0.20),  # category banner + name band
}
HP_REGION = (0.65, 0.0, 1.0, 0.12)  # HP, top-right

ECARD_ERA_START = date(2002, 9, 15)  # Expedition — WOTC-era flavor-line symbol ends here
MODERN_ERA_START = date(2017, 1, 1)  # Sun & Moon — symbol moves to bottom-left

WOTC_FLAVOR_LINE = (0.75, 0.52, 1.0, 0.60)  # end of the Pokédex flavor line, under the art
BOTTOM_RIGHT = (0.65, 0.90, 1.0, 1.0)  # next to the card number
BOTTOM_LEFT = (0.0, 0.90, 0.22, 1.0)  # fixed position, Sun & Moon onward

# Reprint set mixing original WOTC-era cards and newer-style cards — carries the
# set symbol in both possible spots depending on which original card is reprinted.
BEST_OF_GAME_TCG_ID = "bp"


def symbol_regions(card):
    if card.set.tcg_id == BEST_OF_GAME_TCG_ID:
        return [WOTC_FLAVOR_LINE, BOTTOM_RIGHT]
    release_date = card.set.release_date
    if release_date < ECARD_ERA_START:
        return [WOTC_FLAVOR_LINE]
    if release_date < MODERN_ERA_START:
        return [BOTTOM_RIGHT]
    return [BOTTOM_LEFT]


def _regions_for(card, mode):
    if mode == "guess_hp":
        return [HP_REGION]
    if mode == "guess_card":
        return [NAME_REGIONS[card.supertype]]
    if mode == "guess_set":
        return symbol_regions(card)
    raise ValueError(f"Unknown quiz mode: {mode}")


def _to_pixels(region, size):
    width, height = size
    left, top, right, bottom = region
    return (left * width, top * height, right * width, bottom * height)


def _sanitize(tcg_id):
    return re.sub(r"[^A-Za-z0-9_-]", "_", tcg_id)


def get_or_create_masked_image(card, mode) -> str:
    path = f"quiz_masks/{mode}/{_sanitize(card.tcg_id)}.png"

    if default_storage.exists(path):
        return default_storage.url(path)

    response = requests.get(card.image_large, timeout=10)
    response.raise_for_status()

    image = Image.open(BytesIO(response.content)).convert("RGB")
    draw = ImageDraw.Draw(image)
    for region in _regions_for(card, mode):
        draw.rectangle(_to_pixels(region, image.size), fill="black")

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    default_storage.save(path, ContentFile(buffer.getvalue()))

    return default_storage.url(path)
