import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import ScoutTracker from "./ScoutTracker.jsx";

registerSW({ immediate: true });

// Ask the browser not to evict our localStorage data under storage pressure.
if (navigator.storage?.persist) {
  navigator.storage.persist();
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ScoutTracker />
  </React.StrictMode>
);
