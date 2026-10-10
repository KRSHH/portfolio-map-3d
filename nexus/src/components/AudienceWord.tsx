/* The hero's audience word: "Explore the ___ universe." It sits on its underline in a window one
   line tall and rolls up to the next word every few seconds, the window easing to each word's width
   so "universe." follows it. Screen readers hear the first word only, and with reduced motion it is
   the only word shown. The rolling words are drawn by CSS (data-word), so the heading's text, as
   search engines and copy and paste read it, stays "Explore the company universe." */
import { useEffect, useLayoutEffect, useRef, useState, type TransitionEvent } from "react";
import { useReducedMotion } from "../hooks/useMedia.ts";

/** How long each word stays. */
const HOLD_MS = 2600;

export function AudienceWord({ words }: { words: readonly string[] }) {
  const reduce = useReducedMotion();
  const rolls = !reduce && words.length > 1;
  // The words, then the first again: rolling onto that copy and jumping back makes the loop seamless.
  const strip = rolls ? [...words, words[0]] : words.slice(0, 1);
  const [at, setAt] = useState(0);
  const [jump, setJump] = useState(false);
  const [widths, setWidths] = useState<number[]>([]);
  const track = useRef<HTMLSpanElement>(null);
  const atRef = useRef(0);
  atRef.current = at;

  // Each word's width, again whenever the heading's size or its font changes.
  useLayoutEffect(() => {
    const t = track.current;
    if (!t) return;
    const measure = () => {
      const next = [...t.children].map((c) => Math.ceil(c.getBoundingClientRect().width));
      setWidths((was) => (was.length === next.length && was.every((w, i) => w === next[i]) ? was : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(t);
    void document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [strip.length]);

  useEffect(() => {
    if (!rolls) {
      setAt(0);
      return;
    }
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      // On the copy of the first word (its roll's end was missed): jump back, then roll on next time.
      const n = atRef.current;
      setJump(n >= words.length);
      setAt(n >= words.length ? 0 : n + 1);
    }, HOLD_MS);
    return () => window.clearInterval(timer);
  }, [rolls, words.length]);

  const onRolled = (e: TransitionEvent<HTMLSpanElement>) => {
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
    if (atRef.current === words.length) {
      setJump(true);
      setAt(0);
    }
  };

  const width = widths[at];
  return (
    <>
      <span className="sr-only">{words[0]}</span>
      <span className="audience" aria-hidden="true" data-jump={jump || undefined} style={width ? { width: `${width}px` } : undefined}>
        <span className="audience-window">
          <span className="audience-track" ref={track} style={{ transform: `translateY(${-at * 1.2}em)` }} onTransitionEnd={onRolled}>
            {strip.map((w, i) => (
              <span key={i} data-word={w} />
            ))}
          </span>
        </span>
      </span>
    </>
  );
}
