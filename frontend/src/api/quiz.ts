import { apiClient } from '../lib/apiClient';
import type { CardListItem, Set } from './cards';

export type QuizMode =
  'guess_card' | 'guess_set' | 'guess_hp' | 'guess_set_icon';
export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface QuizQuestion {
  // Present for guess_card/guess_set/guess_hp only — absent for
  // guess_set_icon, which has no particular card involved at all.
  card?: number;
  image: string;
  rarity?: string;
  supertype?: string;
  types?: string[];
  name?: string;
  hp?: string;
  // The hint shown alongside guess_card/guess_hp questions (the card's own
  // set) — not to be confused with `set` below, guess_set_icon's own
  // subject.
  card_set?: { id: number; name: string };
  // guess_set_icon only: the set being guessed, and — for easy/medium —
  // the multiple-choice options to pick from (never flagged with which is
  // correct). Absent entirely for hard difficulty, same "never send the
  // answer" principle every other mode already follows.
  set?: number;
  choices?: { id: number; name: string }[];
}

export interface QuizQuestionsResponse {
  questions: QuizQuestion[];
}

export interface QuizCheckResult {
  correct: boolean;
  answer: string;
}

export interface QuizAnswerInput {
  // Exactly one of card/set is ever present, mirroring the backend's own
  // either/or answer shape — guess_set_icon sets `set`, every other mode
  // sets `card`.
  card?: number;
  set?: number;
  guess: string;
  // Kept locally for the instant score tally shown the moment a quiz
  // finishes, before the save round-trip completes — never sent to the
  // backend (stripped when building the request body), which re-derives
  // it itself from `guess` and doesn't trust a client-submitted value.
  // See docs/decisions.md #088.
  is_correct: boolean;
  time_taken_seconds: number;
  order: number;
}

export interface QuizAttemptCreateInput {
  quiz_mode: QuizMode;
  difficulty: QuizDifficulty;
  answers: {
    card?: number;
    set?: number;
    guess: string;
    time_taken_seconds: number;
    order: number;
  }[];
}

export interface QuizAttemptAnswerDetail {
  // Exactly one of card/set is ever present, mirroring the backend's own
  // either/or answer shape. The real, fully unmasked card (not the
  // quiz's masked question image) — enough to show what was being
  // guessed on and link to its own detail page.
  card: CardListItem | null;
  set: Set | null;
  guess: string;
  correct_answer: string;
  is_correct: boolean;
  time_taken_seconds: number;
  order: number;
}

export interface QuizAttemptDetail {
  id: number;
  quiz_mode: QuizMode;
  difficulty: QuizDifficulty;
  score: number;
  total_questions: number;
  completed_at: string;
  answers: QuizAttemptAnswerDetail[];
}

export interface QuizAttemptSummary {
  id: number;
  quiz_mode: QuizMode;
  difficulty: QuizDifficulty;
  score: number;
  total_questions: number;
  completed_at: string;
}

export interface QuizAttemptDatesResponse {
  // "YYYY-MM-DD" — only the days within the requested month that actually
  // have an attempt. Powers the history calendar's "which days are
  // clickable" check, same reasoning as Horoscope's own dates endpoint.
  dates: string[];
}

export interface QuizAttemptModeStats {
  mode: QuizMode;
  attempts: number;
  correct: number;
  total_questions: number;
  // null (not 0) when total_questions is 0 — "never played this mode" is
  // not the same as "played it and got 0% right". See docs/decisions.md
  // #097.
  accuracy: number | null;
}

export interface QuizAttemptStatsSummary {
  attempts: number;
  correct: number;
  total_questions: number;
  accuracy: number | null;
  // Always one row per QuizMode, even at zero — see docs/decisions.md #097.
  by_mode: QuizAttemptModeStats[];
}

export interface QuizAttemptStats {
  today: QuizAttemptStatsSummary;
  career: QuizAttemptStatsSummary;
}

export interface QuizQuestionsParams {
  mode: QuizMode;
  count?: number;
  rarities?: string[];
  difficulty?: QuizDifficulty;
}

function toQueryString(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export const getQuizQuestions = ({
  mode,
  count,
  rarities,
  difficulty,
}: QuizQuestionsParams) =>
  apiClient<QuizQuestionsResponse>(
    `/api/v1/quiz/${toQueryString({ mode, count, rarities: rarities?.join(','), difficulty })}`,
  );

export const checkQuizAnswer = (payload: {
  card?: number;
  set?: number;
  mode: QuizMode;
  guess: string;
}) =>
  apiClient<QuizCheckResult>('/api/v1/quiz/check/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const submitQuizAttempt = (payload: QuizAttemptCreateInput) =>
  apiClient<QuizAttemptDetail>('/api/v1/quiz-attempts/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getQuizAttemptDates = (month: string) =>
  apiClient<QuizAttemptDatesResponse>(
    `/api/v1/quiz-attempts/dates/?month=${month}`,
  );

export const getQuizAttemptsByDate = (date: string) =>
  apiClient<QuizAttemptSummary[]>(`/api/v1/quiz-attempts/by-date/${date}/`);

export const getQuizAttemptDetail = (id: number) =>
  apiClient<QuizAttemptDetail>(`/api/v1/quiz-attempts/${id}/`);

// `date` is "today" in UTC terms — same day boundary QuizHistoryCalendar
// already uses throughout (see docs/decisions.md #088), so a quiz taken
// right after midnight UTC counts the same way for every viewer regardless
// of their own timezone.
export const getQuizAttemptStats = (date: string) =>
  apiClient<QuizAttemptStats>(`/api/v1/quiz-attempts/stats/?date=${date}`);
