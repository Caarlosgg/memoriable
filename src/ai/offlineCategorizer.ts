import type { Analysis, Categorizer, Category, IncomingMessage } from './types.js';

/**
 * Categorizador heurístico offline. NO usa la API de Anthropic: sirve para
 * poder ejecutar el pipeline completo (por ejemplo desde el CLI de simulación)
 * cuando falta `ANTHROPIC_API_KEY`, sin depender de servicios reales.
 *
 * Es deliberadamente simple: reglas por palabras clave. La categorización real
 * la hace `AnthropicCategorizer`.
 */
export class OfflineCategorizer implements Categorizer {
  async analyze(message: IncomingMessage): Promise<Analysis> {
    const texto = message.contenido.toLowerCase();

    const categoria = this.guessCategory(texto);
    const resumen = this.summarize(message.contenido);

    return { categoria, resumen };
  }

  private guessCategory(texto: string): Category {
    if (/\?|¿|cómo|qué |cuándo|dónde|por qué/.test(texto)) return 'pregunta';
    if (/recuérdame|recordar|no olvid|mañana|a las \d|el lunes|el martes/.test(texto)) {
      return 'recordatorio';
    }
    if (/(^|\s)(hacer|comprar|llamar|enviar|terminar|revisar|preparar)\b/.test(texto)) {
      return 'tarea';
    }
    if (/idea|y si|deberíamos|propongo|se me ocurre/.test(texto)) return 'idea';
    if (texto.trim().length > 0) return 'nota';
    return 'otro';
  }

  private summarize(contenido: string): string {
    const limpio = contenido.trim().replace(/\s+/g, ' ');
    if (limpio.length <= 140) return limpio;
    return limpio.slice(0, 137).trimEnd() + '...';
  }
}
