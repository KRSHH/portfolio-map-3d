/* What the Nexus's operators configure: the "Have it built for you" section on the landing page
   (a paid setup service) and the network's promo video. Edit the values here; the page renders
   whatever they say.

   - provider: who offers it; null renders "Offered by the maintainers of portfolio-map-3d".
   - intake: where "Request a setup" goes: an email address (the button opens an email with the
     request's questions filled in) or an https form (a GitHub issue form is public, and the page
     says so).
   - note: one optional line under the packages.
   - packages: price null renders "Quoted per organization"; a checkoutUrl adds a "Book" button;
     an add-on (addon: true) comes after the packages, across the row; exampleHref adds a "See an
     example" link (an https page, or "#video" for the promo video on this page). */
export interface WhiteGlovePackage {
  /** Lowercase letters, digits and hyphens. */
  id: string;
  name: string;
  summary: string;
  includes: string[];
  /** As it should read ("From $2,000"), or null: "Quoted per organization". */
  price: string | null;
  /** An https checkout or booking page for this package, or null. */
  checkoutUrl: string | null;
  /** Offered on top of any package rather than on its own. */
  addon: boolean;
  /** An example of the work: an https page, or a link within this page ("#video"); or null. */
  exampleHref: string | null;
}

/** Where requests go: an email address, or an https form. */
export type Intake = { email: string } | { url: string };

export interface WhiteGlove {
  provider: string | null;
  intake: Intake;
  note: string | null;
  packages: WhiteGlovePackage[];
}

export const WHITE_GLOVE: WhiteGlove = {
  provider: null,
  intake: { email: "jeremy@embarccollective.com" },
  note: null,
  packages: [
    {
      id: "setup",
      name: "Setup",
      summary: "Your map, built and launched.",
      includes: [
        "Districts, labels and theme set up for your organization",
        "Your companies imported, each with its description, website and logo from public sources, every source recorded",
        "Deployed to your domain or a subdomain of it",
        "Joined to the network: the handshake done and your registry entry filed",
      ],
      price: null,
      checkoutUrl: null,
      addon: false,
      exampleHref: null,
    },
    {
      id: "custom-world",
      name: "Setup and custom world",
      summary: "Everything in Setup, with a walk world that looks like you.",
      includes: [
        "Everything in Setup",
        "Your own building modeled at the center of the walk world",
        "Live explorers turned on, on your own Realtime project",
        "A link-preview image and favicon from your brand",
      ],
      price: null,
      checkoutUrl: null,
      addon: false,
      exampleHref: null,
    },
    {
      id: "care",
      name: "Care",
      summary: "Your map kept current.",
      includes: ["New companies added with sources, on your schedule", "Logos and descriptions refreshed", "Framework updates applied and the network check kept green"],
      price: null,
      checkoutUrl: null,
      addon: false,
      exampleHref: null,
    },
    {
      id: "promo-video",
      name: "Promo video",
      summary: "An add-on to any package: a short video of your map, for your site and your social channels.",
      includes: [
        "Filmed from your live map: its walk world, a company in it and its portal to the Nexus",
        "A 16:9 cut, and a 9:16 cut for Reels, TikTok and Shorts, each with a cover image",
        "Captions in your map's own words, with its own counts",
      ],
      price: null,
      checkoutUrl: null,
      addon: true,
      exampleHref: "#video",
    },
  ],
};

/**
 * The network's promo video, shown on the landing page under the hero, or null for none. The files
 * are served from elsewhere (they are not part of this repository); every URL is https.
 */
export interface PromoVideo {
  /** The 16:9 cut (MP4, H.264): the one the page plays. */
  src: string;
  /** The 9:16 cut, linked under the player for phones and social apps; or null. */
  portrait: string | null;
  /** The still shown until it plays (the cut's cover image). */
  poster: string;
  /** Its length, in whole seconds, as the section's title says it. */
  seconds: number;
  /** One line under the title: what it shows. */
  caption: string;
}

export const PROMO_VIDEO: PromoVideo | null = {
  src: "https://community.embarccollective.com/promo/nexus-16x9.mp4",
  portrait: "https://community.embarccollective.com/promo/nexus-9x16.mp4",
  poster: "https://community.embarccollective.com/promo/nexus-cover-16x9.jpg",
  seconds: 50,
  caption: "Filmed from the live sites: Ambition Accelerated's walkable Florida and its portal, the Nexus, and the Florida Ecosystem Map. No sound.",
};

/** Requests through GitHub are public: the page says so when the intake form is on github.com. */
export function isPublicGitHubForm(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "github.com" || host.endsWith(".github.com");
  } catch {
    return false;
  }
}

/** An email address as the intake accepts it: one address, no spaces, a dot in its domain. */
export const EMAIL_PATTERN = /^[^\s@<>()"',;:]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** The request's subject and questions, as the email opens with them. */
export const REQUEST_SUBJECT = "Setup request: <your organization>";
export const REQUEST_QUESTIONS = [
  "Organization and website:",
  "What you're interested in (Setup, Setup and custom world, Care, a promo video, or not sure yet):",
  "Roughly how many companies:",
  "Your timeline, where your list of companies lives today, and the domain you'd like the map on:",
];

/** Where "Request a setup" points: a mailto link with the request filled in, or the form's address. */
export function intakeHref(intake: Intake): string {
  if ("url" in intake) return intake.url;
  const body = REQUEST_QUESTIONS.map((q) => `${q}\n\n`).join("");
  return `mailto:${intake.email}?subject=${encodeURIComponent(REQUEST_SUBJECT)}&body=${encodeURIComponent(body)}`;
}
