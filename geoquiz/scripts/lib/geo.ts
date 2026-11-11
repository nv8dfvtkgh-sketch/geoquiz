// Outils géométriques du pipeline de données (aucune dépendance externe).
// Les anneaux sont manipulés « ouverts » (le dernier point ne répète pas le premier).

export type Pt = [number, number];
export type Ring = Pt[];

const key = (p: Pt) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

/** Anneaux (extérieurs + trous) d'une géométrie GeoJSON surfacique. */
export function ringsOf(geom: any): Ring[] {
  if (!geom) return [];
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  const out: Ring[] = [];
  for (const poly of polys) for (const r of poly) out.push(openRing(r));
  return out.filter((r) => r.length >= 3);
}

/** Lignes d'une géométrie GeoJSON linéaire (fleuves…). */
export function linesOf(geom: any): Ring[] {
  if (!geom) return [];
  if (geom.type === 'LineString') return [geom.coordinates.map((p: number[]) => [p[0], p[1]])];
  if (geom.type === 'MultiLineString') return geom.coordinates.map((l: number[][]) => l.map((p) => [p[0], p[1]] as Pt));
  return [];
}

function openRing(r: number[][]): Ring {
  const pts: Ring = r.map((p) => [p[0], p[1]]);
  if (pts.length > 1 && key(pts[0]) === key(pts[pts.length - 1])) pts.pop();
  return pts;
}

/**
 * Fusionne plusieurs entités voisines en une seule (ex. Maroc + Sahara) en supprimant
 * les arêtes communes. Fonctionne sur des données topologiquement propres comme
 * Natural Earth ; si les sommets ne coïncident pas, les anneaux sont conservés tels quels.
 */
export function dissolve(rings: Ring[]): Ring[] {
  const count = new Map<string, number>();
  const ukey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const k = ukey(key(r[i]), key(r[(i + 1) % r.length]));
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  type Edge = { from: Pt; toKey: string; used: boolean };
  const outgoing = new Map<string, Edge[]>();
  const edges: Edge[] = [];
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = key(r[i]);
      const b = key(r[(i + 1) % r.length]);
      if (a === b || count.get(ukey(a, b))! > 1) continue;
      const e = { from: r[i], toKey: b, used: false };
      edges.push(e);
      if (!outgoing.has(a)) outgoing.set(a, []);
      outgoing.get(a)!.push(e);
    }
  const out: Ring[] = [];
  for (const start of edges) {
    if (start.used) continue;
    const ring: Ring = [];
    let e: Edge | undefined = start;
    const startKey = key(start.from);
    while (e && !e.used) {
      e.used = true;
      ring.push(e.from);
      if (e.toKey === startKey) break;
      e = outgoing.get(e.toKey)?.find((x) => !x.used);
    }
    if (ring.length >= 3) out.push(ring);
  }
  return out;
}

/** Arêtes non orientées (pour calculer les voisinages entre entités). */
export function edgeKeys(rings: Ring[]): string[] {
  const out: string[] = [];
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = key(r[i]);
      const b = key(r[(i + 1) % r.length]);
      if (a !== b) out.push(a < b ? `${a}|${b}` : `${b}|${a}`);
    }
  return out;
}

const RAD = Math.PI / 180;

/** Projection Natural Earth I (identique à d3.geoNaturalEarth1Raw). Entrée en degrés. */
export function naturalEarth(lon: number, lat: number): Pt {
  const l = lon * RAD;
  const p = lat * RAD;
  const p2 = p * p;
  const p4 = p2 * p2;
  return [
    l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
    p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))),
  ];
}

/** Équirectangulaire corrigée par la latitude moyenne : adaptée aux cartes d'un seul pays. */
export function localProjection(midLat: number) {
  const k = Math.cos(midLat * RAD);
  return (lon: number, lat: number): Pt => [lon * k, lat];
}

