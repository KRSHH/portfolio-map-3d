/* The network snapshot: nexus/public/network.json, or the fictional sample with ?sample (the
   sample is a separate chunk, loaded only then). */
import { useEffect, useState } from "react";
import { buildNetwork, SnapshotError, type NetworkModel } from "../lib/network.ts";

export type NetworkState = { status: "loading" } | { status: "ready"; model: NetworkModel; sample: boolean } | { status: "error"; message: string };

export function useNetwork(sample: boolean, attempt: number): NetworkState {
  const [state, setState] = useState<NetworkState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    const load: Promise<unknown> = sample
      ? import("../sample.ts").then((m) => m.SAMPLE_NETWORK)
      : fetch(`${import.meta.env.BASE_URL}network.json`, { cache: "no-cache" }).then((r) => {
          if (!r.ok) throw new Error(`The network list could not be loaded (HTTP ${r.status}).`);
          return r.json();
        });
    load
      .then((snapshot) => {
        if (alive) setState({ status: "ready", model: buildNetwork(snapshot), sample });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const message = e instanceof SnapshotError || (e instanceof Error && e.message.startsWith("The network")) ? e.message : "The network list could not be loaded.";
        setState({ status: "error", message });
      });
    return () => {
      alive = false;
    };
  }, [sample, attempt]);
  return state;
}
