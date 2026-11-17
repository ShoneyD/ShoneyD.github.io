/* ==========================================================================
   museum3d — a walkable first-person gallery the STUDENT curates.

   The page defines window.MUSEUM (see activities/monster-museum.html for the
   annotated format) and loads, in order:
     ../assets/vendor/three-r128.min.js
     ../assets/museum3d/museum3d.js
   and links ../assets/museum3d/museum3d.css. Everything course-specific lives
   in window.MUSEUM: exhibits, prompts, fields, image archive, theme, export
   title. The engine never changes per class.

   What the student does: walk the hall (WASD / arrows / drag / the on-screen
   pad / Prev-Next buttons), click an empty frame, and fill it one step at a
   time: a picture (archive, upload, or link), then the placard fields. The
   frame and placard update live. The last stop is the curator's statement.

   Saving: answers in localStorage, uploaded pictures in IndexedDB (both per
   browser). "Save my museum file" downloads everything as one .json so the
   work moves between computers; "Open a museum file" restores it.
   Export: a real .docx (images embedded, built here with a tiny zip writer,
   no libraries), a print view (Save as PDF), and plain text for Canvas.
   ========================================================================== */
(function () {
'use strict';
const CFG = window.MUSEUM;
if (!CFG) { console.error('museum3d: window.MUSEUM is missing'); return; }
const KEY = 'museum3d:' + CFG.id;
const ROOT = document.getElementById('museum');

/* ---------------- tiny DOM helpers ---------------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------- exhibits ---------------- */
const EXH = CFG.exhibits.map((x, i) => Object.assign({ idx: i, side: i % 2 === 0 ? -1 : 1 }, x));
if (CFG.hall) EXH.push(Object.assign({ idx: EXH.length, hall: true, image: false }, CFG.hall));
const byId = id => EXH.find(x => x.id === id);

/* ---------------- state ---------------- */
let state = { v: 1, name: '', ex: {}, seenIntro: false };
const IMG = {};            // exId -> dataURL for uploads (cached from IndexedDB)
function blank(x) { return { img: null, f: {}, done: false }; }
function S(id) { return state.ex[id] || (state.ex[id] = blank(byId(id))); }
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function loadLocal() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.ex) state = s; return !!raw; } } catch (e) {}
  return false;
}
function applyStarters() {
  for (const x of EXH) {
    if (!x.starter || state.ex[x.id]) continue;
    const s = S(x.id);
    if (x.starter.image != null && x.shelf && x.shelf[x.starter.image]) {
      const it = x.shelf[x.starter.image];
      s.img = { kind: 'shelf', src: it.src, credit: it.credit, title: it.title };
    }
    if (x.starter.fields) Object.assign(s.f, JSON.parse(JSON.stringify(x.starter.fields)));
  }
}

/* IndexedDB for uploaded pictures */
const IDB = {
  db: null,
  open() { return new Promise(res => { try { const r = indexedDB.open('museum3d', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('img');
    r.onsuccess = () => { IDB.db = r.result; res(true); }; r.onerror = () => res(false);
  } catch (e) { res(false); } }); },
  put(k, v) { return new Promise(res => { if (!IDB.db) return res(false); try {
    const t = IDB.db.transaction('img', 'readwrite'); t.objectStore('img').put(v, k);
    t.oncomplete = () => res(true); t.onerror = () => res(false); } catch (e) { res(false); } }); },
  get(k) { return new Promise(res => { if (!IDB.db) return res(null); try {
    const q = IDB.db.transaction('img').objectStore('img').get(k);
    q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }); }
};
const imgKey = id => KEY + ':' + id;

/* ---------------- completeness ---------------- */
function fieldOk(f, v) {
  if (f.optional) return true;
  if (f.type === 'tags') return Array.isArray(v) && v.length >= (f.min || 1);
  if (f.type === 'select') return !!v;
  return typeof v === 'string' && v.trim().length >= (f.minChars || 3);
}
function imageOk(x) {
  if (x.hall || x.image === false) return true;
  const s = S(x.id);
  if (!s.img || !s.img.src) return false;
  if (s.img.kind !== 'shelf' && !(s.img.credit || '').trim()) return false;
  return true;
}
function exOk(x) { return imageOk(x) && x.fields.every(f => fieldOk(f, S(x.id).f[f.id])); }
function missing(x) {
  const m = [];
  if (!imageOk(x)) m.push(S(x.id).img ? 'where the picture is from' : 'a picture');
  x.fields.forEach(f => { if (!fieldOk(f, S(x.id).f[f.id])) m.push(f.short || f.label); });
  return m;
}
function doneCount() { return EXH.filter(x => S(x.id).done && exOk(x)).length; }

/* ---------------- theme ---------------- */
const T = Object.assign({ wall: '#2b2230', wallPattern: '#3a2c3f', floorA: '#2a2420', floorB: '#201b18', carpet: '#3e0f15',
  trim: '#d4a64a', light: '#ffcf8a', fog: '#0c0a0e', placard: '#efe6d2', placardInk: '#2a1d14', banner: '#1b1418', bannerInk: '#e9c97a' }, CFG.theme || {});

/* ======================================================================
   DOM
   ====================================================================== */
const els = {};
function buildDom() {
  ROOT.innerHTML = '';
  els.candles = h('div', { class: 'm-candles', 'aria-live': 'polite' });
  ROOT.append(h('div', { class: 'm-head' },
    h('div', null, h('h1', { text: CFG.title }), h('p', { text: CFG.subtitle || '' })), els.candles));

  els.wrap = h('div', { class: 'm-stagewrap' });
  els.tip = h('div', { class: 'm-tip', text: 'WASD or arrows to walk · drag to look · click a frame to curate it' });
  const pad = h('div', { class: 'm-pad', 'aria-label': 'Walk' },
    padBtn('▲', 'up', 'fwd'), padBtn('◀', 'left', 'tl'), padBtn('▼', 'down', 'back'), padBtn('▶', 'right', 'tr'));
  els.prev = h('button', { type: 'button', onclick: () => step(-1) }, '◀ Previous');
  els.next = h('button', { type: 'button', class: 'go', onclick: () => step(1) }, 'Next exhibit ▶');
  els.wrap.append(els.tip, h('div', { class: 'm-hud' }, pad, h('div', { class: 'm-nav' }, els.prev, els.next)));
  els.panel = h('div', { class: 'm-panel', role: 'dialog', 'aria-label': 'Curate this exhibit' });
  els.wrap.append(els.panel);
  els.toast = h('div', { class: 'm-toast', role: 'status' });
  els.wrap.append(els.toast);
  els.intro = h('div', { class: 'm-overlay' });
  els.wrap.append(els.intro);
  ROOT.append(els.wrap);

  /* below the stage */
  els.list = h('div', { class: 'm-list' });
  const listCard = h('div', { class: 'm-card' }, h('h2', { text: 'Your exhibits' }),
    h('p', { style: 'margin:0 0 8px;color:var(--m-soft)', text: 'Tap one to walk straight to it.' }), els.list);
  els.expMsg = h('div', { class: 'm-msg', role: 'status' });
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: e => openFile(e.target.files[0]) });
  const expCard = h('div', { class: 'm-card' },
    h('h2', { text: CFG.exportHeading || 'Finish and turn it in' }),
    h('p', { style: 'margin:0 0 10px;color:var(--m-soft)', html: CFG.exportNote ||
      'When every candle is lit: <strong>Download the document</strong> and upload it to Canvas. Then paste the text too, as a backup.' }),
    h('div', { class: 'm-row' },
      h('button', { type: 'button', class: 'go', onclick: exportDocx }, '📄 Download the document (.docx)'),
      h('button', { type: 'button', onclick: printView }, '🖨 Print / Save as PDF'),
      h('button', { type: 'button', onclick: copyText }, '📋 Copy text for Canvas')),
    h('div', { class: 'm-row', style: 'margin-top:10px' },
      h('button', { type: 'button', class: 'ghost', onclick: saveFile }, '💾 Save my museum file'),
      h('button', { type: 'button', class: 'ghost', onclick: () => fileIn.click() }, '📂 Open a museum file'),
      fileIn),
    h('p', { style: 'margin:8px 0 0;font-size:.88rem;color:var(--m-soft)',
      text: 'Your museum saves itself in this browser. Working on another computer next time? Save the museum file now and open it there.' }),
    els.expMsg);
  ROOT.append(h('div', { class: 'm-below' }, listCard, expCard));
  els.print = h('div', { id: 'm-print' });
  document.body.append(els.print);
}
function padBtn(label, cls, key) {
  const b = h('button', { type: 'button', class: cls, 'aria-label': { fwd: 'Walk forward', back: 'Walk back', tl: 'Turn left', tr: 'Turn right' }[key] }, label);
  const on = e => { e.preventDefault(); keys[key] = true; };
  const off = () => { keys[key] = false; };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  return b;
}
function toast(msg) {
  els.toast.textContent = msg; els.toast.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => els.toast.classList.remove('show'), 2600);
}
function renderStatus() {
  const n = doneCount();
  els.candles.textContent = EXH.map(x => (S(x.id).done && exOk(x)) ? '🕯️' : '○').join('');
  els.candles.title = n + ' of ' + EXH.length + ' finished';
  els.list.innerHTML = '';
  EXH.forEach(x => {
    const ok = S(x.id).done && exOk(x);
    const started = Object.keys(S(x.id).f).length || S(x.id).img;
    els.list.append(h('button', { type: 'button', onclick: () => goTo(x.idx, true) },
      h('b', { text: (ok ? '🕯️ ' : '') + (x.wing || x.title) }),
      h('span', { class: 'st' + (ok ? ' ok' : ''), text: ok ? 'Finished' : started ? 'Started: ' + missing(x).length + ' left' : 'Empty' })));
  });
  if (n === EXH.length && !renderStatus.cheered) { renderStatus.cheered = true; toast('Museum complete! Download the document below.'); }
}

