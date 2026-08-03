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

El dashboard **no tiene su propio modelo de datos**: usa el mismo
`prisma/schema.prisma` del bot (en la raíz del repo), con un segundo
generador de Prisma (`dashboardClient`) que genera un cliente propio en
`dashboard/node_modules/.prisma/client` — necesario porque el dashboard
es una app aparte, con su propio `node_modules`, sin *workspaces* npm
entre las dos. El script `postinstall` de este `package.json` lo genera
automáticamente al hacer `npm install`.

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
3. En **Environment Variables**, añade:
   - `DATABASE_URL` — la misma cadena de conexión que usa el bot
     (pooler de Supavisor, puerto 6543).
   - `DASHBOARD_PASSWORD` — una contraseña larga y propia de este
     dashboard (no reutilices otra).
4. Deploy. El `postinstall` genera el cliente de Prisma como parte del
   build; no hace falta ningún paso manual adicional.

> Aunque Root Directory esté fijado a `dashboard`, Vercel clona el
> repositorio completo — por eso `prisma generate --schema=../prisma/schema.prisma`
> (el `postinstall`) puede alcanzar el schema de la raíz sin problema.

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
