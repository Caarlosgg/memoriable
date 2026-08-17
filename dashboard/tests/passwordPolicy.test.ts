import { describe, expect, it } from "vitest";
import {
  validarPassword,
  evaluarRequisitos,
  calcularFuerza,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "../src/lib/passwordPolicy";

describe("evaluarRequisitos", () => {
  it("marca cada requisito por separado (es lo que pinta la lista que se va marcando sola)", () => {
    const requisitos = evaluarRequisitos("abcdefg1");
    expect(Object.fromEntries(requisitos.map((r) => [r.id, r.cumplido]))).toEqual({
      longitud: true,
      letra: true,
      numero: true,
      especial: false,
    });
  });

  it("el símbolo NO es obligatorio (recomendado): una contraseña sin él sigue siendo válida", () => {
    const especial = evaluarRequisitos("abcdefg1").find((r) => r.id === "especial");
    expect(especial?.obligatorio).toBe(false);
    expect(validarPassword("micontrasena9")).toBeNull();
  });

  it("cuenta letras con tilde y ñ como letra (no solo a-z)", () => {
    expect(evaluarRequisitos("ñññññññ1").find((r) => r.id === "letra")?.cumplido).toBe(true);
  });

  it("cuenta cualquier no-letra/no-dígito como símbolo, incluidos los de teclado español", () => {
    for (const symbol of ["!", "¿", "@", "-", "_", "·"]) {
      expect(evaluarRequisitos(`abcdefg1${symbol}`).find((r) => r.id === "especial")?.cumplido).toBe(true);
    }
  });
});

describe("validarPassword", () => {
  it("acepta una contraseña razonable", () => {
    expect(validarPassword("caldera8naranja")).toBeNull();
  });

  it("rechaza por debajo del mínimo", () => {
    expect(validarPassword("corta1")).toMatch(new RegExp(`${MIN_PASSWORD_LENGTH} caracteres`));
  });

  it("rechaza por encima del máximo (evita encarecer el hasheo con entradas gigantes)", () => {
    const gigante = `${"a".repeat(MAX_PASSWORD_LENGTH)}1`;
    expect(validarPassword(gigante)).toMatch(/no puede tener más de/);
  });

  it("exige combinar letras y números", () => {
    expect(validarPassword("abcdefghij")).toMatch(/letras y números/);
    expect(validarPassword("1234567890")).toMatch(/letras y números|demasiado común/);
  });

  it("rechaza contraseñas obvias aunque cumplan longitud y composición", () => {
    expect(validarPassword("password1")).toMatch(/demasiado común/);
    expect(validarPassword("qwerty123")).toMatch(/demasiado común/);
  });

  it("rechaza una variante trivial de una obvia (dígitos al final no la salvan)", () => {
    expect(validarPassword("madrid2024")).toMatch(/demasiado común/);
    expect(validarPassword("Barcelona99")).toMatch(/demasiado común/);
  });

  it("ignora tildes al comparar con la lista de obvias", () => {
    expect(validarPassword("contraseña1")).toMatch(/demasiado común/);
  });

  it("rechaza una contraseña derivada del propio email", () => {
    expect(validarPassword("benito12345", "benito@example.com")).toMatch(/no puede parecerse a tu email/);
  });

  it("no bloquea por una parte local del email demasiado corta (bloquearía casi todo)", () => {
    // "ana" dentro de "campana" no debe invalidar una contraseña legítima.
    expect(validarPassword("campana8naranja", "ana@example.com")).toBeNull();
  });

  it("sin email, no aplica la comprobación de email (cambio de contraseña desde /cuenta)", () => {
    expect(validarPassword("benito12345")).toBeNull();
  });
});

describe("calcularFuerza", () => {
  it("vacía es 0", () => {
    expect(calcularFuerza("")).toBe(0);
  });

  it("una contraseña obvia se marca como muy débil aunque sea larga", () => {
    expect(calcularFuerza("123456789")).toBe(1);
  });

  it("premia la longitud por encima de la variedad de símbolos", () => {
    const larga = calcularFuerza("calderanaranjaverde1");
    const cortaConSimbolos = calcularFuerza("Ab1!efg2");
    expect(larga).toBeGreaterThan(cortaConSimbolos);
  });

  it("nunca sale del rango 0-4", () => {
    for (const p of ["", "a", "abcdefg1", "a".repeat(60) + "1!", "Tr0ub4dor&3xyzabc"]) {
      const fuerza = calcularFuerza(p);
      expect(fuerza).toBeGreaterThanOrEqual(0);
      expect(fuerza).toBeLessThanOrEqual(4);
    }
  });
});