/* ======================================================================
   3D
   ====================================================================== */
let renderer, scene, camera, raycaster, clickables = [];
const ROOM = { w: 12, h: 5.4, gap: 11 };
const PAIRS = Math.ceil(CFG.exhibits.length / 2);
const Z0 = 3.5, ZFIRST = -6, ZEND = ZFIRST - (PAIRS - 1) * ROOM.gap - 12;
const look = { yaw: 0, pitch: -0.04 };
const keys = {};
let glide = null;
const objs = {};   // exId -> { picTex, picCanvas, placTex, placCanvas, flame, light }

function canvasTex(w, hgt, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = hgt;
  draw(c.getContext('2d'), w, hgt);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return { tex: t, canvas: c };
}
function wrapLines(ctx, text, maxW) {
  const out = [];
  String(text || '').split('\n').forEach(par => {
    const words = par.split(/\s+/).filter(Boolean); let line = '';
    words.forEach(w => { const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; });
    out.push(line);
  });
  return out;
}
function exhibitPose(x) {
  if (x.hall) return { pos: new THREE.Vector3(0, 0, ZEND + 0.05), normal: new THREE.Vector3(0, 0, 1) };
  const pair = Math.floor(x.idx / 2);
  const z = ZFIRST - pair * ROOM.gap;
  const xx = x.side * (ROOM.w / 2 - 0.05);
  return { pos: new THREE.Vector3(xx, 0, z), normal: new THREE.Vector3(-x.side, 0, 0) };
}

