import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` normalmente resuelve a un no-op solo bajo el
      // condition export "react-server" que activa el compilador de Next
      // para Server Components; Vitest no lo activa, así que sin este
      // alias cualquier archivo con `import "server-only"` lanzaría al
      // testear. Se apunta directo al no-op que trae el propio paquete.
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Igual que en la raíz: los tests nunca deben depender del .env.local
    // real de quien los ejecuta. DATABASE_URL lleva un valor dummy (nunca
    // se conecta de verdad: las funciones bajo test reciben sus
    // dependencias por inyección) solo para que Prisma no falle al
    // resolver el datasource si algún import transitivo llega a prisma.ts.
    env: {
      DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
      DASHBOARD_PASSWORD: "",
      GROQ_API_KEY: "",
      GEMINI_API_KEY: "",
    },
  },
});
