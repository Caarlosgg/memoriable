import { escapeHtml } from './formatResponseCard.js';

/**
 * Trozos de código del Markdown: bloques ``` primero (más específicos) y
 * luego código en línea. Con `g` para poder recorrerlos con `split`, que es
 * lo que mantiene el contenido del código intacto — ver `markdownToTelegramHtml`.
 */
const CODIGO = /(```(?:\w+)?\n[\s\S]*?```|`[^`\n]+`)/g;

/** Reglas de formato que SÍ se aplican al texto normal (nunca dentro de código). */
function formatearTexto(texto: string): string {
  return (
    texto
      // Enlaces `[texto](url)`: solo http/https. Un `javascript:` en un
      // enlace que pinta el propio modelo no tiene por qué llegar nunca al
      // usuario.
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/__([^_\n]+)__/g, '<b>$1</b>')
      .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
      // Cursiva al final y exigiendo que no haya espacio pegado al
      // delimitador: si no, un asterisco suelto de una multiplicación o una
      // nota al pie abriría una etiqueta que nunca se cierra, y Telegram
      // rechazaría el mensaje entero.
      .replace(/(?<![*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, '<i>$1</i>')
      .replace(/(?<![_\w])_([^_\s][^_\n]*?)_(?![_\w])/g, '<i>$1</i>')
  );
}

/** Encabezados y viñetas, que se deciden línea a línea. */
function formatearLinea(linea: string): string {
  // Encabezados: en un chat no hay tamaños de letra, así que un `##` se
  // convierte en negrita — que es lo que el encabezado quería decir.
  const encabezado = /^\s{0,3}#{1,6}\s+(.*)$/.exec(linea);
  if (encabezado) return `<b>${encabezado[1]!.trim()}</b>`;

  // Listas: el guion o el asterisco de viñeta se sustituye por un topo. Se
  // hace ANTES que la cursiva para que un `* item` no se confunda con el
  // inicio de un `*énfasis*`.
  const vinneta = /^(\s*)[-*+]\s+(.*)$/.exec(linea);
  if (vinneta) return `${vinneta[1]}• ${vinneta[2]}`;

  return linea;
}

/**
 * Convierte el Markdown que devuelve el Asistente al subconjunto de HTML que
 * entiende Telegram.
 *
 * Hace falta porque las dos superficies hablan idiomas distintos: el
 * Asistente redacta en Markdown (es lo que renderiza la web, ver
 * `react-markdown` en AssistantChat) y Telegram solo acepta un puñado de
 * etiquetas HTML. Mandar el Markdown tal cual con `parse_mode: 'HTML'` falla
 * de las dos formas posibles: `**negrita**` se ve literal, y un `<` suelto
 * en la respuesta hace que Telegram RECHACE el mensaje entero con un 400 —
 * el usuario se queda sin respuesta por un carácter.
 *
 * Se escapa PRIMERO todo el texto y solo después se reintroducen las
 * etiquetas: al revés, cualquier `<` del contenido se colaría como marcado.
 *
 * El texto se parte por los trozos de código y las reglas de formato se
 * aplican SOLO a los trozos que no lo son. Sin eso, un `**b**` dentro de un
 * bloque de código acabaría convertido en negrita — justo lo que un bloque
 * de código promete que no va a pasar. Partir evita además tener que
 * inventar un marcador de hueco que luego haya que devolver.
 *
 * Solo se traduce lo que Telegram admite (negrita, cursiva, tachado, código
 * y enlaces). Encabezados y listas se convierten a algo legible en un chat,
 * no se intentan imitar.
 */
export function markdownToTelegramHtml(markdown: string): string {
  const escapado = escapeHtml(markdown);

  // `split` con un patrón entre paréntesis intercala los separadores en el
  // resultado: los índices pares son texto normal, los impares son código.
  const html = escapado
    .split(CODIGO)
    .map((trozo, i) => {
      if (i % 2 === 1) {
        const bloque = /^```(?:\w+)?\n([\s\S]*?)```$/.exec(trozo);
        if (bloque) return `<pre>${bloque[1]!.replace(/\n$/, '')}</pre>`;
        return `<code>${trozo.slice(1, -1)}</code>`;
      }
      return trozo.split('\n').map(formatearLinea).map(formatearTexto).join('\n');
    })
    .join('');

  // Solo se recortan líneas en blanco de los extremos, NO la sangría: un
  // `trim()` a secas se comía los espacios de una viñeta anidada que fuera
  // la primera línea.
  return html.replace(/^\n+/, '').replace(/\s+$/, '');
}
