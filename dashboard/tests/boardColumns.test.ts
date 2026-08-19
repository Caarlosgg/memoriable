import { describe, expect, it } from "vitest";
import {
  resolverColumnas,
  columnaDeTarjeta,
  faseDeColumna,
  columnaDeDragId,
  COLUMN_DRAG_PREFIX,
} from "../src/lib/boardColumns";

describe("resolverColumnas", () => {
  it("sin columnas propias devuelve las tres de siempre, con el id del enum", () => {
    const columnas = resolverColumnas([]);
    expect(columnas.map((c) => c.id)).toEqual([
      "POR_HACER",
      "EN_PROGRESO",
      "HECHO",
    ]);
    expect(columnas.every((c) => !c.esPersonalizada)).toBe(true);
    // El id sigue siendo el valor del enum: así un tablero que nunca se ha
    // tocado se comporta exactamente igual que antes de que esto existiera.
    expect(columnas.map((c) => c.fase)).toEqual([
      "POR_HACER",
      "EN_PROGRESO",
      "HECHO",
    ]);
  });

  it("aplica los nombres personalizados de siempre a las columnas por defecto", () => {
    const columnas = resolverColumnas([], { POR_HACER: "Pedidos" });
    expect(columnas[0]!.nombre).toBe("Pedidos");
    // Las que no se han renombrado mantienen su etiqueta por defecto.
    expect(columnas[2]!.nombre).toBe("Hecho");
  });

  it("con columnas propias manda su orden, no el del enum", () => {
    const columnas = resolverColumnas([
      { id: "c3", nombre: "Hecho", orden: 2, fase: "HECHO" },
      { id: "c1", nombre: "Pedidos", orden: 0, fase: "POR_HACER" },
      { id: "c2", nombre: "En horno", orden: 1, fase: "EN_PROGRESO" },
    ]);
    expect(columnas.map((c) => c.nombre)).toEqual([
      "Pedidos",
      "En horno",
      "Hecho",
    ]);
    expect(columnas.every((c) => c.esPersonalizada)).toBe(true);
  });

  it("admite VARIAS columnas de la misma fase — es el motivo de todo esto", () => {
    const columnas = resolverColumnas([
      { id: "c1", nombre: "Por hacer", orden: 0, fase: "POR_HACER" },
      { id: "c2", nombre: "En diseño", orden: 1, fase: "EN_PROGRESO" },
      { id: "c3", nombre: "En revisión", orden: 2, fase: "EN_PROGRESO" },
      { id: "c4", nombre: "Hecho", orden: 3, fase: "HECHO" },
    ]);
    expect(columnas.filter((c) => c.fase === "EN_PROGRESO")).toHaveLength(2);
  });
});

describe("columnaDeTarjeta", () => {
  const porDefecto = resolverColumnas([]);
  const propias = resolverColumnas([
    { id: "c1", nombre: "Por hacer", orden: 0, fase: "POR_HACER" },
    { id: "c2", nombre: "En diseño", orden: 1, fase: "EN_PROGRESO" },
    { id: "c3", nombre: "En revisión", orden: 2, fase: "EN_PROGRESO" },
    { id: "c4", nombre: "Hecho", orden: 3, fase: "HECHO" },
  ]);

  it("sin columna propia, cae en la columna por defecto de su fase", () => {
    expect(
      columnaDeTarjeta(
        { estado: "EN_PROGRESO", boardStatusId: null },
        porDefecto,
      ),
    ).toBe("EN_PROGRESO");
  });

  it("con columna propia, manda esa", () => {
    expect(
      columnaDeTarjeta({ estado: "EN_PROGRESO", boardStatusId: "c3" }, propias),
    ).toBe("c3");
  });

  it("si su columna ya no existe (borrada), cae en la PRIMERA de su fase — nunca desaparece", () => {
    // Es lo que deja el ON DELETE SET NULL de la migración, y también el
    // caso de una tarjeta cuya columna se borró mientras estaba en pantalla.
    expect(
      columnaDeTarjeta(
        { estado: "EN_PROGRESO", boardStatusId: "borrada" },
        propias,
      ),
    ).toBe("c2");
  });

  it("si no queda ninguna columna de su fase, va a la primera que haya en vez de a ninguna", () => {
    const soloHecho = resolverColumnas([
      { id: "x", nombre: "Hecho", orden: 0, fase: "HECHO" },
    ]);
    expect(
      columnaDeTarjeta({ estado: "POR_HACER", boardStatusId: null }, soloHecho),
    ).toBe("x");
  });
});

describe("faseDeColumna", () => {
  const propias = resolverColumnas([
    { id: "c1", nombre: "Por hacer", orden: 0, fase: "POR_HACER" },
    { id: "c2", nombre: "En revisión", orden: 1, fase: "EN_PROGRESO" },
  ]);

  it("da la fase que se guardará en `estado` al soltar ahí", () => {
    // Lo que mantiene coherente al resto de la app: una tarjeta en "En
    // revisión" es EN_PROGRESO para las cifras, el Asistente y los avisos.
    expect(faseDeColumna("c2", propias)).toBe("EN_PROGRESO");
  });

  it("null ante una columna que no existe, en vez de adivinar una fase", () => {
    expect(faseDeColumna("inventada", propias)).toBeNull();
  });
});

describe("resolverColumnas — cambio de identidad al crear la primera columna propia", () => {
  it("los ids cambian ENTEROS al pasar de las por defecto a las propias", () => {
    // Este es el motivo por el que KanbanBoard tiene que resincronizar sus
    // tarjetas cuando cambia el juego de columnas (ver la firma de columnas
    // en KanbanBoard.tsx). No es que se añada un id: es que se van TODOS.
    // Un tablero que guardara sus tarjetas indexadas por el id anterior se
    // queda sin ninguna coincidencia de golpe — y por tanto en blanco.
    const antes = resolverColumnas([]);
    const despues = resolverColumnas([
      { id: "ck1", nombre: "Por hacer", orden: 0, fase: "POR_HACER" },
      { id: "ck2", nombre: "En progreso", orden: 1, fase: "EN_PROGRESO" },
      { id: "ck3", nombre: "Hecho", orden: 2, fase: "HECHO" },
      { id: "ck4", nombre: "En revisión", orden: 3, fase: "EN_PROGRESO" },
    ]);

    expect(antes.map((c) => c.id)).toEqual([
      "POR_HACER",
      "EN_PROGRESO",
      "HECHO",
    ]);
    const idsDespues = new Set(despues.map((c) => c.id));
    for (const c of antes) expect(idsDespues.has(c.id)).toBe(false);
  });
});

describe("columnaDeDragId", () => {
  it("distingue el arrastre de una COLUMNA del de una tarjeta", () => {
    // El prefijo existe porque el id pelado de la columna ya lo ocupa su
    // zona de destino: sin él, dnd-kit tendría el mismo id como origen y
    // como destino. De paso es lo que deja al tablero saber, sin consultar
    // ninguna lista, si lo que viaja es una tarjeta o una columna.
    expect(columnaDeDragId(`${COLUMN_DRAG_PREFIX}ck1`)).toBe("ck1");
    expect(columnaDeDragId("ck1")).toBeNull();
  });

  it("un id de tarjeta que empiece por algo parecido no se confunde", () => {
    expect(columnaDeDragId("colaborador-123")).toBeNull();
  });
});
