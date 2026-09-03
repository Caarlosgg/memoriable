import { describe, expect, it } from 'vitest';
import { markdownToTelegramHtml } from '../src/telegram/markdownToHtml.js';

describe('markdownToTelegramHtml', () => {
  it('convierte negrita y cursiva a las etiquetas que entiende Telegram', () => {
    expect(markdownToTelegramHtml('Esto es **importante** y esto *matizado*')).toBe(
      'Esto es <b>importante</b> y esto <i>matizado</i>',
    );
  });

  it('escapa el HTML del contenido — un `<` suelto hacía que Telegram rechazara el mensaje ENTERO', () => {
    // Es el fallo que deja al usuario sin ninguna respuesta por un carácter.
    const html = markdownToTelegramHtml('Compara a < b && revisa <script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;&amp;');
    expect(html).not.toContain('<script>');
  });

  it('los encabezados pasan a negrita: en un chat no hay tamaños de letra', () => {
    expect(markdownToTelegramHtml('## Pendientes de hoy')).toBe('<b>Pendientes de hoy</b>');
  });

  it('las viñetas se convierten en topos, conservando la sangría', () => {
    expect(markdownToTelegramHtml('- uno\n- dos')).toBe('• uno\n• dos');
    expect(markdownToTelegramHtml('  - anidado')).toBe('  • anidado');
  });

  it('el contenido de un bloque de código NO se interpreta como formato', () => {
    const html = markdownToTelegramHtml('```\nconst a = **b**;\n```');
    expect(html).toBe('<pre>const a = **b**;</pre>');
  });

  it('respeta el código en línea', () => {
    expect(markdownToTelegramHtml('usa `npm test` para verlo')).toBe(
      'usa <code>npm test</code> para verlo',
    );
  });

  it('convierte enlaces http(s), y solo esos', () => {
    expect(markdownToTelegramHtml('[la nota](https://memoriable.app/notas)')).toBe(
      '<a href="https://memoriable.app/notas">la nota</a>',
    );
    // Un `javascript:` que pinte el modelo no debe llegar como enlace.
    expect(markdownToTelegramHtml('[ojo](javascript:alert(1))')).not.toContain('<a href');
  });

  it('un asterisco suelto NO abre una cursiva que nunca se cierra', () => {
    // Si lo hiciera, Telegram rechazaría el mensaje por etiqueta sin cerrar
    // — y el usuario se quedaría sin respuesta.
    const html = markdownToTelegramHtml('3 * 4 = 12');
    expect(html).not.toContain('<i>');
    expect(html).toBe('3 * 4 = 12');
  });

  it('un guion bajo dentro de una palabra no se convierte en cursiva', () => {
    expect(markdownToTelegramHtml('la tabla user_workspace_id')).toBe('la tabla user_workspace_id');
  });

  it('deja el texto plano tal cual', () => {
    expect(markdownToTelegramHtml('Mañana tienes 3 tareas.')).toBe('Mañana tienes 3 tareas.');
  });
});
