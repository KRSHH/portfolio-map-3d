/* The search highlight, shown where it acts: a search keeps dimming every
   company it does not match, in both 3D views, until it is cleared. On phones
   the search field folds into an icon after a pick, so without this chip the
   only sign of an active search was a dot on that icon, and the dimmed logos
   looked like a fault. The chip says what is highlighted and clears it. */
import { Search, X } from "lucide-react";
import { useMemo } from "react";
import { COMPANIES } from "../data/catalog";
import { matchesText } from "../data/graph";
import { LABELS } from "../data/labels";
import { L } from "../site";
import { finderActive, useStore } from "../state/store";

export default function SearchChip({ className = "" }: { className?: string }) {
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  // The open provider finder outranks the search in the highlight (useHighlight), and shows itself.
  const finderOn = useStore((s) => s.panel === "finder" && finderActive(s.finder));
  const q = query.trim();
  const count = useMemo(() => (q ? COMPANIES.filter((m) => matchesText(m, q, LABELS)).length : 0), [q]);
  if (!q || finderOn) return null;
  return (
    <div className={`search-chip ${className}`}>
      <Search size={14} aria-hidden="true" className="search-chip-icon" />
      <span className="search-chip-text">
        {count === 0 ? `No ${L.companies} match` : `Showing ${count} ${count === 1 ? "match" : "matches"} for`} <strong>“{q}”</strong>
      </span>
      <button type="button" className="search-chip-x" onClick={() => setQuery("")} aria-label={`Clear the search for “${q}” and show every ${L.company}`} title={`Show every ${L.company}`}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
