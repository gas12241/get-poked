import type { QuizDifficulty, QuizMode } from '../api/quiz';

// Shared between QuizPage (the picker) and QuizHistorySection (labeling a
// past attempt's mode/difficulty) — kept in its own module rather than
// exported from QuizPage.tsx, which QuizHistorySection is itself imported
// by, to avoid a circular import between the two.
export const MODES: { value: QuizMode; label: string }[] = [
  // "...'s Name" — guess_card isn't Pokémon-only (eligible Trainer cards at
  // the chase-rarity tier too, see eligibility.py), so "the Card" alone
  // doesn't say what's actually being guessed.
  { value: 'guess_card', label: "Guess the Card's Name" },
  // Relabeled alongside guess_set_icon's own addition below — both renamed
  // together so the two read as clearly different questions (this one is
  // about a real card shown with its set symbol blurred out; the other is
  // about a set's icon alone, no card involved) rather than looking like
  // duplicates. The underlying mode value is unchanged.
  { value: 'guess_set', label: "Guess the Pokémon's Set" },
  // "the Pokémon's" — guess_hp is already Pokémon-only (Trainer/Energy
  // cards have no HP), so the label now says so explicitly.
  { value: 'guess_hp', label: "Guess the Pokémon's HP" },
  { value: 'guess_set_icon', label: 'Guess the Set by Symbol' },
];

// guess_set_icon's own difficulty meaning — answer format, not a rarity
// pool (sets have no rarity at all). Shown instead of DIFFICULTIES' own
// descriptions when that mode is selected. See docs/decisions.md #096.
export const SET_ICON_DIFFICULTY_DESCRIPTIONS: Record<QuizDifficulty, string> =
  {
    easy: 'Multiple choice — 1 of 4',
    medium: 'Multiple choice — 1 of 8',
    hard: "Type the set's name",
  };

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
