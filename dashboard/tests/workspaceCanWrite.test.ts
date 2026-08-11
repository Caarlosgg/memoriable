import { describe, expect, it } from "vitest";
import { canWrite } from "../src/lib/workspace";

describe("canWrite", () => {
  it("VIEWER no puede escribir", () => {
    expect(canWrite("VIEWER")).toBe(false);
  });

  it("OWNER, ADMIN y MEMBER sí pueden escribir", () => {
    expect(canWrite("OWNER")).toBe(true);
    expect(canWrite("ADMIN")).toBe(true);
    expect(canWrite("MEMBER")).toBe(true);
  });
});
