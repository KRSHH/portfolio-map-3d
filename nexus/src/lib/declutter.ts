/* Which labels show: no two labels overlap on screen, and none sits under the HUD (or, on the
   landing page, under the headline). Labels are placed in priority order (the world in view
   first, then the nearest); a label that would overlap one already placed, or leave the visible
   part of the screen, is hidden until the camera moves. Pure, unit-tested. */

export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface LabelBox {
  rect: Rect;
  /** Lower first. */
  priority: number;
  /** Always shown (the world in view): it still claims its space. */
  pinned?: boolean;
}

export function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return a.l < b.r + pad && b.l < a.r + pad && a.t < b.b + pad && b.t < a.b + pad;
}

export function inside(a: Rect, area: Rect): boolean {
  return a.l >= area.l && a.r <= area.r && a.t >= area.t && a.b <= area.b;
}

/** For each box (in input order): may it show? */
export function declutter(boxes: readonly LabelBox[], area: Rect, pad = 6): boolean[] {
  const order = boxes.map((_, i) => i).sort((a, b) => Number(!!boxes[b].pinned) - Number(!!boxes[a].pinned) || boxes[a].priority - boxes[b].priority);
  const placed: Rect[] = [];
  const show = boxes.map(() => false);
  for (const i of order) {
    const { rect, pinned } = boxes[i];
    if (!pinned && (!inside(rect, area) || placed.some((p) => overlaps(rect, p, pad)))) continue;
    placed.push(rect);
    show[i] = true;
  }
  return show;
}
