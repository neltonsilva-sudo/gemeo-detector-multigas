// Agente CARCAÇA — primitivas SDF (mm) + malhador "surface nets" em banda estreita, com normais pelo gradiente
// e oclusão ambiente assada por vértice. Sem dependência de three (pode rodar em node para medir tempo).

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const mix = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const len2 = (x, y) => Math.sqrt(x * x + y * y);
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

// retângulo arredondado 2D centrado na origem, semi-extensões (hx,hy), raio r
export function sdRRect(x, y, hx, hy, r) {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r;
  return Math.min(Math.max(qx, qy), 0) + len2(Math.max(qx, 0), Math.max(qy, 0)) - r;
}
// extrusão em z de uma distância 2D d2 (contorno), entre z0..z1, com arredondamento re das arestas
export function extrude(d2, z, z0, z1, re0, re1) {
  const zc = (z0 + z1) * 0.5, hz = (z1 - z0) * 0.5;
  const re = z > zc ? re1 : re0;
  const wx = d2 + re, wz = Math.abs(z - zc) - hz + re;
  return Math.min(Math.max(wx, wz), 0) + len2(Math.max(wx, 0), Math.max(wz, 0)) - re;
}
export function sdRBox(x, y, z, hx, hy, hz, r) {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r;
  return Math.min(Math.max(qx, Math.max(qy, qz)), 0) + len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) - r;
}
// cilindro arredondado com eixo em z: raio ra, semi-altura h, arredondamento rb
export function sdRCylZ(x, y, z, ra, h, rb) {
  const dx = len2(x, y) - ra + rb, dz = Math.abs(z) - h + rb;
  return Math.min(Math.max(dx, dz), 0) + len2(Math.max(dx, 0), Math.max(dz, 0)) - rb;
}
export function sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax, pay = py - ay, paz = pz - az, bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}
export function smin(a, b, k) { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); }
export function smax(a, b, k) { return -smin(-a, -b, k); }
// subtração suave: a - b
export function ssub(a, b, k) { return smax(a, -b, k); }

/**
 * Malha a isosuperfície f=0 por surface nets. f(x,y,z) em mm. Retorna {positions, normals, ao, indices} (mm).
 * opts: { h: célula (mm), ao: [[dist, peso],...], aoScale, refine: iterações de projeção }
 */
