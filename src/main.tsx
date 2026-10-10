import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { readUrlState, syncUrl } from "./state/url";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

readUrlState();
syncUrl();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
