/** Código de barras Code 128 (juegos B y C), sin librerías: devuelve los anchos de barras y espacios. */

// Anchos (barra, espacio, barra, espacio, barra, espacio) de los valores 0 a 105; el 106 es el de parada.
const PATTERNS = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 " +
  "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 " +
  "232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 " +
  "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 " +
  "111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 " +
  "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112"
).split(" ");

export const START_B = 104;
export const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;
export const QUIET = 10;

export function patterns(): string[] {
  return PATTERNS;
}

function digitRun(text: string, i: number): number {
  let n = 0;
  while (i + n < text.length && text.charCodeAt(i + n) >= 48 && text.charCodeAt(i + n) <= 57) n++;
  return n;
}

/** Valores del código, con el de inicio y el de control (sin el de parada). Pasa a juego C en tramos de dígitos. */
export function encodeValues(text: string): number[] {
  if (!text) throw new Error("El código está vacío.");
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error("El código solo puede tener letras, números y signos comunes.");
  }
  const values: number[] = [];
  let mode: "B" | "C";
  let i = 0;
  const lead = digitRun(text, 0);
  if (lead >= 4 && (lead === text.length || lead >= 6)) {
    mode = "C";
    values.push(START_C);
  } else {
    mode = "B";
    values.push(START_B);
  }
  while (i < text.length) {
    const run = digitRun(text, i);
    const toC = run >= 4 && (i + run === text.length || run >= 6);
    if (mode === "C") {
      if (run >= 2) {
        values.push(Number(text.slice(i, i + 2)));
        i += 2;
        continue;
      }
      values.push(CODE_B);
      mode = "B";
    }
    if (toC) {
      // con un número impar de dígitos, el primero se queda en B
      if (run % 2 === 1) {
        values.push(text.charCodeAt(i) - 32);
        i++;
      }
      values.push(CODE_C);
      mode = "C";
      continue;
    }
    values.push(text.charCodeAt(i) - 32);
    i++;
  }
  const check = values.reduce((s, v, k) => s + v * (k === 0 ? 1 : k), 0) % 103;
  values.push(check);
  return values;
}

/** Anchos alternados barra/espacio (empieza con barra), en módulos, sin zona de silencio. */
export function encodeWidths(text: string): number[] {
  const out: number[] = [];
  for (const v of [...encodeValues(text), STOP]) for (const d of PATTERNS[v]) out.push(Number(d));
  return out;
}

/** Barras como rectángulos [x, ancho] en módulos, ya con la zona de silencio a la izquierda. */
export function bars(text: string): { rects: [number, number][]; width: number } {
  const widths = encodeWidths(text);
  const rects: [number, number][] = [];
  let x = QUIET;
  widths.forEach((w, k) => {
    if (k % 2 === 0) rects.push([x, w]);
    x += w;
  });
  return { rects, width: x + QUIET };
}
