/**
 * Política de contraseñas — SIN "server-only" a propósito: la misma
 * función evalúa los requisitos en el navegador (para la lista que se va
 * marcando sola mientras escribes, ver PasswordRequirements.tsx) y en el
 * servidor (que es quien de verdad decide, ver registro/restablecer-
 * password/cuenta). Un único sitio para la regla: sin esto, el aviso del
 * cliente y la validación real podrían discrepar y dejar al usuario
 * viendo "todo correcto" mientras el servidor lo rechaza.
 *
 * Criterio (NIST SP 800-63B): las reglas de composición muy estrictas son
 * contraproducentes — obligan a "Password1!" y a apuntarla en un papel.
 * Lo que de verdad protege es la longitud y NO usar una contraseña obvia.
 * Por eso aquí:
 *   - se EXIGE longitud, una letra y un número (barato, corta lo peor),
 *   - el carácter especial se RECOMIENDA pero no bloquea,
 *   - y sí se BLOQUEAN las contraseñas obvias (lista de las más usadas) y
 *     las derivadas del propio email, que es lo que de verdad revientan
 *     primero los ataques por diccionario.
 */

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Tope general de tamaño de entrada: sin él, alguien podría mandar una
 * contraseña gigantesca solo para encarecer el hasheo en el servidor
 * (coste de CPU/memoria proporcional al tamaño). Ya no viene impuesto por
 * el límite de 72 bytes de bcrypt (argon2id no lo tiene), pero se mantiene.
 */
export const MAX_PASSWORD_LENGTH = 72;

/**
 * Contraseñas obvias, en minúsculas y sin la parte numérica variable —
 * se comparan contra la contraseña normalizada (ver `esDemasiadoComun`).
 * Lista corta a propósito: cubre lo que sale en cualquier top-100 (global
 * y español) sin convertir esto en un fichero de datos de miles de líneas
 * que habría que mantener. No pretende ser exhaustiva; es una red para lo
 * indefendible, no un sustituto de la longitud.
 */
const CONTRASENAS_COMUNES = [
  "password",
  "passw0rd",
  "contrasena",
  "contraseña",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "qwertyui",
  "qwerty123",
  "abc12345",
  "iloveyou",
  "admin123",
  "administrador",
  "usuario",
  "bienvenido",
  "welcome",
  "letmein",
  "monkey",
  "dragon",
  "football",
  "futbol",
  "barcelona",
  "realmadrid",
  "sevilla",
  "atletico",
  "españa",
  "espana",
  "madrid",
  "asdasd",
  "asdfghjk",
  "11111111",
  "00000000",
  "changeme",
  "cambiame",
  "secreto",
  "santiago",
  "alejandro",
  "cristina",
  "memoriable",
] as const;

/** Quita tildes/mayúsculas y los dígitos del final ("Madrid2024" → "madrid") para que una variante trivial de una contraseña obvia siga contando como obvia. */
function normalizar(password: string): string {
  return password
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]+$/, "");
}

function esDemasiadoComun(password: string): boolean {
  const normalizada = normalizar(password);
  if (normalizada.length === 0) return true; // solo dígitos/símbolos repetidos
  return CONTRASENAS_COMUNES.some((comun) => normalizar(comun) === normalizada);
}

/**
 * La contraseña no puede ser (ni contener) la parte local del email — es
 * de lo primero que prueba cualquiera que conozca la dirección. Solo se
 * comprueba si esa parte local es lo bastante larga como para que la
 * coincidencia signifique algo (con "ana@…" bloquearíamos cualquier
 * contraseña que lleve "ana" dentro, que es demasiado).
 */
function derivaDelEmail(password: string, email: string | undefined): boolean {
  if (!email) return false;
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length < 4) return false;
  return normalizar(password).includes(local);
}

export interface PasswordRequirement {
  id: "longitud" | "letra" | "numero" | "especial";
  /** Texto tal cual se le muestra al usuario en la lista de requisitos. */
  label: string;
  cumplido: boolean;
  /** false = suma seguridad pero no impide guardar (ver criterio arriba). */
  obligatorio: boolean;
}

/** Requisitos uno a uno, para pintarlos marcándose solos mientras se escribe. */
export function evaluarRequisitos(password: string): PasswordRequirement[] {
  return [
    {
      id: "longitud",
      label: `Al menos ${MIN_PASSWORD_LENGTH} caracteres`,
      cumplido: password.length >= MIN_PASSWORD_LENGTH,
      obligatorio: true,
    },
    { id: "letra", label: "Una letra", cumplido: /\p{L}/u.test(password), obligatorio: true },
    { id: "numero", label: "Un número", cumplido: /\d/.test(password), obligatorio: true },
    {
      id: "especial",
      label: "Un símbolo (recomendado)",
      cumplido: /[^\p{L}\d]/u.test(password),
      obligatorio: false,
    },
  ];
}

/**
 * Fuerza orientativa (0-4) SOLO para la barra de color — no decide si se
 * puede guardar (eso es `validarPassword`). Premia la longitud por encima
 * de la variedad de caracteres, coherente con el criterio de arriba.
 */
export function calcularFuerza(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length === 0) return 0;
  if (esDemasiadoComun(password)) return 1;

  let puntos = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) puntos++;
  if (password.length >= 12) puntos++;
  if (password.length >= 16) puntos++;
  const variedad = evaluarRequisitos(password).filter((r) => r.id !== "longitud" && r.cumplido).length;
  if (variedad >= 2) puntos++;
  if (variedad === 3) puntos++;

  return Math.min(4, Math.max(1, puntos)) as 1 | 2 | 3 | 4;
}

export const FUERZA_LABEL: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "",
  1: "Muy débil",
  2: "Débil",
  3: "Buena",
  4: "Fuerte",
};

/**
 * Validación REAL (la que aplica el servidor). Devuelve el mensaje de
 * error tal cual se le enseña al usuario, o null si la contraseña vale.
 * `email` es opcional: solo se pasa donde se conoce (registro), para
 * bloquear las contraseñas derivadas de la propia dirección.
 */
export function validarPassword(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `La contraseña no puede tener más de ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  const pendientes = evaluarRequisitos(password).filter((r) => r.obligatorio && !r.cumplido);
  if (pendientes.length > 0) {
    return "La contraseña debe combinar letras y números.";
  }
  if (esDemasiadoComun(password)) {
    return "Esa contraseña es demasiado común y se adivina enseguida. Elige otra.";
  }
  if (derivaDelEmail(password, email)) {
    return "La contraseña no puede parecerse a tu email. Elige otra.";
  }
  return null;
}
