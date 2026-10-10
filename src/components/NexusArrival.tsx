/* A visitor who came through the Nexus (?from=nexus) sees where they arrived and the way back,
   once, until they close it. */
import { Orbit, X } from "lucide-react";
import { useState } from "react";
import { ARRIVED_FROM_NEXUS, NETWORK_NAME, NEXUS_HREF } from "../network";
import { SITE } from "../site";

export default function NexusArrival() {
  const [open, setOpen] = useState(ARRIVED_FROM_NEXUS);
  if (!open) return null;
  return (
    <div className="nexus-arrival" role="status">
      <Orbit size={16} aria-hidden="true" />
      <span>
        Welcome to {SITE.org.name}'s map, one of the worlds of the {NETWORK_NAME}.{" "}
        <a href={NEXUS_HREF}>Back to the Nexus</a>
      </span>
      <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
