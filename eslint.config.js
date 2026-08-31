import tseslint from "typescript-eslint";

export default tseslint.config(
  // dashboard/ es un proyecto npm APARTE, con su propio ESLint/React —
  // recorrerlo desde aquí choca con sus propias dependencias (versión
  // distinta de eslint-plugin-react). Se lintea desde dentro de dashboard/,
  // nunca desde la raíz.
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "dashboard/**", "landing/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Convención ya usada en dashboard/eslint.config.mjs: un
      // parámetro/variable con prefijo "_" es intencionadamente sin usar
      // (p. ej. el `_text` de NullEmbedder, que cumple una interfaz pero
      // no necesita el argumento).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
