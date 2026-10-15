import { Platform } from "react-native";
import { colors } from "./tokens";

/**
 * Surfaces du navigateur que l'on ne dessine pas soi-même : sélection, curseur,
 * barres de défilement, contour de focus au clavier. Thémées depuis la palette (web uniquement).
 */
export function installWebSurfaces(): void {
  if (Platform.OS !== "web" || typeof document === "undefined" || document.getElementById("kynex-surfaces")) return;
  const style = document.createElement("style");
  style.id = "kynex-surfaces";
  style.textContent = `
    html, body { background: ${colors.bg}; color-scheme: dark; }
    ::selection { background: ${colors.accent}; color: ${colors.onAccent}; }
    input, textarea { caret-color: ${colors.accent}; }
    * { scrollbar-width: thin; scrollbar-color: ${colors.faint} transparent; }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-thumb { background: ${colors.line}; border-radius: 10px; border: 2px solid ${colors.bg}; }
    ::-webkit-scrollbar-thumb:hover { background: ${colors.faint}; }
    ::-webkit-scrollbar-track { background: transparent; }
    :focus { outline: none; }
    :focus-visible { outline: 2px solid ${colors.accent}; outline-offset: 2px; border-radius: 6px; }
  `;
  document.head.appendChild(style);
}
