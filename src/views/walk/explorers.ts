/* Other live explorers in the walk world.

   An imperative Map<id, entry> synced from the live session's join/leave
   updates: meshes are created when someone arrives and disposed when they
   leave (or rebuilt when they change their look). Each frame every explorer
   is placed at its interpolated pose, its walk cycle runs while it moves,
   and the nearest few get a DOM name tag. No React state per frame, no
   collision with other explorers. */
import * as THREE from "three";
import { poseAt, type LiveState, type RemoteExplorer } from "../../live/presence";
import { buildAvatar, specKey, type Avatar } from "./avatar";
import { damp, lerpAngle } from "./util";

const TAG_RANGE = 45;
const TAG_MAX = 12;
const DRAW_RANGE = 160;

interface Entry {
  remote: RemoteExplorer;
  avatar: Avatar;
  key: string;
  tag: HTMLDivElement;
  tagName: HTMLSpanElement;
  tagDot: HTMLSpanElement;
  tagShown: boolean;
  x: number;
  z: number;
  heading: number;
  placed: boolean;
  speed: number;
}

export interface ExplorerDot {
  x: number;
  z: number;
  color: string;
}

export class Explorers {
  readonly root = new THREE.Group();
  private entries = new Map<string, Entry>();
  private shown = true;
  private readonly v = new THREE.Vector3();
  private readonly order: { e: Entry; d: number }[] = [];

  constructor(
    private readonly tagLayer: HTMLElement,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.root.name = "explorers";
  }

  /** Reconcile meshes with the session's explorer list (join, leave, new look, new name). */
  sync(state: LiveState): void {
    const seen = new Set<string>();
    for (const r of state.others) {
      seen.add(r.id);
      let e = this.entries.get(r.id);
      const key = specKey(r.avatar);
      if (!e) {
        e = this.create(r, key);
        this.entries.set(r.id, e);
      } else {
        e.remote = r;
        if (e.key !== key) {
          this.root.remove(e.avatar.root);
          e.avatar.dispose();
          e.avatar = buildAvatar(r.avatar);
          e.key = key;
          e.avatar.root.position.set(e.x, this.heightAt(e.x, e.z), e.z);
          e.avatar.root.rotation.y = e.heading;
          e.avatar.root.visible = e.placed && this.shown;
          this.root.add(e.avatar.root);
        }
      }
      if (e.tagName.textContent !== r.name) e.tagName.textContent = r.name;
      e.tagDot.style.background = r.avatar.body;
    }
    for (const [id, e] of this.entries) {
      if (seen.has(id)) continue;
      this.destroy(e);
      this.entries.delete(id);
    }
  }

  private create(r: RemoteExplorer, key: string): Entry {
    const avatar = buildAvatar(r.avatar);
    avatar.root.visible = false;
    this.root.add(avatar.root);
    const tag = document.createElement("div");
    tag.className = "walk-tag";
    tag.setAttribute("aria-hidden", "true");
    tag.hidden = true;
    const tagDot = document.createElement("span");
    tagDot.className = "walk-tag-dot";
    tagDot.style.background = r.avatar.body;
    const tagName = document.createElement("span");
    tagName.textContent = r.name;
    tag.append(tagDot, tagName);
    this.tagLayer.appendChild(tag);
    return { remote: r, avatar, key, tag, tagName, tagDot, tagShown: false, x: 0, z: 0, heading: 0, placed: false, speed: 0 };
  }

  private destroy(e: Entry): void {
    this.root.remove(e.avatar.root);
    e.avatar.dispose();
    e.tag.remove();
  }

  setShown(v: boolean): void {
    this.shown = v;
    for (const e of this.entries.values()) {
      e.avatar.root.visible = v && e.placed;
      if (!v) this.hideTag(e);
    }
  }

  private hideTag(e: Entry) {
    if (e.tagShown) {
      e.tag.hidden = true;
      e.tagShown = false;
    }
  }

  /** Place, animate and label everyone. `me` is the local explorer's position (for tag culling). */
  update(now: number, dt: number, time: number, reduced: boolean, camera: THREE.Camera, width: number, height: number, me: { x: number; z: number }): void {
    this.order.length = 0;
    const k = damp(14, dt);
    for (const e of this.entries.values()) {
      const pose = poseAt(e.remote, now);
      if (!pose) {
        e.avatar.root.visible = false;
        this.hideTag(e);
        continue;
      }
      if (!e.placed || reduced) {
        e.x = pose.x;
        e.z = pose.z;
        e.heading = pose.heading;
        e.placed = true;
      } else {
        // poseAt already interpolates; this only smooths the odd late packet.
        e.x += (pose.x - e.x) * k;
        e.z += (pose.z - e.z) * k;
        e.heading = lerpAngle(e.heading, pose.heading, k);
      }
      const target = pose.moving ? (pose.running ? 1.9 : 1) : 0;
      e.speed += (target - e.speed) * damp(10, dt);
      const root = e.avatar.root;
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      root.visible = this.shown && d < DRAW_RANGE;
      root.position.set(e.x, this.heightAt(e.x, e.z), e.z);
      root.rotation.y = e.heading;
      if (root.visible) e.avatar.animate(dt, time, e.speed, reduced);
      if (this.shown && d < TAG_RANGE) this.order.push({ e, d });
      else this.hideTag(e);
    }
    this.order.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.order.length; i++) {
      const { e } = this.order[i];
      if (i >= TAG_MAX) {
        this.hideTag(e);
        continue;
      }
      this.v.set(e.x, e.avatar.root.position.y + 2.35, e.z).project(camera);
      if (this.v.z > 1 || this.v.x < -1.1 || this.v.x > 1.1 || this.v.y < -1.1 || this.v.y > 1.1) {
        this.hideTag(e);
        continue;
      }
      const sx = (this.v.x * 0.5 + 0.5) * width;
      const sy = (-this.v.y * 0.5 + 0.5) * height;
      e.tag.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      if (!e.tagShown) {
        e.tag.hidden = false;
        e.tagShown = true;
      }
    }
  }

  /** Positions and colors for the minimap. */
  dots(out: ExplorerDot[]): ExplorerDot[] {
    out.length = 0;
    if (!this.shown) return out;
    for (const e of this.entries.values()) if (e.placed) out.push({ x: e.x, z: e.z, color: e.remote.avatar.body });
    return out;
  }

  get count(): number {
    return this.entries.size;
  }

  dispose(): void {
    for (const e of this.entries.values()) this.destroy(e);
    this.entries.clear();
  }
}
