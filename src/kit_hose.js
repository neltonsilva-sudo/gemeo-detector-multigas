// Mangueira física (Verlet: massas + restrições de distância/flexão, gravidade, piso com atrito, colisões cápsula/caixa,
// autocolisão) e malha tubular atualizada in-place (transporte paralelo). Dono: agente KIT.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

export class Hose {
  constructor({ length = 0.6, nodes = 48, radius = 0.0039, inner = 0.0024, material, radial = 16, floorY = 0 }) {
    this.length = length; this.n = nodes; this.seg = length / (nodes - 1); this.r = radius; this.ri = inner; this.floorY = floorY;
    this.p = Array.from({ length: nodes }, () => new THREE.Vector3());
    this.q = Array.from({ length: nodes }, () => new THREE.Vector3());
    this.pinned = new Uint8Array(nodes);
    this.start = { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0), depth: 0.006 }; // depth: quanto a mangueira cobre o bico
    this.end = null; // { pos, dir, depth }
    this.colliders = [];
    this.gravity = -9.81; this.damp = 0.985; this.friction = 0.82;
    // malha
    this.sub = 4; this.M = (nodes - 1) * this.sub + 1; this.R = radial;
    const verts = (this.M * (this.R + 1)) + 2 * (this.R + 1) * 2;
    this.pos = new Float32Array(verts * 3); this.nrm = new Float32Array(verts * 3); const uv = new Float32Array(verts * 2);
    const idx = [];
    for (let j = 0; j < this.M; j++) for (let k = 0; k <= this.R; k++) { const i = j * (this.R + 1) + k; uv[i * 2] = j / (this.M - 1) * length * 30; uv[i * 2 + 1] = k / this.R; }
    for (let j = 0; j < this.M - 1; j++) for (let k = 0; k < this.R; k++) {
      const a = j * (this.R + 1) + k, b = a + this.R + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    // anéis das pontas (parede da mangueira: externo→interno)
    this.capBase = this.M * (this.R + 1);
    for (let e = 0; e < 2; e++) {
      const base = this.capBase + e * 2 * (this.R + 1);
      for (let k = 0; k < this.R; k++) {
        const o = base + k, i = base + this.R + 1 + k;
        if (e === 0) idx.push(o, i, o + 1, i, i + 1, o + 1); else idx.push(o, o + 1, i, i, o + 1, i + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.S = Array.from({ length: this.M }, () => new THREE.Vector3());
    this.T = Array.from({ length: this.M }, () => new THREE.Vector3());
    this.N = new THREE.Vector3(); this.B = new THREE.Vector3();
  }

  // forma inicial: lista de pontos de controle (polilinha) reamostrada no comprimento da mangueira
  initAlong(pts) {
    const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
    for (let i = 0; i < this.n; i++) {
      const s = Math.min(i * this.seg, L[L.length - 1] - 1e-6);
      let k = 1; while (k < L.length - 1 && L[k] < s) k++;
      const t = (s - L[k - 1]) / Math.max(1e-9, L[k] - L[k - 1]);
      this.p[i].lerpVectors(pts[k - 1], pts[k], t); this.q[i].copy(this.p[i]);
    }
    // se a polilinha for curta, o resto segue na direção final
    const last = pts[pts.length - 1], dir = _a.subVectors(last, pts[pts.length - 2]).normalize();
    for (let i = 0; i < this.n; i++) if (i * this.seg > L[L.length - 1]) { this.p[i].copy(last).addScaledVector(dir, i * this.seg - L[L.length - 1]); this.q[i].copy(this.p[i]); }
  }

  _pinEnds() {
    const s = this.start, n = this.n;
    this.p[0].copy(s.pos).addScaledVector(s.dir, -s.depth); this.p[1].copy(this.p[0]).addScaledVector(s.dir, this.seg);
    this.q[0].copy(this.p[0]); this.q[1].copy(this.p[1]);
    this.pinned.fill(0); this.pinned[0] = this.pinned[1] = 1;
    if (this.end) {
      const e = this.end;
      this.p[n - 1].copy(e.pos).addScaledVector(e.dir, -e.depth); this.p[n - 2].copy(this.p[n - 1]).addScaledVector(e.dir, this.seg);
      this.q[n - 1].copy(this.p[n - 1]); this.q[n - 2].copy(this.p[n - 2]);
      this.pinned[n - 1] = this.pinned[n - 2] = 1;
    }
  }

  step(dt) {
    if (dt <= 0) { this._pinEnds(); return; }
    dt = Math.min(dt, 1 / 30);
    const subs = 5, h = dt / subs, g = this.gravity * h * h, n = this.n, p = this.p, q = this.q, seg = this.seg, F = this.floorY + this.r;
    for (let s = 0; s < subs; s++) {
      this._pinEnds();
      for (let i = 0; i < n; i++) {
        if (this.pinned[i]) continue;
        const pi = p[i], qi = q[i];
        const vx = (pi.x - qi.x) * this.damp, vy = (pi.y - qi.y) * this.damp, vz = (pi.z - qi.z) * this.damp;
        qi.copy(pi); pi.x += vx; pi.y += vy + g; pi.z += vz;
      }
      for (let it = 0; it < 14; it++) {
        // distância (inextensível)
        for (let i = 0; i < n - 1; i++) this._dist(i, i + 1, seg, 1, false);
        // flexão: resiste a dobrar (Tygon é relativamente rígido)
        for (let i = 0; i < n - 2; i++) this._dist(i, i + 2, seg * 1.985, 0.22, true);
        for (let i = 0; i < n - 4; i += 1) this._dist(i, i + 4, seg * 3.86, 0.05, true);
      }
      this._collide(F);
    }
    this._pinEnds();
  }

  _dist(i, j, rest, k, onlyCompress) {
    const a = this.p[i], b = this.p[j], wa = this.pinned[i] ? 0 : 1, wb = this.pinned[j] ? 0 : 1, w = wa + wb;
    if (!w) return;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
    if (onlyCompress && d >= rest) return;
    const c = (d - rest) / d * k / w;
    a.x += dx * c * wa; a.y += dy * c * wa; a.z += dz * c * wa;
    b.x -= dx * c * wb; b.y -= dy * c * wb; b.z -= dz * c * wb;
  }

  _collide(F) {
    const n = this.n, p = this.p, q = this.q, r = this.r;
    for (let i = 0; i < n; i++) {
      if (this.pinned[i]) continue;
      const pi = p[i];
      for (const c of this.colliders) {
        if (c.skipEnd && this.end && i >= n - c.skipEnd) continue;
        if (c.skipStart && i < c.skipStart) continue;
        if (c.type === 'capsule') {
          _a.subVectors(c.b, c.a); const L2 = _a.lengthSq();
          let t = L2 > 0 ? _b.subVectors(pi, c.a).dot(_a) / L2 : 0; t = Math.max(0, Math.min(1, t));
          _c.copy(c.a).addScaledVector(_a, t); _d.subVectors(pi, _c); const d = _d.length(), R = c.r + r;
          if (d < R) { if (d < 1e-7) _d.set(1, 0, 0); else _d.multiplyScalar(1 / d); pi.copy(_c).addScaledVector(_d, R); q[i].lerp(pi, 0.3); }
        } else if (c.type === 'box') {
          _a.copy(pi).applyMatrix4(c.inv); const hx = c.half.x + r, hy = c.half.y + r, hz = c.half.z + r;
          const ox = hx - Math.abs(_a.x - c.center.x), oy = hy - Math.abs(_a.y - c.center.y), oz = hz - Math.abs(_a.z - c.center.z);
          if (ox > 0 && oy > 0 && oz > 0) {
            if (ox < oy && ox < oz) _a.x += Math.sign(_a.x - c.center.x) * ox; else if (oy < oz) _a.y += Math.sign(_a.y - c.center.y) * oy; else _a.z += Math.sign(_a.z - c.center.z) * oz;
            pi.copy(_a.applyMatrix4(c.mat)); q[i].lerp(pi, 0.3);
          }
        }
      }
      if (pi.y < F) { pi.y = F; const qi = q[i]; qi.x += (pi.x - qi.x) * this.friction; qi.z += (pi.z - qi.z) * this.friction; if (qi.y < F) qi.y = F; }
    }
    // autocolisão (evita a mangueira atravessar a si mesma ao enrolar no chão)
    const D = 2 * r * 0.98, D2 = D * D;
    for (let i = 0; i < n; i++) for (let j = i + 3; j < n; j++) {
      const a = p[i], b = p[j]; const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < D2 && d2 > 1e-12) {
        const d = Math.sqrt(d2), wa = this.pinned[i] ? 0 : 1, wb = this.pinned[j] ? 0 : 1, w = wa + wb; if (!w) continue;
        const c = (D - d) / d / w;
        a.x -= dx * c * wa; a.y -= dy * c * wa; a.z -= dz * c * wa; b.x += dx * c * wb; b.y += dy * c * wb; b.z += dz * c * wb;
      }
    }
  }

  settle(seconds = 3) { const k = Math.ceil(seconds * 120); for (let i = 0; i < k; i++) this.step(1 / 120); }

  // amostra Catmull-Rom uniforme dos nós → anéis com transporte paralelo
  updateMesh() {
    const n = this.n, P = this.p, S = this.S, T = this.T, sub = this.sub, M = this.M, R = this.R;
    let m = 0;
    for (let i = 0; i < n - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
      for (let k = 0; k < sub; k++) {
        const t = k / sub, t2 = t * t, t3 = t2 * t;
        const a = -0.5 * t3 + t2 - 0.5 * t, b = 1.5 * t3 - 2.5 * t2 + 1, c = -1.5 * t3 + 2 * t2 + 0.5 * t, d = 0.5 * t3 - 0.5 * t2;
        S[m++].set(p0.x * a + p1.x * b + p2.x * c + p3.x * d, p0.y * a + p1.y * b + p2.y * c + p3.y * d, p0.z * a + p1.z * b + p2.z * c + p3.z * d);
      }
    }
    S[m++].copy(P[n - 1]);
    for (let j = 0; j < M; j++) T[j].subVectors(S[Math.min(M - 1, j + 1)], S[Math.max(0, j - 1)]).normalize();
    const N = this.N, B = this.B;
    // normal inicial perpendicular à tangente
    _a.set(0, 1, 0); if (Math.abs(T[0].y) > 0.9) _a.set(1, 0, 0);
    N.crossVectors(T[0], _a).normalize();
    const pos = this.pos, nrm = this.nrm, r = this.r;
    for (let j = 0; j < M; j++) {
      if (j > 0) { N.addScaledVector(T[j], -N.dot(T[j])).normalize(); }
      B.crossVectors(T[j], N);
      for (let k = 0; k <= R; k++) {
        const ang = k / R * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang), i = (j * (R + 1) + k) * 3;
        const nx = cs * N.x + sn * B.x, ny = cs * N.y + sn * B.y, nz = cs * N.z + sn * B.z;
        nrm[i] = nx; nrm[i + 1] = ny; nrm[i + 2] = nz;
        pos[i] = S[j].x + nx * r; pos[i + 1] = S[j].y + ny * r; pos[i + 2] = S[j].z + nz * r;
      }
      if (j === 0 || j === M - 1) {
        const base = this.capBase + (j ? 1 : 0) * 2 * (R + 1), sgn = j ? 1 : -1;
        for (let k = 0; k <= R; k++) {
          const ang = k / R * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
          const nx = cs * N.x + sn * B.x, ny = cs * N.y + sn * B.y, nz = cs * N.z + sn * B.z;
          for (let e = 0; e < 2; e++) {
            const rr = e ? this.ri : r, i = (base + e * (R + 1) + k) * 3;
            pos[i] = S[j].x + nx * rr; pos[i + 1] = S[j].y + ny * rr; pos[i + 2] = S[j].z + nz * rr;
            nrm[i] = T[j].x * sgn; nrm[i + 1] = T[j].y * sgn; nrm[i + 2] = T[j].z * sgn;
          }
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  endPos(out) { return out.copy(this.p[this.n - 1]); }
}
