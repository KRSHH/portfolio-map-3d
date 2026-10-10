import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { webModelContext } from "../federation/agent.ts";
import App from "./App";
import { readUrlState, syncUrl } from "./state/url";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

readUrlState();
syncUrl();

// In a browser with WebMCP, AI agents get the map's tools (src/agent.ts); other visitors never load them.
if (webModelContext()) void import("./agent").then((m) => m.registerMapTools());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
