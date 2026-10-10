import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ID_PATTERN } from "../../federation/protocol.ts";
import { isHttpsUrl } from "../../federation/validate.ts";
import { AUDIENCES, EMAIL_PATTERN, HERO_WORDS, MUSIC, PROMO_VIDEO, REQUEST_QUESTIONS, REQUEST_SUBJECT, WHITE_GLOVE, intakeHref, isPublicGitHubForm } from "./config.ts";

describe("HERO_WORDS", () => {
  it("are single lowercase words, short enough to keep the hero's line whole, none twice", () => {
    expect(HERO_WORDS.length).toBeGreaterThan(0);
    expect(new Set(HERO_WORDS).size).toBe(HERO_WORDS.length);
    for (const w of HERO_WORDS) expect(/^[a-z]{2,12}$/.test(w), w).toBe(true);
  });
});

describe("AUDIENCES", () => {
  it("have unique ids, a name and a summary", () => {
    const ids = AUDIENCES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of AUDIENCES) {
      expect(ID_PATTERN.test(a.id), a.id).toBe(true);
      expect(a.name.trim()).not.toBe("");
      expect(a.summary.trim()).not.toBe("");
    }
  });

  it("name maps by their network ids, and only services that are offered", () => {
    const packages = new Set(WHITE_GLOVE.packages.map((p) => p.id));
    for (const a of AUDIENCES) {
      for (const id of a.examples) expect(ID_PATTERN.test(id), id).toBe(true);
      if (a.service !== null) expect(packages.has(a.service), a.service).toBe(true);
    }
  });
});

describe("WHITE_GLOVE", () => {
  it("sends requests to an email address or an https form, with an optional provider and note", () => {
    const intake = WHITE_GLOVE.intake;
    if ("email" in intake) expect(EMAIL_PATTERN.test(intake.email), intake.email).toBe(true);
    else expect(isHttpsUrl(intake.url)).toBe(true);
    for (const v of [WHITE_GLOVE.provider, WHITE_GLOVE.note]) expect(v === null || (typeof v === "string" && v.trim().length > 0)).toBe(true);
  });

  it("has well-formed packages with unique ids", () => {
    const ids = WHITE_GLOVE.packages.map((p) => p.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of WHITE_GLOVE.packages) {
      expect(ID_PATTERN.test(p.id), p.id).toBe(true);
      expect(p.name.trim()).not.toBe("");
      expect(p.summary.trim()).not.toBe("");
      expect(p.includes.length).toBeGreaterThan(0);
      for (const line of p.includes) expect(line.trim()).not.toBe("");
      expect(p.price === null || p.price.trim().length > 0).toBe(true);
      expect(p.checkoutUrl === null || isHttpsUrl(p.checkoutUrl)).toBe(true);
      expect(typeof p.addon).toBe("boolean");
      expect(p.exampleHref === null || isHttpsUrl(p.exampleHref) || /^#[a-z][a-z0-9-]*$/.test(p.exampleHref), String(p.exampleHref)).toBe(true);
    }
    // At least one package stands on its own; add-ons go with it.
    expect(WHITE_GLOVE.packages.some((p) => !p.addon)).toBe(true);
  });

  it("links an example on this page only when the page has it", () => {
    for (const p of WHITE_GLOVE.packages) if (p.exampleHref === "#video") expect(PROMO_VIDEO, p.id).not.toBeNull();
  });

  it("knows a GitHub form is public", () => {
    expect(isPublicGitHubForm("https://github.com/acme/repo/issues/new")).toBe(true);
    expect(isPublicGitHubForm("https://forms.example.com/setup")).toBe(false);
    expect(isPublicGitHubForm("not a url")).toBe(false);
  });

  it("opens an email with the request's subject and questions filled in", () => {
    const href = intakeHref({ email: "someone@example.org" });
    const url = new URL(href);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("someone@example.org");
    expect(url.searchParams.get("subject")).toBe(REQUEST_SUBJECT);
    const body = url.searchParams.get("body") ?? "";
    for (const q of REQUEST_QUESTIONS) expect(body).toContain(q);
    // Encoded for a mailto link: no raw spaces or line breaks.
    expect(href).not.toMatch(/\s/);
  });

  it("points straight at a form when the intake is one", () => {
    expect(intakeHref({ url: "https://forms.example.com/setup" })).toBe("https://forms.example.com/setup");
  });

  it("takes one plain email address, nothing more", () => {
    for (const ok of ["someone@example.org", "a.b+c@sub.example.org"]) expect(EMAIL_PATTERN.test(ok), ok).toBe(true);
    for (const bad of ["no-at.example.org", "a@b", "a b@example.org", "a@example.org?cc=x@example.org", "<a@example.org>"]) expect(EMAIL_PATTERN.test(bad), bad).toBe(false);
  });
});

describe("PROMO_VIDEO", () => {
  it("is off, or names https files, a length and a caption", () => {
    if (!PROMO_VIDEO) return;
    for (const url of [PROMO_VIDEO.src, PROMO_VIDEO.poster, ...(PROMO_VIDEO.portrait ? [PROMO_VIDEO.portrait] : [])]) expect(isHttpsUrl(url), url).toBe(true);
    expect(PROMO_VIDEO.src).toMatch(/\.mp4$/);
    expect(Number.isInteger(PROMO_VIDEO.seconds) && PROMO_VIDEO.seconds > 0).toBe(true);
    expect(PROMO_VIDEO.caption.trim()).not.toBe("");
  });
});

describe("MUSIC", () => {
  it("is off, or an MP3 the site serves from public/, at a volume from 0 to 1", () => {
    if (!MUSIC) return;
    expect(MUSIC.src).toMatch(/^[a-z0-9][a-z0-9._/-]*\.mp3$/);
    expect(MUSIC.src).not.toContain("..");
    const bytes = readFileSync(new URL(`../public/${MUSIC.src}`, import.meta.url));
    // An ID3 tag, or an MPEG audio frame, first.
    expect(bytes.subarray(0, 3).toString("latin1") === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)).toBe(true);
    // Fetched whole by every visitor who presses play.
    expect(bytes.length).toBeLessThan(8_000_000);
    expect(MUSIC.volume > 0 && MUSIC.volume <= 1).toBe(true);
  });
});
