from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from cards.models import Attack, Card, Resistance, Set, Type, Weakness


class CardsSetsTypesTestBase(APITestCase):
    def setUp(self):
        self.set_a = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        self.set_b = Set.objects.create(tcg_id="base2", name="Jungle", series="Base")

        self.fire = Type.objects.create(name="Fire")
        self.water = Type.objects.create(name="Water")

        self.charizard = Card.objects.create(
            tcg_id="base1-4",
            set=self.set_a,
            name="Charizard",
            number="4",
            rarity="Rare Holo",
            hp="120",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.charizard.types.add(self.fire)
        Attack.objects.create(card=self.charizard, name="Fire Spin", damage="100", order=0)
        Weakness.objects.create(card=self.charizard, type=self.water, value="×2")
        Resistance.objects.create(card=self.charizard, type=self.water, value="-30")

        self.squirtle = Card.objects.create(
            tcg_id="base2-63",
            set=self.set_b,
            name="Squirtle",
            number="63",
            rarity="Common",
            hp="40",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.squirtle.types.add(self.water)


class CardListTests(CardsSetsTypesTestBase):
    def test_list_returns_paginated_shape(self):
        response = self.client.get(reverse("card-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for key in ("count", "next", "previous", "results"):
            self.assertIn(key, response.data)
        self.assertEqual(response.data["count"], 2)

    def test_list_uses_light_serializer(self):
        response = self.client.get(reverse("card-list"))
        result = response.data["results"][0]
        self.assertNotIn("attacks", result)
        self.assertIn("set", result)
        self.assertIn("types", result)
        self.assertIn("number", result)
        self.assertIn("artist", result)

    def test_list_includes_image_large_as_a_fallback_for_a_broken_small_image(self):
        # `image_small` occasionally 404s on the upstream image host for
        # older cards (see docs/decisions.md #039) — the frontend falls
        # back to `image_large` when that happens, so the list response
        # needs to carry it even though the list view is otherwise a
        # deliberately light serializer.
        response = self.client.get(reverse("card-list"))
        result = response.data["results"][0]
        self.assertIn("image_large", result)

    def test_list_does_not_require_authentication(self):
        response = self.client.get(reverse("card-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_filter_by_rarity(self):
        response = self.client.get(reverse("card-list"), {"rarity": "Common"})
        names = [c["name"] for c in response.data["results"]]
        self.assertEqual(names, ["Squirtle"])

    def test_filter_by_supertype(self):
        response = self.client.get(reverse("card-list"), {"supertype": "Pokémon"})
        self.assertEqual(response.data["count"], 2)

    def test_filter_by_set(self):
        response = self.client.get(reverse("card-list"), {"set": self.set_a.id})
        names = [c["name"] for c in response.data["results"]]
        self.assertEqual(names, ["Charizard"])

    def test_filter_by_type_case_insensitive(self):
        response = self.client.get(reverse("card-list"), {"type": "fire"})
        names = [c["name"] for c in response.data["results"]]
        self.assertEqual(names, ["Charizard"])

    def test_filter_combination(self):
        response = self.client.get(reverse("card-list"), {"type": "water", "rarity": "Common"})
        names = [c["name"] for c in response.data["results"]]
        self.assertEqual(names, ["Squirtle"])

    def test_search_by_partial_case_insensitive_name(self):
        response = self.client.get(reverse("card-list"), {"search": "char"})
        names = [c["name"] for c in response.data["results"]]
        self.assertEqual(names, ["Charizard"])

    def test_ordering_by_name(self):
        response = self.client.get(reverse("card-list"), {"ordering": "name"})
        names = [c["name"] for c in response.data["results"]]
        self.assertEqual(names, ["Charizard", "Squirtle"])

    def test_filter_by_series_includes_cards_from_every_set_in_it(self):
        # set_a and set_b are both series "Base" (see
        # CardsSetsTypesTestBase) — a series filter should span both.
        response = self.client.get(reverse("card-list"), {"series": "Base"})
        names = {c["name"] for c in response.data["results"]}
        self.assertEqual(names, {"Charizard", "Squirtle"})

    def test_filter_by_series_excludes_cards_from_other_series(self):
        other_series_set = Set.objects.create(tcg_id="xy1", name="XY", series="XY")
        Card.objects.create(
            tcg_id="xy1-1",
            set=other_series_set,
            name="Mewtwo",
            number="1",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )

        response = self.client.get(reverse("card-list"), {"series": "Base"})

        names = {c["name"] for c in response.data["results"]}
        self.assertNotIn("Mewtwo", names)

    def test_filter_by_series_case_insensitive(self):
        response = self.client.get(reverse("card-list"), {"series": "base"})
        self.assertEqual(response.data["count"], 2)


class CardNumberOrderingTests(APITestCase):
    """`number` is a CharField (not every printed number is purely numeric,
    e.g. "TG01"), so ordering by it needs a numeric sort, not a lexicographic
    one — see docs/decisions.md #032.
    """

    def setUp(self):
        self.set_a = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        # "TG1" has a digit (extracts to numeric 1, ties with "1"); "A" has no
        # digits at all (extracts to NULL, must sort last regardless of direction).
        for number in ["1", "2", "10", "TG1", "A"]:
            Card.objects.create(
                tcg_id=f"base1-{number}",
                set=self.set_a,
                name=f"Card {number}",
                number=number,
                supertype="Pokémon",
                image_small="https://example.com/small.png",
                image_large="https://example.com/large.png",
            )

    def test_ordering_by_number_is_numeric_not_lexicographic(self):
        response = self.client.get(reverse("card-list"), {"ordering": "number"})
        numbers = [c["number"] for c in response.data["results"]]
        self.assertEqual(numbers, ["1", "TG1", "2", "10", "A"])

    def test_ordering_by_number_descending(self):
        response = self.client.get(reverse("card-list"), {"ordering": "-number"})
        numbers = [c["number"] for c in response.data["results"]]
        self.assertEqual(numbers, ["10", "2", "TG1", "1", "A"])


class CardReleaseDateOrderingTests(APITestCase):
    """Lets a search or an "All Sets"/"All {series}" view come back in the
    order the cards were actually released, e.g. every Charizard variant
    from earliest print to most recent — see docs/decisions.md #037.
    """

    def setUp(self):
        # Names are deliberately alphabetized *backwards* from release
        # order (newest set's card sorts first by name, oldest set's
        # sorts last) — otherwise a test could pass by coincidence even
        # if `?ordering=release_date` silently fell back to the view's
        # default alphabetical-by-name ordering instead of really sorting
        # by release date.
        self.newest_set = Set.objects.create(
            tcg_id="swsh1",
            name="Sword & Shield",
            series="Sword & Shield",
            release_date="2020-02-07",
        )
        self.oldest_set = Set.objects.create(
            tcg_id="base1",
            name="Base",
            series="Base",
            release_date="1999-01-09",
        )
        self.middle_set = Set.objects.create(
            tcg_id="neo1",
            name="Neo Genesis",
            series="Neo",
            release_date="2000-12-16",
        )
        # Two cards in the same set (same release date) — a tiebreak is
        # needed for these to come back in checklist order. Numbered so
        # checklist order ("Zapdos" #1 before "Ninetales" #2) also
        # disagrees with alphabetical name order, for the same reason.
        Card.objects.create(
            tcg_id="base1-1",
            set=self.oldest_set,
            name="Zapdos",
            number="1",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        Card.objects.create(
            tcg_id="base1-2",
            set=self.oldest_set,
            name="Ninetales",
            number="2",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        Card.objects.create(
            tcg_id="neo1-1",
            set=self.middle_set,
            name="Lugia",
            number="1",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        Card.objects.create(
            tcg_id="swsh1-1",
            set=self.newest_set,
            name="Alakazam",
            number="1",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )

    def test_ordering_by_release_date_oldest_first(self):
        response = self.client.get(reverse("card-list"), {"ordering": "release_date"})
        names = [c["name"] for c in response.data["results"]]
        self.assertEqual(names, ["Zapdos", "Ninetales", "Lugia", "Alakazam"])

    def test_ordering_by_release_date_newest_first(self):
        response = self.client.get(reverse("card-list"), {"ordering": "-release_date"})
        names = [c["name"] for c in response.data["results"]]
        self.assertEqual(names, ["Alakazam", "Lugia", "Zapdos", "Ninetales"])

    def test_cards_in_the_same_set_still_come_back_in_checklist_order(self):
        # Both are in oldest_set, so they share a release date — the
        # tiebreak (by number) is what keeps this deterministic.
        response = self.client.get(reverse("card-list"), {"ordering": "release_date"})
        names = [c["name"] for c in response.data["results"]]
        self.assertEqual(names.index("Zapdos"), names.index("Ninetales") - 1)

    def test_release_date_included_on_nested_set(self):
        response = self.client.get(reverse("card-list"), {"ordering": "release_date"})
        result = response.data["results"][0]
        self.assertEqual(result["set"]["release_date"], "1999-01-09")


class CardNameNumberReleaseDateTiebreakTests(APITestCase):
    """Sorting by `name` (e.g. every "Abra" print) or `number` (e.g. every
    "#1" across different sets) needs a `release_date` tiebreak too, or
    same-named/same-numbered cards come back in arbitrary order — see
    docs/decisions.md #038.
    """

    def setUp(self):
        self.new_set = Set.objects.create(
            tcg_id="new1",
            name="New Set",
            series="New",
            release_date="2020-02-07",
        )
        self.old_set = Set.objects.create(
            tcg_id="old1",
            name="Old Set",
            series="Old",
            release_date="1999-01-09",
        )
        # Numbers/names are deliberately picked so a *wrong* tiebreak
        # (falling back to number-ascending, or to alphabetical name)
        # would produce a different result than tiebreaking by
        # release_date really does. `abra_new` is also deliberately
        # created *before* `abra_old` (so it gets the lower id) — release
        # date is what must decide their order, not insertion/id order,
        # which a fresh table can otherwise coincide with.
        self.abra_new = Card.objects.create(
            tcg_id="new1-1",
            set=self.new_set,
            name="Abra",
            number="1",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.abra_old = Card.objects.create(
            tcg_id="old1-99",
            set=self.old_set,
            name="Abra",
            number="99",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.kadabra = Card.objects.create(
            tcg_id="old1-50",
            set=self.old_set,
            name="Kadabra",
            number="50",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.zubat = Card.objects.create(
            tcg_id="old1-1",
            set=self.old_set,
            name="Zubat",
            number="1",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )

    def test_name_sort_tiebreaks_same_named_cards_by_release_date(self):
        # If this instead fell back to number-ascending, Abra/New (#1)
        # would wrongly come before Abra/Old (#99).
        response = self.client.get(reverse("card-list"), {"ordering": "name"})
        results = [(c["name"], c["set"]["name"]) for c in response.data["results"]]
        self.assertEqual(
            results,
            [
                ("Abra", "Old Set"),
                ("Abra", "New Set"),
                ("Kadabra", "Old Set"),
                ("Zubat", "Old Set"),
            ],
        )

    def test_number_sort_tiebreaks_same_numbered_cards_by_release_date(self):
        # If this instead fell back to alphabetical name, Abra/New would
        # wrongly come before Zubat/Old within the "#1" group.
        response = self.client.get(reverse("card-list"), {"ordering": "number"})
        results = [(c["number"], c["name"], c["set"]["name"]) for c in response.data["results"]]
        self.assertEqual(
            results,
            [
                ("1", "Zubat", "Old Set"),
                ("1", "Abra", "New Set"),
                ("50", "Kadabra", "Old Set"),
                ("99", "Abra", "Old Set"),
            ],
        )

    def test_name_sort_tiebreak_reverses_with_newest_first(self):
        response = self.client.get(
            reverse("card-list"), {"ordering": "name", "newest_first": "true"}
        )
        results = [(c["name"], c["set"]["name"]) for c in response.data["results"]]
        self.assertEqual(
            results,
            [
                ("Abra", "New Set"),
                ("Abra", "Old Set"),
                ("Kadabra", "Old Set"),
                ("Zubat", "Old Set"),
            ],
        )

    def test_number_sort_tiebreak_reverses_with_newest_first(self):
        response = self.client.get(
            reverse("card-list"), {"ordering": "number", "newest_first": "true"}
        )
        results = [(c["number"], c["name"], c["set"]["name"]) for c in response.data["results"]]
        self.assertEqual(
            results,
            [
                ("1", "Abra", "New Set"),
                ("1", "Zubat", "Old Set"),
                ("50", "Kadabra", "Old Set"),
                ("99", "Abra", "Old Set"),
            ],
        )

    def test_newest_first_is_ignored_for_release_date_sort(self):
        # `newest_first` only affects the name/number tiebreak; reversing
        # a `release_date` sort itself is already `-release_date`.
        response = self.client.get(
            reverse("card-list"),
            {"ordering": "release_date", "newest_first": "true"},
        )
        results = [(c["name"], c["number"]) for c in response.data["results"]]
        # old_set's three cards (all release_date 1999) tiebreak by number
        # ascending: Zubat #1, Kadabra #50, Abra #99 — then new_set's Abra
        # (release_date 2020, #1) last.
        self.assertEqual(
            results,
            [("Zubat", "1"), ("Kadabra", "50"), ("Abra", "99"), ("Abra", "1")],
        )


class CardDetailTests(CardsSetsTypesTestBase):
    def test_retrieve_includes_nested_related_data(self):
        response = self.client.get(reverse("card-detail", args=[self.charizard.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["attacks"]), 1)
        self.assertEqual(response.data["attacks"][0]["name"], "Fire Spin")
        self.assertEqual(len(response.data["weaknesses"]), 1)
        self.assertEqual(response.data["weaknesses"][0]["type"]["name"], "Water")
        self.assertEqual(len(response.data["resistances"]), 1)
        self.assertEqual(len(response.data["types"]), 1)

    def test_retrieve_nonexistent_card_returns_404(self):
        response = self.client.get(reverse("card-detail", args=[999999]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_does_not_require_authentication(self):
        response = self.client.get(reverse("card-detail", args=[self.charizard.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class SetViewSetTests(CardsSetsTypesTestBase):
    def test_list_sets_is_not_paginated(self):
        response = self.client.get(reverse("set-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 2)

    def test_list_does_not_require_authentication(self):
        response = self.client.get(reverse("set-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class TypeViewSetTests(CardsSetsTypesTestBase):
    def test_list_types_is_not_paginated(self):
        response = self.client.get(reverse("type-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 2)

    def test_list_does_not_require_authentication(self):
        response = self.client.get(reverse("type-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_list_scoped_to_a_set_excludes_types_only_used_elsewhere(self):
        # set_a's only card (Charizard) is Fire-type; set_b's (Squirtle) is
        # Water-type — see CardsSetsTypesTestBase.
        response = self.client.get(reverse("type-list"), {"set": self.set_a.id})
        names = [t["name"] for t in response.data]
        self.assertEqual(names, ["Fire"])

    def test_list_scoped_to_a_series_includes_types_from_every_set_in_it(self):
        # set_a and set_b are both series "Base".
        response = self.client.get(reverse("type-list"), {"series": "Base"})
        names = sorted(t["name"] for t in response.data)
        self.assertEqual(names, ["Fire", "Water"])


class RarityListViewTests(APITestCase):
    def setUp(self):
        self.set_a = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        self.set_b = Set.objects.create(tcg_id="base2", name="Jungle", series="Base")
        # set_a: includes a duplicate ("Common" twice) and a blank rarity, to
        # prove the response is distinct and excludes blanks.
        for i, rarity in enumerate(["Rare Holo", "Common", "Common", ""]):
            Card.objects.create(
                tcg_id=f"base1-{i}",
                set=self.set_a,
                name=f"Card {i}",
                number=str(i),
                rarity=rarity,
                supertype="Pokémon",
                image_small="https://example.com/small.png",
                image_large="https://example.com/large.png",
            )
        # set_b: a rarity that doesn't appear anywhere in set_a. Same series
        # as set_a ("Base"), so a series filter should include it.
        Card.objects.create(
            tcg_id="base2-0",
            set=self.set_b,
            name="Other Card",
            number="0",
            rarity="Rare Ultra",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        # set_c: a different series entirely, with a rarity that shouldn't
        # appear when scoped to "Base".
        self.set_c = Set.objects.create(tcg_id="xy1", name="XY", series="XY")
        Card.objects.create(
            tcg_id="xy1-0",
            set=self.set_c,
            name="Other Series Card",
            number="0",
            rarity="Ultra Rare",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )

    def test_returns_distinct_sorted_rarities_excluding_blank(self):
        response = self.client.get(reverse("rarity-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, ["Common", "Rare Holo", "Rare Ultra", "Ultra Rare"])

    def test_list_scoped_to_a_set_excludes_rarities_only_present_elsewhere(self):
        response = self.client.get(reverse("rarity-list"), {"set": self.set_a.id})
        self.assertEqual(response.data, ["Common", "Rare Holo"])

    def test_list_scoped_to_a_series_includes_every_set_in_it_but_excludes_others(
        self,
    ):
        response = self.client.get(reverse("rarity-list"), {"series": "Base"})
        self.assertEqual(response.data, ["Common", "Rare Holo", "Rare Ultra"])

        response = self.client.get(reverse("rarity-list"), {"series": "XY"})
        self.assertEqual(response.data, ["Ultra Rare"])

    def test_does_not_require_authentication(self):
        response = self.client.get(reverse("rarity-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class SupertypeListViewTests(APITestCase):
    def setUp(self):
        self.set_a = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        self.set_b = Set.objects.create(tcg_id="base2", name="Jungle", series="Base")
        Card.objects.create(
            tcg_id="base1-1",
            set=self.set_a,
            name="Charizard",
            number="1",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        Card.objects.create(
            tcg_id="base1-2",
            set=self.set_a,
            name="Potion",
            number="2",
            supertype="Trainer",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        Card.objects.create(
            tcg_id="base2-1",
            set=self.set_b,
            name="Fire Energy",
            number="1",
            supertype="Energy",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )

    def test_returns_all_present_supertypes_in_canonical_order(self):
        response = self.client.get(reverse("supertype-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, ["Pokémon", "Trainer", "Energy"])

    def test_list_scoped_to_a_set_excludes_supertypes_only_present_elsewhere(self):
        response = self.client.get(reverse("supertype-list"), {"set": self.set_a.id})
        self.assertEqual(response.data, ["Pokémon", "Trainer"])

    def test_list_scoped_to_a_series_includes_supertypes_from_every_set_in_it(self):
        # set_a and set_b are both series "Base".
        response = self.client.get(reverse("supertype-list"), {"series": "Base"})
        self.assertEqual(response.data, ["Pokémon", "Trainer", "Energy"])

    def test_does_not_require_authentication(self):
        response = self.client.get(reverse("supertype-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class CardNameListViewTests(APITestCase):
    def setUp(self):
        self.set_a = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        self.set_b = Set.objects.create(tcg_id="base2", name="Jungle", series="Base")
        self.set_c = Set.objects.create(tcg_id="xy1", name="XY", series="XY")
        for i, (name, card_set) in enumerate(
            [
                ("Piplup", self.set_a),
                ("Pidgey", self.set_a),
                ("Pikachu", self.set_b),
                ("Charizard", self.set_c),
            ]
        ):
            Card.objects.create(
                tcg_id=f"card-{i}",
                set=card_set,
                name=name,
                number=str(i),
                supertype="Pokémon",
                image_small="https://example.com/small.png",
                image_large="https://example.com/large.png",
            )

    def test_returns_names_containing_the_search_term_as_a_prefix(self):
        response = self.client.get(reverse("card-name-list"), {"search": "pi"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(sorted(response.data), ["Pidgey", "Pikachu", "Piplup"])

    def test_case_insensitive(self):
        response = self.client.get(reverse("card-name-list"), {"search": "PI"})
        self.assertEqual(sorted(response.data), ["Pidgey", "Pikachu", "Piplup"])

    def test_matches_the_search_term_anywhere_in_the_name_not_just_as_a_prefix(self):
        # See docs/decisions.md #046 — a substring match, not startswith:
        # "zard" (mid/end of "Charizard") should still find it.
        response = self.client.get(reverse("card-name-list"), {"search": "zard"})
        self.assertEqual(response.data, ["Charizard"])

    def test_finds_a_species_name_embedded_in_a_longer_tag_team_card_name(self):
        # The exact real-world case reported: searching a species name
        # embedded partway through a combined "X & Y" tag-team card name
        # should surface it, not just a card named exactly that species.
        Card.objects.create(
            tcg_id="tag-team",
            set=self.set_c,
            name="Mega Lopunny & Jigglypuff GX",
            number="300",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        response = self.client.get(reverse("card-name-list"), {"search": "jigglypuff"})
        self.assertIn("Mega Lopunny & Jigglypuff GX", response.data)

    def test_empty_search_returns_no_suggestions(self):
        response = self.client.get(reverse("card-name-list"))
        self.assertEqual(response.data, [])

    def test_single_character_search_returns_no_suggestions(self):
        # Rejected outright rather than run as a substring match — see
        # MIN_SEARCH_LENGTH's own comment for why a 1-character substring
        # search is pathologically broad against real data.
        response = self.client.get(reverse("card-name-list"), {"search": "p"})
        self.assertEqual(response.data, [])

    def test_scoped_to_a_set_excludes_names_only_present_elsewhere(self):
        response = self.client.get(
            reverse("card-name-list"), {"search": "pi", "set": self.set_b.id}
        )
        self.assertEqual(response.data, ["Pikachu"])

    def test_scoped_to_a_series_includes_every_set_in_it_but_excludes_others(self):
        response = self.client.get(reverse("card-name-list"), {"search": "pi", "series": "Base"})
        self.assertEqual(sorted(response.data), ["Pidgey", "Pikachu", "Piplup"])

    def test_capped_at_eight_results(self):
        for i in range(10):
            Card.objects.create(
                tcg_id=f"cap-{i}",
                set=self.set_a,
                name=f"Piloswine {i}",
                number=str(100 + i),
                supertype="Pokémon",
                image_small="https://example.com/small.png",
                image_large="https://example.com/large.png",
            )

        response = self.client.get(reverse("card-name-list"), {"search": "pi"})

        self.assertEqual(len(response.data), 8)

    def test_prefers_shorter_plainer_names_over_longer_variant_suffixed_ones(self):
        # A naive alphabetical cap gets dominated by one popular species'
        # reprints before ever reaching a different, shorter species name —
        # confirmed against real data ("Pikachu" and "Piplup" both fell
        # outside an alphabetical top 8 for "pi", crowded out by "Pidgeot"
        # variants alone).
        for name in ["Pikachu ex", "Pikachu VMAX", "Pikachu V", "Pikachu-EX"]:
            Card.objects.create(
                tcg_id=f"variant-{name}",
                set=self.set_a,
                name=name,
                number="200",
                supertype="Pokémon",
                image_small="https://example.com/small.png",
                image_large="https://example.com/large.png",
            )

        response = self.client.get(reverse("card-name-list"), {"search": "pi"})

        self.assertIn("Pikachu", response.data)
        self.assertIn("Piplup", response.data)

    def test_does_not_require_authentication(self):
        response = self.client.get(reverse("card-name-list"), {"search": "pi"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
