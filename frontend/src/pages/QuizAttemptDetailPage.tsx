import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getQuizAttemptDetail } from '../api/quiz';
import {
  difficultyLabel,
  formatQuizAttemptTime,
  formatQuizHistoryDate,
  modeLabel,
} from '../lib/quizAttemptFormatting';
import QuizAttemptBreakdown from '../components/QuizAttemptBreakdown';
import './pages.css';

function QuizAttemptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const attemptQuery = useQuery({
    queryKey: ['quiz-attempt-detail', Number(id)],
    queryFn: () => getQuizAttemptDetail(Number(id)),
    enabled: Boolean(id),
  });

  if (attemptQuery.isLoading) return <p>Loading...</p>;
  // Covers both "not found" (another user's attempt, or a bad id) and a
  // genuine failure with one generic message — same reasoning as other
  // per-user detail views in this app not distinguishing the two.
  if (attemptQuery.isError) return <p>Couldn&apos;t load this quiz attempt.</p>;
  if (!attemptQuery.data) return null;

  const attempt = attemptQuery.data;
  const dateStr = attempt.completed_at.slice(0, 10);

  return (
    <>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="back-link back-button"
      >
        &larr; Back to Quiz
      </button>

      <div className="quiz-history-day">
        <h2>{formatQuizHistoryDate(dateStr)}</h2>
        <p className="quiz-attempt-detail-summary">
          <span>{modeLabel(attempt.quiz_mode)}</span>
          <span>{difficultyLabel(attempt.difficulty)}</span>
          <span>{formatQuizAttemptTime(attempt.completed_at)}</span>
          <span>
            {attempt.score} / {attempt.total_questions}
          </span>
        </p>
        <QuizAttemptBreakdown answers={attempt.answers} />
      </div>
    </>
  );
}

export default QuizAttemptDetailPage;
