import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// After a new deploy, old hashed chunks (e.g. the PDF engine) disappear.
// Reload once to pick up the fresh version instead of showing an error.
window.addEventListener("vite:preloadError", (event) => {
  const key = "sk-chunk-reload";
  const last = Number(sessionStorage.getItem(key) ?? 0);
  if (Date.now() - last < 30_000) return;
  event.preventDefault();
  sessionStorage.setItem(key, String(Date.now()));
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
