import type { Context } from 'telegraf';
import { errorContext, type Logger } from '../logging/index.js';

/** Límite real de la API de Telegram para el texto de un mensaje. */
const TELEGRAM_TEXT_LIMIT = 4096;

/** Última red si ni el HTML ni el texto plano se han podido entregar. */
const FALLBACK_ERROR_TEXT = '⚠️ No he podido enviarte la respuesta. Inténtalo de nuevo en un momento.';

type ReplyExtra = NonNullable<Parameters<Context['reply']>[1]>;

/**
 * Trocea un texto ya formateado en HTML de Telegram en fragmentos que caben
 * en un mensaje. Corta por líneas — los formatos que genera
 * `markdownToTelegramHtml` no cruzan líneas (salvo `<pre>`, que en la
 * práctica nunca se acerca al límite) — así que nunca se parte una etiqueta
 * a medias. Si una sola línea ya se pasa del límite (caso raro: un bloque de
 * código enorme), se trocea a lo bruto: perder el trozo sobrante es mejor
 * que no entregar nada.
 */
export function splitForTelegram(text: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
  if (text.length <= limit) return [text];

  const partes: string[] = [];
  let actual = '';
  for (const linea of text.split('\n')) {
    let pendiente = linea;
    while (pendiente.length > limit) {
      if (actual) {
        partes.push(actual);
        actual = '';
      }
      partes.push(pendiente.slice(0, limit));
      pendiente = pendiente.slice(limit);
    }
    const conSalto = actual ? `${actual}\n${pendiente}` : pendiente;
    if (conSalto.length > limit) {
      partes.push(actual);
      actual = pendiente;
    } else {
      actual = conSalto;
    }
  }
  if (actual) partes.push(actual);
  return partes;
}

/**
 * Envía una respuesta que puede ser larga (el Asistente, una lista de
 * pendientes, un resumen) o llevar HTML que a veces no sale perfecto (viene
 * de un modelo, no de una plantilla fija) SIN dejar nunca al usuario sin
 * ninguna respuesta.
 *
 * Antes de esto, el último `ctx.reply` de un comando no estaba protegido: si
 * Telegram lo rechazaba (mensaje de más de 4096 caracteres, o cualquier
 * fallo de parseo de HTML que `markdownToTelegramHtml` no hubiera cubierto),
 * el único que se enteraba era `bot.catch` — que se limita a registrar el
 * error. El usuario se quedaba mirando el "escribiendo…" para siempre, sin
 * ninguna respuesta ni buena ni de error.
 *
 * Tres redes de seguridad, de más a menos ideal:
 *  1. Si cabe en un mensaje, se manda tal cual con `parse_mode: 'HTML'`.
 *  2. Si no cabe, se trocea en varios mensajes seguidos (`splitForTelegram`).
 *  3. Si Telegram RECHAZA un fragmento, se reintenta ESE fragmento sin
 *     `parse_mode` (texto plano, feo pero entregado) y, si ni eso funciona,
 *     un último mensaje genérico de error — nunca silencio.
 *
 * `extra` (teclado, etc.) se adjunta solo al ÚLTIMO fragmento: repetirlo en
 * cada trozo de un mensaje partido no tendría sentido.
 */
export async function sendSafeReply(
  ctx: Context,
  texto: string,
  logger?: Logger,
  extra?: ReplyExtra,
): Promise<void> {
  const fragmentos = splitForTelegram(texto);

  for (let i = 0; i < fragmentos.length; i++) {
    const fragmento = fragmentos[i]!;
    const extraDelFragmento = i === fragmentos.length - 1 ? extra : undefined;

    try {
      await ctx.reply(fragmento, { parse_mode: 'HTML', ...extraDelFragmento });
      continue;
    } catch (err) {
      logger?.warn('telegram.reply_html_failed', errorContext(err));
    }

    try {
      await ctx.reply(fragmento, extraDelFragmento);
    } catch (err) {
      logger?.error('telegram.reply_failed', errorContext(err));
      await ctx.reply(FALLBACK_ERROR_TEXT).catch(() => {});
      return;
    }
  }
}
