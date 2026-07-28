import 'dotenv/config';

/**
 * Lectura y validación centralizada de variables de entorno.
 *
 * Este módulo NO lanza al importarse: los valores ausentes quedan como
 * `undefined` y los inválidos se degradan a su valor por defecto, acumulando
 * avisos en `configWarnings`. Cada módulo decide, de forma perezosa, si puede
 * arrancar (`requireEnv`) o no. Así el resto del sistema sigue siendo
 * ejecutable y testeable aunque falten secretos.
 */

/**
 * Modelo por defecto: modelo abierto de OpenAI servido por Groq. Barato y muy
 * rápido, sobrado para clasificar y resumir un mensaje corto.
 *
 * El identificador lleva el prefijo `openai/` a propósito: es el nombre exacto
 * que expone Groq (`openai/gpt-oss-120b`), no `gpt-oss-120b` a secas.
 */
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';

/** Fusible de coste por defecto: deliberadamente bajo. */
export const DEFAULT_MAX_MESSAGES_PER_DAY = 50;

export type RequiredEnvVar = 'DATABASE_URL' | 'TELEGRAM_BOT_TOKEN' | 'GROQ_API_KEY';

interface EnvVarSpec {
  /** Para qué sirve la variable. */
  purpose: string;
  /** Pasos concretos para conseguir el valor. */
  howTo: string[];
  /** Ejemplo del formato esperado (nunca un valor real). */
  example: string;
}

/**
 * Documentación de cada secreto, usada para construir mensajes de error
 * accionables en vez de stack traces crípticos.
 */
export const ENV_SPECS: Record<RequiredEnvVar, EnvVarSpec> = {
  TELEGRAM_BOT_TOKEN: {
    purpose: 'arrancar el bot de Telegram (Telegraf, modo polling)',
    howTo: [
      'Abre Telegram y habla con @BotFather.',
      'Envía /newbot y sigue las instrucciones (nombre y usuario del bot).',
      'BotFather te devolverá un token: cópialo entero.',
    ],
    example: '123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  },
  GROQ_API_KEY: {
    purpose: 'categorizar y resumir mensajes con la API de Groq',
    howTo: [
      'Entra en https://console.groq.com y crea una cuenta (tiene plan gratuito).',
      'Ve a API Keys → Create API Key.',
      'Copia la clave (solo se muestra una vez).',
    ],
    example: 'gsk_xxxxxxxxxxxxxxxxxxxxxxxx',
  },
  DATABASE_URL: {
    purpose: 'persistir los mensajes en PostgreSQL mediante Prisma',
    howTo: [
      'Opción gratuita: crea un proyecto en https://supabase.com (plan Free).',
      'En el panel: Project Settings → Database → Connection string → URI.',
      'Copia la cadena y sustituye [YOUR-PASSWORD] por la contraseña del proyecto.',
      'Después ejecuta: npm run prisma:generate && npm run prisma:deploy',
    ],
    example: 'postgresql://usuario:password@host:5432/postgres?schema=public',
  },
};

/**
 * Error de configuración con un mensaje accionable: qué falta, para qué sirve
 * y cómo conseguirlo.
 */
export class MissingEnvError extends Error {
  readonly variable: RequiredEnvVar;

  constructor(variable: RequiredEnvVar) {
    super(describeMissingEnv(variable));
    this.name = 'MissingEnvError';
    this.variable = variable;
  }
}

/** Construye el texto de ayuda para una variable que falta. */
export function describeMissingEnv(variable: RequiredEnvVar): string {
  const spec = ENV_SPECS[variable];
  const pasos = spec.howTo.map((paso, i) => `    ${i + 1}. ${paso}`).join('\n');
  return [
    '',
    `❌ Falta la variable de entorno requerida: ${variable}`,
    '',
    `  Para qué sirve: ${spec.purpose}.`,
    '',
    '  Cómo conseguirla:',
    pasos,
    '',
    `  Dónde ponerla: añade esta línea a tu archivo .env (copia .env.example si aún no lo tienes):`,
    `    ${variable}=${spec.example}`,
    '',
  ].join('\n');
}

/** Avisos de configuración no fatales, emitidos por el logger al arrancar. */
export const configWarnings: string[] = [];

function readString(name: string): string | undefined {
  const raw = process.env[name];
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Lee un entero positivo del entorno. Si el valor es inválido, registra un
 * aviso y devuelve el valor por defecto en vez de romper el arranque.
 */
export function readPositiveInt(name: string, fallback: number): number {
  const raw = readString(name);
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    configWarnings.push(
      `${name}="${raw}" no es un entero >= 0; se usa el valor por defecto ${fallback}.`,
    );
    return fallback;
  }
  return parsed;
}

export const env = {
  DATABASE_URL: readString('DATABASE_URL'),
  TELEGRAM_BOT_TOKEN: readString('TELEGRAM_BOT_TOKEN'),
  GROQ_API_KEY: readString('GROQ_API_KEY'),
  GROQ_MODEL: readString('GROQ_MODEL') ?? DEFAULT_MODEL,
  /** Fusible de coste: máximo de llamadas a la API de Groq por día. */
  MAX_MESSAGES_PER_DAY: readPositiveInt('MAX_MESSAGES_PER_DAY', DEFAULT_MAX_MESSAGES_PER_DAY),
  /** Fichero donde persiste el contador del fusible (debe ser escribible). */
  BUDGET_FILE: readString('BUDGET_FILE'),
  LOG_LEVEL: readString('LOG_LEVEL'),
} as const;

/**
 * Devuelve el valor de una variable requerida o lanza `MissingEnvError` con un
 * mensaje que explica exactamente qué falta y cómo conseguirlo.
 */
export function requireEnv(variable: RequiredEnvVar): string {
  const value = env[variable];
  if (!value) throw new MissingEnvError(variable);
  return value;
}

export function hasDatabase(): boolean {
  return Boolean(env.DATABASE_URL);
}

export function hasTelegram(): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN);
}

export function hasGroq(): boolean {
  return Boolean(env.GROQ_API_KEY);
}
