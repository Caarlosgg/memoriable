import type { Metadata } from "next";

export const metadata: Metadata = { title: "Política de privacidad · MemorIAble" };

/**
 * Política de privacidad. Igual que los términos: describe el tratamiento
 * REAL de datos (los subencargados listados son los que de verdad se usan).
 * Si se añade un proveedor nuevo que vea contenido de usuario, hay que
 * añadirlo aquí también.
 */
export default function PrivacidadPage() {
  return (
    <>
      <h1 className="font-display text-2xl text-ink">Política de privacidad</h1>
      <p>Última actualización: septiembre de 2026.</p>

      <h2>Qué datos guardamos</h2>
      <ul>
        <li>
          <strong>De tu cuenta</strong>: correo, nombre (si lo indicas), contraseña cifrada (o tu
          identificador de Google si entras con Google) y tus preferencias.
        </li>
        <li>
          <strong>Tu contenido</strong>: las notas, tareas, eventos, comentarios y archivos que
          creas, junto con la categoría y el resumen que genera la IA.
        </li>
        <li>
          <strong>De uso</strong>: registro de actividad dentro de tus espacios de trabajo (quién
          hizo qué y cuándo) y errores técnicos para poder arreglarlos.
        </li>
      </ul>
      <p>No usamos cookies de seguimiento ni publicidad. La única cookie es la de tu sesión.</p>

      <h2>Para qué los usamos</h2>
      <p>
        Únicamente para prestarte el servicio: guardar tu contenido, organizarlo, buscarlo,
        responder a tus preguntas sobre él y avisarte de lo que tienes pendiente. No vendemos tus
        datos, no los cedemos con fines comerciales y no los usamos para entrenar modelos de IA.
      </p>

      <h2>Con quién se comparten</h2>
      <p>Solo con los proveedores necesarios para que funcione:</p>
      <ul>
        <li>
          <strong>Groq</strong> — categoriza y resume tu contenido, y genera las respuestas del
          Asistente.
        </li>
        <li>
          <strong>Google (Gemini)</strong> — calcula los vectores que permiten la búsqueda por
          significado.
        </li>
        <li>
          <strong>Supabase</strong> — base de datos donde se almacena tu contenido (alojada en la
          Unión Europea).
        </li>
        <li>
          <strong>Vercel</strong> — alojamiento de la aplicación.
        </li>
        <li>
          <strong>Telegram</strong> — solo si vinculas el bot, para recibir lo que le dictas.
        </li>
        <li>
          <strong>Resend</strong> — envío de los correos de verificación y recuperación.
        </li>
        <li>
          <strong>Sentry</strong> — registro de errores técnicos.
        </li>
      </ul>

      <h2>Cuánto tiempo</h2>
      <p>
        Tu contenido se conserva mientras tengas la cuenta abierta. El historial del Asistente se
        borra automáticamente a los 7 días. Si cierras tu cuenta, tus datos se eliminan.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Puedes acceder, rectificar, exportar y eliminar tus datos en cualquier momento desde la
        pantalla «Cuenta» —sin pedir permiso a nadie— o escribiéndonos. También puedes presentar
        una reclamación ante la Agencia Española de Protección de Datos.
      </p>

      <h2>Seguridad</h2>
      <p>
        Las contraseñas se almacenan cifradas (nunca en claro), las conexiones van por HTTPS y cada
        consulta a la base de datos comprueba que el contenido pertenece a tu espacio de trabajo.
      </p>

      <h2>Contacto</h2>
      <p>
        Para ejercer tus derechos o resolver dudas, escribe a{" "}
        <a href="mailto:carlosgallardogonzalez14@gmail.com">carlosgallardogonzalez14@gmail.com</a>.
      </p>
    </>
  );
}
