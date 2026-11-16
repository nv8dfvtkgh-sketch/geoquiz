// Fichiers tableur pour « Crée ton quiz » : modèle Excel à remplir, import (Excel, CSV, page HTML,
// copier-coller depuis Excel ou Google Sheets) et export. Sans bibliothèque : un .xlsx est un zip
// de fichiers XML ; on l'écrit sans compression et on le lit avec la décompression du navigateur.

export type Rows = string[][];

// ---------------------------------------------------------------- écriture .xlsx
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(files: { name: string; data: string }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); // UTF-8
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, data.length, true); cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i: number) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

/** Classeur Excel : une feuille par entrée. `bold` : numéros des lignes en gras (en-têtes). */
export function writeXlsx(sheets: { name: string; rows: Rows; widths?: number[]; bold?: number[] }[]): Blob {
  const files: { name: string; data: string }[] = [];
  const x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  files.push({ name: '[Content_Types].xml', data: `${x}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
  files.push({ name: '_rels/.rels', data: `${x}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
  files.push({ name: 'xl/workbook.xml', data: `${x}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: `${x}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
  files.push({ name: 'xl/styles.xml', data: `${x}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE9A8"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf xfId="0"/><xf xfId="0" fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` });
  sheets.forEach((s, i) => {
    const bold = new Set(s.bold ?? []);
    const cols = s.widths ? `<cols>${s.widths.map((w, k) => `<col min="${k + 1}" max="${k + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === '' ? '' : `<c r="${colName(ci)}${ri + 1}" t="inlineStr"${bold.has(ri) ? ' s="1"' : ' s="2"'}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`)).join('')}</row>`).join('');
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: `${x}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>` });
  });
  return zip(files);
}

// ---------------------------------------------------------------- lecture
interface ZipEntry { text: () => Promise<string>; bytes: () => Promise<Uint8Array> }
async function unzip(buf: ArrayBuffer): Promise<Map<string, ZipEntry>> {
  const v = new DataView(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('notZip');
  const n = v.getUint16(e + 10, true);
  let p = v.getUint32(e + 16, true);
  const dec = new TextDecoder();
  const out = new Map<string, ZipEntry>();
  for (let i = 0; i < n; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nlen));
    const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
    const raw = new Uint8Array(buf, start, csize);
    const bytes = async () => {
      if (method === 0) return raw;
      if (method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('unsupported');
      const s = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    };
    out.set(name, { bytes, text: async () => dec.decode(await bytes()) });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

/** Tableau lu, et photos collées dans le fichier Excel (rangées par numéro de ligne, à partir de 0). */
export interface Table { rows: Rows; images: Map<number, Blob> }

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
/** Chemin relatif d'une relation (« ../media/image1.png » depuis xl/drawings/) → chemin dans le zip. */
const resolve = (base: string, target: string) => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
};
/** Éléments par nom local, avec ou sans préfixe (Excel écrit « xdr: », d'autres outils non). */
const tags = (el: Document | Element, name: string) => Array.from(el.getElementsByTagNameNS('*', name));
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rAttr = (el: Element | undefined, name: string) => el?.getAttributeNS(R_NS, name) || el?.getAttribute(`r:${name}`) || '';
const relsOf = (path: string) => path.replace(/([^/]+)$/, '_rels/$1.rels');

async function readXlsx(buf: ArrayBuffer): Promise<Table> {
  const files = await unzip(buf);
  const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');
  const shared: string[] = [];
  const ss = files.get('xl/sharedStrings.xml');
  if (ss) for (const si of Array.from(xml(await ss.text()).getElementsByTagName('si'))) shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''));
  const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.slice(19)) - parseInt(b.slice(19)))[0];
  if (!sheetName) throw new Error('noSheet');
  const doc = xml(await files.get(sheetName)!.text());
  const rows: Rows = [];
  const images = new Map<number, Blob>();
  const blobOf = async (path: string) => {
    const f = files.get(path);
    const type = MIME[path.split('.').pop()!.toLowerCase()];
    return f && type ? new Blob([(await f.bytes()) as BlobPart], { type }) : null;
  };
  const relMap = async (path: string) => {
    const m = new Map<string, string>();
    const f = files.get(relsOf(path));
    if (f) for (const r of tags(xml(await f.text()), 'Relationship')) m.set(r.getAttribute('Id') ?? '', resolve(path, r.getAttribute('Target') ?? ''));
    return m;
  };
  // 1) Photos posées sur la feuille (Insertion › Image) : rangées sur la ligne de leur coin haut gauche.
  try {
    const sheetRels = await relMap(sheetName);
    for (const d of tags(doc, 'drawing')) {
      const dPath = sheetRels.get(rAttr(d, 'id'));
      const df = dPath && files.get(dPath);
      if (!dPath || !df) continue;
      const dRels = await relMap(dPath);
      const dDoc = xml(await df.text());
      const anchors = [...tags(dDoc, 'twoCellAnchor'), ...tags(dDoc, 'oneCellAnchor')];
      for (const a of anchors) {
        const from = tags(a, 'from')[0];
        const row = Number(from ? tags(from, 'row')[0]?.textContent : NaN);
        const media = dRels.get(rAttr(tags(a, 'blip')[0], 'embed'));
        if (!Number.isFinite(row) || !media || images.has(row)) continue;
        const b = await blobOf(media);
        if (b) images.set(row, b);
      }
    }
  } catch { /* photos illisibles : on garde le texte */ }
  // 2) Photos « dans la cellule » (Excel 365 : Insertion › Image › Placer dans la cellule).
  const cellImage: Blob[] = [];
  try {
    const rv = files.get('xl/richData/rdrichvalue.xml'), rel = files.get('xl/richData/richValueRel.xml');
    if (rv && rel) {
      const relIds = tags(xml(await rel.text()), 'rel').map((x) => rAttr(x, 'id'));
      const rRels = await relMap('xl/richData/richValueRel.xml');
      for (const v of tags(xml(await rv.text()), 'rv')) {
        const idx = Number(tags(v, 'v')[0]?.textContent);
        const media = rRels.get(relIds[idx] ?? '');
        const b = media ? await blobOf(media) : null;
        cellImage.push(b ?? new Blob());
      }
    }
  } catch { /* idem */ }
  for (const r of Array.from(doc.getElementsByTagName('row'))) {
    const ri = Number(r.getAttribute('r')) - 1;
    const row: string[] = [];
    for (const c of Array.from(r.getElementsByTagName('c'))) {
      const ref = c.getAttribute('r') ?? '';
      const col = [...(ref.match(/^[A-Z]+/)?.[0] ?? 'A')].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const tp = c.getAttribute('t');
      const vEl = c.getElementsByTagName('v')[0];
      let val = '';
      if (tp === 's') val = shared[Number(vEl?.textContent)] ?? '';
      else if (tp === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('');
      else if (tp === 'b') val = vEl?.textContent === '1' ? 'TRUE' : 'FALSE';
      else val = vEl?.textContent ?? '';
      const vm = Number(c.getAttribute('vm'));
      if (vm && cellImage[vm - 1]?.size && !images.has(ri)) { images.set(ri, cellImage[vm - 1]); val = tp === 'e' ? '' : val; }
      if (tp === 'e') val = ''; // #VALUE! d'une image dans la cellule
      row[col] = val;
    }
    rows[ri >= 0 ? ri : rows.length] = Array.from(row, (x) => x ?? '');
  }
  return { rows: Array.from(rows, (x) => x ?? []), images };
}

