import type { Metadata } from "next";

export const metadata: Metadata = { title: "Términos de uso · MemorIAble" };

/**
 * Términos de uso. Plantilla honesta para un producto autoalojado y en
 * evolución — describe lo que el servicio hace y no hace de verdad, sin
 * prometer garantías que no se pueden sostener.
 *
 * OJO: esto NO es asesoramiento legal. Si MemorIAble pasa a cobrar o a
 * tratar datos de clientes de terceros, hay que revisarlo con alguien que
 * sepa (sobre todo el apartado de responsabilidad y el de subencargados).
 */
export default function TerminosPage() {
  return (
    <>
      <h1 className="font-display text-2xl text-ink">Términos de uso</h1>
      <p>Última actualización: septiembre de 2026.</p>

      <h2>Qué es MemorIAble</h2>
      <p>
        MemorIAble es una herramienta para capturar notas y tareas —por Telegram o desde la web— y
        organizarlas automáticamente con ayuda de inteligencia artificial. Al crear una cuenta
        aceptas estos términos.
      </p>

      <h2>Tu cuenta</h2>
      <ul>
        <li>Eres responsable de mantener tu contraseña a salvo y de la actividad de tu cuenta.</li>
        <li>Necesitas una dirección de correo válida y tener al menos 16 años.</li>
        <li>Puedes cerrar tu cuenta cuando quieras desde los ajustes.</li>
      </ul>

      <h2>Tu contenido es tuyo</h2>
      <p>
        Las notas, tareas y archivos que guardas siguen siendo tuyos. No los usamos para entrenar
        modelos ni los cedemos a nadie. Solo se procesan para prestarte el servicio: categorizarlos,
        buscarlos y responderte sobre ellos. Puedes exportarlo todo en cualquier momento desde
        «Cuenta».
      </p>

      <h2>Uso aceptable</h2>
      <ul>
        <li>No uses el servicio para nada ilegal ni para almacenar contenido que no puedas tener.</li>
        <li>No intentes acceder a cuentas ajenas ni saturar el servicio deliberadamente.</li>
      </ul>

      <h2>Servicios de terceros</h2>
      <p>
        Para funcionar, MemorIAble se apoya en proveedores externos: Groq (categorización y
        respuestas), Google Gemini (búsqueda por significado), Supabase (base de datos), Vercel
        (alojamiento) y Telegram (captura). El contenido que envías pasa por ellos en la medida
        necesaria para darte el servicio.
      </p>

      <h2>Disponibilidad y responsabilidad</h2>
      <p>
        El servicio se ofrece «tal cual», sin garantía de disponibilidad ininterrumpida. Aunque
        ponemos cuidado en no perder datos, te recomendamos exportar tu contenido periódicamente.
        No nos hacemos responsables de daños indirectos derivados del uso del servicio.
      </p>

      <h2>Cambios</h2>
      <p>
        Si estos términos cambian de forma relevante, te avisaremos por correo o dentro de la
        aplicación antes de que apliquen.
      </p>

      <h2>Contacto</h2>
      <p>
        Para cualquier duda sobre estos términos, escribe a{" "}
        <a href="mailto:carlosgallardogonzalez14@gmail.com">carlosgallardogonzalez14@gmail.com</a>.
      </p>
    </>
  );
}
