/* A map's counts on split-flap digits. At rest each digit is two halves on either side of the hinge;
   while it turns, a leaf for each half folds over (src/lib/splitFlap.ts runs the motion: the boards
   refresh in a cascade every few seconds, a board flips in when first seen, and new numbers turn
   over from the old ones). Each count is spoken once; the digits are aria-hidden. With reduced
   motion they never move. */
import { useEffect, useLayoutEffect, useRef } from "react";
import type { Manifest } from "../../../federation/protocol.ts";
import { useReducedMotion } from "../hooks/useMedia.ts";
import { plural } from "../lib/copy.ts";
import { alignFrom, boardInView, flipBoard, watchBoard } from "../lib/splitFlap.ts";

/** One digit: its own text only sizes it; the faces draw it from data-c. */
function SplitDigit({ char }: { char: string }) {
  return (
    <span className="split-digit" data-char={char}>
      <span className="split-sizer">{char}</span>
      <span className="flap flap-top" data-c={char} />
      <span className="flap flap-bottom" data-c={char} />
      <span className="flap flap-leaf flap-leaf-top" data-c={char} />
      <span className="flap flap-leaf flap-leaf-bottom" data-c={char} />
    </span>
  );
}

export function CountBoard({ metrics }: { metrics: { label: string; value: number }[] }) {
  const reduce = useReducedMotion();
  const board = useRef<HTMLDListElement>(null);
  const texts = metrics.map((m) => String(m.value));
  const key = texts.join("|");
  const shown = useRef<string[] | null>(null);

  // Join the page's cascade (and flip in when first seen).
  useEffect(() => {
    const el = board.current;
    if (!el || reduce) return;
    return watchBoard(el);
  }, [reduce]);

  // New numbers turn over from the old ones, before the new ones are ever painted.
  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = key.split("|");
    const el = board.current;
    if (!el || reduce || !before || before.join("|") === key || !boardInView(el)) return;
    const after = key.split("|");
    flipBoard(el, after.flatMap((t, m) => alignFrom(before[m] ?? "", t)));
  }, [key, reduce]);

  return (
    <dl className="count-board" ref={board}>
      {metrics.map(({ label, value }, index) => (
        <div className={`count-metric${index === 1 ? " is-inverted" : ""}`} key={label}>
          <dt>{label}</dt>
          <dd>
            <span className="sr-only">{value.toLocaleString("en-US")}</span>
            <span className="split-number" aria-hidden="true">
              {texts[index].split("").map((digit, i) => (
                <SplitDigit char={digit} key={i} />
              ))}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function MapCounts({ manifest: m }: { manifest: Manifest }) {
  return <CountBoard metrics={[
    { value: m.counts.companies, label: plural(m.counts.companies, m.labels.company, m.labels.companies) },
    { value: m.counts.districts, label: plural(m.counts.districts, m.labels.district, m.labels.districts) },
    ...(m.labels.people && m.counts.people ? [{ value: m.counts.people, label: m.labels.people }] : []),
  ]} />;
}
