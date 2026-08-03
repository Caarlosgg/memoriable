import ReactMarkdown, { type Components } from "react-markdown";

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
  li: ({ children }) => <li>{children}</li>,
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
