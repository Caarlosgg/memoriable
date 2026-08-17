"use client";

import { Component, type ReactNode } from "react";
import { useRouter } from "next/navigation";

interface SectionErrorBoundaryProps {
  title: string;
  children: ReactNode;
}

interface SectionErrorBoundaryState {
  error: Error | null;
}

/**
 * Límite de error POR SECCIÓN (no por ruta): un fallo puntual en una
 * sección (p. ej. la BD cae al cargar Pendientes) no debe tumbar el resto
 * del dashboard.
 *
 * Antes usaba `unstable_catchError` de `next/error` — una API marcada
 * explícitamente como inestable que resolvía en local pero NO en el build
 * de producción de Vercel ("Module has no exported member"), rompiendo el
 * despliegue entero sin avisar en desarrollo. Los límites de error son el
 * único caso donde React sigue exigiendo una clase (no hay equivalente de
 * hooks estable) — esto usa solo API pública y estable de React/Next.js,
 * sin apostar por nada experimental en el camino crítico del build.
 */
class SectionErrorBoundaryInner extends Component<
  SectionErrorBoundaryProps & { onRetry: () => void },
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`Error en la sección "${this.props.title}":`, error);
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="fade-in rounded-xl border border-danger/30 bg-danger-soft p-4">
          <p className="text-sm font-medium text-danger">{this.props.title}: no se ha podido cargar.</p>
          <p className="mt-1 text-xs text-danger/80">{this.state.error.message}</p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-3 rounded-full bg-danger/10 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Envoltorio funcional: `router.refresh()` vuelve a pedir los datos de los
 * Server Components de esta ruta al reintentar — limpiar solo el estado
 * local de la clase de arriba no repetiría la consulta que falló.
 */
export function SectionErrorBoundary({ title, children }: SectionErrorBoundaryProps) {
  const router = useRouter();
  return (
    <SectionErrorBoundaryInner title={title} onRetry={() => router.refresh()}>
      {children}
    </SectionErrorBoundaryInner>
  );
}
