/* ============================================================
   contract-patterns.mjs — the patterns the content contract checks
   with, used by scripts/validate-site.mjs on every string in site/ (companies and people) and
   by scripts/import-csv.mjs, so both scan alike.
   ============================================================ */

export const isHttp = (u) => typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u);
export const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
/**
 * A US phone number: separated (813-555-0100, (813) 555-0100, 813.555.0100) or run together
 * (8135550100, +18135550100). The run-together form needs a valid area code and exchange (first
 * digit 2-9) and no other digits joined to it (directly, or by a dot, slash or hyphen), so long
 * figures, decimals and IDs do not match.
 */
export const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|(?<!\d|\d[./-])(?:\+?1)?[2-9]\d{2}[2-9]\d{6}(?!\d|[./-]\d)/;
/**
 * A street address with an apartment or unit number ("545 Main St Unit 2210", "12 Oak Ave Apt 3"):
 * the shape a public registry record takes when a company registered at a founder's home. Business
 * addresses a company publishes itself (a suite) are not matched.
 */
export const HOME_ADDRESS = /\b\d{1,6}\s+(?:[A-Z][\w'.-]*\s+){1,4}(?:St|Street|Ave|Avenue|Dr|Drive|Rd|Road|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Ter|Terrace|Cir|Circle|Hwy|Highway)\.?,?\s+(?:Apt|Apartment|Unit)\.?\s*#?\s*[\w-]+/i;
/** A clean public LinkedIn profile URL, as founders, leaders and people carry them. */
export const LINKEDIN_PROFILE = /^https:\/\/www\.linkedin\.com\/in\/[A-Za-z0-9_%-]+\/$/;
export const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