/** CSV ou texte collé : séparateur deviné (tabulation, point-virgule ou virgule), guillemets gérés. */
export function readDelimited(text: string): Rows {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const sep = ['\t', ';', ','].map((s) => ({ s, n: first.split(s).length })).sort((a, b) => b.n - a.n)[0].s;
  const rows: Rows = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function readHtml(text: string): Rows {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const table = Array.from(doc.querySelectorAll('table')).sort((a, b) => b.rows.length - a.rows.length)[0];
  if (!table) throw new Error('noTable');
  return Array.from(table.rows).map((r) => Array.from(r.cells).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()));
}

/** Lit un fichier Excel (.xlsx), CSV, texte ou page HTML (le plus grand tableau). */
export async function readTableFile(file: File): Promise<Table> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) return readXlsx(await file.arrayBuffer());
  if (name.endsWith('.xls') || name.endsWith('.ods')) throw new Error('oldFormat');
  const text = await file.text();
  if (name.endsWith('.html') || name.endsWith('.htm') || /^\s*<(!doctype|html|table)/i.test(text)) return { rows: readHtml(text), images: new Map() };
  return { rows: readDelimited(text), images: new Map() };
}

// ---------------------------------------------------------------- quiz ⇄ tableau
export interface SheetQuestion { text: string; answers: string[]; correct: number; photo?: string; image?: Blob }
const TITLE_RX = /^(titre|title|título|titulo|العنوان)/i;
const HEAD_RX = /^(question|pregunta|سؤال|السؤال)\b/i;