function initThree() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  els.wrap.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'A 3D museum hall. Use the exhibit list below the hall if you cannot use the 3D view.');
  renderer.domElement.setAttribute('role', 'img');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(T.fog);
  scene.fog = new THREE.Fog(T.fog, 10, 46);
  camera = new THREE.PerspectiveCamera(66, 1, 0.05, 120);
  camera.rotation.order = 'YXZ';
  camera.position.set(0, 1.65, Z0);
  raycaster = new THREE.Raycaster();

  scene.add(new THREE.AmbientLight(0x8a7a90, 0.55));
  scene.add(new THREE.HemisphereLight(0xffe2b0, 0x1a1418, 0.35));

  const len = Z0 + 2 - ZEND;
  const zc = (Z0 + 2 + ZEND) / 2;
  /* floor: stone tiles */
  const fl = canvasTex(512, 512, (g, w, hh) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? T.floorA : T.floorB; g.fillRect(i * 128, j * 128, 128, 128);
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3; g.strokeRect(i * 128, j * 128, 128, 128);
    }
  });
  fl.tex.wrapS = fl.tex.wrapT = THREE.RepeatWrapping; fl.tex.repeat.set(ROOM.w / 4, len / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, len), new THREE.MeshStandardMaterial({ map: fl.tex, roughness: .85 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, zc); scene.add(floor);
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(2.4, len - 2), new THREE.MeshStandardMaterial({ color: T.carpet, roughness: 1 }));
  carpet.rotation.x = -Math.PI / 2; carpet.position.set(0, 0.005, zc); scene.add(carpet);
  /* walls: damask */
  const wl = canvasTex(256, 256, (g, w, hh) => {
    g.fillStyle = T.wall; g.fillRect(0, 0, w, hh);
    g.fillStyle = T.wallPattern;
    for (const [cx, cy] of [[64, 64], [192, 192], [192, 64], [64, 192]]) {
      g.beginPath(); g.ellipse(cx, cy, 22, 40, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(cx, cy, 40, 14, 0, 0, Math.PI * 2); g.fill();
    }
  });
  wl.tex.wrapS = wl.tex.wrapT = THREE.RepeatWrapping;
  const wallMat = len2 => { const t = wl.tex.clone(); t.needsUpdate = true; t.repeat.set(len2 / 2.2, ROOM.h / 2.2); return new THREE.MeshStandardMaterial({ map: t, roughness: .95 }); };
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, ROOM.h), wallMat(len));
    wall.position.set(s * ROOM.w / 2, ROOM.h / 2, zc); wall.rotation.y = -s * Math.PI / 2; scene.add(wall);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, len), new THREE.MeshStandardMaterial({ color: T.trim, metalness: .5, roughness: .4 }));
    rail.position.set(s * (ROOM.w / 2 - 0.04), 1.0, zc); scene.add(rail);
  }
  for (const [z, ry] of [[ZEND, 0], [Z0 + 2, Math.PI]]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.h), wallMat(ROOM.w));
    wall.position.set(0, ROOM.h / 2, z); wall.rotation.y = ry; scene.add(wall);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, len), new THREE.MeshStandardMaterial({ color: 0x0e0b10, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, ROOM.h, zc); scene.add(ceil);
  /* pillars and hanging lights between pairs */
  for (let p = 0; p <= PAIRS; p++) {
    const z = ZFIRST + ROOM.gap / 2 - p * ROOM.gap;
    for (const s of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, ROOM.h, 0.7), new THREE.MeshStandardMaterial({ color: 0x1d171f, roughness: .8 }));
      col.position.set(s * (ROOM.w / 2 - 0.35), ROOM.h / 2, z); scene.add(col);
    }
  }
  /* entrance title on the floor-facing wall above the start */
  const sign = canvasTex(1024, 192, (g, w, hh) => {
    g.fillStyle = T.banner; g.fillRect(0, 0, w, hh); g.strokeStyle = T.trim; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, hh - 16);
    g.fillStyle = T.bannerInk; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 74px Georgia, serif';
    g.fillText(CFG.title, w / 2, hh / 2);
  });
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.125), new THREE.MeshBasicMaterial({ map: sign.tex }));
  signM.position.set(0, ROOM.h - 0.9, ZEND + 0.02); scene.add(signM);

  EXH.forEach(buildExhibit);
  resize();
  new ResizeObserver(resize).observe(els.wrap);
  bindInput();
  requestAnimationFrame(loop);
}

function buildExhibit(x) {
  const pose = exhibitPose(x);
  const g = new THREE.Group();
  g.position.copy(pose.pos);
  g.lookAt(pose.pos.clone().add(pose.normal));
  scene.add(g);
  const o = objs[x.id] = {};
  const gold = new THREE.MeshStandardMaterial({ color: T.trim, metalness: .65, roughness: .35 });
  if (!x.hall) {
    const PW = 2.9, PH = 2.175, cy = 2.45, cx = -0.65;
    const pic = canvasTex(1024, 768, (c, w, hh) => drawPlaceholder(c, w, hh, x));
    o.picCanvas = pic.canvas; o.picTex = pic.tex;
    const picM = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: pic.tex }));
    picM.position.set(cx, cy, 0.05); g.add(picM);
    const t = 0.16;
    [[0, PH / 2 + t / 2, PW + 2 * t, t], [0, -PH / 2 - t / 2, PW + 2 * t, t], [-PW / 2 - t / 2, 0, t, PH], [PW / 2 + t / 2, 0, t, PH]].forEach(([dx, dy, w, hh]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 0.14), gold); b.position.set(cx + dx, cy + dy, 0.07); g.add(b);
    });
    const plc = canvasTex(512, 640, (c, w, hh) => drawPlacard(c, w, hh, x));
    o.placCanvas = plc.canvas; o.placTex = plc.tex;
    const placM = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 1.7), new THREE.MeshStandardMaterial({ map: plc.tex, roughness: .9 }));
    placM.position.set(cx + PW / 2 + 1.05, 2.15, 0.04); g.add(placM);
    const ban = canvasTex(1024, 160, (c, w, hh) => {
      c.fillStyle = T.banner; c.fillRect(0, 0, w, hh); c.fillStyle = T.bannerInk; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 66px Georgia, serif'; c.fillText(x.wing || x.title, w / 2, hh / 2 - 6);
      if (x.wingSub) { c.font = 'italic 34px Georgia, serif'; c.globalAlpha = .8; c.fillText(x.wingSub, w / 2, hh - 24); }
    });
    const banM = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.625), new THREE.MeshBasicMaterial({ map: ban.tex }));
    banM.position.set(0, 4.13, 0.03); g.add(banM);
    [picM, placM].forEach(m => { m.userData.exId = x.id; clickables.push(m); });
    /* candle on top of the frame: lit when finished */
    const cand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 12), new THREE.MeshStandardMaterial({ color: 0xf2e8d5 }));
    cand.position.set(cx + PW / 2 + 1.05, 3.16, 0.1); g.add(cand);
    o.flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffc35a }));
    o.flame.scale.set(1, 1.7, 1); o.flame.position.set(cx + PW / 2 + 1.05, 3.37, 0.1); g.add(o.flame);
    const lamp = new THREE.PointLight(T.light, 1.0, 9, 2); lamp.position.set(cx, 3.6, 1.6); g.add(lamp); o.light = lamp;
  } else {
    /* the curator's lectern with an open book */
    const wood = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: .7 });
    const stand = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.05, 0.6), wood); stand.position.set(0, 0.52, 2.4); g.add(stand);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 1.4), wood); top.position.set(0, 1.1, 2.4); top.rotation.x = 0.35; g.add(top);
    const book = canvasTex(1024, 640, (c, w, hh) => drawBook(c, w, hh, x));
    o.placCanvas = book.canvas; o.placTex = book.tex;
    const bookM = new THREE.Mesh(new THREE.PlaneGeometry(1.92, 1.2), new THREE.MeshStandardMaterial({ map: book.tex, roughness: .9 }));
    bookM.position.set(0, 1.16, 2.42); bookM.rotation.x = -Math.PI / 2 + 0.35 + 0.02; bookM.rotation.order = 'YXZ'; g.add(bookM);
    const ban = canvasTex(1024, 160, (c, w, hh) => {
      c.fillStyle = T.banner; c.fillRect(0, 0, w, hh); c.fillStyle = T.bannerInk; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = 'bold 64px Georgia, serif'; c.fillText(x.wing || x.title, w / 2, hh / 2);
    });
    const banM = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.66), new THREE.MeshBasicMaterial({ map: ban.tex }));
    banM.position.set(0, 3.2, 0.03); g.add(banM);
    [stand, top, bookM, banM].forEach(m => { m.userData.exId = x.id; clickables.push(m); });
    o.flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffc35a }));
    o.flame.scale.set(1, 1.7, 1); o.flame.position.set(1.25, 1.46, 2.0); g.add(o.flame);
    const cand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.26, 12), new THREE.MeshStandardMaterial({ color: 0xf2e8d5 }));
    cand.position.set(1.25, 1.26, 2.0); g.add(cand);
    const lamp = new THREE.PointLight(T.light, 1.2, 10, 2); lamp.position.set(0, 3.4, 3.4); g.add(lamp); o.light = lamp;
  }
  o.group = g;
  refreshExhibit(x);
}

