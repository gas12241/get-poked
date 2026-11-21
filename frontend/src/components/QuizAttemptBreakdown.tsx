import { Link } from 'react-router-dom';
import type { QuizAttemptAnswerDetail } from '../api/quiz';

// Reused for both the immediate post-quiz breakdown (fed by the save
// response) and an expanded history entry (fed by a detail fetch) — same
// shape either way. See docs/decisions.md #088.
function QuizAttemptBreakdown({
  answers,
}: {
  answers: QuizAttemptAnswerDetail[];
}) {
  return (
    <ol className="quiz-attempt-breakdown">
      {answers.map((answer) => (
        <li key={answer.order} className="quiz-attempt-breakdown-row">
          <Link
            to={`/cards/${answer.card.id}`}
            state={{ from: 'quiz' }}
            className="quiz-attempt-breakdown-card"
          >
            <img src={answer.card.image_small} alt={answer.card.name} />
          </Link>
          <div className="quiz-attempt-breakdown-text">
            <p>Your guess: {answer.guess || '—'}</p>
            <p>Correct answer: {answer.correct_answer}</p>
            <p>Time: {answer.time_taken_seconds.toFixed(1)}s</p>
          </div>
          <span
            className={
              answer.is_correct
                ? 'quiz-feedback-correct'
                : 'quiz-feedback-incorrect'
            }
          >
            {answer.is_correct ? 'Correct' : 'Incorrect'}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default QuizAttemptBreakdown;
