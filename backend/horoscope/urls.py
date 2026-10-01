from django.urls import path

from .views import HoroscopePullListView, HoroscopeTodayView

urlpatterns = [
    path("horoscope/pull/", HoroscopeTodayView.as_view(), name="horoscope-today"),
    path("horoscope-pulls/", HoroscopePullListView.as_view(), name="horoscope-pull-list"),
]
