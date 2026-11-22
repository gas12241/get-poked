from django.urls import path

from .views import (
    QuizAttemptCreateView,
    QuizAttemptDatesView,
    QuizAttemptDetailView,
    QuizAttemptsByDateView,
    QuizAttemptStatsView,
    QuizCheckView,
    QuizQuestionsView,
    QuizShareCreateView,
    QuizShareDetailView,
)

urlpatterns = [
    path("quiz/", QuizQuestionsView.as_view(), name="quiz-questions"),
    path("quiz/check/", QuizCheckView.as_view(), name="quiz-check"),
    path("quiz-attempts/", QuizAttemptCreateView.as_view(), name="quiz-attempt-create"),
    path("quiz-shares/", QuizShareCreateView.as_view(), name="quiz-share-create"),
    path("quiz-shares/<uuid:token>/", QuizShareDetailView.as_view(), name="quiz-share-detail"),
    path("quiz-attempts/dates/", QuizAttemptDatesView.as_view(), name="quiz-attempt-dates"),
    path(
        "quiz-attempts/by-date/<str:date>/",
        QuizAttemptsByDateView.as_view(),
        name="quiz-attempts-by-date",
    ),
    path("quiz-attempts/stats/", QuizAttemptStatsView.as_view(), name="quiz-attempt-stats"),
    path("quiz-attempts/<int:pk>/", QuizAttemptDetailView.as_view(), name="quiz-attempt-detail"),
]
