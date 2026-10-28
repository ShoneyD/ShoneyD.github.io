/* =====================================================================
   WORLD — an endless, recycled jungle canyon. The path runs toward -z
   above a river. Everything is built in CHUNKS of CH metres; chunks behind
   the camera are disposed and new ones are built ahead. All shapes are
   generated in code (no downloads) and shaded smooth, cartoon-bright.
   ===================================================================== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const CH = 48;                 /* chunk length (m) */
export const RIVER_Y = 0;
export const CANOPY_Y = 21;           /* height of the limbs vines hang from */

/* ---------- deterministic noise ---------- */
function rng(seed){ let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, z){ const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z){
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z){ return vnoise(x, z) * .55 + vnoise(x * 2.1, z * 2.1) * .3 + vnoise(x * 4.3, z * 4.3) * .15; }

/* river centre line, gently meandering */
export function riverX(z){ return 3.2 * Math.sin(z * .021) + 1.6 * Math.sin(z * .053 + 1.3); }
export function riverW(z){ return 4.6 + 1.2 * Math.sin(z * .037); }
/* ground height: river bed, rocky banks, then the canyon floor rising */
export function groundY(x, z){
  const d = Math.abs(x - riverX(z)), w = riverW(z);
  const n = fbm(x * .09, z * .09);
  let h;
  if (d < w) h = RIVER_Y - 1.2 + (d / w) * .6;
  else if (d < w + 4) h = RIVER_Y - .6 + (d - w) / 4 * 3.4 + n * 1.2;
  else { const k = Math.min(1, (d - w - 4) / 9); h = RIVER_Y + 2.8 + k * k * (3 - 2 * k) * 8 + n * 3 + Math.max(0, d - 20) * .9; }
  return h;
}

/* ---------- procedural textures (canvas) ---------- */
function canvasTex(w, h, draw, srgb){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/* leaf atlas: 4 cells: broad leaf, palm frond, fern, small-leaf spray */
function leafAtlas(){
  return canvasTex(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512);
    const leaf = (cx, cy, len, wid, ang, c1, c2) => {
      g.save(); g.translate(cx, cy); g.rotate(ang);
      const gr = g.createLinearGradient(0, 0, 0, -len); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0);
      g.bezierCurveTo(wid, -len * .25, wid * .9, -len * .75, 0, -len);
      g.bezierCurveTo(-wid * .9, -len * .75, -wid, -len * .25, 0, 0); g.fill();
      g.strokeStyle = 'rgba(220,255,200,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * .95); g.stroke();
      g.restore();
    };
    /* cell 0: big broad leaves */
    for (let i = 0; i < 7; i++) leaf(128 + (i - 3) * 6, 250, 150 + (i % 3) * 25, 42, (i - 3) * .42, '#3f8f3a', '#7cc95a');
    /* cell 1: palm frond */
    g.save(); g.translate(384, 250);
    g.strokeStyle = '#4a7a2c'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -120, 0, -235); g.stroke();
    for (let i = 0; i < 22; i++){ const t = i / 22, y = -10 - t * 220, x = Math.sin(t * 1.5) * 8;
      for (const s of [-1, 1]) leaf(x, y, 95 * (1 - t * .55), 9, s * (1.1 - t * .3), '#2f7d34', '#8fd260'); }
    g.restore();
    /* cell 2: fern */
    g.save(); g.translate(128, 505);
    for (let i = 0; i < 26; i++){ const t = i / 26, y = -6 - t * 230;
      for (const s of [-1, 1]) leaf(0, y, 70 * (1 - t * .8), 7, s * 1.25, '#2a6b30', '#6fbf4c'); }
    g.strokeStyle = '#35602a'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -236); g.stroke(); g.restore();
    /* cell 3: small-leaf spray */
    const R = rng(7);
    for (let i = 0; i < 70; i++){ const a = R() * Math.PI * 2, r = R() * 95;
      leaf(384 + Math.cos(a) * r, 384 + Math.sin(a) * r + 30, 34 + R() * 20, 12, a + Math.PI / 2 + (R() - .5), ['#3c8a37', '#4f9e3e', '#2f7430'][i % 3], '#8ad35e'); }
  });
}
function barkTex(){
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#7a5434'; g.fillRect(0, 0, w, h);
    const R = rng(3);
    for (let i = 0; i < 120; i++){ g.fillStyle = `rgba(${40 + R() * 40},${25 + R() * 25},${15 + R() * 10},${.25 + R() * .3})`;
      const x = R() * w; g.fillRect(x, 0, 2 + R() * 5, h); }
    for (let i = 0; i < 40; i++){ g.fillStyle = `rgba(120,160,70,${.15 + R() * .2})`; g.beginPath(); g.ellipse(R() * w, R() * h, 4 + R() * 10, 8 + R() * 18, 0, 0, 7); g.fill(); }
  });
}
function waterTex(){
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const R = rng(11);
    for (let i = 0; i < 260; i++){ g.strokeStyle = `rgba(255,255,255,${.15 + R() * .5})`; g.lineWidth = 1 + R() * 2.5;
      const x = R() * w, y = R() * h, l = 10 + R() * 40; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 4, y + l / 2, x, y + l); g.stroke(); }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function groundTex(){
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const R = rng(5);
    for (let i = 0; i < 900; i++){ const v = 200 + R() * 55; g.fillStyle = `rgba(${v},${v},${v},.6)`; g.fillRect(R() * w, R() * h, 2 + R() * 4, 2 + R() * 4); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10);
  return t;
}
function glowTex(){
  return canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,248,210,.0)'); gr.addColorStop(.25, 'rgba(255,248,210,.55)');
    gr.addColorStop(1, 'rgba(255,248,210,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h);
  });
}

