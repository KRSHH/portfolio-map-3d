// @ts-nocheck
// The original joins a P2P room here; the walk world has its own live explorers, so this is a quiet stand-in.
export interface P2PClientData { p: number[]; r: number[]; a: number; seed?: number }
export class P2PConnection {
  _clients = new Map<string, any>();
  _data: any = null;
  constructor(o: any) { setTimeout(() => o?.onConnect?.(), 0); }
  _dispose() {}
}
