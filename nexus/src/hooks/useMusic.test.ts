import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MUSIC } from "../config.ts";
import { musicPlaying, subscribeMusic, toggleMusic } from "./useMusic.ts";

/** Just enough of a media element: paused, play() and pause(), and their events. */
class FakeMedia extends EventTarget {
  paused = true;
  loop = false;
  volume = 1;
  refuse = false;
  play(): Promise<void> {
    if (this.refuse) return Promise.reject(new Error("NotAllowedError"));
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  }
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
}

const made: FakeAudio[] = [];
class FakeAudio extends FakeMedia {
  src: string;
  constructor(src: string) {
    super();
    this.src = src;
    made.push(this);
  }
}

/** The page: its promo video, whose "play" reaches the document as a real one's does (capture). */
const page = Object.assign(new EventTarget(), { querySelectorAll: () => [video] });
class PageVideo extends FakeMedia {
  play(): Promise<void> {
    const started = super.play();
    page.dispatchEvent(new Event("play"));
    return started;
  }
}
const video = new PageVideo();
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the music", () => {
  beforeAll(() => {
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("document", page);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("fetches nothing and plays nothing before the first press", () => {
    expect(MUSIC).not.toBeNull();
    expect(musicPlaying()).toBe(false);
    expect(made).toHaveLength(0);
  });

  it("plays the configured file on a loop at its volume, and pauses on the next press", () => {
    let changes = 0;
    const off = subscribeMusic(() => changes++);
    toggleMusic();
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ src: `${import.meta.env.BASE_URL}${MUSIC?.src}`, loop: true, volume: MUSIC?.volume });
    expect(musicPlaying()).toBe(true);
    toggleMusic();
    expect(musicPlaying()).toBe(false);
    expect(changes).toBe(2);
    off();
    toggleMusic();
    expect(changes).toBe(2);
    // One element for the whole visit.
    expect(made).toHaveLength(1);
  });

  it("plays one sound at a time: the video stops the music, and the music stops the video", () => {
    expect(musicPlaying()).toBe(true);
    void video.play();
    expect(musicPlaying()).toBe(false);
    toggleMusic();
    expect(video.paused).toBe(true);
    expect(musicPlaying()).toBe(true);
    toggleMusic();
  });

  it("stays off when the browser refuses to start it", async () => {
    let changes = 0;
    const off = subscribeMusic(() => changes++);
    made[0].refuse = true;
    toggleMusic();
    await settle();
    expect(musicPlaying()).toBe(false);
    expect(changes).toBe(1);
    off();
  });

  it("starts over with a new element after the file fails to load", () => {
    made[0].dispatchEvent(new Event("error"));
    expect(musicPlaying()).toBe(false);
    toggleMusic();
    expect(made).toHaveLength(2);
    expect(musicPlaying()).toBe(true);
  });
});