export function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i];
    const q = r[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function ringCentroid(r: Ring): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i];
    const q = r[(i + 1) % n];
    const f = p[0] * q[1] - q[0] * p[1];
    a += f;
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const s = r.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]] as Pt, [0, 0] as Pt);
    return [s[0] / r.length, s[1] / r.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Point intérieur d'un anneau (centroïde s'il est dedans, sinon meilleur point d'une grille). */
export function interiorPoint(r: Ring): Pt {
  const c = ringCentroid(r);
  if (pointInRing(c, r)) return c;
  const b = bbox([r]);
  let best: Pt = r[0];
  let bestD = -1;
  for (let i = 1; i < 12; i++)
    for (let j = 1; j < 12; j++) {
      const p: Pt = [b[0] + ((b[2] - b[0]) * i) / 12, b[1] + ((b[3] - b[1]) * j) / 12];
      if (!pointInRing(p, r)) continue;
      const d = distToRing(p, r);
      if (d > bestD) { bestD = d; best = p; }
    }
  return best;
}

export function pointInRing(p: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToRing(p: Pt, r: Ring): number {
  let m = Infinity;
  for (let i = 0; i < r.length; i++) m = Math.min(m, segDist(p, r[i], r[(i + 1) % r.length]));
  return m;
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function bbox(rings: Ring[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  return [x0, y0, x1, y1];
}

/** Douglas-Peucker itératif ; conserve les extrémités. */
function dp(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = -1, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx > 0 && maxD > tol) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Simplification qui préserve la topologie : chaque frontière commune est découpée en
 * arcs entre « jonctions » et simplifiée de façon déterministe, donc identique des deux
 * côtés. Pas de trous ni de chevauchements entre voisins.
 */
export function topoSimplify(allRings: Ring[], tol: number, closed = true): Ring[] {
  const nb = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    if (!nb.has(a)) nb.set(a, new Set());
    nb.get(a)!.add(b);
  };
  for (const r of allRings) {
    const n = r.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = key(r[i]);
      const b = key(r[(i + 1) % n]);
      link(a, b);
      link(b, a);
    }
  }
  const isJunction = (p: Pt) => (nb.get(key(p))?.size ?? 0) > 2;

  const simplifyArc = (arc: Pt[]): Pt[] => {
    const ka = key(arc[0]);
    const kb = key(arc[arc.length - 1]);
    let rev = ka > kb;
    if (ka === kb && arc.length > 2) rev = key(arc[1]) > key(arc[arc.length - 2]);
    const seq = rev ? arc.slice().reverse() : arc;
    const s = dp(seq, tol);
    return rev ? s.reverse() : s;
  };

  return allRings.map((r) => {
    if (!closed) {
      // Ligne : extrémités et jonctions fixes.
      const idx = [0];
      for (let i = 1; i < r.length - 1; i++) if (isJunction(r[i])) idx.push(i);
      idx.push(r.length - 1);
      const out: Pt[] = [];
      for (let j = 0; j < idx.length - 1; j++) {
        const s = simplifyArc(r.slice(idx[j], idx[j + 1] + 1));
        out.push(...(j === 0 ? s : s.slice(1)));
      }
      return out;
    }
    const n = r.length;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (isJunction(r[i])) idx.push(i);
    if (idx.length === 0) {
      // Anneau isolé ou partagé tel quel (enclave) : départ canonique au plus petit sommet.
      let m = 0;
      for (let i = 1; i < n; i++) if (key(r[i]) < key(r[m])) m = i;
      const fwd = key(r[(m + 1) % n]) < key(r[(m - 1 + n) % n]);
      const seq: Pt[] = [];
      for (let i = 0; i <= n; i++) seq.push(r[(m + (fwd ? i : -i) + n * 2) % n]);
      const s = dp(seq, tol);
      s.pop();
      return s;
    }
    const out: Pt[] = [];
    for (let j = 0; j < idx.length; j++) {
      const a = idx[j];
      const b = idx[(j + 1) % idx.length];
      const arc: Pt[] = [];
      for (let i = a; ; i = (i + 1) % n) {
        arc.push(r[i]);
        if (i === b && arc.length > 1) break;
        if (arc.length > n + 1) break;
      }
      const s = simplifyArc(arc);
      s.pop(); // l'extrémité sera le début de l'arc suivant
      out.push(...s);
    }
    return out;
  });
}

/** Chaîne « d » SVG. */
export function pathD(rings: Ring[], closed = true, precision = 1): string {
  const f = (v: number) => {
    const s = v.toFixed(precision);
    return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  };
  return rings
    .map((r) => 'M' + r.map((p) => `${f(p[0])} ${f(p[1])}`).join('L') + (closed ? 'Z' : ''))
    .join('');
}
