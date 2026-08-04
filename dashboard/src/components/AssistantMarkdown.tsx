import ReactMarkdown, { type Components } from "react-markdown";
import { Children, isValidElement, type ReactNode } from "react";

/**
 * Durante el streaming, `AssistantMarkdown` re-parsea el markdown parcial en
 * cada chunk. Una lista que va llegando palabra a palabra pasa por un
 * instante en el que solo ha llegado "- " (marcador sin texto todavía) —
 * CommonMark lo interpreta como un `<li>` válido pero vacío, y con
 * `list-disc` eso se ve como una viñeta vacía hasta que llega el resto del
 * texto. Se autocorrige solo, pero el parpadeo es visible en uso real.
 */
export function isBlank(node: ReactNode): boolean {
  if (node == null || typeof node === "boolean") return true;
  if (typeof node === "string" || typeof node === "number") return String(node).trim() === "";
  if (Array.isArray(node)) return node.every(isBlank);
  if (isValidElement<{ children?: ReactNode }>(node)) return isBlank(node.props.children);
  return true;
}

/**
 * Estilos propios para el markdown del Asistente (negrita, listas, enlaces):
 * sin esto, react-markdown usa los estilos por defecto del navegador, que
 * no encajan con la paleta/tipografía del resto del dashboard. Deliberadamente
 * mínimo — el Asistente no necesita tablas, código con resaltado, etc.
 */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="[&:not(:first-child)]:mt-2">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="mt-1.5 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-1.5 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => (Children.toArray(children).every(isBlank) ? null : <li>{children}</li>),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline hover:text-accent-strong">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-accent-soft px-1 py-0.5 font-mono text-[0.85em] text-accent-strong">{children}</code>
  ),
};

export function AssistantMarkdown({ text }: { text: string }) {
  return <ReactMarkdown components={COMPONENTS}>{text}</ReactMarkdown>;
}
