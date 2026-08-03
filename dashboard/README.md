# 📊 Dashboard — MemorIAble

Dashboard web del bot de Telegram [MemorIAble](../README.md): consulta,
busca y gestiona tus mensajes categorizados desde el navegador (o
instalado como app en el móvil). Next.js (App Router) + TypeScript +
Tailwind, con su propio despliegue en Vercel, independiente del bot.

## ¿Qué hace?

- **Login** por contraseña (`DASHBOARD_PASSWORD`), con cookie de sesión
  firmada.
- **Vista principal por categorías**, con skeletons de carga y estados
  vacíos con mensaje útil.
- **Buscador en tiempo real** (debounce) con highlight del término
  encontrado.
- **Pendientes**: marca tareas/recordatorios como hechos, con contador
  visible.
- **Instalable como PWA** (Add to Home Screen en iPhone, abre a
  pantalla completa).
- **Cada sección tiene su propio estado de error** con botón
  Reintentar: un fallo puntual (p. ej. la búsqueda) no rompe el resto.
- **Aviso de sin conexión**, no intrusivo.

No incluye (fuera de alcance, ver el README del bot →
[ROADMAP.md](../ROADMAP.md)): búsqueda semántica, más de un usuario,
edición de mensajes.

## Cómo reutiliza los datos del bot

El dashboard mantiene su **propia copia** del schema de Prisma en
`dashboard/prisma/schema.prisma` — mismo modelo `Message` y mismo
`datasource` que `prisma/schema.prisma` (la raíz, fuente de verdad para
las migraciones), pero como archivo físico separado, no como un segundo
generador del schema compartido.

Antes había un segundo generador en el schema de la raíz (`output`
apuntando a `dashboard/node_modules/.prisma/client`), pensado para no
duplicar el modelo. Se descartó porque Prisma resuelve `@prisma/client`/
`prisma` recorriendo los directorios **ancestros** del propio
`schema.prisma`, nunca directorios hermanos: ese generador necesitaba
encontrar un `node_modules` en la raíz del repo. En Vercel, con **Root
Directory** fijado a `dashboard`, el `npm install` de la raíz nunca se
ejecuta — no existe ese `node_modules` — así que Prisma intentaba
auto-instalarse a mitad del build (`npm i prisma@... -D --silent`) y esa
instalación anidada fallaba con `Command failed with exit code 1`.

Con el schema copiado dentro de `dashboard/prisma/`, la resolución sube
desde ahí hasta `dashboard/node_modules` — que sí existe siempre, tanto
en local como en Vercel — sin auto-instalar nada. El coste es mantener
sincronizados a mano los dos archivos si cambia el modelo `Message`; dado
que es un modelo pequeño y estable, es un precio razonable a cambio de
un build que no depende de la raíz del repo.

El `postinstall` de este `package.json` corre `prisma generate`
automáticamente al hacer `npm install` (con
`PRISMA_GENERATE_SKIP_AUTOINSTALL=1` como salvaguarda: si algún día algo
rompe la resolución de nuevo, falla con un error claro en vez de intentar
un `npm install` anidado silencioso).

El dashboard **nunca ejecuta migraciones**: eso lo sigue haciendo solo
el bot (`npm run prisma:deploy` en la raíz). Aquí solo se lee y se
actualiza el campo `hecho`.

## Desarrollo local

```bash
npm install               # también genera el cliente de Prisma (postinstall)
cp .env.example .env.local
# rellena DATABASE_URL (la misma cadena que usa el bot) y DASHBOARD_PASSWORD
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). El service worker
**no se registra en desarrollo** (interferiría con el hot-reload); para
probarlo de verdad hace falta un build de producción:

```bash
npm run build && npm start
```

### Variables de entorno

| Variable             | Uso                                              | Obligatoria |
| --------------------- | ------------------------------------------------- | ----------- |
| `DATABASE_URL`        | Conexión a PostgreSQL (la misma que usa el bot)    | Sí          |
| `DASHBOARD_PASSWORD`  | Contraseña de acceso; también firma la cookie de sesión (si rota, las sesiones activas dejan de valer) | Sí |

No hace falta `DIRECT_URL` aquí: esa variable es solo para migraciones,
y el dashboard no migra.

### Comandos

- `npm run dev` — servidor de desarrollo (Turbopack).
- `npm run build` — build de producción.
- `npm start` — arranca el build de producción.
- `npm run lint` — ESLint.

## Despliegue en Vercel

Este repo tiene el bot en la raíz y el dashboard en `dashboard/`: hay
que decirle a Vercel dónde vive el proyecto de Next.js.

1. En [vercel.com/new](https://vercel.com/new), importa el repositorio.
2. En **Root Directory**, selecciona `dashboard`. Vercel detecta
   Next.js automáticamente (no hace falta tocar el build command).
   No hace falta marcar "Include source files outside of the Root
   Directory": el dashboard es autocontenido (su propia copia del
   schema vive en `dashboard/prisma/`, ver más arriba), así que Vercel
   no necesita nada fuera de `dashboard/` para instalar ni compilar.
3. En **Environment Variables**, añade:
   - `DATABASE_URL` — la misma cadena de conexión que usa el bot
     (pooler de Supavisor, puerto 6543).
   - `DASHBOARD_PASSWORD` — una contraseña larga y propia de este
     dashboard (no reutilices otra).
4. Deploy. El `postinstall` genera el cliente de Prisma como parte del
   build; no hace falta ningún paso manual adicional.

### Instalar en el iPhone

Con el dashboard ya desplegado (HTTPS, que Vercel da por defecto):

1. Abre la URL en Safari.
2. Entra con la contraseña.
3. Toca el icono de compartir (⎋) → **Añadir a pantalla de inicio**.

Se abre a pantalla completa, sin la barra de Safari, con su propio
icono.

## Estructura

```
dashboard/
├── prisma/
│   └── schema.prisma       # copia propia (ver "Cómo reutiliza los datos del bot")
├── src/
│   ├── app/
│   │   ├── (dashboard)/    # rutas protegidas: layout con verifySession() + logout
│   │   ├── login/          # público
│   │   ├── api/search/     # Route Handler protegido (JSON, no redirige)
│   │   ├── manifest.ts     # PWA
│   │   ├── icon.tsx, apple-icon.tsx, icons/192|512/  # iconos generados
│   │   └── layout.tsx
│   ├── components/         # secciones de la página + límites de error
│   ├── lib/                 # datos (Prisma), sesión, categorías, etc.
│   └── proxy.ts             # antes "middleware.ts" (Next.js 16 lo renombró)
└── public/sw.js              # cachea solo el shell estático, nunca datos
```
