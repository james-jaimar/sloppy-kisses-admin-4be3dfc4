// Minimal EAN-13 encoder producing SVG, for internal in-store codes (prefix 20–29).
const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

export function ean13CheckDigit(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/** Random internal EAN-13 starting with "20" (GS1 restricted in-store range). */
export function randomInternalEan13(): string {
  let s = "20";
  for (let i = 0; i < 10; i++) s += Math.floor(Math.random() * 10);
  return s + ean13CheckDigit(s);
}

export function isValidEan13(code: string) {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** SVG markup (black on white, as required for scanning). */
export function ean13Svg(code: string, opts: { height?: number } = {}): string {
  const h = opts.height ?? 60;
  const first = Number(code[0]);
  let bits = "101";
  for (let i = 1; i <= 6; i++) {
    const d = Number(code[i]);
    bits += PARITY[first][i - 1] === "L" ? L[d] : G[d];
  }
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[Number(code[i])];
  bits += "101";
  const quiet = 11;
  const width = bits.length + quiet * 2;
  const guard = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  let rects = "";
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === "1") {
      const bh = guard.has(i) ? h + 5 : h;
      rects += `<rect x="${i + quiet}" y="0" width="1" height="${bh}"/>`;
    }
  }
  const ty = h + 13;
  const text =
    `<text x="${quiet - 7}" y="${ty}">${code[0]}</text>` +
    `<text x="${quiet + 3 + 21}" y="${ty}" text-anchor="middle">${code.slice(1, 7)}</text>` +
    `<text x="${quiet + 50 + 21}" y="${ty}" text-anchor="middle">${code.slice(7)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${h + 16}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects}</g><g fill="#000" font-family="monospace" font-size="10" letter-spacing="1">${text}</g></svg>`;
}