export function meshSDF(f, min, max, h, opts = {}) {
  const pad = h * 2;
  const x0 = min[0] - pad, y0 = min[1] - pad, z0 = min[2] - pad;
  const nx = Math.ceil((max[0] - min[0] + 2 * pad) / h) + 1;
  const ny = Math.ceil((max[1] - min[1] + 2 * pad) / h) + 1;
  const nz = Math.ceil((max[2] - min[2] + 2 * pad) / h) + 1;
  const sxy = nx * ny;
  const V = new Float32Array(nx * ny * nz);
  // --- culling por blocos ---
  const B = 4;
  const nbx = Math.ceil((nx - 1) / B), nby = Math.ceil((ny - 1) / B), nbz = Math.ceil((nz - 1) / B);
  const bAct = new Uint8Array(nbx * nby * nbz), bSign = new Int8Array(nbx * nby * nbz);
  const thr = B * h * 0.8660254 * 1.7 + h;
  for (let bz = 0; bz < nbz; bz++) for (let by = 0; by < nby; by++) for (let bx = 0; bx < nbx; bx++) {
    const d = f(x0 + (bx * B + B / 2) * h, y0 + (by * B + B / 2) * h, z0 + (bz * B + B / 2) * h);
    const bi = bx + nbx * (by + nby * bz);
    bAct[bi] = Math.abs(d) < thr ? 1 : 0; bSign[bi] = d < 0 ? -1 : 1;
  }
  const lo = (i) => (i % B === 0 && i > 0 ? i / B - 1 : Math.floor(i / B));
  let evals = 0;
  for (let k = 0; k < nz; k++) {
    const bz0 = Math.min(lo(k), nbz - 1), bz1 = Math.min(Math.floor(k / B), nbz - 1);
    for (let j = 0; j < ny; j++) {
      const by0 = Math.min(lo(j), nby - 1), by1 = Math.min(Math.floor(j / B), nby - 1);
      for (let i = 0; i < nx; i++) {
        const bx0 = Math.min(lo(i), nbx - 1), bx1 = Math.min(Math.floor(i / B), nbx - 1);
        let act = 0;
        for (let c = bz0; c <= bz1 && !act; c++) for (let b = by0; b <= by1 && !act; b++) for (let a = bx0; a <= bx1; a++)
          if (bAct[a + nbx * (b + nby * c)]) { act = 1; break; }
        const idx = i + nx * j + sxy * k;
        if (act) { V[idx] = f(x0 + i * h, y0 + j * h, z0 + k * h); evals++; }
        else V[idx] = bSign[bx1 + nbx * (by1 + nby * bz1)] * 1e3;
      }
    }
  }
  // --- vértices por célula ---
  const cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
  const cellV = new Int32Array(cnx * cny * cnz).fill(-1);
  const P = [];
  const off = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1];
  const cp = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const g = new Float32Array(8);
  for (let k = 0; k < cnz; k++) for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) {
    const base = i + nx * j + sxy * k;
    let mask = 0;
    for (let c = 0; c < 8; c++) { g[c] = V[base + off[c]]; if (g[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 12; e++) {
      const a = E[e][0], b = E[e][1];
      if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
      const t = g[a] / (g[a] - g[b]);
      sx += cp[a][0] + (cp[b][0] - cp[a][0]) * t; sy += cp[a][1] + (cp[b][1] - cp[a][1]) * t; sz += cp[a][2] + (cp[b][2] - cp[a][2]) * t; n++;
    }
    cellV[i + cnx * (j + cny * k)] = P.length / 3;
    P.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }
  const nv = P.length / 3;
  const pos = new Float32Array(P), nor = new Float32Array(nv * 3), ao = new Float32Array(nv);
  const e = Math.min(0.02, h * 0.1);
  const grad = (x, y, z, out) => { // tetraedro
    const a = f(x + e, y - e, z - e), b = f(x - e, y - e, z + e), c = f(x - e, y + e, z - e), d = f(x + e, y + e, z + e);
    out[0] = a - b - c + d; out[1] = -a - b + c + d; out[2] = -a + b - c + d;
    const l = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= l; out[1] /= l; out[2] /= l;
  };
  const gr = [0, 0, 0];
  const refine = opts.refine ?? 1;
  const aoT = opts.ao || [[0.6, 1], [1.4, 0.6], [3, 0.35], [5.5, 0.2]];
  const aoS = opts.aoScale ?? 0.9;
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const ox = x, oy = y, oz = z;
    for (let it = 0; it < refine; it++) {
      const d = f(x, y, z); grad(x, y, z, gr);
      x -= d * gr[0]; y -= d * gr[1]; z -= d * gr[2];
    }
    const mv = Math.hypot(x - ox, y - oy, z - oz);
    if (mv > h * 0.9) { const s = h * 0.9 / mv; x = ox + (x - ox) * s; y = oy + (y - oy) * s; z = oz + (z - oz) * s; }
    grad(x, y, z, gr);
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    nor[v * 3] = gr[0]; nor[v * 3 + 1] = gr[1]; nor[v * 3 + 2] = gr[2];
    let occ = 0;
    for (const [dd, w] of aoT) { const s = f(x + gr[0] * dd, y + gr[1] * dd, z + gr[2] * dd); occ += w * Math.max(0, dd - s) / dd; }
    ao[v] = clamp(1 - occ * aoS, 0, 1);
  }
  // --- faces ---
  const I = [];
  const cidx = (i, j, k) => cellV[i + cnx * (j + cny * k)];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // diagonal mais curta
    const dac = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
    const dbd = (pos[b * 3] - pos[d * 3]) ** 2 + (pos[b * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b * 3 + 2] - pos[d * 3 + 2]) ** 2;
    if (flip) { const t = b; b = d; d = t; }
    if (dac <= dbd) I.push(a, b, c, a, c, d); else I.push(a, b, d, b, c, d);
  };
  for (let k = 1; k < cnz; k++) for (let j = 1; j < cny; j++) for (let i = 1; i < cnx; i++) {
    const p = i + nx * j + sxy * k;
    const s0 = V[p] < 0;
    // aresta x: (i,j,k)->(i+1,j,k); células (i,j-1,k-1),(i,j,k-1),(i,j,k),(i,j-1,k)
    if (s0 !== V[p + 1] < 0) quad(cidx(i, j - 1, k - 1), cidx(i, j, k - 1), cidx(i, j, k), cidx(i, j - 1, k), !s0);
    if (s0 !== V[p + nx] < 0) quad(cidx(i - 1, j, k - 1), cidx(i - 1, j, k), cidx(i, j, k), cidx(i, j, k - 1), !s0);
    if (s0 !== V[p + sxy] < 0) quad(cidx(i - 1, j - 1, k), cidx(i, j - 1, k), cidx(i, j, k), cidx(i - 1, j, k), !s0);
  }
  return { positions: pos, normals: nor, ao, indices: nv > 65535 ? new Uint32Array(I) : new Uint16Array(I), evals, nv };
}
