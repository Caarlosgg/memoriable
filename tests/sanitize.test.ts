import { describe, expect, it } from 'vitest';
import {
  InvalidMessageError,
  MAX_CONTENT_LENGTH,
  sanitizeContent,
} from '../src/pipeline/sanitize.js';

/** Caracteres especiales construidos por código: escritos como literales serían invisibles. */
const NUL = String.fromCharCode(0x00);
const BEL = String.fromCharCode(0x07);
const ESC = String.fromCharCode(0x1b);
const BOM = String.fromCharCode(0xfeff);
const ZWSP = String.fromCharCode(0x200b);
const HIGH_SURROGATE = String.fromCharCode(0xd800);
const COMBINING_ACUTE = String.fromCharCode(0x0301);

describe('sanitizeContent', () => {
  it('deja intacto un mensaje normal', () => {
    const out = sanitizeContent('Comprar pan y leche');
    expect(out.contenido).toBe('Comprar pan y leche');
    expect(out.truncated).toBe(false);
  });

  it('rechaza contenido vacío o solo espacios', () => {
    for (const entrada of ['', '   ', '\n\n\t  ']) {
      expect(() => sanitizeContent(entrada)).toThrow(InvalidMessageError);
    }
  });

  it('rechaza contenido que no es texto', () => {
    for (const entrada of [null, undefined, 42, {}, []]) {
      expect(() => sanitizeContent(entrada)).toThrow(InvalidMessageError);
    }
  });

  it('rechaza un mensaje formado solo por caracteres invisibles', () => {
    expect(() => sanitizeContent(`${BOM}${ZWSP}${NUL}`)).toThrow(InvalidMessageError);
  });

  it('expone el motivo del rechazo', () => {
    expect.assertions(2);
    try {
      sanitizeContent('   ');
    } catch (err) {
      expect((err as InvalidMessageError).reason).toBe('empty');
    }
    try {
      sanitizeContent(123);
    } catch (err) {
      expect((err as InvalidMessageError).reason).toBe('not_text');
    }
  });

  it('trunca mensajes gigantes al límite', () => {
    const gigante = 'a'.repeat(50_000);
    const out = sanitizeContent(gigante);

    expect(out.truncated).toBe(true);
    expect(out.length).toBeLessThanOrEqual(MAX_CONTENT_LENGTH);
    expect(out.originalLength).toBe(50_000);
    expect(out.contenido.endsWith('…')).toBe(true);
  });

  it('no trunca justo en el límite', () => {
    const out = sanitizeContent('a'.repeat(MAX_CONTENT_LENGTH));
    expect(out.truncated).toBe(false);
    expect(out.length).toBe(MAX_CONTENT_LENGTH);
  });

  it('elimina caracteres de control pero conserva saltos y tabuladores', () => {
    const out = sanitizeContent(`hola${NUL}${BEL}${ESC}mundo\nsegunda\tlínea`);
    expect(out.contenido).toBe('holamundo\nsegunda\tlínea');
  });

  it('elimina caracteres de anchura cero y BOM', () => {
    const out = sanitizeContent(`${BOM}ho${ZWSP}la`);
    expect(out.contenido).toBe('hola');
  });

  it('elimina surrogates sueltos sin romper los emoji válidos', () => {
    const out = sanitizeContent(`hola ${HIGH_SURROGATE} mundo 👍`);
    expect(out.contenido).toContain('👍');
    expect(out.contenido).not.toContain(HIGH_SURROGATE);
    expect(() => JSON.stringify(out.contenido)).not.toThrow();
  });

  it('no parte un emoji por la mitad al truncar', () => {
    const out = sanitizeContent('👍'.repeat(5000));
    expect(out.truncated).toBe(true);
    // Un emoji partido dejaría un surrogate suelto y el round-trip fallaría.
    expect(JSON.parse(JSON.stringify(out.contenido))).toBe(out.contenido);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out.contenido)).toBe(false);
  });

  it('normaliza saltos de línea y colapsa repeticiones', () => {
    const out = sanitizeContent('a\r\nb\n\n\n\nc     d');
    expect(out.contenido).toBe('a\nb\n\nc d');
  });

  it('normaliza a NFC (acentos compuestos)', () => {
    // "cafe" + acento combinante (NFD) debe quedar como "café" (NFC, 4 chars).
    const out = sanitizeContent('cafe' + COMBINING_ACUTE);
    expect(out.contenido).toBe('café');
    expect(out.contenido).toHaveLength(4);
  });
});
