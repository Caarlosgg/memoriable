"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon, Monitor, Type } from "lucide-react";
import {
  applyTextSize,
  applyTheme,
  getTextSizeServerSnapshot,
  getTextSizeSnapshot,
  getThemeServerSnapshot,
  getThemeSnapshot,
  subscribeToThemeChange,
  type TextSizePreference,
  type ThemePreference,
} from "@/lib/theme";

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Sistema", Icon: Monitor },
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Oscuro", Icon: Moon },
];

const TEXT_SIZE_OPTIONS: { value: TextSizePreference; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "large", label: "Grande" },
];

/**
 * Tema y tamaño de texto (Tier P3): preferencias del navegador, no de la
 * cuenta — guardadas en localStorage, sin tocar la base de datos (ver
 * lib/theme.ts). `useSyncExternalStore` (mismo patrón que
 * `usePrefersReducedMotion` en Sidebar.tsx) en vez de useState+useEffect:
 * es la forma pensada para leer una fuente externa (localStorage) sin
 * arriesgar un mismatch de hidratación ni disparar el aviso de "setState
 * síncrono en un efecto".
 */
export function ThemeSettings() {
  const theme = useSyncExternalStore(subscribeToThemeChange, getThemeSnapshot, getThemeServerSnapshot);
  const textSize = useSyncExternalStore(subscribeToThemeChange, getTextSizeSnapshot, getTextSizeServerSnapshot);

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
      <p className="mb-3 font-display text-lg text-ink">Apariencia y accesibilidad</p>

      <div className="mb-4 flex flex-col gap-2">
        <span className="text-sm text-muted">Tema</span>
        <div role="radiogroup" aria-label="Tema" className="flex gap-2">
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => applyTheme(value)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                theme === value
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-paper-line text-ink hover:bg-paper"
              }`}
            >
              <Icon aria-hidden size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5 text-sm text-muted">
          <Type aria-hidden size={14} /> Tamaño de texto
        </span>
        <div role="radiogroup" aria-label="Tamaño de texto" className="flex gap-2">
          {TEXT_SIZE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={textSize === value}
              onClick={() => applyTextSize(value)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                textSize === value
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-paper-line text-ink hover:bg-paper"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
