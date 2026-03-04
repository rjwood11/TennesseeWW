import "leaflet/dist/leaflet.css";
import "./styles/widget.css";
import { mountTNWWWidget } from "./mount";

function findScript(): HTMLScriptElement | null {
  const current = document.currentScript as HTMLScriptElement | null;
  if (current) return current;
  const scripts = Array.from(document.getElementsByTagName("script"));
  return scripts.find((s) => s.src.includes("tnww-widget.js")) || null;
}

function inferApiBase(script: HTMLScriptElement | null): string {
  const explicit = script?.dataset.api?.trim();
  if (explicit) return explicit;
  if (!script?.src) return "http://localhost:8000";
  try {
    const src = new URL(script.src, window.location.href);
    return new URL("./static-api", src).toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:8000";
  }
}

(function autoMount() {
  const script = findScript();
  const apiBase = inferApiBase(script);
  const targetId = script?.dataset.target ?? "tnww";
  const target = document.getElementById(targetId);
  if (!target) return;
  mountTNWWWidget(target, apiBase);
})();
