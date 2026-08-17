"use client";

import { Check, Circle } from "lucide-react";
import { evaluarRequisitos, calcularFuerza, FUERZA_LABEL } from "@/lib/passwordPolicy";

/** Color de cada tramo de la barra — reutiliza los tokens del tema, sin colores sueltos. */
const FUERZA_COLOR: Record<1 | 2 | 3 | 4, string> = {
  1: "bg-danger",
  2: "bg-highlight-strong",
  3: "bg-accent",
  4: "bg-accent-strong",
};

const FUERZA_TEXTO: Record<1 | 2 | 3 | 4, string> = {
  1: "text-danger",
  2: "text-highlight-strong",
  3: "text-accent-strong",
  4: "text-accent-strong",
};

/**
 * Requisitos que se van marcando solos mientras escribes, más una barra de
 * fuerza orientativa. Feedback en vivo en vez de un error después de
 * enviar: así el usuario no descubre las reglas a base de rechazos.
 *
 * Es SOLO ayuda visual — quien decide de verdad es `validarPassword` en el
 * servidor (ver passwordPolicy.ts), nunca esto.
 */
export function PasswordRequirements({ password }: { password: string }) {
  // Con el campo vacío no se enseña nada: una lista de requisitos en rojo
  // antes de que el usuario haya escrito una sola letra intimida sin
  // aportar (aún no ha hecho nada mal).
  if (password.length === 0) return null;

  const requisitos = evaluarRequisitos(password);
  const fuerza = calcularFuerza(password);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((tramo) => (
            <span
              key={tramo}
              className={`h-1 flex-1 rounded-full transition-colors ${
                fuerza >= tramo && fuerza > 0 ? FUERZA_COLOR[fuerza as 1 | 2 | 3 | 4] : "bg-paper-line"
              }`}
            />
          ))}
        </div>
        {/* aria-live: quien usa lector de pantalla no ve la barra, así que
            el cambio de "Débil" a "Fuerte" tiene que anunciarse. */}
        <span aria-live="polite" className={`text-xs font-medium ${fuerza > 0 ? FUERZA_TEXTO[fuerza as 1 | 2 | 3 | 4] : "text-muted"}`}>
          {FUERZA_LABEL[fuerza]}
        </span>
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {requisitos.map((r) => (
          <li key={r.id} className="flex items-center gap-1 text-xs">
            {r.cumplido ? (
              <Check aria-hidden size={12} className="shrink-0 text-accent" />
            ) : (
              <Circle aria-hidden size={12} className="shrink-0 text-muted" />
            )}
            <span className={r.cumplido ? "text-muted line-through decoration-muted/40" : "text-muted"}>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
