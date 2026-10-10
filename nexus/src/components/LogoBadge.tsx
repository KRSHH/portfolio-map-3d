/* A world's badge in lists and panels: its logo (from the Nexus's own origin) on a light plate,
   or its initials in ink that reads on its accent. Decorative: the name always stands beside it. */
import { useState } from "react";
import { inkOn } from "../lib/color.ts";
import { initials } from "../lib/copy.ts";

export function LogoBadge({ name, accent, logo, size = 40 }: { name: string; accent: string; logo: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (logo && !failed) {
    return (
      <span className="badge badge-logo" style={style} aria-hidden="true">
        <img src={`${import.meta.env.BASE_URL}${logo}`} alt="" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className="badge" style={{ ...style, background: accent, color: inkOn(accent) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
