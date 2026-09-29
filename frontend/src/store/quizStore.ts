import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QuizAnswerInput, QuizMode, QuizQuestion } from '../api/quiz';

export interface QuizSession {
  mode: QuizMode;
  questions: QuizQuestion[];
  currentIndex: number;
  answers: QuizAnswerInput[];
  submitted: boolean;
  // Whether the case-opening reel has already played for the question at
  // currentIndex — persisted so leaving the quiz page (or reloading) and
  // coming back doesn't replay it for a question already shown. Reset
  // whenever currentIndex advances to a fresh, unrevealed question.
  currentRevealed: boolean;
}

interface QuizState {
  session: QuizSession | null;
  startSession: (mode: QuizMode, questions: QuizQuestion[]) => void;
  recordAnswer: (answer: QuizAnswerInput) => void;
  revealCurrent: () => void;
  markSubmitted: () => void;
  abandonSession: () => void;
}

// Persisted (not in-memory only, unlike authStore) so an in-progress quiz
// survives a reload — losing all progress to an accidental refresh is a
// worse experience here than the token-security concern that keeps
// authStore in-memory-only. See docs/decisions.md #030.
export const useQuizStore = create<QuizState>()(
  persist(
    (set) => ({
      session: null,
      startSession: (mode, questions) =>
        set({
          session: {
            mode,
            questions,
            currentIndex: 0,
            answers: [],
            submitted: false,
            currentRevealed: false,
          },
        }),
      recordAnswer: (answer) =>
        set((state) => {
          if (!state.session) return state;
          return {
            session: {
              ...state.session,
              answers: [...state.session.answers, answer],
              currentIndex: state.session.currentIndex + 1,
              currentRevealed: false,
            },
          };
        }),
      revealCurrent: () =>
        set((state) =>
          state.session
            ? { session: { ...state.session, currentRevealed: true } }
            : state,
        ),
      markSubmitted: () =>
        set((state) =>
          state.session
            ? { session: { ...state.session, submitted: true } }
            : state,
        ),
      abandonSession: () => set({ session: null }),
    }),
    { name: 'quiz-session' },
  ),
);
