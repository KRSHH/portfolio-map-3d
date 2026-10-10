/* The address is the Nexus's state: which page, which world is open, where the visitor came
   from (lib/route.ts). Changes go through navigate(), which updates history and tells every
   subscriber; the back and forward buttons work as usual. */
import { useMemo, useSyncExternalStore } from "react";
import { parseRoute, routeSearch, type Route } from "../lib/route.ts";

const EVENT = "nexus:navigate";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useRoute(): Route {
  const search = useSyncExternalStore(subscribe, () => window.location.search);
  return useMemo(() => parseRoute(search), [search]);
}

/** The Nexus's own address for a route, under its base path ("/?world", or "/<base>/?world"). */
export function routeHref(route: Route, hash = ""): string {
  return `${import.meta.env.BASE_URL}${routeSearch(route)}${hash}`;
}

/** Goes to `route`: a new history entry, or `replace` the current one (a selection inside the world). */
export function navigate(route: Route, opts: { replace?: boolean; hash?: string } = {}): void {
  const url = routeHref(route, opts.hash);
  if (opts.replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(EVENT));
}
