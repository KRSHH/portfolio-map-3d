/* Inline icons (no icon font or network request). Decorative: the text beside each one names
   the action, or the button carries an aria-label. */
import { useId, type ReactNode, type SVGProps } from "react";
import { MARK, closedPath, ringFront } from "../lib/mark.ts";

function Icon({ children, size = 20, ...rest }: SVGProps<SVGSVGElement> & { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

type P = { size?: number; className?: string };

export const ArrowRight = (p: P) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const ArrowLeft = (p: P) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);
export const External = (p: P) => (
  <Icon {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);
export const SearchIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);
export const Close = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
export const CopyIcon = (p: P) => (
  <Icon {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </Icon>
);
export const Check = (p: P) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const ListIcon = (p: P) => (
  <Icon {...p}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" />
    <circle cx="4.5" cy="12" r="1" />
    <circle cx="4.5" cy="18" r="1" />
  </Icon>
);
export const Orbit = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2.6" />
    <ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-25 12 12)" />
  </Icon>
);
export const Globe = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.6 2.6 3.8 5.4 3.8 8.5s-1.2 5.9-3.8 8.5c-2.6-2.6-3.8-5.4-3.8-8.5s1.2-5.9 3.8-8.5Z" />
  </Icon>
);
export const Walk = (p: P) => (
  <Icon {...p}>
    <path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21Z" />
    <circle cx="12" cy="10.5" r="2.2" />
  </Icon>
);
export const Directory = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
    <path d="M8 9h8M8 12.5h8M8 16h5" />
  </Icon>
);
export const MusicNote = (p: P) => (
  <Icon {...p}>
    <path d="M9 17.5V6l10-2v11.5" />
    <circle cx="6.5" cy="17.5" r="2.5" />
    <circle cx="16.5" cy="15.5" r="2.5" />
  </Icon>
);
/** Bars that move while the music plays (base.css; still when the visitor prefers reduced motion). */
export const SoundBars = ({ className, ...p }: P) => (
  <Icon {...p} className={className ? `sound-bars ${className}` : "sound-bars"}>
    <line x1="5" y1="9.5" x2="5" y2="14.5" />
    <line x1="9.67" y1="5.5" x2="9.67" y2="18.5" />
    <line x1="14.33" y1="8" x2="14.33" y2="16" />
    <line x1="19" y1="10" x2="19" y2="14" />
  </Icon>
);

/** GitHub's mark (GitHub's Octicons, MIT License), for the link to the repository. */
export const GitHubMark = ({ size = 20, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
    <path d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943" />
  </svg>
);

/** The Nexus mark: the core of the 3D world as an icon (lib/mark.ts has the geometry): a crystal
    in a geodesic cage, a ring that passes behind it and in front of it, and a glow. */
export function Mark({ size = 28, className }: P) {
  // Each mark on the page needs its own gradient ids.
  const id = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const { rx, ry, tilt } = MARK.ring;
  const ring = `rotate(${tilt} 32 32)`;
  const accent = { stroke: "var(--accent)" };
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <radialGradient id={`${id}-glow`} cx="32" cy="32" r="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--orb-glow)", stopOpacity: 0.6 }} />
          <stop offset="0.45" style={{ stopColor: "var(--accent)", stopOpacity: 0.16 }} />
          <stop offset="0.8" style={{ stopColor: "var(--violet)", stopOpacity: 0.07 }} />
          <stop offset="1" style={{ stopColor: "var(--violet)", stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id={`${id}-crystal`} x1="32" y1="18" x2="32" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--orb-bright)", stopOpacity: 0.9 }} />
          <stop offset="1" style={{ stopColor: "var(--orb-deep)", stopOpacity: 0.95 }} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${id}-glow)`} />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="32" cy="32" rx={rx} ry={ry} transform={ring} style={accent} strokeWidth={3} />
        <path d={closedPath(MARK.cage) + closedPath(MARK.struts)} style={{ stroke: "var(--violet)" }} strokeWidth={1.8} strokeOpacity={0.85} />
        <path d={closedPath(MARK.crystal)} fill={`url(#${id}-crystal)`} style={accent} strokeWidth={3} />
        <path d={closedPath(MARK.facet)} style={{ stroke: "var(--orb-facet)" }} strokeWidth={2.2} />
        <path d={ringFront()} transform={ring} style={accent} strokeWidth={3} />
      </g>
    </svg>
  );
}