function drawPlaceholder(c, w, hh, x) {
  c.fillStyle = '#0d0b10'; c.fillRect(0, 0, w, hh);
  c.strokeStyle = 'rgba(212,166,74,.55)'; c.setLineDash([24, 18]); c.lineWidth = 6; c.strokeRect(40, 40, w - 80, hh - 80); c.setLineDash([]);
  c.fillStyle = '#e9dcc4'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = 'bold 60px Georgia, serif'; c.fillText('Empty frame', w / 2, hh / 2 - 60);
  c.font = '40px Georgia, serif'; c.fillStyle = '#c9bfb3'; c.fillText('Click to curate this exhibit', w / 2, hh / 2 + 10);
  c.font = 'italic 34px Georgia, serif'; c.fillText(x.wingSub || '', w / 2, hh / 2 + 70);
}
function fieldText(f, v) {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}
function drawPlacard(c, w, hh, x) {
  const s = S(x.id);
  c.fillStyle = T.placard; c.fillRect(0, 0, w, hh);
  c.strokeStyle = T.trim; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, hh - 10);
  c.fillStyle = T.placardInk; c.textAlign = 'left'; c.textBaseline = 'top';
  let y = 30; const L = 32, mw = w - 64;
  c.font = 'bold 26px Georgia, serif'; c.globalAlpha = .7; c.fillText((x.wing || '').toUpperCase(), L, y); c.globalAlpha = 1; y += 40;
  const pf = (x.placard || []);
  if (!pf.length || !Object.keys(s.f).length) {
    c.font = 'italic 26px Georgia, serif';
    wrapLines(c, 'This placard is blank. Click the frame and write it.', mw).forEach(l => { c.fillText(l, L, y); y += 34; });
    return;
  }
  pf.forEach((pid, i) => {
    const f = x.fields.find(q => q.id === pid); if (!f) return;
    const val = fieldText(f, s.f[pid]); if (!val) return;
    if (i === 0) { c.font = 'bold 36px Georgia, serif'; wrapLines(c, val, mw).slice(0, 3).forEach(l => { if (y < hh - 50) c.fillText(l, L, y); y += 42; }); y += 8; return; }
    if (f.placardLabel) { c.font = 'bold 24px Georgia, serif'; if (y < hh - 60) c.fillText(f.placardLabel, L, y); y += 30; }
    c.font = '27px Georgia, serif';
    wrapLines(c, val, mw).forEach(l => { if (y < hh - 40) c.fillText(l, L, y); y += 33; });
    y += 10;
  });
}
function drawBook(c, w, hh, x) {
  const s = S(x.id);
  c.fillStyle = '#f1e7d0'; c.fillRect(0, 0, w, hh);
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(w / 2 - 4, 0, 8, hh);
  c.fillStyle = '#2a1d14'; c.textBaseline = 'top';
  const pages = [[], []];
  x.fields.forEach((f, i) => { const v = fieldText(f, s.f[f.id]); if (v) pages[i < Math.ceil(x.fields.length / 2) ? 0 : 1].push([f, v]); });
  if (!pages[0].length && !pages[1].length) {
    c.font = 'italic 34px Georgia, serif'; c.textAlign = 'center';
    c.fillText('The curator has not written', w / 4, hh / 2 - 40); c.fillText('the statement yet.', w / 4, hh / 2);
    c.fillText('Click the book.', w * 3 / 4, hh / 2 - 20); return;
  }
  c.textAlign = 'left';
  pages.forEach((pg, pi) => {
    let y = 36; const L = pi ? w / 2 + 36 : 36, mw = w / 2 - 72;
    pg.forEach(([f, v]) => {
      c.font = 'bold 28px Georgia, serif'; if (y < hh - 60) c.fillText(f.short || f.label, L, y); y += 34;
      c.font = '27px Georgia, serif'; wrapLines(c, v, mw).forEach(l => { if (y < hh - 30) c.fillText(l, L, y); y += 32; }); y += 12;
    });
  });
}
function srcOf(x) {
  const s = S(x.id); if (!s.img) return null;
  if (s.img.kind === 'upload') return IMG[x.id] || null;
  return s.img.src;
}
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); if (!/^data:/.test(src)) im.crossOrigin = 'anonymous';
    const t = setTimeout(() => rej(new Error('timeout')), 12000);
    im.onload = () => { clearTimeout(t); res(im); }; im.onerror = e => { clearTimeout(t); rej(e); }; im.src = src; });
}
function refreshExhibit(x) {
  const o = objs[x.id]; if (!o) return;
  if (!x.hall) {
    const src = srcOf(x);
    const ctx = o.picCanvas.getContext('2d');
    if (!src) { drawPlaceholder(ctx, o.picCanvas.width, o.picCanvas.height, x); o.picTex.needsUpdate = true; }
    else loadImage(src).then(im => {
      const W = o.picCanvas.width, H = o.picCanvas.height;
      ctx.fillStyle = '#0b0a0d'; ctx.fillRect(0, 0, W, H);
      const k = Math.min(W / im.width, H / im.height); const dw = im.width * k, dh = im.height * k;
      ctx.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
      o.picTex.needsUpdate = true;
    }).catch(() => {
      drawPlaceholder(ctx, o.picCanvas.width, o.picCanvas.height, x);
      ctx.fillStyle = '#ef7a6b'; ctx.font = 'bold 34px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('This picture would not load.', o.picCanvas.width / 2, o.picCanvas.height - 90);
      o.picTex.needsUpdate = true;
    });
    drawPlacard(o.placCanvas.getContext('2d'), o.placCanvas.width, o.placCanvas.height, x);
  } else {
    drawBook(o.placCanvas.getContext('2d'), o.placCanvas.width, o.placCanvas.height, x);
  }
  o.placTex.needsUpdate = true;
  const lit = S(x.id).done && exOk(x);
  o.flame.visible = lit;
}

