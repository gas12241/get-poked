import shutil
import tempfile
from datetime import date
from io import BytesIO

import responses
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings
from PIL import Image, ImageDraw

from cards.models import Card, Set
from quiz.imaging import (
    BOTTOM_LEFT,
    BOTTOM_RIGHT,
    HP_REGION,
    WOTC_FLAVOR_LINE,
    _sanitize,
    _to_pixels,
    get_or_create_masked_image,
    symbol_regions,
)

SOURCE_SIZE = (600, 825)
SOURCE_COLOR = (200, 200, 200)


def make_test_image_bytes():
    image = Image.new("RGB", SOURCE_SIZE, color=SOURCE_COLOR)
    # A blur has no visible effect on a perfectly uniform region — a
    # checkerboard inside HP_REGION (the one this file's tests actually
    # sample) gives it real high-contrast detail to smooth out, so
    # asserting the masked pixel changed is a genuine check rather than a
    # tautology. Everywhere else stays flat SOURCE_COLOR so the
    # "untouched region is byte-identical" assertion still holds.
    draw = ImageDraw.Draw(image)
    square = 10
    left, top, right, bottom = _to_pixels(HP_REGION, SOURCE_SIZE)
    for y in range(int(top), int(bottom), square):
        for x in range(int(left), int(right), square):
            if (x // square + y // square) % 2 == 0:
                draw.rectangle([x, y, x + square, y + square], fill=(0, 0, 0))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_card(tcg_id, release_date, supertype="Pokémon"):
    set_obj = Set.objects.create(
        tcg_id=f"set-{tcg_id}", name=f"Set {tcg_id}", series="Test", release_date=release_date
    )
    return Card.objects.create(
        tcg_id=tcg_id,
        set=set_obj,
        name="Test Card",
        number="1",
        supertype=supertype,
        image_small="https://example.com/small.png",
        image_large="https://example.com/large.png",
    )


class SymbolRegionsTests(TestCase):
    def test_wotc_era(self):
        card = make_card("wotc-1", date(2000, 1, 1))
        self.assertEqual(symbol_regions(card), [WOTC_FLAVOR_LINE])

    def test_base_set_uses_wotc_region_even_with_no_real_symbol(self):
        card = make_card("base1-4", date(1999, 1, 9))
        self.assertEqual(symbol_regions(card), [WOTC_FLAVOR_LINE])

    def test_ecard_through_xy_era(self):
        card = make_card("xy-1", date(2010, 1, 1))
        self.assertEqual(symbol_regions(card), [BOTTOM_RIGHT])

    def test_modern_era(self):
        card = make_card("sv-1", date(2020, 1, 1))
        self.assertEqual(symbol_regions(card), [BOTTOM_LEFT])

    def test_best_of_game_returns_both_regions_regardless_of_date(self):
        set_obj = Set.objects.create(
            tcg_id="bp", name="Best of Game", series="Base", release_date=date(2002, 12, 1)
        )
        card = Card.objects.create(
            tcg_id="bp-1",
            set=set_obj,
            name="Test Card",
            number="1",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.assertEqual(symbol_regions(card), [WOTC_FLAVOR_LINE, BOTTOM_RIGHT])


class MaskedImageTests(TestCase):
    def setUp(self):
        media_dir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media_dir, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=media_dir)
        override.enable()
        self.addCleanup(override.disable)

        self.card = make_card("mask-test-1", date(2020, 1, 1))

    @responses.activate
    def test_generates_and_caches_masked_image(self):
        responses.add(responses.GET, self.card.image_large, body=make_test_image_bytes())

        url_first = get_or_create_masked_image(self.card, "guess_hp")
        url_second = get_or_create_masked_image(self.card, "guess_hp")

        self.assertEqual(url_first, url_second)
        self.assertEqual(len(responses.calls), 1)  # second call was a cache hit

    @responses.activate
    def test_masked_region_differs_but_untouched_region_does_not(self):
        responses.add(responses.GET, self.card.image_large, body=make_test_image_bytes())

        get_or_create_masked_image(self.card, "guess_hp")
        path = f"quiz_masks/guess_hp/{_sanitize(self.card.tcg_id)}.png"
        with default_storage.open(path) as f:
            result = Image.open(f)
            result.load()

        left, top, right, bottom = _to_pixels((0.65, 0.0, 1.0, 0.12), result.size)
        masked_pixel = result.getpixel((int((left + right) / 2), int((top + bottom) / 2)))
        untouched_pixel = result.getpixel((10, int(result.size[1] * 0.99)))

        self.assertNotEqual(masked_pixel, SOURCE_COLOR)
        self.assertEqual(untouched_pixel, SOURCE_COLOR)

    @responses.activate
    def test_masked_region_is_genuinely_blurred_not_a_differently_colored_fill(self):
        # See docs/decisions.md #052. A solid fill (of any color, including
        # one that happens to differ from SOURCE_COLOR) would make every
        # pixel in the region identical; a real Gaussian blur of the
        # checkerboard instead smooths neighboring cells into a gradient of
        # *different* intermediate values, so no two sampled pixels should
        # be exactly equal to each other, and none should be pure black
        # (0, 0, 0) — the checkerboard's own un-blurred color.
        responses.add(responses.GET, self.card.image_large, body=make_test_image_bytes())

        get_or_create_masked_image(self.card, "guess_hp")
        path = f"quiz_masks/guess_hp/{_sanitize(self.card.tcg_id)}.png"
        with default_storage.open(path) as f:
            result = Image.open(f)
            result.load()

        left, top, right, bottom = _to_pixels(HP_REGION, result.size)
        y = int((top + bottom) / 2)
        sampled = {result.getpixel((x, y)) for x in range(int(left) + 5, int(right) - 5, 15)}

        self.assertNotIn((0, 0, 0), sampled)
        self.assertGreater(len(sampled), 1)

    @responses.activate
    def test_masking_base_set_card_does_not_error(self):
        base_card = make_card("base1-1", date(1999, 1, 9))
        responses.add(responses.GET, base_card.image_large, body=make_test_image_bytes())

        url = get_or_create_masked_image(base_card, "guess_set")

        self.assertTrue(url)
