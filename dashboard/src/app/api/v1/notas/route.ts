import { autenticarPeticion } from "@/lib/apiTokens";
import { getPersonalWorkspaceId } from "@/lib/workspace";
import { searchMessages, SEARCH_PAGE_SIZE } from "@/lib/data";
import { captureMessage } from "@/lib/pipeline";
import { checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 30;

/**
 * Topes por token y hora.
 *
 * Sin esto, `POST` era un endpoint de GASTO sin medir: cada nota creada
 * dispara una llamada a Groq (categorizar y resumir) y otra a Gemini
 * (embedding), y un token es algo que por definición usa un script — un
 * bucle mal escrito, o un token filtrado, vaciaría la cuota de las dos APIs
 * sin que nadie se enterase hasta ver la factura.
 *
 * La lectura también se limita, mucho más alto: no cuesta dinero pero sí
 * base de datos, y un cliente que sondee en bucle no debe poder tumbarla.
 */
const LIMITE_ESCRITURA = 60;
const LIMITE_LECTURA = 600;
const VENTANA_MS = 60 * 60 * 1000;

/** Respuesta 429 con `Retry-After`, para que un cliente automático sepa cuánto esperar en vez de reintentar en bucle. */
function demasiadasPeticiones(segundos: number): Response {
  return Response.json(
    { error: `Demasiadas peticiones. Reinténtalo en ${segundos}s.` },
    { status: 429, headers: { "Retry-After": String(segundos) } },
  );
}

/**
 * API pública v1 de notas.
 *
 * Es lo que convierte MemorIAble en "la memoria de la que tiran tus otras
 * IAs": un servidor MCP, un script propio o cualquier cliente HTTP pueden
 * leer y escribir aquí con un token personal (ver `lib/apiTokens.ts`), sin
 * una sesión de navegador.
 *
 * **Alcance: el espacio PERSONAL del dueño del token**, no el workspace
 * activo. Dos razones: el workspace activo vive en una cookie que una
 * integración no tiene, y un token que escribiera en el espacio compartido
 * de un equipo por defecto es una forma muy fácil de que algo automático
 * publique donde no debía. Elegir workspace por la API se añadirá cuando
 * haya un caso real que lo pida, con el permiso explícito en el token.
 */
function noAutorizado(): Response {
  // `WWW-Authenticate` para que un cliente HTTP sepa QUÉ le falta, en vez
  // de recibir un 401 mudo.
  return Response.json(
    { error: "Falta un token válido. Usa: Authorization: Bearer <token>" },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="memoriable"' } },
  );
}

/** GET /api/v1/notas?q=…&limite=… — busca (híbrida, la misma que la web). */
export async function GET(req: Request) {
  const userId = await autenticarPeticion(req);
  if (!userId) return noAutorizado();

  const limite429 = await checkRateLimit(`api:lectura:${userId}`, LIMITE_LECTURA, VENTANA_MS);
  if (!limite429.allowed) return demasiadasPeticiones(limite429.retryAfterSeconds);

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limiteParam = Number(url.searchParams.get("limite"));
  const limite = Number.isInteger(limiteParam) && limiteParam > 0 ? limiteParam : SEARCH_PAGE_SIZE;

  const workspaceId = await getPersonalWorkspaceId(userId);
  const { messages, total, hayMas } = await searchMessages(workspaceId, q, {}, limite);

  return Response.json({
    notas: messages.map((m) => ({
      id: m.id,
      contenido: m.contenido,
      resumen: m.resumen,
      categoria: m.categoria,
      hecho: m.hecho,
      fecha: m.fecha.toISOString(),
      fechaLimite: m.fechaLimite?.toISOString() ?? null,
    })),
    total,
    hayMas,
  });
}

/** Tope del texto de una nota por API: el mismo que aplica el saneado del pipeline. */
const MAX_CONTENIDO = 10_000;

/**
 * POST /api/v1/notas — crea una nota.
 *
 * Pasa por el MISMO pipeline que la captura web y el bot (categorizar,
 * resumir, embeber, guardar): una nota creada por API no puede ser una nota
 * de segunda que luego no aparezca en las búsquedas por significado.
 */
export async function POST(req: Request) {
  const userId = await autenticarPeticion(req);
  if (!userId) return noAutorizado();

  // Antes de leer el cuerpo: si está limitado, no hay por qué gastar en
  // parsear nada.
  const limite429 = await checkRateLimit(`api:escritura:${userId}`, LIMITE_ESCRITURA, VENTANA_MS);
  if (!limite429.allowed) return demasiadasPeticiones(limite429.retryAfterSeconds);

  let body: { contenido?: unknown };
  try {
    body = (await req.json()) as { contenido?: unknown };
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON." }, { status: 400 });
  }

  const contenido = typeof body.contenido === "string" ? body.contenido.trim() : "";
  if (!contenido) return Response.json({ error: "Falta `contenido`." }, { status: 400 });
  if (contenido.length > MAX_CONTENIDO) {
    return Response.json({ error: `\`contenido\` no puede pasar de ${MAX_CONTENIDO} caracteres.` }, { status: 400 });
  }

  const workspaceId = await getPersonalWorkspaceId(userId);
  try {
    const saved = await captureMessage(userId, contenido, workspaceId);
    return Response.json(
      { nota: { id: saved.id, resumen: saved.resumen, categoria: saved.categoria } },
      { status: 201 },
    );
  } catch (err) {
    // El pipeline lanza `InvalidMessageError` si el contenido no es
    // aprovechable; el resto son fallos reales (Groq caído, BD).
    console.error("No se pudo crear la nota por API:", err);
    return Response.json({ error: "No se ha podido guardar la nota." }, { status: 502 });
  }
}
