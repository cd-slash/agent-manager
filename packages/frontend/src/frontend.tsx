/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import "./index.css";

// Initialize Convex client
// Bun doesn't expose env vars to client bundle, so we use the URL directly
// In production, this would be configured via build-time replacement
const convexUrl = (typeof import.meta.env !== 'undefined' && import.meta.env.VITE_CONVEX_URL)
  || "https://brazen-skunk-217.convex.cloud";
const convex = new ConvexReactClient(convexUrl);

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>
);

if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  // The hot module reloading API is not available in production.
  createRoot(elem).render(app);
}