/* ---------- the world ---------- */
export function createWorld(scene, quality){
  const Q = quality;                                  /* 'high' | 'low' */
  const T = { leaf:leafAtlas(), bark:barkTex(), water:waterTex(), ground:groundTex(), glow:glowTex() };
  T.bark.wrapS = T.bark.wrapT = THREE.RepeatWrapping;
  const M = {
    leaf: new THREE.MeshStandardMaterial({ map:T.leaf, alphaTest:.45, side:THREE.DoubleSide, roughness:.75 }),
    bark: new THREE.MeshStandardMaterial({ map:T.bark, roughness:.95, color:0xffffff }),
    ground: new THREE.MeshStandardMaterial({ vertexColors:true, map:T.ground, roughness:1 }),
    rock: new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.9, flatShading:false }),
    vine: new THREE.MeshStandardMaterial({ color:0x5d8a34, roughness:.8 }),
    water: new THREE.MeshStandardMaterial({ color:0x2f9fa6, roughness:.12, metalness:.05, transparent:true, opacity:.88,
      emissive:0x0c3b40, emissiveIntensity:.6 }),
    foam: new THREE.MeshBasicMaterial({ color:0xffffff, alphaMap:T.water, transparent:true, opacity:.55, depthWrite:false }),
    shaft: new THREE.MeshBasicMaterial({ map:T.glow, transparent:true, opacity:.28, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.DoubleSide }),
    flower: new THREE.MeshStandardMaterial({ color:0xff5a7a, roughness:.6, emissive:0x401018 }),
    flower2: new THREE.MeshStandardMaterial({ color:0xffc83d, roughness:.6, emissive:0x403000 })
  };
  const G = {
    leafQuad: new THREE.PlaneGeometry(1, 1),
    trunk: (() => { const g = new THREE.CylinderGeometry(.55, 1, 1, 14, 12, true); g.translate(0, .5, 0);
      const p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++){ v.fromBufferAttribute(p, i); const a = Math.atan2(v.z, v.x);
        const flare = 1 + 1.6 * Math.exp(-v.y * 9) * (.6 + .4 * Math.abs(Math.sin(a * 2.5)));
        const wob = 1 + .06 * Math.sin(v.y * 9 + a * 3);
        p.setXYZ(i, v.x * flare * wob, v.y, v.z * flare * wob); }
      g.computeVertexNormals(); return g; })(),
    root: (() => { const g = new THREE.ConeGeometry(1, 1, 4, 1); g.translate(0, .5, 0); return g; })(),
    rock: (() => { const g = new THREE.IcosahedronGeometry(1, 3); const p = g.attributes.position, v = new THREE.Vector3(), col = [];
      for (let i = 0; i < p.count; i++){ v.fromBufferAttribute(p, i); const n = .78 + .45 * fbm(v.x * 1.7 + 3, v.z * 1.7 + v.y);
        v.multiplyScalar(n); v.y *= .7; p.setXYZ(i, v.x, v.y, v.z);
        const moss = Math.max(0, Math.min(1, (v.y + .1) * 2.2));
        col.push(.42 - .2 * moss, .4 + .05 * moss, .36 - .2 * moss); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g; })(),
    flower: new THREE.SphereGeometry(.18, 8, 6)
  };
  /* UV cells of the atlas: [u0, v0] for a 0.5×0.5 cell */
  const CELL = { broad:[0, .5], palm:[.5, .5], fern:[0, 0], spray:[.5, 0] };
  const leafGeos = {};
  for (const k in CELL){
    const g = G.leafQuad.clone(); const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, CELL[k][0] + uv.getX(i) * .5, CELL[k][1] + uv.getY(i) * .5);
    g.translate(0, .5, 0);                 /* pivot at the stem */
    leafGeos[k] = g;
  }

  const chunks = new Map();
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  function bentTrunk(group, x, y0, z, h, r, lean, R){
    const m = new THREE.Mesh(G.trunk, M.bark);
    m.position.set(x, y0 - 1, z); m.scale.set(r, h + 1, r);
    m.rotation.z = lean.x; m.rotation.x = lean.z;
    m.castShadow = Q === 'high'; m.receiveShadow = Q === 'high';
    group.add(m);
    /* where the top ends up */
    const top = new THREE.Vector3(0, h, 0).applyEuler(m.rotation).add(new THREE.Vector3(x, y0 - 1, z));
    return top;
  }
  function addCanopy(list, cx, cy, cz, rx, ry, rz, n, R, kinds){
    for (let i = 0; i < n; i++){
      const u = R() * Math.PI * 2, v = Math.acos(2 * R() - 1) * .8;
      const px = cx + Math.cos(u) * Math.sin(v) * rx, py = cy + Math.cos(v) * ry * (R() > .3 ? 1 : -.5), pz = cz + Math.sin(u) * Math.sin(v) * rz;
      list.push({ k:kinds[i % kinds.length], x:px, y:py, z:pz, s:2.4 + R() * 2.4, ry:R() * 6.28, rx:-.6 - R() * 1.4, rz:(R() - .5) * .8,
        c:[.75 + R() * .35, .85 + R() * .3, .7 + R() * .3] });
    }
  }
  function curveTube(points, r, mat, group, seg){
    const curve = new THREE.CatmullRomCurve3(points);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg || 24, r, 6, false), mat);
    m.castShadow = Q === 'high'; group.add(m); return { m, curve };
  }

  function buildChunk(ci){
    const z0 = -ci * CH, z1 = z0 - CH;
    const R = rng(1000 + ci * 7919);
    const group = new THREE.Group();
    const leaves = [];
    /* --- terrain strip --- */
    const W = 90, NX = Q === 'high' ? 60 : 36, NZ = Q === 'high' ? 32 : 18;
    const tg = new THREE.PlaneGeometry(W, CH, NX, NZ); tg.rotateX(-Math.PI / 2);
    const p = tg.attributes.position, cols = [];
    for (let i = 0; i < p.count; i++){
      const lx = p.getX(i), lz = p.getZ(i), wz = z0 - CH / 2 + lz, rx = riverX(wz), wx = rx + lx;
      const h = groundY(wx, wz);
      p.setXYZ(i, wx, h, wz);
      const d = Math.abs(wx - rx), w = riverW(wz), n = fbm(wx * .2, wz * .2);
      if (d < w + 1.2) col.setRGB(.36 + n * .1, .34 + n * .08, .28);                /* wet stones */
      else if (d < w + 4.5) col.setRGB(.34 + n * .12, .33 + n * .1, .26 + n * .05); /* rocky bank */
      else col.setRGB(.13 + n * .08, .3 + n * .12, .08 + n * .04);                  /* moss floor */
      cols.push(col.r, col.g, col.b);
    }
    tg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); tg.computeVertexNormals();
    const terr = new THREE.Mesh(tg, M.ground); terr.receiveShadow = Q === 'high'; group.add(terr);
    /* --- river surface + foam --- */
    const rg = new THREE.PlaneGeometry(1, CH, 1, 24); rg.rotateX(-Math.PI / 2);
    const rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++){ const lz = rp.getZ(i), wz = z0 - CH / 2 + lz; rp.setXYZ(i, riverX(wz) + rp.getX(i) * riverW(wz) * 2.05, RIVER_Y - .35, wz); }
    rg.computeVertexNormals();
    group.add(new THREE.Mesh(rg, M.water));
    const fg = rg.clone(); const fp = fg.attributes.position; for (let i = 0; i < fp.count; i++) fp.setY(i, RIVER_Y - .3);
    const uvs = fg.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 2, uvs.getY(i) * 6);
    group.add(new THREE.Mesh(fg, M.foam));
    /* --- rocks in and beside the river --- */
    for (let i = 0; i < 9; i++){
      const z = z0 - R() * CH, side = R() < .5 ? -1 : 1, inRiver = R() < .45;
      const x = riverX(z) + side * (inRiver ? R() * riverW(z) * .8 : riverW(z) + R() * 4);
      const s = inRiver ? .7 + R() * 1.4 : 1 + R() * 2.2;
      const rk = new THREE.Mesh(G.rock, M.rock); rk.position.set(x, groundY(x, z) - .2, z); rk.scale.set(s * (1 + R() * .5), s, s); rk.rotation.y = R() * 6;
      rk.castShadow = Q === 'high'; rk.receiveShadow = Q === 'high'; group.add(rk);
    }
    /* --- trees lining the canyon --- */
    const nTrees = Q === 'high' ? 16 : 10;
    for (let i = 0; i < nTrees; i++){
      const z = z0 - (i + R()) * CH / nTrees, side = i % 2 ? 1 : -1;
      const d = 9 + R() * (i % 3 === 0 ? 5 : 16);
      const x = riverX(z) + side * d, y0 = groundY(x, z);
      const h = Math.max(8, CANOPY_Y + 5 + R() * 7 - y0), r = .75 + R() * .7;
      const lean = { x:-side * (.05 + R() * .12), z:(R() - .5) * .1 };
      const top = bentTrunk(group, x, y0, z, h, r, lean, R);
      addCanopy(leaves, top.x, top.y + 1, top.z, 5.5 + R() * 3, 3, 5.5 + R() * 3, Q === 'high' ? 110 : 55, R, ['broad', 'spray', 'spray', 'palm', 'broad']);
      /* a mid-height cluster too */
      addCanopy(leaves, x + (top.x - x) * .5, y0 + h * .55, z, 2.5, 1.5, 2.5, Q === 'high' ? 16 : 8, R, ['broad', 'spray']);
      /* moss-hanging vines from canopy edges */
      for (let j = 0; j < 3; j++){
        const hx = top.x + (R() - .5) * 8 - side * 3, hz = top.z + (R() - .5) * 6, hy = top.y - 1 + R();
        const len = 5 + R() * 9;
        const pts = []; for (let k = 0; k <= 4; k++) pts.push(new THREE.Vector3(hx + Math.sin(k + j) * .25, hy - len * k / 4, hz + Math.cos(k * 1.3) * .25));
        curveTube(pts, .05 + R() * .04, M.vine, group, 10);
        for (let k = 1; k < 4; k++) leaves.push({ k:'spray', x:hx, y:hy - len * k / 4.5, z:hz, s:.9 + R() * .5, ry:R() * 6, rx:-.3, rz:0, c:[.9, 1, .9] });
      }
    }
    /* lianas: sagging loops between trees across the canyon (like the reference) */
    for (let i = 0; i < 3; i++){
      const z = z0 - R() * CH, a = new THREE.Vector3(riverX(z) - 11 - R() * 4, CANOPY_Y + 4 + R() * 4, z + (R() - .5) * 8);
      const b = new THREE.Vector3(riverX(z) + 11 + R() * 4, CANOPY_Y + 4 + R() * 4, z + (R() - .5) * 8);
      const sag = 2 + R() * 2.5, pts = [];
      for (let k = 0; k <= 8; k++){ const t = k / 8; pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * Math.sin(t * Math.PI), 0))); }
      curveTube(pts, .09, M.vine, group, 30);
      for (let k = 1; k < 8; k++) if (R() < .7) leaves.push({ k:'spray', x:pts[k].x, y:pts[k].y - .3, z:pts[k].z, s:1 + R() * .6, ry:R() * 6, rx:-.2, rz:0, c:[.9, 1, .9] });
    }
    /* ferns and palms on the banks */
    const nF = Q === 'high' ? 70 : 35;
    for (let i = 0; i < nF; i++){
      const z = z0 - R() * CH, side = R() < .5 ? -1 : 1, x = riverX(z) + side * (riverW(z) + 2.5 + R() * 22), y = groundY(x, z);
      const kind = R() < .7 ? 'fern' : 'palm', n = kind === 'fern' ? 7 : 5, s = kind === 'fern' ? 1.4 + R() : 2.5 + R() * 1.5;
      for (let j = 0; j < n; j++) leaves.push({ k:kind, x, y:y - .1, z, s, ry:j / n * 6.28 + R(), rx:-(.55 + R() * .5), rz:0, c:[.8 + R() * .3, .9 + R() * .2, .8] });
      if (R() < .15){ const f = new THREE.Mesh(G.flower, R() < .5 ? M.flower : M.flower2); f.position.set(x + .3, y + .5, z); group.add(f); }
    }
    /* dense undergrowth: bushes of broad leaves and sprays all over the floor */
    const nB = Q === 'high' ? 90 : 45;
    for (let i = 0; i < nB; i++){
      const z = z0 - R() * CH, side = R() < .5 ? -1 : 1, x = riverX(z) + side * (riverW(z) + 3.5 + R() * 30), y = groundY(x, z);
      const s = 1.6 + R() * 1.8, n = 6;
      for (let j = 0; j < n; j++) leaves.push({ k:j % 2 ? 'broad' : 'spray', x:x + (R() - .5), y:y - .2, z:z + (R() - .5), s, ry:j / n * 6.28 + R(), rx:-(.4 + R() * .7), rz:(R() - .5) * .5,
        c:[.7 + R() * .3, .85 + R() * .25, .6 + R() * .3] });
    }
    /* far slopes: a carpet of treetops so the canyon walls read as forest */
    const nC = Q === 'high' ? 26 : 14;
    for (let i = 0; i < nC; i++){
      const z = z0 - R() * CH, side = i % 2 ? 1 : -1, x = riverX(z) + side * (24 + R() * 26), y = groundY(x, z) + 6 + R() * 6;
      addCanopy(leaves, x, y, z, 6 + R() * 3, 3.5, 6 + R() * 3, Q === 'high' ? 40 : 20, R, ['broad', 'spray', 'palm']);
    }
    /* light shafts */
    if (Q === 'high') for (let i = 0; i < 2; i++){
      const z = z0 - R() * CH, sh = new THREE.Mesh(new THREE.PlaneGeometry(4 + R() * 4, 40), M.shaft);
      sh.position.set(riverX(z) + (R() - .5) * 14, 14, z); sh.rotation.z = .35; sh.rotation.y = R() * .6; group.add(sh);
    }
    /* --- leaves as instanced cards, one InstancedMesh per kind --- */
    const byKind = {}; leaves.forEach(l => (byKind[l.k] = byKind[l.k] || []).push(l));
    for (const k in byKind){
      const arr = byKind[k];
      const im = new THREE.InstancedMesh(leafGeos[k], M.leaf, arr.length);
      arr.forEach((l, i) => {
        dummy.position.set(l.x, l.y, l.z); dummy.rotation.set(0, l.ry, 0); dummy.rotateX(l.rx); dummy.rotateZ(l.rz);
        dummy.scale.set(l.s, l.s, l.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
        im.setColorAt(i, col.setRGB(l.c[0], l.c[1], l.c[2]));
      });
      im.castShadow = Q === 'high' && k !== 'fern';
      im.receiveShadow = false;
      group.add(im);
    }
    mergeStatic(group);
    scene.add(group);
    return group;
  }
  /* collapse every plain mesh in a chunk into one mesh per material: a few
     draw calls per chunk instead of ~100, which is what keeps school laptops smooth */
  function mergeStatic(group){
    const byMat = new Map(), drop = [];
    group.updateMatrixWorld(true);
    group.children.forEach(m => {
      if (!m.isMesh || m.isInstancedMesh || m.material === M.water || m.material === M.foam || m.material === M.shaft || m.material === M.ground) return;
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (!['position','normal','uv','color'].includes(k)) g.deleteAttribute(k);
      if (!byMat.has(m.material)) byMat.set(m.material, []);
      byMat.get(m.material).push(g); drop.push(m);
    });
    drop.forEach(m => group.remove(m));
    for (const [mat, list] of byMat){
      const hasColor = list.some(g => g.attributes.color);
      list.forEach(g => { if (hasColor && !g.attributes.color){ const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
                          if (!g.attributes.uv){ g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); } });
      const merged = mergeGeometries(list, false);
      list.forEach(g => g.dispose());
      if (!merged) continue;
      const mm = new THREE.Mesh(merged, mat);
      mm.castShadow = Q === 'high' && mat !== M.rock; mm.receiveShadow = Q === 'high';
      group.add(mm);
    }
  }
  function disposeChunk(g){
    scene.remove(g);
    g.traverse(n => { if (n.geometry && !Object.values(G).includes(n.geometry) && !Object.values(leafGeos).includes(n.geometry)) n.geometry.dispose(); if (n.isInstancedMesh) n.dispose(); });
  }

  /* limbs that hold the game's vines: a branch from a side trunk out over the path */
  const limbGroup = new THREE.Group(); scene.add(limbGroup);
  function addLimb(anchor){
    const R = rng(Math.floor(anchor.z * 13 + anchor.x * 7) + 99);
    const side = anchor.x > riverX(anchor.z) ? -1 : 1;     /* grow from the far side */
    const base = new THREE.Vector3(riverX(anchor.z) + side * (10 + R() * 3), CANOPY_Y - 4, anchor.z + (R() - .5) * 4);
    const tip = new THREE.Vector3(anchor.x - side * (2 + R() * 2), anchor.y + .6, anchor.z + (R() - .5) * 2);
    const mid = new THREE.Vector3().lerpVectors(base, tip, .5); mid.y += 2.2;
    const g = new THREE.Group();
    curveTube([base, mid, new THREE.Vector3(anchor.x, anchor.y + .25, anchor.z), tip], .32, M.bark, g, 16);
    const lv = [];
    addCanopy(lv, tip.x, tip.y + .8, tip.z, 2.5, 1.1, 2, 22, R, ['broad', 'spray']);
    addCanopy(lv, mid.x, mid.y + .8, mid.z, 3, 1.2, 2.5, 22, R, ['broad', 'spray']);
    const im = new THREE.InstancedMesh(leafGeos.spray, M.leaf, lv.length);
    lv.forEach((l, i) => { dummy.position.set(l.x, l.y, l.z); dummy.rotation.set(0, l.ry, 0); dummy.rotateX(l.rx); dummy.scale.setScalar(l.s * .8); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    g.add(im);
    limbGroup.add(g);
    return g;
  }
  function removeLimb(g){ limbGroup.remove(g); g.traverse(n => { if (n.geometry && n.geometry.type === 'TubeGeometry') n.geometry.dispose(); }); }

  /* motes */
  const NM = Q === 'high' ? 400 : 150;
  const mg = new THREE.BufferGeometry(), mp = new Float32Array(NM * 3);
  for (let i = 0; i < NM; i++){ mp[i * 3] = (Math.random() - .5) * 40; mp[i * 3 + 1] = 2 + Math.random() * 22; mp[i * 3 + 2] = -Math.random() * 90; }
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color:0xfff3c4, size:.16, transparent:true, opacity:.8, depthWrite:false }));
  scene.add(motes);

  /* butterflies */
  const flies = [];
  const wingG = new THREE.CircleGeometry(.22, 10); wingG.translate(.2, 0, 0);
  for (let i = 0; i < (Q === 'high' ? 8 : 3); i++){
    const b = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color:[0xff7b2e, 0x4cc9ff, 0xffd23d, 0xff5ab0][i % 4], side:THREE.DoubleSide });
    const l = new THREE.Mesh(wingG, m), r = new THREE.Mesh(wingG, m); r.rotation.y = Math.PI;
    b.add(l); b.add(r); b.userData = { l, r, ph:Math.random() * 6, off:new THREE.Vector3((Math.random() - .5) * 16, 3 + Math.random() * 10, -10 - Math.random() * 40) };
    scene.add(b); flies.push(b);
  }

  /* distant hills, fixed relative to the camera (parallax) */
  const far = new THREE.Group();
  const hillM = new THREE.MeshBasicMaterial({ color:0x6fa58c, fog:false });
  const hillM2 = new THREE.MeshBasicMaterial({ color:0x8bbfa6, fog:false });
  for (let i = 0; i < 12; i++){
    const h = new THREE.Mesh(new THREE.ConeGeometry(30 + Math.random() * 30, 60 + Math.random() * 70, 7), i % 2 ? hillM : hillM2);
    const s = i % 2 ? -1 : 1;
    h.position.set(s * (40 + Math.random() * 90), -10, -220 - Math.random() * 120); far.add(h);
  }
  scene.add(far);

  function update(camZ, camPos, t, dt){
    const ci0 = Math.max(0, Math.floor(-(camZ + 30) / CH)), ci1 = Math.floor(-(camZ - 150) / CH);
    for (const [k, g] of chunks) if (k < ci0 || k > ci1){ disposeChunk(g); chunks.delete(k); }
    let built = 0;
    for (let k = ci0; k <= ci1; k++) if (!chunks.has(k) && built < 1){ chunks.set(k, buildChunk(k)); built++; }
    T.water.offset.y += dt * .35; T.water.offset.x = Math.sin(t * .3) * .02;
    far.position.set(camPos.x * .8, 0, camZ);
    const a = motes.geometry.attributes.position;
    for (let i = 0; i < NM; i++){
      let z = a.getZ(i); if (z > camZ + 5){ z -= 95; a.setX(i, camPos.x + (Math.random() - .5) * 40); a.setZ(i, z); }
      a.setY(i, a.getY(i) + Math.sin(t * 1.5 + i) * .004);
    }
    a.needsUpdate = true;
    flies.forEach((b, i) => { const u = b.userData; const ft = t * .5 + u.ph;
      b.position.set(camPos.x + u.off.x + Math.sin(ft) * 3, u.off.y + Math.sin(ft * 1.7) * 1.5, camZ + u.off.z + Math.cos(ft * .8) * 3);
      if (b.position.z > camZ - 3) u.off.z -= 30;
      if (u.off.z < -60) u.off.z += 50;
      const f = Math.sin(t * 18 + u.ph) * 1.1; u.l.rotation.y = f; u.r.rotation.y = Math.PI - f; b.rotation.y = ft; });
  }
  /* build the first chunks synchronously */
  function prime(camZ){ const ci1 = Math.floor(-(camZ - 150) / CH); for (let k = 0; k <= ci1; k++) if (!chunks.has(k)) chunks.set(k, buildChunk(k)); }
  function reset(){ for (const [k, g] of chunks){ disposeChunk(g); } chunks.clear(); }
  return { update, prime, reset, addLimb, removeLimb, M };
}
