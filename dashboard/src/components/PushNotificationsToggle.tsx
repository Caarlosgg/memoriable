"use client";

import { useState, useSyncExternalStore } from "react";
import { BellRing } from "lucide-react";
import { savePushSubscription, deletePushSubscription } from "@/app/(dashboard)/cuenta/actions";
import { Button } from "@/components/ui/button";

/** VAPID exige la clave pública como Uint8Array, no como el string base64url que da `web-push generate-vapid-keys`. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Capacidad del navegador (no cambia en caliente) — useSyncExternalStore en
// vez de useState+useEffect, mismo patrón que usePrefersReducedMotion en
// Sidebar.tsx: evita el aviso de "setState síncrono en un efecto" y, sobre
// todo, el desajuste de hidratación (el servidor no tiene navigator/window).
function subscribeNever(): () => void {
  return () => {};
}
function getSupportedSnapshot(): boolean {
  return Boolean(VAPID_PUBLIC_KEY) && "serviceWorker" in navigator && "PushManager" in window;
}
function getSupportedServerSnapshot(): boolean {
  return false;
}

/**
 * Notificaciones del sistema aunque MemorIAble esté cerrado — Web Push
 * estándar (VAPID), sin servicio de terceros. `initialEnabled` viene del
 * servidor (¿tiene ESTE usuario alguna suscripción guardada?) pero la
 * suscripción en sí vive en ESTE navegador — si abre desde otro
 * dispositivo, ese arranca en "desactivado" hasta que también lo active
 * ahí, aunque el servidor ya tenga una suscripción de otro sitio.
 */
export function PushNotificationsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = useSyncExternalStore(subscribeNever, getSupportedSnapshot, getSupportedServerSnapshot);

  async function handleEnable() {
    if (!VAPID_PUBLIC_KEY) return;
    setError(null);
    setPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("No has dado permiso — actívalo desde los ajustes del navegador si cambias de idea.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Suscripción incompleta.");
      }
      const result = await savePushSubscription({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      if (result.error) throw new Error(result.error);
      setEnabled(true);
    } catch (err) {
      console.error("No se pudo activar el push:", err);
      setError("No se ha podido activar. Inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  async function handleDisable() {
    setError(null);
    setPending(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setEnabled(false);
    } catch (err) {
      console.error("No se pudo desactivar el push:", err);
      setError("No se ha podido desactivar. Inténtalo de nuevo.");
    } finally {
      setPending(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="rounded-2xl border border-paper-line bg-paper-raised p-5">
      <p className="mb-1 flex items-center gap-1.5 font-display text-lg text-ink">
        <BellRing aria-hidden size={17} /> Avisos aunque esté cerrada
      </p>
      <p className="mb-3 text-sm text-muted">
        Recibe un aviso del sistema cuando te asignen algo o te escriban en el chat, aunque no tengas MemorIAble
        abierto ni la pestaña activa.
      </p>
      {error && (
        <p role="alert" className="mb-2 text-xs text-danger">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant={enabled ? "secondary" : "default"}
        size="sm"
        disabled={pending}
        onClick={enabled ? handleDisable : handleEnable}
      >
        {pending ? "…" : enabled ? "Desactivar avisos" : "Activar avisos"}
      </Button>
    </div>
  );
}
