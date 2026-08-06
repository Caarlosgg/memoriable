/**
 * Preferencias de apariencia/accesibilidad (Tier P3): guardadas en
 * localStorage, nunca en la base de datos — son del navegador, no de la
 * cuenta (cambiar de dispositivo simplemente vuelve al valor por
 * defecto/del sistema, un compromiso razonable para no necesitar un
 * cambio de esquema por esto). Este módulo es el único sitio con las
 * claves de localStorage y los valores válidos, para que
 * ThemeScript/ThemeSettings nunca se desincronicen.
 */

export const THEME_STORAGE_KEY = "memoriable:theme";
export const TEXT_SIZE_STORAGE_KEY = "memoriable:text-size";

/** "system" = sigue `prefers-color-scheme`, sin atributo forzado en <html>. */
export type ThemePreference = "light" | "dark" | "system";
export type TextSizePreference = "normal" | "large";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export function isTextSizePreference(value: unknown): value is TextSizePreference {
  return value === "normal" || value === "large";
}

/**
 * Pequeño pub-sub propio para `useSyncExternalStore` (ver ThemeSettings.tsx
 * — mismo patrón que `usePrefersReducedMotion` en Sidebar.tsx). El evento
 * nativo `storage` SOLO avisa a las otras pestañas, nunca a la que
 * escribió — así que además de escucharlo, `applyTheme`/`applyTextSize`
 * emiten este evento a mano para que el propio toggle se refresque en el
 * momento, en su misma pestaña.
 */
const THEME_CHANGE_EVENT = "memoriable:theme-change";

function notifyThemeChange(): void {
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function subscribeToThemeChange(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
  };
}

export function getThemeSnapshot(): ThemePreference {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemePreference(stored) ? stored : "system";
}

export function getTextSizeSnapshot(): TextSizePreference {
  const stored = localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
  return isTextSizePreference(stored) ? stored : "normal";
}

/** Valor por defecto durante el render en servidor — nunca hay preferencia guardada ahí. */
export function getThemeServerSnapshot(): ThemePreference {
  return "system";
}

export function getTextSizeServerSnapshot(): TextSizePreference {
  return "normal";
}

/** Aplica la preferencia al DOM y al storage — mismo efecto tanto si lo llama el toggle en Cuenta como cualquier otro sitio futuro. */
export function applyTheme(theme: ThemePreference): void {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage bloqueado (modo privado estricto, cuota...): el tema se
    // aplica igual esta visita, solo no sobrevive a recargar.
  }
  notifyThemeChange();
}

export function applyTextSize(size: TextSizePreference): void {
  if (size === "normal") document.documentElement.removeAttribute("data-text-size");
  else document.documentElement.setAttribute("data-text-size", size);
  try {
    localStorage.setItem(TEXT_SIZE_STORAGE_KEY, size);
  } catch {
    // No crítico, ver comentario de arriba.
  }
  notifyThemeChange();
}

/** Texto del script inline que se ejecuta ANTES de pintar (ver ThemeScript.tsx) — evita el parpadeo de "tema equivocado un instante". Nunca lanza: un localStorage bloqueado no debe romper la carga de la página. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t);var s=localStorage.getItem(${JSON.stringify(TEXT_SIZE_STORAGE_KEY)});if(s==="large")document.documentElement.setAttribute("data-text-size",s);}catch(e){}})();`;
