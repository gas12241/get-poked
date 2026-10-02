from django.urls import path

from .views import HoroscopePullDatesView, HoroscopePullDetailView, HoroscopeTodayView

urlpatterns = [
    path("horoscope/pull/", HoroscopeTodayView.as_view(), name="horoscope-today"),
    path(
        "horoscope-pull-dates/",
        HoroscopePullDatesView.as_view(),
        name="horoscope-pull-dates",
    ),
    path(
        "horoscope-pulls/<str:date>/",
        HoroscopePullDetailView.as_view(),
        name="horoscope-pull-detail",
    ),
]
