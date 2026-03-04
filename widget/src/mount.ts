import React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";

export function mountTNWWWidget(target: HTMLElement, apiBase: string): void {
  const root = createRoot(target);
  root.render(React.createElement(App, { apiBase }));
}
