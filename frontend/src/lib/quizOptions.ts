import type { QuizDifficulty, QuizMode } from '../api/quiz';

// Shared between QuizPage (the picker) and QuizHistorySection (labeling a
// past attempt's mode/difficulty) — kept in its own module rather than
// exported from QuizPage.tsx, which QuizHistorySection is itself imported
// by, to avoid a circular import between the two.
export const MODES: { value: QuizMode; label: string }[] = [
  { value: 'guess_card', label: 'Guess the Card' },
  { value: 'guess_set', label: 'Guess the Set' },
  { value: 'guess_hp', label: 'Guess the HP' },
];

// Deliberately the reverse of what "rare" suggests: most players recognize
// a distinctive chase card's set on sight more easily than a common, which
// they've likely seen dozens of across different sets — confirmed directly
// with the user rather than assumed. See docs/decisions.md #047.
export const DIFFICULTIES: {
  value: QuizDifficulty;
  label: string;
  description: string;
}[] = [
  {
    value: 'easy',
    label: 'Easy',
    description:
      'Chase cards — Ultra Rare, Secret Rare, Special Illustration Rare, and similar',
  },
  {
    value: 'medium',
    label: 'Medium',
    description:
      'Everything in between — Rare Holo, EX, GX, V, VMAX, VSTAR, and similar',
  },
  {
    value: 'hard',
    label: 'Hard',
    description: 'Common, Uncommon, and Rare cards',
  },
];
