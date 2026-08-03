# Landing page de MemorIAble

Página única en HTML + CSS puro (sin build, sin framework, sin JavaScript).
Todo está en un solo archivo (`index.html`) para que cargue lo más rápido
posible: cero peticiones externas, cero dependencias.

## Antes de publicarla

Sustituye el enlace de ejemplo del formulario por el real. Aparece dos veces
en `index.html`, búscalo así:

```bash
grep -n "PEGA-AQUI-TU-FORMULARIO" index.html
```

Cambia `https://forms.gle/PEGA-AQUI-TU-FORMULARIO` por la URL de tu Google
Form en ambos sitios (el botón del hero y el del footer).

## Desplegar en Vercel (sin backend)

Esta carpeta es un sitio estático — no necesita servidor, base de datos ni
variables de entorno.

### Opción A — desde el dashboard de Vercel (recomendado)

1. Entra en [vercel.com](https://vercel.com) e inicia sesión con tu cuenta de
   GitHub.
2. **Add New… → Project** y elige el repositorio `memoriable`.
3. En **Root Directory**, pulsa "Edit" y selecciona `landing`.
4. En **Framework Preset**, elige **Other** (no hay build, es HTML plano).
   Deja "Build Command" y "Output Directory" vacíos/por defecto.
5. **Deploy**. En unos segundos tienes una URL pública
   (`memoriable.vercel.app` o similar).

Cada `git push` a `main` que toque algo dentro de `landing/` vuelve a
desplegar automáticamente.

### Opción B — con la CLI de Vercel

```bash
npm install -g vercel   # una vez, si no la tienes
cd landing
vercel --prod
```

La CLI detecta que es un sitio estático y no pide configuración adicional.

## Dominio propio (opcional)

Desde el proyecto en Vercel: **Settings → Domains** → añade tu dominio y
sigue las instrucciones de DNS que te da Vercel.

## Editar el contenido

Todo — textos, colores, animación de la conversación de ejemplo — está en
`index.html`. No hay pasos de compilación: guarda el archivo y recarga el
navegador para ver los cambios.
