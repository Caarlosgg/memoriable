import { THEME_SCRIPT } from "@/lib/theme";

/**
 * Se ejecuta antes de pintar (colocado en `<head>`) para fijar
 * `data-theme`/`data-text-size` en `<html>` desde localStorage — sin
 * esto, la página pintaría un instante con el tema por defecto y luego
 * "saltaría" al elegido, un parpadeo visible. `dangerouslySetInnerHTML`
 * con una constante fija (nunca datos de usuario) es el patrón estándar
 * para este caso, el único sitio del código donde tiene sentido.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
