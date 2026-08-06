"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const REDIRECT_SECONDS = 3;

/** Tras confirmar el email, lleva sola a /login pasados unos segundos — el enlace manual sigue ahí por si acaso. */
export function AutoRedirect() {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) {
      router.push("/login");
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, router]);

  return (
    <p className="mb-4 text-xs text-muted">Te llevamos a la pantalla de entrar en {secondsLeft}…</p>
  );
}
