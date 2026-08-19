from rest_framework.routers import DefaultRouter

from .views import CardViewSet, SetViewSet, TypeViewSet

router = DefaultRouter()
router.register("cards", CardViewSet, basename="card")
router.register("sets", SetViewSet, basename="set")
router.register("types", TypeViewSet, basename="type")

urlpatterns = router.urls
