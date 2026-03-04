import "leaflet/dist/leaflet.css";
import "./styles/widget.css";
import { mountTNWWWidget } from "./mount";

function findScript(): HTMLScriptElement | null {
  const current = document.currentScript as HTMLScriptElement | null;
  if (current) return current;
  const scripts = Array.from(document.getElementsByTagName("script"));
  return scripts.find((s) => s.src.includes("tnww-widget.js")) || null;
}

(function autoMount() {
  const script = findScript();
  const apiBase = script?.dataset.api ?? "http://localhost:8000";
  const targetId = script?.dataset.target ?? "tnww";
  const target = document.getElementById(targetId);
  if (!target) return;
  mountTNWWWidget(target, apiBase);
})();