function resize() {
  const r = els.wrap.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}

/* ---------------- input ---------------- */
function typing() { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
function bindInput() {
  const map = { KeyW: 'fwd', ArrowUp: 'fwd', KeyS: 'back', ArrowDown: 'back', KeyA: 'sl', KeyD: 'sr', ArrowLeft: 'tl', ArrowRight: 'tr', KeyQ: 'tl', KeyE: 'tr' };
  window.addEventListener('keydown', e => {
    if (typing() || panelOpen() || els.intro.classList.contains('open')) return;
    const k = map[e.code]; if (k) { keys[k] = true; e.preventDefault(); glide = null; }
  });
  window.addEventListener('keyup', e => { const k = map[e.code]; if (k) keys[k] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  const cv = renderer.domElement;
  let down = null;
  cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0 }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!down) { hover(e); return; }
    const dx = e.clientX - down.lx, dy = e.clientY - down.ly; down.lx = e.clientX; down.ly = e.clientY;
    down.moved += Math.abs(dx) + Math.abs(dy);
    if (down.moved > 5) { look.yaw -= dx * 0.005; look.pitch = Math.max(-0.7, Math.min(0.6, look.pitch - dy * 0.004)); glide = null; }
  });
  cv.addEventListener('pointerup', e => { if (down && down.moved <= 6) clickAt(e); down = null; });
  cv.addEventListener('pointercancel', () => { down = null; });
}
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(v, camera);
  const hit = raycaster.intersectObjects(clickables, false)[0];
  return hit && hit.distance < 16 ? hit.object.userData.exId : null;
}
function hover(e) { renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab'; }
function clickAt(e) { const id = pick(e); if (id) { const x = byId(id); goTo(x.idx, true); } }

/* ---------------- movement ---------------- */
let cur = -1;
function viewPose(x) {
  const p = exhibitPose(x);
  if (x.hall) return { pos: new THREE.Vector3(0, 2.0, ZEND + 4.3), yaw: 0, pitch: -0.42 };
  const pos = p.pos.clone().add(p.normal.clone().multiplyScalar(4.4)); pos.y = 1.75;
  pos.z -= 0.0;
  const yaw = x.side < 0 ? Math.PI / 2 - 0.12 : -Math.PI / 2 + 0.12;
  pos.z += x.side < 0 ? -0.35 : 0.35;
  return { pos, yaw, pitch: 0.07 };
}
function goTo(i, openAfter) {
  i = Math.max(0, Math.min(EXH.length - 1, i));
  cur = i; closePanel(true);
  const vp = viewPose(EXH[i]);
  let dy = vp.yaw - look.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  glide = { t: 0, dur: 0.9, from: camera.position.clone(), to: vp.pos, y0: look.yaw, y1: look.yaw + dy, p0: look.pitch, p1: vp.pitch, open: openAfter ? EXH[i].id : null };
  updateNav();
}
function step(d) { goTo(cur < 0 ? (d > 0 ? 0 : EXH.length - 1) : cur + d, false); }
function updateNav() {
  els.prev.disabled = cur <= 0;
  els.next.textContent = cur >= EXH.length - 1 ? 'Last stop' : (cur < 0 ? 'First exhibit ▶' : 'Next exhibit ▶');
  els.next.disabled = cur >= EXH.length - 1;
  if (cur >= 0) els.tip.textContent = (EXH[cur].wing || EXH[cur].title) + (EXH[cur].hall ? ' · click the book to write it' : ' · click the frame to curate it');
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (glide) {
    glide.t += dt / glide.dur; const k = glide.t >= 1 ? 1 : 1 - Math.pow(1 - glide.t, 3);
    camera.position.lerpVectors(glide.from, glide.to, k);
    look.yaw = glide.y0 + (glide.y1 - glide.y0) * k; look.pitch = glide.p0 + (glide.p1 - glide.p0) * k;
    if (glide.t >= 1) { const id = glide.open; glide = null; if (id) openPanel(id); }
  } else if (!panelOpen()) {
    const sp = 3.4 * dt, tr = 1.9 * dt;
    if (keys.tl) look.yaw += tr; if (keys.tr) look.yaw -= tr;
    const fx = -Math.sin(look.yaw), fz = -Math.cos(look.yaw);
    let mx = 0, mz = 0;
    if (keys.fwd) { mx += fx; mz += fz; } if (keys.back) { mx -= fx; mz -= fz; }
    if (keys.sl) { mx += fz; mz -= fx; } if (keys.sr) { mx -= fz; mz += fx; }
    camera.position.x = Math.max(-ROOM.w / 2 + 0.9, Math.min(ROOM.w / 2 - 0.9, camera.position.x + mx * sp));
    camera.position.z = Math.max(ZEND + 1.6, Math.min(Z0 + 1.2, camera.position.z + mz * sp));
  }
  camera.rotation.set(look.pitch, look.yaw, 0);
  const tt = now / 1000;
  for (const id in objs) { const f = objs[id].flame; if (f && f.visible) f.scale.y = 1.6 + Math.sin(tt * 9 + id.length) * 0.15; }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

/* ======================================================================
   EDITOR PANEL (one step at a time)
   ====================================================================== */
let ed = null;   // { x, step }
function panelOpen() { return els.panel.classList.contains('open'); }
function stepsOf(x) { const st = []; if (!x.hall && x.image !== false) st.push({ kind: 'image' }); x.fields.forEach(f => st.push({ kind: 'field', f })); return st; }
function openPanel(id) {
  const x = byId(id); cur = x.idx; updateNav();
  const st = stepsOf(x);
  let first = st.findIndex(s => s.kind === 'image' ? !imageOk(x) : !fieldOk(s.f, S(x.id).f[s.f.id]));
  ed = { x, step: first < 0 ? 0 : first };
  els.panel.classList.add('open');
  renderPanel();
}
function closePanel(silent) {
  if (!panelOpen()) return;
  els.panel.classList.remove('open'); ed = null;
  if (!silent) renderer.domElement.focus && renderer.domElement.focus();
}
function setMsg(box, kind, html) { box.className = 'm-msg show ' + kind; box.innerHTML = html; }
function renderPanel() {
  const { x } = ed; const st = stepsOf(x); const s = S(x.id);
  els.panel.innerHTML = '';
  const dots = h('div', { class: 'm-dots', 'aria-label': 'Steps' });
  st.forEach((sp, i) => {
    const ok = sp.kind === 'image' ? imageOk(x) : fieldOk(sp.f, s.f[sp.f.id]);
    dots.append(h('button', { type: 'button', class: (i === ed.step ? 'cur ' : '') + (ok ? 'ok' : ''), title: sp.kind === 'image' ? 'Picture' : (sp.f.short || sp.f.label),
      onclick: () => { ed.step = i; renderPanel(); } }, ok ? '✓' : String(i + 1)));
  });
  els.panel.append(h('div', { class: 'm-ph' },
    h('div', { class: 'wing', text: (x.wing || '') + (x.wingSub ? ' · ' + x.wingSub : '') }),
    h('h2', { text: x.title }),
    x.prompt ? h('p', { class: 'prompt', html: x.prompt }) : null, dots));
  const body = h('div', { class: 'm-pb' });
  const cur = st[ed.step];
  const msg = h('div', { class: 'm-msg', role: 'status' });
  if (cur.kind === 'image') body.append(imageStep(x, msg)); else body.append(fieldStep(x, cur.f));
  body.append(msg);
  els.panel.append(body);
  const last = ed.step === st.length - 1;
  const back = h('button', { type: 'button', class: 'ghost', onclick: () => { ed.step = Math.max(0, ed.step - 1); renderPanel(); } }, '← Back');
  if (ed.step === 0) back.disabled = true;
  const fwd = last
    ? h('button', { type: 'button', class: 'go', onclick: () => finish(x, msg) }, x.hall ? 'Sign the statement ✓' : 'Hang it on the wall ✓')
    : h('button', { type: 'button', class: 'go', onclick: () => { ed.step++; renderPanel(); } }, 'Next →');
  els.panel.append(h('div', { class: 'm-pf' }, back,
    h('button', { type: 'button', class: 'ghost', onclick: () => { closePanel(); renderStatus(); } }, 'Close'), fwd,
    h('p', { class: 'note', text: CFG.panelNote || "Don't worry about spelling. You can say any answer out loud and your teacher will type it." })));
  const focusable = body.querySelector('textarea, input[type=text]');
  if (focusable && !/Mobi/.test(navigator.userAgent)) setTimeout(() => focusable.focus({ preventScroll: true }), 30);
}
function changed(x) { saveLocal(); refreshExhibit(x); renderStatus(); }
function finish(x, msg) {
  const m = missing(x);
  if (m.length) {
    setMsg(msg, 'warn', '<strong>Almost.</strong> Still to do: ' + m.map(esc).join(' · ') + '. Tap a number above to jump to it.');
    return;
  }
  S(x.id).done = true; changed(x);
  closePanel(); toast((x.hall ? 'Statement signed' : 'Exhibit hung') + '. ' + doneCount() + ' of ' + EXH.length + ' candles lit.');
}
function fieldStep(x, f) {
  const s = S(x.id); const v = s.f[f.id];
  const wrap = h('div', { class: 'm-step' }, h('h3', { text: f.label }), f.hint ? h('p', { class: 'hint', html: f.hint }) : null);
  const set = val => { s.f[f.id] = val; s.done = s.done && exOk(x); changed(x); };
  if (f.type === 'textarea' || f.type === 'text' || f.type === 'work') {
    const isArea = f.type === 'textarea';
    const listId = f.suggest ? 'm-dl-' + x.id + '-' + f.id : null;
    const inp = isArea ? h('textarea', { rows: f.rows || 3, placeholder: f.placeholder || 'Type here, or say it out loud…' })
      : h('input', { type: 'text', placeholder: f.placeholder || '', list: listId, maxlength: f.max || 140 });
    inp.value = v || '';
    inp.addEventListener('input', () => set(inp.value));
    wrap.append(inp);
    if (listId) wrap.append(h('datalist', { id: listId }, f.suggest.map(o => h('option', { value: o }))));
    if (f.suggest) wrap.append(h('div', { class: 'm-tags', style: 'margin-top:8px' },
      f.suggest.map(o => h('button', { type: 'button', onclick: () => { inp.value = o; set(o); } }, o))));
    if (f.stem) wrap.append(h('button', { type: 'button', class: 'ghost m-starter', onclick: () => {
      if (!inp.value.trim()) { inp.value = f.stem; set(inp.value); } inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
    } }, '✏️ Start me off: "' + f.stem + '"'));
  } else if (f.type === 'select') {
    const box = h('div', { class: 'm-tags' });
    f.options.forEach(o => box.append(h('button', { type: 'button', class: v === o ? 'on' : '', 'aria-pressed': v === o ? 'true' : 'false',
      onclick: () => { set(o); renderPanel(); } }, o)));
    wrap.append(box);
  } else if (f.type === 'tags') {
    const arr = Array.isArray(v) ? v.slice() : [];
    const max = f.max || f.options.length, min = f.min || 1;
    const box = h('div', { class: 'm-tags' });
    f.options.forEach(o => {
      const on = arr.includes(o);
      box.append(h('button', { type: 'button', class: on ? 'on' : '', 'aria-pressed': on ? 'true' : 'false', onclick: () => {
        const a = Array.isArray(s.f[f.id]) ? s.f[f.id].slice() : [];
        const i = a.indexOf(o);
        if (i >= 0) a.splice(i, 1); else { if (a.length >= max) a.shift(); a.push(o); }
        set(a); renderPanel();
      } }, o));
    });
    wrap.append(box, h('div', { class: 'm-count', text: arr.length + ' picked · pick ' + (min === max ? min : min + ' to ' + max) }));
  }
  return wrap;
}
function imageStep(x, msg) {
  const s = S(x.id);
  const wrap = h('div', { class: 'm-step' }, h('h3', { text: x.imageLabel || 'Hang a picture in the frame' }),
    h('p', { class: 'hint', html: x.imageHint || 'Pick one from the museum archive, upload your own, or paste a link.' }));
  const pv = h('div', { class: 'm-preview' });
  const src = srcOf(x);
  if (src) pv.append(h('img', { src, alt: 'The picture in this frame' })); else pv.textContent = 'No picture yet';
  wrap.append(pv);
  const tabs = [];
  if (x.shelf && x.shelf.length) tabs.push(['shelf', '📚 Museum archive']);
  if (x.upload !== false) tabs.push(['upload', '⬆ Upload']);
  if (x.link !== false) tabs.push(['link', '🔗 Paste a link']);
  ed.tab = ed.tab && tabs.some(t => t[0] === ed.tab) ? ed.tab : (s.img && s.img.kind !== 'shelf' ? s.img.kind : tabs[0][0]);
  const tabRow = h('div', { class: 'm-tabs', role: 'tablist' });
  tabs.forEach(([k, label]) => tabRow.append(h('button', { type: 'button', class: ed.tab === k ? 'on' : '', role: 'tab', onclick: () => { ed.tab = k; renderPanel(); } }, label)));
  wrap.append(tabRow);
  const area = h('div');
  if (ed.tab === 'shelf') {
    const grid = h('div', { class: 'm-shelf' });
    x.shelf.forEach(it => grid.append(h('button', { type: 'button', class: s.img && s.img.src === it.src ? 'on' : '', onclick: () => {
      s.img = { kind: 'shelf', src: it.src, credit: it.credit, title: it.title }; changed(x); renderPanel();
    } }, h('img', { src: it.thumb || it.src, alt: it.alt || it.title, loading: 'lazy' }), it.title)));
    area.append(grid);
  } else if (ed.tab === 'upload') {
    const inp = h('input', { type: 'file', accept: 'image/*', onchange: async e => {
      const file = e.target.files[0]; if (!file) return;
      setMsg(msg, 'good', 'Hanging it…');
      try {
        const url = await shrink(file);
        IMG[x.id] = url; await IDB.put(imgKey(x.id), url);
        s.img = { kind: 'upload', src: 'idb', credit: (s.img && s.img.kind === 'upload') ? s.img.credit : '', title: file.name };
        changed(x); renderPanel();
      } catch (err) { setMsg(msg, 'bad', 'That file would not open as a picture. Try a .jpg or .png.'); }
    } });
    area.append(h('button', { type: 'button', onclick: () => inp.click() }, '⬆ Choose a picture from this computer'), inp);
    inp.style.display = 'none';
  } else {
    const inp = h('input', { type: 'url', placeholder: 'https://…  (right-click a picture → Copy image address)' });
    if (s.img && s.img.kind === 'url') inp.value = s.img.src;
    area.append(inp, h('button', { type: 'button', style: 'margin-top:8px', onclick: async () => {
      const u = inp.value.trim(); if (!/^https:\/\//i.test(u)) { setMsg(msg, 'warn', 'Paste a link that starts with <strong>https://</strong>'); return; }
      setMsg(msg, 'good', 'Checking the link…');
      try {
        await loadImage(u);
        s.img = { kind: 'url', src: u, credit: (s.img && s.img.kind === 'url') ? s.img.credit : '', title: '' };
        changed(x); renderPanel();
      } catch (e) {
        setMsg(msg, 'warn', "That site won't share its picture with the museum. <strong>Save the picture to your computer</strong> (right-click → Save image as…), then use <strong>⬆ Upload</strong>.");
      }
    } }, '🔗 Hang this link'));
  }
  wrap.append(area);
  if (s.img && s.img.kind !== 'shelf') {
    const ci = h('input', { type: 'text', placeholder: 'e.g. a poster from the 2016 film; or "I drew it"', maxlength: 160 });
    ci.value = s.img.credit || '';
    ci.addEventListener('input', () => { s.img.credit = ci.value; s.done = s.done && exOk(x); changed(x); });
    wrap.append(h('div', { class: 'm-credit' }, h('label', { text: 'Where is this picture from?' }), ci));
  } else if (s.img) {
    wrap.append(h('p', { class: 'hint', style: 'margin-top:10px', text: 'Source: ' + s.img.credit }));
  }
  return wrap;
}
function shrink(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => loadImage(fr.result).then(im => {
      const max = 1280, k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.86));
    }).catch(rej);
    fr.onerror = rej; fr.readAsDataURL(file);
  });
}

