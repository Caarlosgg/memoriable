# 🚀 Puesta en marcha en 5 minutos

Sigue estos pasos en orden. No hace falta entender el código para llegar al
final funcionando.

## 1. Clona el repositorio

```bash
git clone https://github.com/Caarlosgg/memoria-ia.git
cd memoria-ia
```

## 2. Instala las dependencias

```bash
npm install
```

## 3. Prueba que funciona (sin ninguna clave)

Esto ya te sirve para ver el proyecto funcionando sin cuentas ni claves:

```bash
npm run simulate -- "Recuérdame comprar pan mañana"
```

Deberías ver algo como:

```
📨 Mensaje entrante: "Recuérdame comprar pan mañana"
🧪 Sin ANTHROPIC_API_KEY: usando categorizador heurístico offline.

✅ Resultado del pipeline:
   id:        mem_1
   tipo:      text
   categoría: recordatorio
   resumen:   Recuérdame comprar pan mañana
   fecha:     2026-07-27T21:29:30.227Z
```

Si ves esto, todo lo demás va a funcionar. Sigue al paso 4 solo si quieres el
bot real conectado a Telegram, Claude y una base de datos.

## 4. Configura las variables de entorno

```bash
cp .env.example .env
```

Abre `.env` y rellena estas tres líneas (cada una es gratis de conseguir):

| Variable | Qué es | Dónde conseguirla gratis |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | El token de tu bot de Telegram | Habla con [@BotFather](https://t.me/BotFather) en Telegram, envía `/newbot` y sigue las instrucciones. Te da un token tipo `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `ANTHROPIC_API_KEY` | La clave para usar Claude (categoriza y resume) | Crea una cuenta en [console.anthropic.com](https://console.anthropic.com) → **Settings → API keys → Create key** |
| `DATABASE_URL` | La cadena de conexión de tu base de datos PostgreSQL | Crea una cuenta gratis en [supabase.com](https://supabase.com) → crea un proyecto → **Project Settings → Database → Connection string → URI** (sustituye `[YOUR-PASSWORD]` por la contraseña que elegiste) |

No necesitas rellenar las tres a la vez. Si dejas alguna vacía, esa parte
concreta no arranca, pero el resto del proyecto sigue funcionando.

## 5. Prepara la base de datos

Solo si rellenaste `DATABASE_URL`:

```bash
npm run prisma:generate
npm run prisma:deploy
```

Esto crea el cliente de Prisma y la tabla `messages` en tu base de datos.
(Usa `prisma:deploy`, no `prisma:migrate`: `deploy` aplica la migración ya
preparada sin shadow DB ni prompts, que es lo que necesita este flujo contra
Supabase.)

**Con Supabase necesitas dos URLs.** La conexión va por el **pooler de
Supavisor** y Prisma **no puede migrar en modo transacción** (las migraciones
requieren una sesión completa), así que se separan:

| Variable       | Uso                    | Puerto | Modo        |
| -------------- | ---------------------- | ------ | ----------- |
| `DATABASE_URL` | Runtime del bot        | `6543` | transacción |
| `DIRECT_URL`   | Migraciones (`prisma`) | `5432` | sesión      |

```bash
# Mismo host (aws-0-<region>.pooler.supabase.com) y usuario postgres.<ref>
DATABASE_URL="postgresql://postgres.<ref>:PASSWORD@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<ref>:PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

## 6. Arranca el bot

```bash
npm run dev
```

Verás en la consola si cada pieza (Telegram, Claude, base de datos) está
configurada o no. Si todo está bien, abre Telegram, busca tu bot y
escríbele cualquier mensaje — te responderá con una tarjeta indicando
categoría, resumen y fecha.

Para pararlo: `Ctrl+C`.

---

## ¿Y ahora qué?

- **`npm run simulate -- "texto"`** — para probar el pipeline sin gastar
  llamadas a Telegram ni a Claude.
- **`npm test`** — corre toda la batería de tests (no necesita ninguna clave).
- **[README.md](./README.md)** — explica qué hace el proyecto y cómo está
  organizado.
- **[CLAUDE.md](./CLAUDE.md)** — las reglas fijas del proyecto (para quien
  vaya a tocar código).
- **[ROADMAP.md](./ROADMAP.md)** — hacia dónde va esto.

## ¿Algo no funciona?

- **"Falta la variable de entorno..."** — el mensaje de error te dice
  exactamente qué variable falta y cómo conseguirla. Revisa tu `.env`.
- **El bot no responde en Telegram** — comprueba que `TELEGRAM_BOT_TOKEN` es
  correcto y que dejaste `npm run dev` corriendo en la terminal.
- **Error de conexión a la base de datos** — revisa que copiaste la cadena de
  `DATABASE_URL` completa, con la contraseña ya sustituida (sin `[YOUR-PASSWORD]`
  literal).
