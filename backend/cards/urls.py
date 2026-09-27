from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CardNameListView,
    CardViewSet,
    RarityListView,
    SetViewSet,
    SupertypeListView,
    TypeViewSet,
)

router = DefaultRouter()
router.register("cards", CardViewSet, basename="card")
router.register("sets", SetViewSet, basename="set")
router.register("types", TypeViewSet, basename="type")

urlpatterns = router.urls + [
    path("rarities/", RarityListView.as_view(), name="rarity-list"),
    path("supertypes/", SupertypeListView.as_view(), name="supertype-list"),
    path("card-names/", CardNameListView.as_view(), name="card-name-list"),
]
