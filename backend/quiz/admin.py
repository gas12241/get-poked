from django.contrib import admin

from .models import QuizAttempt, QuizAttemptAnswer


class QuizAttemptAnswerInline(admin.TabularInline):
    model = QuizAttemptAnswer
    extra = 0


@admin.register(QuizAttempt)
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ("user", "quiz_mode", "score", "total_questions", "completed_at")
    list_filter = ("quiz_mode",)
    search_fields = ("user__email",)
    inlines = [QuizAttemptAnswerInline]