/* ======================================================================
   INTRO
   ====================================================================== */
function showIntro(returning) {
  const name = h('input', { type: 'text', placeholder: 'First name (only goes into your document)', maxlength: 60 });
  name.value = state.name || '';
  const go = h('button', { type: 'button', class: 'go', onclick: () => {
    state.name = name.value.trim(); state.seenIntro = true; saveLocal();
    els.intro.classList.remove('open'); goTo(0, false); toast(CFG.firstToast || 'Walk to the first frame and click it.');
  } }, returning ? 'Back into the museum →' : 'Enter the museum →');
  els.intro.innerHTML = '';
  els.intro.append(h('div', { class: 'box' },
    h('h2', { text: returning ? 'Welcome back, curator.' : CFG.title }),
    h('p', { style: 'margin:0;color:var(--m-soft)', html: returning ? 'Your museum is exactly where you left it: <strong>' + doneCount() + ' of ' + EXH.length + '</strong> candles lit.' : (CFG.introLede || '') }),
    h('ol', null, (CFG.introSteps || []).map(s => h('li', { html: s }))),
    h('label', { style: 'font-weight:700', text: 'Your name for the document' }), name,
    h('div', { class: 'm-row' }, go)));
  els.intro.classList.add('open');
}

/* ======================================================================
   EXPORT
   ====================================================================== */
