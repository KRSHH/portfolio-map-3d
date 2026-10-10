import { describe, expect, it } from "vitest";
import { ID_PATTERN } from "../../federation/protocol.ts";
import { isHttpsUrl } from "../../federation/validate.ts";
import { EMAIL_PATTERN, REQUEST_QUESTIONS, REQUEST_SUBJECT, WHITE_GLOVE, intakeHref, isPublicGitHubForm } from "./config.ts";

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
    }
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
