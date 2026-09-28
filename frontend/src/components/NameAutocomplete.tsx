import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

const MIN_CHARS = 2;
const DEBOUNCE_MS = 150;

interface NameAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  fetchSuggestions: (search: string) => Promise<string[]>;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}

// A typeahead dropdown layered on top of a plain controlled text input —
// the caller keeps owning `value`/`onChange` (and whatever else it does
// with them, e.g. CardListPage's own debounced URL commit), this only adds
// suggestions and lets picking one call the same `onChange`. See
// docs/decisions.md #036.
function NameAutocomplete({
  value,
  onChange,
  fetchSuggestions,
  ariaLabel,
  placeholder,
  className,
}: NameAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Always mirrors the latest fetchSuggestions, so the debounce effect
  // below only needs to depend on `value` — depending on the function
  // itself would restart the debounce on every render in which the caller
  // passes a fresh inline function, not just when the typed value changes.
  const fetchSuggestionsRef = useRef(fetchSuggestions);
  useEffect(() => {
    fetchSuggestionsRef.current = fetchSuggestions;
  }, [fetchSuggestions]);

  // Set right before `onChange` in `selectSuggestion` below, so the effect
  // below can tell "value changed because a suggestion was just picked"
  // apart from "value changed because the user kept typing" — otherwise
  // picking a suggestion re-triggers this same effect (it depends on
  // `value`, which just changed to the full name) and re-fetches, and that
  // fetch often still matches (the chosen name usually still starts with
  // itself), popping the dropdown back open right after it was chosen.
  const justSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (value === justSelectedRef.current) {
      justSelectedRef.current = null;
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length < MIN_CHARS) {
      // No setState here — `showSuggestions` below already hides the
      // dropdown once the value is too short, regardless of whatever
      // `suggestions` still holds from before. Clearing it synchronously
      // in an effect body is exactly what react-hooks/set-state-in-effect
      // warns against; skipping the fetch is all that's needed.
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      fetchSuggestionsRef.current(trimmed).then((results) => {
        if (cancelled) return;
        setSuggestions(results);
        setIsOpen(results.length > 0);
        setHighlightedIndex(-1);
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [value]);

  // Gates on the current value too, not just `isOpen` — once the value
  // drops below MIN_CHARS, `suggestions` may still hold stale results from
  // before (see the effect above), but they must never be shown or
  // keyboard-navigable.
  const showSuggestions =
    isOpen && value.trim().length >= MIN_CHARS && suggestions.length > 0;

  function selectSuggestion(name: string) {
    justSelectedRef.current = name;
    onChange(name);
    setIsOpen(false);
    setSuggestions([]);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showSuggestions) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === 'Enter' && highlightedIndex >= 0) {
      // Only when a suggestion is actually highlighted — otherwise Enter
      // falls through to the input's normal behavior (e.g. submitting the
      // Quiz guess form).
      event.preventDefault();
      selectSuggestion(suggestions[highlightedIndex]);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }

  const activeOptionId =
    highlightedIndex >= 0
      ? `${listboxId}-option-${highlightedIndex}`
      : undefined;

  return (
    <div className="name-autocomplete">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        placeholder={placeholder}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setIsOpen(true);
        }}
        onBlur={() => setIsOpen(false)}
      />
      {showSuggestions && (
        <ul
          className="name-autocomplete-suggestions"
          role="listbox"
          id={listboxId}
        >
          {suggestions.map((name, index) => (
            <li
              key={name}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === highlightedIndex}
              className={
                index === highlightedIndex
                  ? 'name-autocomplete-option active'
                  : 'name-autocomplete-option'
              }
              // Prevents the input from blurring before the click fires —
              // a blurred input would close (and possibly unmount) this
              // list before the click ever registers.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(name)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NameAutocomplete;