/** Lignes du tableau → titre et questions (colonne B : bonne réponse ; C à E : mauvaises réponses). */
export function rowsToQuiz(rows: Rows, max = 50, images?: Map<number, Blob>): { title: string; questions: SheetQuestion[]; skipped: number } {
  let title = '';
  const questions: SheetQuestion[] = [];
  let skipped = 0;
  for (const [ri, raw] of rows.entries()) {
    const r = (raw ?? []).map((c) => String(c ?? '').replace(/\s+/g, ' ').trim());
    if (!r.some(Boolean)) continue;
    if (TITLE_RX.test(r[0]) && r.filter(Boolean).length <= 2) { title = r[1] || title; continue; }
    if (HEAD_RX.test(r[0]) && questions.length === 0) continue; // ligne d'en-tête
    const [text, good, b1, b2, b3, photo] = r;
    const bad = [b1, b2, b3];
    // Mauvaises réponses : sans doublon, ni copie de la bonne réponse.
    const seen = new Set([good.toLowerCase()]);
    const wrong = bad.filter((a) => a && !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase())).slice(0, 3);
    if (!text || !good || !wrong.length || questions.length >= max) { skipped++; continue; }
    questions.push({ text: text.slice(0, 200), answers: [good, ...wrong].map((a) => a.slice(0, 80)), correct: 0, photo: photo ? photo.slice(0, 120) : undefined, image: images?.get(ri) });
  }
  return { title: title.slice(0, 80), questions, skipped };
}

export interface SheetLabels { title: string; question: string; good: string; bad: string; photo: string; example: string[][]; help: string[] }
/** Quiz → lignes du tableau (même présentation que le modèle). */
export function quizToRows(l: SheetLabels, title: string, qs: SheetQuestion[]): Rows {
  const head = [l.question, l.good, `${l.bad} 1`, `${l.bad} 2`, `${l.bad} 3`, l.photo];
  const body = qs.map((q) => { const bad = q.answers.filter((_, i) => i !== q.correct); return [q.text, q.answers[q.correct] ?? '', bad[0] ?? '', bad[1] ?? '', bad[2] ?? '', q.photo ?? '']; });
  return [[l.title, title], [], head, ...body];
}

/** Fichier rempli avec le modèle HTML de Quizellige (questions et photos dans le fichier). */
export function readQuizHtml(text: string): { title: string; questions: SheetQuestion[]; skipped: number } | null {
  const m = text.match(/<script[^>]*id="quiz-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let d: { title?: string; questions?: { text?: string; answers?: string[]; image?: string | null }[] };
  try { d = JSON.parse(m[1]); } catch { return null; }
  const questions: SheetQuestion[] = [];
  let skipped = 0;
  for (const q of d.questions ?? []) {
    const text = String(q.text ?? '').trim();
    const [good, ...bad] = (q.answers ?? []).map((a) => String(a ?? '').trim());
    const seen = new Set([good?.toLowerCase()]);
    const wrong = bad.filter((a) => a && !seen.has(a.toLowerCase()) && seen.add(a.toLowerCase())).slice(0, 3);
    if (!text && !good && !q.image) continue; // carte vide
    if (!text || !good || !wrong.length || questions.length >= 50) { skipped++; continue; }
    let image: Blob | undefined;
    const im = typeof q.image === 'string' ? q.image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/) : null;
    if (im) { const bin = atob(im[2]); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); image = new Blob([u], { type: im[1] }); }
    questions.push({ text: text.slice(0, 200), answers: [good, ...wrong].map((a) => a.slice(0, 80)), correct: 0, image });
  }
  return { title: String(d.title ?? '').trim().slice(0, 80), questions, skipped };
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** Nom de photo comparable : sans dossier, sans extension, sans accents ni majuscules. */
export const photoKey = (s: string) => s.split(/[\\/]/).pop()!.replace(/\.(jpe?g|png|webp|gif|heic)$/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
export const fileSafe = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'quiz';
