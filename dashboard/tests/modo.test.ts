import { describe, expect, it } from "vitest";
import { modoDe, MODO_PRESENTATION } from "../src/lib/modo";
import { NAV_ITEMS, navItemsDeModo } from "../src/components/nav/navItems";

describe("modoDe", () => {
  it("traduce el booleano del workspace activo al modo", () => {
    expect(modoDe(true)).toBe("personal");
    expect(modoDe(false)).toBe("equipo");
  });
});

describe("MODO_PRESENTATION", () => {
  it("cada modo tiene icono y acento DISTINTOS — es lo que hace que cambiar se note", () => {
    // El fallo que arregla: antes el selector usaba el mismo icono para tu
    // espacio y para un equipo, así que cambiar de contexto no se veía.
    expect(MODO_PRESENTATION.personal.Icon).not.toBe(MODO_PRESENTATION.equipo.Icon);
    expect(MODO_PRESENTATION.personal.acento).not.toBe(MODO_PRESENTATION.equipo.acento);
  });

  it("dice de quién es cada espacio, no solo cómo se llama", () => {
    expect(MODO_PRESENTATION.personal.descripcion).toMatch(/solo tú/i);
    expect(MODO_PRESENTATION.equipo.descripcion).toMatch(/equipo/i);
  });
});

describe("navItemsDeModo", () => {
  it("Ahorros ya no está en el menú: no encaja en «la memoria de trabajo de tu equipo»", () => {
    // La ruta y los datos siguen intactos (se llega por URL directa), pero
    // deja de ser producto — ver el plan de producto. Este test lo fija para
    // que no vuelva a colarse en el menú por error.
    expect(navItemsDeModo("personal").map((i) => i.href)).not.toContain("/ahorros");
    expect(navItemsDeModo("equipo").map((i) => i.href)).not.toContain("/ahorros");
  });

  it("Equipo solo en modo equipo: en personal no hay plantilla que gestionar", () => {
    expect(navItemsDeModo("equipo").map((i) => i.href)).toContain("/equipo");
    expect(navItemsDeModo("personal").map((i) => i.href)).not.toContain("/equipo");
  });

  it("el chat ya no es un destino: la comunicación del equipo vive en los comentarios", () => {
    // Se retiró del producto (ver el modelo Comentario en schema.prisma) —
    // este test lo fija para que no vuelva a colarse por error.
    expect(navItemsDeModo("personal").map((i) => i.href)).not.toContain("/chat");
    expect(navItemsDeModo("equipo").map((i) => i.href)).not.toContain("/chat");
  });

  it("los cuatro básicos están siempre, se esté donde se esté", () => {
    for (const modo of ["personal", "equipo"] as const) {
      const hrefs = navItemsDeModo(modo).map((i) => i.href);
      expect(hrefs).toEqual(expect.arrayContaining(["/inicio", "/asistente", "/pendientes", "/calendario"]));
    }
  });

  it("ningún destino se queda sin modo (quedaría inalcanzable desde el menú)", () => {
    for (const item of NAV_ITEMS) {
      expect(item.modos.length, `${item.href} no declara ningún modo`).toBeGreaterThan(0);
    }
  });

  it("en móvil caben 4 + «Más» en los dos modos, sin apretujar etiquetas", () => {
    // BottomTabs recorta a MAX_TABS_MOVIL, pero si un modo tuviera MENOS de
    // 4 candidatos la barra quedaría coja — esto lo detecta antes.
    for (const modo of ["personal", "equipo"] as const) {
      const enMovil = navItemsDeModo(modo).filter((i) => i.enMovil);
      expect(enMovil.length, `${modo} tiene pocos destinos en móvil`).toBeGreaterThanOrEqual(4);
    }
  });
});
