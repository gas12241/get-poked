from django.urls import path

from .views import QuizAttemptListCreateView, QuizCheckView, QuizQuestionsView

urlpatterns = [
    path("quiz/", QuizQuestionsView.as_view(), name="quiz-questions"),
    path("quiz/check/", QuizCheckView.as_view(), name="quiz-check"),
    path("quiz-attempts/", QuizAttemptListCreateView.as_view(), name="quiz-attempt-list"),
]
