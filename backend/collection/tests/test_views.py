from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from cards.models import Card, Set
from collection.models import CollectionEntry, Favorite

User = get_user_model()


class CollectionTestBase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="tester@example.com", password="s3cret-pass!")
        self.other_user = User.objects.create_user(
            email="other@example.com", password="s3cret-pass!"
        )
        set_obj = Set.objects.create(tcg_id="base1", name="Base", series="Base")
        self.card = Card.objects.create(
            tcg_id="base1-4",
            set=set_obj,
            name="Charizard",
            number="4",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )
        self.other_card = Card.objects.create(
            tcg_id="base1-5",
            set=set_obj,
            name="Blastoise",
            number="2",
            supertype="Pokémon",
            image_small="https://example.com/small.png",
            image_large="https://example.com/large.png",
        )


class FavoriteViewTests(CollectionTestBase):
    def test_requires_authentication(self):
        response = self.client.get(reverse("favorite-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_sets_user_from_request(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(reverse("favorite-list"), {"card_id": self.card.id})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        favorite = Favorite.objects.get(card=self.card)
        self.assertEqual(favorite.user, self.user)
        self.assertEqual(response.data["card"]["id"], self.card.id)

    def test_list_only_returns_the_requesting_users_favorites(self):
        Favorite.objects.create(user=self.user, card=self.card)
        Favorite.objects.create(user=self.other_user, card=self.other_card)
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("favorite-list"))

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["card"]["id"], self.card.id)

    def test_duplicate_favorite_rejected(self):
        Favorite.objects.create(user=self.user, card=self.card)
        self.client.force_authenticate(self.user)

        response = self.client.post(reverse("favorite-list"), {"card_id": self.card.id})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Favorite.objects.filter(user=self.user, card=self.card).count(), 1)

    def test_delete_removes_own_favorite(self):
        favorite = Favorite.objects.create(user=self.user, card=self.card)
        self.client.force_authenticate(self.user)

        response = self.client.delete(reverse("favorite-detail", args=[favorite.id]))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Favorite.objects.filter(id=favorite.id).exists())

    def test_cannot_delete_another_users_favorite(self):
        favorite = Favorite.objects.create(user=self.other_user, card=self.card)
        self.client.force_authenticate(self.user)

        response = self.client.delete(reverse("favorite-detail", args=[favorite.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Favorite.objects.filter(id=favorite.id).exists())

    def test_card_ids_returns_only_own_favorited_ids_unpaginated(self):
        Favorite.objects.create(user=self.user, card=self.card)
        Favorite.objects.create(user=self.other_user, card=self.other_card)
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("favorite-card-ids"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [self.card.id])


class CollectionEntryViewTests(CollectionTestBase):
    def test_requires_authentication(self):
        response = self.client.get(reverse("collection-list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_sets_user_from_request(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            reverse("collection-list"), {"card_id": self.card.id, "quantity": 2}
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        entry = CollectionEntry.objects.get(card=self.card)
        self.assertEqual(entry.user, self.user)
        self.assertEqual(entry.quantity, 2)

    def test_create_defaults_quantity_to_one(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(reverse("collection-list"), {"card_id": self.card.id})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["quantity"], 1)

    def test_list_only_returns_the_requesting_users_entries(self):
        CollectionEntry.objects.create(user=self.user, card=self.card, quantity=1)
        CollectionEntry.objects.create(user=self.other_user, card=self.other_card, quantity=3)
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("collection-list"))

        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["card"]["id"], self.card.id)

    def test_duplicate_collection_entry_rejected(self):
        CollectionEntry.objects.create(user=self.user, card=self.card, quantity=1)
        self.client.force_authenticate(self.user)

        response = self.client.post(reverse("collection-list"), {"card_id": self.card.id})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_without_card_id_rejected(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(reverse("collection-list"), {"quantity": 1})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_zero_quantity_rejected(self):
        self.client.force_authenticate(self.user)

        response = self.client.post(
            reverse("collection-list"), {"card_id": self.card.id, "quantity": 0}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_updates_own_quantity(self):
        entry = CollectionEntry.objects.create(user=self.user, card=self.card, quantity=1)
        self.client.force_authenticate(self.user)

        response = self.client.patch(reverse("collection-detail", args=[entry.id]), {"quantity": 5})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry.refresh_from_db()
        self.assertEqual(entry.quantity, 5)

    def test_cannot_patch_another_users_entry(self):
        entry = CollectionEntry.objects.create(user=self.other_user, card=self.card, quantity=1)
        self.client.force_authenticate(self.user)

        response = self.client.patch(reverse("collection-detail", args=[entry.id]), {"quantity": 5})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        entry.refresh_from_db()
        self.assertEqual(entry.quantity, 1)

    def test_delete_removes_own_entry(self):
        entry = CollectionEntry.objects.create(user=self.user, card=self.card, quantity=1)
        self.client.force_authenticate(self.user)

        response = self.client.delete(reverse("collection-detail", args=[entry.id]))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(CollectionEntry.objects.filter(id=entry.id).exists())

    def test_cannot_delete_another_users_entry(self):
        entry = CollectionEntry.objects.create(user=self.other_user, card=self.card, quantity=1)
        self.client.force_authenticate(self.user)

        response = self.client.delete(reverse("collection-detail", args=[entry.id]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(CollectionEntry.objects.filter(id=entry.id).exists())

    def test_quantities_returns_only_own_entries_as_a_map(self):
        CollectionEntry.objects.create(user=self.user, card=self.card, quantity=3)
        CollectionEntry.objects.create(user=self.other_user, card=self.other_card, quantity=9)
        self.client.force_authenticate(self.user)

        response = self.client.get(reverse("collection-quantities"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {self.card.id: 3})
