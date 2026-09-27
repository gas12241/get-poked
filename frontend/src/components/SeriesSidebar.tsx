import { useState } from 'react';
import type { Set as CardSet } from '../api/cards';

interface SeriesGroup {
  series: string;
  sets: CardSet[];
}

function compareReleaseDateDesc(a: string | null, b: string | null) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
}

function groupBySeries(sets: CardSet[]): SeriesGroup[] {
  const bySeries = new Map<string, CardSet[]>();
  for (const set of sets) {
    const group = bySeries.get(set.series);
    if (group) {
      group.push(set);
    } else {
      bySeries.set(set.series, [set]);
    }
  }

  const groups = Array.from(bySeries.entries()).map(([series, seriesSets]) => ({
    series,
    sets: [...seriesSets].sort((a, b) =>
      compareReleaseDateDesc(a.release_date, b.release_date),
    ),
  }));

  groups.sort((a, b) =>
    compareReleaseDateDesc(
      a.sets[0]?.release_date ?? null,
      b.sets[0]?.release_date ?? null,
    ),
  );

  return groups;
}

interface SeriesSidebarProps {
  sets: CardSet[];
  selectedSetId: string;
  selectedSeries: string;
  onSelect: (setId: string) => void;
  onSelectSeries: (series: string) => void;
}

function SeriesSidebar({
  sets,
  selectedSetId,
  selectedSeries,
  onSelect,
  onSelectSeries,
}: SeriesSidebarProps) {
  const groups = groupBySeries(sets);
  const seriesOfSelectedSet = sets.find(
    (set) => String(set.id) === selectedSetId,
  )?.series;
  // Only matters for the initial expand-on-load (e.g. a direct link to a
  // filtered view) — selecting a set or "All {series}" always happens from
  // an already-expanded group, so no further auto-expand is needed after
  // mount.
  const initiallyExpanded =
    seriesOfSelectedSet ?? (selectedSeries || undefined);

  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(
    () => new Set(initiallyExpanded ? [initiallyExpanded] : []),
  );

  function toggleSeries(series: string) {
    setExpandedSeries((prev) => {
      const next = new Set(prev);
      if (next.has(series)) {
        next.delete(series);
      } else {
        next.add(series);
      }
      return next;
    });
  }

  return (
    <nav className="series-sidebar" aria-label="Browse sets by series">
      <button
        className={
          selectedSetId === '' && !selectedSeries
            ? 'series-all-sets active'
            : 'series-all-sets'
        }
        onClick={() => onSelect('')}
      >
        All Sets
      </button>

      {groups.map(({ series, sets: seriesSets }) => {
        const isExpanded = expandedSeries.has(series);
        return (
          <div key={series} className="series-group">
            <button
              className="series-header"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${series}`}
              onClick={() => toggleSeries(series)}
            >
              <span>{series}</span>
              <svg
                className="series-chevron"
                width="10"
                height="10"
                viewBox="0 0 10 10"
                aria-hidden="true"
              >
                <path
                  d="M2 3.5L5 6.5L8 3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div
              className={
                isExpanded ? 'series-collapse expanded' : 'series-collapse'
              }
              aria-hidden={!isExpanded}
            >
              <ul className="series-sets">
                <li>
                  <button
                    tabIndex={isExpanded ? undefined : -1}
                    className={
                      selectedSeries === series
                        ? 'series-all-in-series active'
                        : 'series-all-in-series'
                    }
                    onClick={() => onSelectSeries(series)}
                  >
                    All {series}
                  </button>
                </li>
                {seriesSets.map((set) => (
                  <li key={set.id}>
                    <button
                      tabIndex={isExpanded ? undefined : -1}
                      className={
                        String(set.id) === selectedSetId
                          ? 'series-set active'
                          : 'series-set'
                      }
                      onClick={() => onSelect(String(set.id))}
                    >
                      {set.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export default SeriesSidebar;
