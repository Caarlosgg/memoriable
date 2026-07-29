/**
 * Marca visual compartida por los cuatro tamaños de icono que necesita la
 * PWA (favicon, apple-touch-icon, y los 192/512 del manifest). Un solo sitio
 * para no repetir cuatro veces el mismo <div> con estilos ligeramente
 * distintos.
 */
export function AppIconMark({ fontSize }: { fontSize: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#4f46e5",
        color: "white",
        fontFamily: "sans-serif",
        fontWeight: 700,
        fontSize,
      }}
    >
      M
    </div>
  );
}
