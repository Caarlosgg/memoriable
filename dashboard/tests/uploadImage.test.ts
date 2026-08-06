import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/dal", () => ({ verifySession: async () => "u1" }));

const put = vi.fn();
vi.mock("@vercel/blob", () => ({ put: (...args: unknown[]) => put(...args) }));

function fakeImageFile(overrides: Partial<{ type: string; size: number }> = {}): File {
  const type = overrides.type ?? "image/png";
  const size = overrides.size ?? 1024;
  const bytes = new Uint8Array(size);
  return new File([bytes], "captura.png", { type });
}

describe("uploadImage", () => {
  beforeEach(() => {
    put.mockReset();
    put.mockResolvedValue({ url: "https://blob.vercel-storage.com/notas/u1/abc.png" });
  });

  it("rechaza si no hay fichero", async () => {
    const { uploadImage } = await import("../src/app/(dashboard)/actions");
    const result = await uploadImage(new FormData());
    expect(result.error).toMatch(/ningún fichero/);
    expect(put).not.toHaveBeenCalled();
  });

  it("rechaza un tipo de fichero que no es imagen", async () => {
    const fd = new FormData();
    fd.set("file", new File(["hola"], "doc.pdf", { type: "application/pdf" }));
    const { uploadImage } = await import("../src/app/(dashboard)/actions");
    const result = await uploadImage(fd);
    expect(result.error).toMatch(/solo se admiten imágenes/i);
    expect(put).not.toHaveBeenCalled();
  });

  it("rechaza una imagen demasiado grande (> 8 MB)", async () => {
    const fd = new FormData();
    fd.set("file", fakeImageFile({ size: 9 * 1024 * 1024 }));
    const { uploadImage } = await import("../src/app/(dashboard)/actions");
    const result = await uploadImage(fd);
    expect(result.error).toMatch(/pesa demasiado/);
    expect(put).not.toHaveBeenCalled();
  });

  it("sube la imagen bajo notas/<userId>/ y devuelve la URL pública", async () => {
    const fd = new FormData();
    fd.set("file", fakeImageFile());
    const { uploadImage } = await import("../src/app/(dashboard)/actions");
    const result = await uploadImage(fd);

    expect(put).toHaveBeenCalledWith(
      expect.stringMatching(/^notas\/u1\/.+\.png$/),
      expect.anything(),
      { access: "public" },
    );
    expect(result.url).toBe("https://blob.vercel-storage.com/notas/u1/abc.png");
  });

  it("sin BLOB_READ_WRITE_TOKEN (put lanza), devuelve un error legible en vez de una excepción cruda", async () => {
    put.mockRejectedValue(new Error("Missing BLOB_READ_WRITE_TOKEN"));
    const fd = new FormData();
    fd.set("file", fakeImageFile());
    const { uploadImage } = await import("../src/app/(dashboard)/actions");
    const result = await uploadImage(fd);
    expect(result.error).toMatch(/no se ha podido subir/i);
  });
});
