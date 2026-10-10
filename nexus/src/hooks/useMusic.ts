/* The music behind the floating button (components/MusicButton.tsx, MUSIC in config.ts): one audio
   element for the whole visit, so the music carries on from the landing page into the Nexus and
   back. The element is made on the first press, so nothing is fetched before, and the music never
   starts on its own. One sound at a time: starting it pauses the promo video, and the video (or any
   other video or audio on the page) starting pauses it. */
import { useSyncExternalStore } from "react";
import { MUSIC } from "../config.ts";

let audio: HTMLAudioElement | null = null;
let watching = false;
const listeners = new Set<() => void>();

function changed(): void {
  for (const listener of listeners) listener();
}

function player(): HTMLAudioElement | null {
  if (!MUSIC) return null;
  if (audio) return audio;
  const a = new Audio(`${import.meta.env.BASE_URL}${MUSIC.src}`);
  a.loop = true;
  a.volume = MUSIC.volume;
  a.addEventListener("play", changed);
  a.addEventListener("pause", changed);
  // A file that fails to load: the next press starts over with a new element.
  a.addEventListener("error", () => {
    if (audio === a) audio = null;
    changed();
  });
  if (!watching) {
    watching = true;
    // Media events do not bubble; the capture phase sees every video and audio element on the page.
    document.addEventListener(
      "play",
      (e) => {
        if (e.target !== audio) audio?.pause();
      },
      true,
    );
  }
  audio = a;
  return a;
}

/** Whether the music is playing (or about to). */
export function musicPlaying(): boolean {
  return audio !== null && !audio.paused;
}

/** Calls `listener` whenever the music starts or stops; returns the unsubscribe. */
export function subscribeMusic(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Plays the music, or pauses it. */
export function toggleMusic(): void {
  const a = player();
  if (!a) return;
  if (!a.paused) {
    a.pause();
    return;
  }
  for (const media of document.querySelectorAll<HTMLMediaElement>("video, audio")) if (!media.paused) media.pause();
  // A start the browser refuses leaves the button off.
  a.play().catch(changed);
}

export function useMusicPlaying(): boolean {
  return useSyncExternalStore(subscribeMusic, musicPlaying);
}
