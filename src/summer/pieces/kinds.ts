/* The island's set pieces as the plan sees them (mapLayout.ts): which kinds there are, whether each
   stands on the coast or inland, whether it is a one-off landmark, and how much ground it takes.
   What each looks like is in models.ts; this file is pure data, so the plan and the ground stay
   free of three.js.

   The kinds, their sizes and the order they are handed out in (each kind once, then the ones that
   may repeat, by turns) follow the procedural walk world's set pieces. */

export type PieceKind =
  | "lighthouse"
  | "pier"
  | "beach"
  | "huts"
  | "boathouse"
  | "windmill"
  | "farm"
  | "camp"
  | "tower"
  | "orchard"
  | "observatory"
  | "greenhouse";

export interface PieceInfo {
  /** On the shore facing the sea, or inland on the hills facing the plaza. */
  coast: boolean;
  /** A landmark: one at most on the island. */
  once: boolean;
  /** The ground it takes, as a radius around where it stands (its parts and colliders keep inside). */
  footprint: number;
  /** How far round where it stands the ground is leveled for it (0: its small things settle on the slope instead). */
  pad: number;
  /** What it is, in a few words. */
  title: string;
}

export const PIECE_INFO: Record<PieceKind, PieceInfo> = {
  lighthouse: { coast: true, once: true, footprint: 4.6, pad: 5, title: "A lighthouse" },
  pier: { coast: true, once: true, footprint: 3.2, pad: 3, title: "A pier, a rowboat and a sailboat" },
  beach: { coast: true, once: false, footprint: 8, pad: 7, title: "Parasols, towels and a sandcastle" },
  huts: { coast: true, once: false, footprint: 13, pad: 12, title: "Beach huts and a lifeguard tower" },
  boathouse: { coast: true, once: false, footprint: 7, pad: 6.5, title: "A boathouse with a slipway" },
  windmill: { coast: false, once: true, footprint: 5.6, pad: 4, title: "A windmill" },
  farm: { coast: false, once: false, footprint: 11.5, pad: 0, title: "Haystacks, crops and a scarecrow" },
  camp: { coast: false, once: false, footprint: 6.6, pad: 0, title: "A campsite with a fire" },
  tower: { coast: false, once: true, footprint: 3.6, pad: 3.5, title: "A water tower" },
  orchard: { coast: false, once: false, footprint: 9.6, pad: 0, title: "An orchard" },
  observatory: { coast: false, once: true, footprint: 5.6, pad: 4.2, title: "An observatory" },
  greenhouse: { coast: false, once: false, footprint: 6.2, pad: 5.5, title: "A greenhouse" },
};

/** Every kind, in the order the island hands them out. */
export const PIECE_KINDS = Object.keys(PIECE_INFO) as PieceKind[];
