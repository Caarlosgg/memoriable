# botPipeline — copia sincronizada del pipeline del bot

Los archivos de esta carpeta son copias de la lógica pura del bot
(`../../../../src/{ai,pipeline,db,logging}/*`): `processMessage`,
`sanitizeContent`, `GroqCategorizer`, `OfflineCategorizer`,
`ResilientCategorizer`, `GeminiEmbedder`/`NullEmbedder` y las interfaces
`Categorizer`/`Embedder`/`MessageRepository`.

## Por qué una copia y no un import directo

Se probó primero importar directamente desde `../../../src/...`. Falla en
Turbopack: el bot usa `"moduleResolution": "nodenext"` (imports con sufijo
`.js` obligatorio, p. ej. `from './types.js'`, aunque el archivo sea
`.ts` — así funciona `tsx` en Node real), mientras que el dashboard usa
`"moduleResolution": "bundler"` (imports sin sufijo). Turbopack no reescribe
`.js` → `.ts` al cruzar ese límite (no hay equivalente al `extensionAlias`
de webpack en su configuración), así que cualquier import compartido con
sufijo `.js` rompe el build del dashboard con "Module not found".

Ampliar `turbopack.root` al monorepo (ver `next.config.ts`) resuelve que
Turbopack pueda LEER los archivos de `../../../src/`, pero no resuelve el
choque de convenciones de extensión — y reescribir todos los imports internos
del bot a `bundler` rompería `tsx`/Node en el propio bot. De ahí la copia.

## Cómo mantenerla sincronizada

Si cambias alguno de estos archivos en el bot, replica el cambio aquí (y
viceversa). Son pocos y estables: la lógica de categorización, saneado y
orquestación del pipeline no cambia a menudo. `resolveCategorizer()`,
`resolveEmbedder()` y `DashboardMessageRepository` en `../pipeline.ts` son
las ÚNICAS piezas genuinamente propias del dashboard (el cliente de Groq,
el de Gemini y el Prisma son suyos); todo lo demás en esta carpeta debería
ser un calco byte a byte de su homólogo en `src/`.

No se copió `BudgetedCategorizer`: su fusible de coste persiste en un
fichero local pensado para un proceso de larga duración, algo sin sentido en
el modelo serverless del dashboard.
