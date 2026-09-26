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
