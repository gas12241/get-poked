import { apiClient } from '../lib/apiClient';

export type QuizMode = 'guess_card' | 'guess_set' | 'guess_hp';

export interface QuizQuestion {
  card: number;
  image: string;
  rarity: string;
  supertype: string;
  types: string[];
  name?: string;
  hp?: string;
  set?: { id: number; name: string };
}

export interface QuizQuestionsResponse {
  questions: QuizQuestion[];
}

export interface QuizCheckResult {
  correct: boolean;
  answer: string;
}

export interface QuizAnswerInput {
  card: number;
  is_correct: boolean;
  time_taken_seconds: number;
  order: number;
}

export interface QuizAttemptInput {
  quiz_mode: QuizMode;
  answers: QuizAnswerInput[];
}

export interface QuizAttempt {
  id: number;
  quiz_mode: QuizMode;
  score: number;
  total_questions: number;
  completed_at: string;
}

export interface QuizQuestionsParams {
  mode: QuizMode;
  count?: number;
  rarities?: string[];
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
}: QuizQuestionsParams) =>
  apiClient<QuizQuestionsResponse>(
    `/api/v1/quiz/${toQueryString({ mode, count, rarities: rarities?.join(',') })}`,
  );

export const checkQuizAnswer = (payload: {
  card: number;
  mode: QuizMode;
  guess: string;
}) =>
  apiClient<QuizCheckResult>('/api/v1/quiz/check/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const submitQuizAttempt = (payload: QuizAttemptInput) =>
  apiClient<QuizAttempt>('/api/v1/quiz-attempts/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
