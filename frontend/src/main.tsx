import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { useHub, useUi } from "./lib/store";
import { sim, useDemo } from "./lib/sim";

// handle for tests and for poking at the app from the browser console: add ?debug to the URL
if (import.meta.env.DEV || location.search.includes("debug")) (window as unknown as Record<string, unknown>).__ld = { useHub, useUi, useDemo, sim };

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