function answersOf(x) {
  const s = S(x.id);
  return x.fields.map(f => [f.short || f.label, fieldText(f, s.f[f.id])]);
}
function plainText() {
  const out = [CFG.exportTitle || CFG.title, 'Curator: ' + (state.name || '________'), ''];
  EXH.forEach(x => {
    const s = S(x.id);
    out.push('== ' + (x.wing || x.title) + (x.wingSub ? ' (' + x.wingSub + ')' : '') + ' ==');
    if (!x.hall && x.image !== false) out.push('Picture: ' + (s.img ? (s.img.title || s.img.src === 'idb' ? (s.img.title || 'uploaded picture') : s.img.src) + (s.img.credit ? ' | Source: ' + s.img.credit : '') : '(none yet)'));
    answersOf(x).forEach(([q, a]) => out.push(q + ': ' + (a || '(not answered yet)')));
    out.push('');
  });
  return out.join('\n');
}
async function copyText() {
  const t = plainText(); let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch (e) {
    const ta = h('textarea', { style: 'position:fixed;left:-9999px' }); ta.value = t; document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (e2) {} ta.remove(); }
  setMsg(els.expMsg, ok ? 'good' : 'warn', ok ? '✓ Copied. Paste it into the Canvas text box.' : 'Copy did not work here. Use the document download instead.');
}
function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
}
const fname = ext => (CFG.exportFile || 'Museum') + (state.name ? ' - ' + state.name.replace(/[^\w\- ]+/g, '') : '') + ext;
async function saveFile() {
  const images = {};
  for (const x of EXH) if (S(x.id).img && S(x.id).img.kind === 'upload' && IMG[x.id]) images[x.id] = IMG[x.id];
  download(new Blob([JSON.stringify({ museum3d: 1, id: CFG.id, state, images })], { type: 'application/json' }), fname('.museum.json'));
  setMsg(els.expMsg, 'good', '✓ Museum file saved to your Downloads. Next time, use <strong>📂 Open a museum file</strong>.');
}
async function openFile(file) {
  if (!file) return;
  try {
    const j = JSON.parse(await file.text());
    if (!j || !j.state || j.id !== CFG.id) throw new Error('wrong museum');
    state = j.state;
    for (const id in (j.images || {})) { IMG[id] = j.images[id]; await IDB.put(imgKey(id), j.images[id]); }
    saveLocal(); EXH.forEach(refreshExhibit); renderStatus();
    setMsg(els.expMsg, 'good', '✓ Museum opened: ' + doneCount() + ' of ' + EXH.length + ' candles lit.');
  } catch (e) { setMsg(els.expMsg, 'bad', 'That file is not a save from this museum.'); }
}
async function jpegOf(x) {
  const src = srcOf(x); if (!src) return null;
  try {
    const im = await loadImage(src);
    const max = 1400, k = Math.min(1, max / Math.max(im.width, im.height));
    const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height };
  } catch (e) { return null; }
}
/* --- minimal .docx writer --- */
const XE = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (t, b) => '<w:r>' + (b ? '<w:rPr><w:b/></w:rPr>' : '') + '<w:t xml:space="preserve">' + XE(t) + '</w:t></w:r>';
const P = (inner, style) => '<w:p>' + (style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '') + inner + '</w:p>';
function imgPara(rid, n, cx, cy) {
  return '<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
    '<wp:docPr id="' + n + '" name="Picture ' + n + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + n + '" name="image' + n + '.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
    '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(files, type) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const f of files) {
    const nb = enc.encode(f.name), d = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(d), sz = d.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, sz, true); lh.setUint32(22, sz, true);
    lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nb, d);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, sz, true); ch.setUint32(24, sz, true);
    ch.setUint16(28, nb.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, off, true);
    cen.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + sz;
  }
  const cs = cen.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type });
}
async function buildDocx() {
  const media = []; let body = '';
  body += P(run(CFG.exportTitle || CFG.title), 'Title');
  if (CFG.exportSubtitle) body += P(run(CFG.exportSubtitle), 'Subtitle');
  body += P(run('Curator: ', true) + run(state.name || '________'));
  body += P(run('Exhibits finished: ', true) + run(doneCount() + ' of ' + EXH.length));
  for (const x of EXH) {
    const s = S(x.id);
    body += P(run((x.wing || x.title) + (x.wingSub ? ': ' + x.wingSub : '')), 'Heading1');
    if (!x.hall && x.image !== false) {
      const j = await jpegOf(x);
      if (j) {
        const n = media.length + 1; media.push(j);
        const maxW = 5.5 * 914400, maxH = 4.0 * 914400, k = Math.min(maxW / j.w, maxH / j.h);
        body += imgPara('rIdImg' + n, n, Math.round(j.w * k), Math.round(j.h * k));
      } else if (s.img) body += P(run('[Picture: ' + (s.img.src === 'idb' ? 'uploaded picture' : s.img.src) + ']'));
      else body += P(run('[No picture yet]'));
      if (s.img && s.img.credit) body += P(run('Picture source: ', true) + run(s.img.credit));
    }
    answersOf(x).forEach(([q, a]) => { body += P(run(q, true)); body += P(run(a || '(not answered yet)')); });
  }
  const doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    '<w:body>' + body + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/><w:sz w:val="24"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="5A1820"/><w:sz w:val="52"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:i/><w:color w:val="555555"/><w:sz w:val="26"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="5A1820"/><w:sz w:val="34"/></w:rPr></w:style>' +
    '</w:styles>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    media.map((m, i) => '<Relationship Id="rIdImg' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image' + (i + 1) + '.jpeg"/>').join('') +
    '</Relationships>';
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
  const root = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const files = [
    { name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: root },
    { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles }, { name: 'word/_rels/document.xml.rels', data: rels }
  ].concat(media.map((m, i) => ({ name: 'word/media/image' + (i + 1) + '.jpeg', data: m.bytes })));
  return zip(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
async function exportDocx() {
  setMsg(els.expMsg, 'good', 'Building your document…');
  try {
    const blob = await buildDocx();
    download(blob, fname('.docx'));
    const left = EXH.length - doneCount();
    setMsg(els.expMsg, left ? 'warn' : 'good', (left ? '⚠ Downloaded, but ' + left + ' candle' + (left > 1 ? 's are' : ' is') + ' still dark. ' : '✓ ') +
      'Your document is in Downloads. Upload it to Canvas (Submit Assignment → File Upload).');
  } catch (e) { console.error(e); setMsg(els.expMsg, 'bad', 'Something went wrong building the document. Use Print / Save as PDF instead.'); }
}
window.__museumDocx = buildDocx;   /* used by the test harness */
function printView() {
  const p = els.print; p.innerHTML = '';
  p.append(h('h1', { text: CFG.exportTitle || CFG.title }), h('p', { text: 'Curator: ' + (state.name || '________') }));
  EXH.forEach(x => {
    const s = S(x.id); const box = h('div', { class: 'ex' });
    box.append(h('h2', { text: (x.wing || x.title) + (x.wingSub ? ': ' + x.wingSub : '') }));
    const src = srcOf(x); if (src && !x.hall) box.append(h('img', { src, alt: '' }));
    if (s.img && s.img.credit && !x.hall) box.append(h('p', null, h('b', { text: 'Picture source: ' }), s.img.credit));
    answersOf(x).forEach(([q, a]) => box.append(h('p', null, h('b', { text: q + ' ' })), h('p', { text: a || '(not answered yet)' })));
    p.append(box);
  });
  setTimeout(() => window.print(), 300);
}

/* ======================================================================
   START
   ====================================================================== */
async function start() {
  if (CFG.theme) for (const k in CFG.theme.css || {}) ROOT.style.setProperty(k, CFG.theme.css[k]);
  buildDom();
  const had = loadLocal();
  applyStarters(); saveLocal();
  await IDB.open();
  for (const x of EXH) if (S(x.id).img && S(x.id).img.kind === 'upload') { const d = await IDB.get(imgKey(x.id)); if (d) IMG[x.id] = d; }
  if (!window.THREE) { els.wrap.innerHTML = '<p style="padding:20px">The 3D hall could not load. You can still curate every exhibit from the list below.</p>'; }
  else {
    try { initThree(); } catch (e) {
      console.error(e);
      els.wrap.querySelector('canvas') && els.wrap.querySelector('canvas').remove();
      els.wrap.prepend(h('p', { style: 'padding:20px;color:var(--m-soft)', text: 'This computer could not draw the 3D hall. Use the exhibit list below: every exhibit opens the same way.' }));
    }
  }
  renderStatus(); updateNav();
  showIntro(had && state.seenIntro);
}
/* the exhibit list must open the panel even without 3D */
const _goTo = goTo;
goTo = function (i, open) { if (!renderer) { cur = i; if (open) openPanel(EXH[i].id); return; } _goTo(i, open); };
start();
})();
