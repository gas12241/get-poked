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

    def test_returns_names_starting_with_the_search_term(self):
        response = self.client.get(reverse("card-name-list"), {"search": "pi"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(sorted(response.data), ["Pidgey", "Pikachu", "Piplup"])

    def test_case_insensitive(self):
        response = self.client.get(reverse("card-name-list"), {"search": "PI"})
        self.assertEqual(sorted(response.data), ["Pidgey", "Pikachu", "Piplup"])

    def test_excludes_names_not_starting_with_the_search_term(self):
        # "charizard" contains no "pi" substring anyway, but this also
        # proves it's a startswith match, not a substring one — e.g.
        # searching "zard" should not match "Charizard".
        response = self.client.get(reverse("card-name-list"), {"search": "zard"})
        self.assertEqual(response.data, [])

    def test_empty_search_returns_no_suggestions(self):
        response = self.client.get(reverse("card-name-list"))
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
