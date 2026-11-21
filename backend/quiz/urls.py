from django.urls import path

from .views import (
    QuizAttemptCreateView,
    QuizAttemptDatesView,
    QuizAttemptDetailView,
    QuizAttemptsByDateView,
    QuizCheckView,
    QuizQuestionsView,
)

urlpatterns = [
    path("quiz/", QuizQuestionsView.as_view(), name="quiz-questions"),
    path("quiz/check/", QuizCheckView.as_view(), name="quiz-check"),
    path("quiz-attempts/", QuizAttemptCreateView.as_view(), name="quiz-attempt-create"),
    path("quiz-attempts/dates/", QuizAttemptDatesView.as_view(), name="quiz-attempt-dates"),
    path(
        "quiz-attempts/by-date/<str:date>/",
        QuizAttemptsByDateView.as_view(),
        name="quiz-attempts-by-date",
    ),
    path("quiz-attempts/<int:pk>/", QuizAttemptDetailView.as_view(), name="quiz-attempt-detail"),
]
