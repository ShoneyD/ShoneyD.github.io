/* =====================================================================
   VINE SWING — the 3D run. Loaded as a module by activities/vine-swing.html
   after the page's classic script, which defines the content (TYPES, BANK,
   DECOYS, ROUNDS), the stage engine (LL, ORDER) and the turn-in panel.
   Those are global `const`s, so they are visible here by name.

   One continuous run. Free swings: HOLD (mouse / Space) to hang, LET GO near
   the front of the swing to fly, HOLD again to catch the next vine, A/D to
   steer in the air. Skill checks: as the monkey passes the bottom of the
   swing before a trio of vines, time slows to a crawl; A/D (or ←/→) moves
   the highlight, click / Space / Enter grabs; 1·2·3 or clicking a word work
   too. Bananas: steer into the fruit, press as the rings line up.
   ===================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMonkey } from './monkey.js';
import { createWorld, riverX, riverW, groundY, CANOPY_Y } from './world.js';

/* works from a double-clicked file too: assets come embedded in assets.js when present */
const BASE = (document.currentScript && document.currentScript.src.replace(/[^/]*$/, '')) || '../assets/vine-swing/';
const EMB = window.VS_ASSETS || null;
function b64buf(b){ const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
const box = $('box');

/* ---------------- tuning ---------------- */
const SEG = 11.5;              /* metres between vine nodes */
const VL = 8.6;                /* vine length */
const AMP = 1.0;               /* swing amplitude (rad) */
const PERIOD = 2.5;            /* swing period at streak 0 (s) */
const CATCH_TH = -.55;         /* vine angle when a vine is caught */
const GOOD_MIN = .28;          /* release earlier than this falls short */
const LANES = [-5.2, 0, 5.2];
const DECIDE_SLOW = .045;      /* time scale while choosing */
const READ_SLOW = .035;        /* time scale while a feedback panel is up */
const QTE_SLOW = .12;

/* ---------------- state ---------------- */
let R3 = null;                 /* renderer bundle */
let world = null, M = null;    /* world + monkey rig */
let timeScale = 1, tsTarget = 1;
const keys = {};
let holding = false, grabLatch = 0;  /* grabLatch: a press during the catch window */
let steer = 0;
const S = {                    /* the run */
  st:'load',                   /* load | intro | hang | fly | fall | bounce | land | menu */
  t:0, nodes:[], cur:null, nodeIx:0,
  vine:null, phi:0, theta:0,
  fly:null, fall:null,
  seg:-1, segPlan:null, segName:'', mode:'practice', R:null,
  streak:0, best:0, score:0, bananas:0, used:0,
  timeLeft:0, timeMax:0, clock:0, clockOn:false, frozen:0, target:0,
  results:[], decide:null, hl:1, qte:null, tutorial:null
};
window.VS = S; window.__dbg = () => ({ timeScale, tsTarget, t:S.t, calls:R3 && R3.renderer.info.render.calls, tris:R3 && R3.renderer.info.render.triangles });

function speed(){ return 1 + Math.min(.6, .1 * S.streak); }
function mult(){ return 1 + Math.min(2, .25 * S.streak); }

/* =====================================================================
   SETUP
   ===================================================================== */
function chooseQuality(){
  const qp = new URLSearchParams(location.search).get('q'); if (qp === 'low' || qp === 'high') return qp;
  if (SET.quality !== 'auto') return SET.quality;
  const lowCPU = (navigator.hardwareConcurrency || 4) <= 4;
  return lowCPU ? 'low' : 'high';
}
async function init(){
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas:$('gl'), antialias:true, powerPreference:'high-performance' });
  } catch (e) { flatFallback(); return; }
  const Q = chooseQuality(); SET.quality = Q;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q === 'high' ? 1.5 : 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = Q === 'high'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const sky = document.createElement('canvas'); sky.width = 2; sky.height = 256;
  const g = sky.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#5fb3e6'); gr.addColorStop(.45, '#bfe6f0'); gr.addColorStop(.62, '#d8f0d8'); gr.addColorStop(1, '#7fb08e');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const st = new THREE.CanvasTexture(sky); st.colorSpace = THREE.SRGBColorSpace; scene.background = st;
  scene.fog = new THREE.FogExp2(0xb8dccb, .0105);
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x40602f, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.8);
  sun.castShadow = Q === 'high'; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left:-22, right:22, top:22, bottom:-22, near:1, far:120 });
  scene.add(sun); scene.add(sun.target);
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, .1, 420);
  R3 = { renderer, scene, camera, sun, Q };
  world = createWorld(scene, Q);
  setLoading('Growing the jungle…');
  world.prime(0);
  setLoading('Waking up the monkey…');
  const gltf = EMB ? await new GLTFLoader().parseAsync(b64buf(EMB.monkey), '') : await new GLTFLoader().loadAsync(BASE + 'monkey.glb');
  M = createMonkey(gltf, 2.3); scene.add(M.root);
  resize();
  new ResizeObserver(resize).observe(box);
  requestAnimationFrame(frame);
  intro();
}
function setLoading(t){ $('sent').textContent = t; }
function resize(){
  const w = box.clientWidth, h = box.clientHeight; if (!w || !h || !R3) return;
  R3.renderer.setSize(w, h, false); R3.camera.aspect = w / h; R3.camera.updateProjectionMatrix();
}
function flatFallback(){
  box.classList.add('flat');
  $('sent').textContent = 'This computer can’t show the 3D jungle. Ask your teacher for the other version.';
}

/* =====================================================================
   AUDIO — on by default (Sean's call), master mute in the toolbar
   ===================================================================== */
const AU = { ctx:null, master:null, music:null, buf:{}, musicSrc:null, ready:false };
async function audioStart(){
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  try {
    const C = new (window.AudioContext || window.webkitAudioContext)();
    AU.ctx = C; AU.master = C.createGain(); AU.master.gain.value = SET.sound ? 1 : 0; AU.master.connect(C.destination);
    AU.music = C.createGain(); AU.music.gain.value = .32; AU.music.connect(AU.master);
    const names = ['music', 'ambient', 'success', 'win', 'miss', 'whoosh', 'creak'];
    await Promise.all(names.map(async n => {
      const ab = EMB ? b64buf(EMB.audio[n]) : await (await fetch(BASE + 'audio/' + n + '.mp3')).arrayBuffer();
      AU.buf[n] = await C.decodeAudioData(ab);
    }));
    AU.ready = true;
    const src = C.createBufferSource(); src.buffer = AU.buf.music; src.loop = true; src.loopStart = 0; src.loopEnd = 16.0;
    src.connect(AU.music); src.start(); AU.musicSrc = src;
    setInterval(() => { if (Math.random() < .5) sfx('ambient', .35); }, 26000);
  } catch (e) { /* no audio: the game is fine without it */ }
}
function sfx(n, vol, rate){
  if (!AU.ready || !AU.buf[n]) return;
  const s = AU.ctx.createBufferSource(), g = AU.ctx.createGain();
  s.buffer = AU.buf[n]; s.playbackRate.value = rate || 1; g.gain.value = vol === undefined ? .8 : vol;
  s.connect(g).connect(AU.master); s.start();
}
function setSound(on){
  SET.sound = on;
  try { localStorage.setItem('vineswing:mute', on ? '0' : '1'); } catch (e) {}
  if (AU.master) AU.master.gain.value = on ? 1 : 0;
  paintToggles();
}

/* =====================================================================
   COURSE — nodes are generated ahead of the monkey from a segment plan
   ===================================================================== */
/* segment 0 = practice (s1), 1–3 = canopies (s2–s4), 4+ = bonus */
function segId(k){ return k < ORDER.length ? ORDER[k] : 'bonus'; }
function segRound(k){ return k < ORDER.length ? ROUNDS[ORDER[k]] : BONUS_ROUND; }
function planSegment(k){
  const R = segRound(k), plan = [];
  if (R.practice){
    plan.push({ type:'free', tip:'hold' }, { type:'free', tip:'catch' }, { type:'check' }, { type:'free', fruit:true, tip:'fruit' },
              { type:'check' }, { type:'free' }, { type:'check' }, { type:'free' }, { type:'check' });
  } else {
    for (let i = 0; i < R.vines; i++){
      const nFree = 1 + (Math.random() < .55 ? 1 : 0);
      for (let j = 0; j < nFree; j++) plan.push({ type:'free', fruit:Math.random() < .3 });
      plan.push({ type:'check' });
    }
  }
  plan.push({ type:'free' }, { type:'checkpoint' });
  return plan;
}
const vineMat = () => new THREE.MeshStandardMaterial({ color:0x5f8f35, roughness:.8 });
const vineGeo = (() => { const g = new THREE.CylinderGeometry(.075, .06, 1, 7, 1); g.translate(0, -.5, 0); return g; })();
const knotGeo = new THREE.SphereGeometry(.14, 10, 8);
const leafG = (() => { const g = new THREE.PlaneGeometry(.7, .7); g.translate(0, .35, 0); return g; })();
const leafM = new THREE.MeshStandardMaterial({ color:0x58a243, side:THREE.DoubleSide, roughness:.8 });
const VINE_LEAVES = (() => {
  const up = [], lo = [], o = new THREE.Object3D();
  for (let i = 0; i < 6; i++){
    const y = -.6 - i * 1.35, low = y < -VL * .55;
    o.position.set(0, y + (low ? VL * .55 : 0), 0); o.rotation.set(-.6, i * 2.1, (i % 2 ? .7 : -.7)); o.updateMatrix();
    const g = leafG.clone(); g.applyMatrix4(o.matrix); (low ? lo : up).push(g);
  }
  return { up:mergeGeometries(up), lo:mergeGeometries(lo) };
})();
function makeVine(x, z, y){
  const anchor = new THREE.Vector3(x, y || CANOPY_Y + (Math.random() - .5) * 1.2, z);
  const m = vineMat();
  const pivot = new THREE.Group(); pivot.position.copy(anchor);
  const upper = new THREE.Mesh(vineGeo, m); upper.scale.set(1, VL * .55, 1);
  const lower = new THREE.Group(); lower.position.y = -VL * .55;
  const lo = new THREE.Mesh(vineGeo, m); lo.scale.set(1, VL * .45, 1); lower.add(lo);
  const knot = new THREE.Mesh(knotGeo, m); knot.position.y = -VL * .45; lower.add(knot);
  pivot.add(new THREE.Mesh(VINE_LEAVES.up, leafM)); lower.add(new THREE.Mesh(VINE_LEAVES.lo, leafM));
  upper.castShadow = R3.Q === 'high';
  pivot.add(upper); pivot.add(lower);
  R3.scene.add(pivot);
  const limb = world.addLimb(anchor);
  return { anchor, pivot, lower, m, stretch:1, theta:0, sway:Math.random() * 6, limb, snapped:false };
}
function disposeVine(v){ R3.scene.remove(v.pivot); if (v.limb) world.removeLimb(v.limb); v.m.dispose(); }
function vineGrip(v, th, out){
  out = out || new THREE.Vector3();
  const L = VL * v.stretch;
  return out.set(v.anchor.x, v.anchor.y - L * Math.cos(th), v.anchor.z - L * Math.sin(th));
}

let nextZ = 0;
function makeNode(spec){
  const z = nextZ; nextZ -= SEG;
  const cx = riverX(z);
  const n = Object.assign({ z, cx, vines:[], seg:S.planSeg }, spec);
  if (spec.type === 'free'){
    n.vines.push(makeVine(cx + (Math.random() - .5) * 5, z));
    if (spec.fruit){
      const side = Math.random() < .5 ? -1 : 1;
      n.fruitPos = new THREE.Vector3(cx + side * 2.6, CANOPY_Y - VL + 2.4, z + SEG * .5);
      n.fruit = bananaMesh(); n.fruit.position.copy(n.fruitPos); R3.scene.add(n.fruit);
    }
  } else if (spec.type === 'check'){
    LANES.forEach(dx => n.vines.push(makeVine(cx + dx, z)));
  } else if (spec.type === 'checkpoint' || spec.type === 'start'){
    n.platform = platformMesh(cx, z, spec.type === 'start');
    n.deck = new THREE.Vector3(cx, n.platform.userData.deckY, z);
    nextZ -= 2;
  }
  S.nodes.push(n);
  return n;
}
/* keep five nodes ahead; plans roll over into the next segment */
function topUp(){
  while (S.nodes.filter(n => n.z <= (S.cur ? S.cur.z : 0)).length < 6){
    if (!S.planQueue || !S.planQueue.length){ S.planSeg = (S.planSeg === undefined ? S.startSeg - 1 : S.planSeg) + 1; S.planQueue = planSegment(S.planSeg); }
    makeNode(S.planQueue.shift());
  }
  /* tidy nodes far behind */
  S.nodes = S.nodes.filter(n => {
    if (n.z > (S.cur ? S.cur.z : 0) + SEG * 3){
      n.vines.forEach(disposeVine);
      if (n.platform) R3.scene.remove(n.platform);
      if (n.fruit) R3.scene.remove(n.fruit);
      return false;
    }
    return true;
  });
}
function nodeAfter(n){ const i = S.nodes.indexOf(n); return S.nodes[i + 1]; }

function bananaMesh(){
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color:0xf5d33a, roughness:.45, emissive:0x3a2a00 });
  const geo = new THREE.TorusGeometry(.42, .11, 8, 16, 2.0);
  for (let i = 0; i < 5; i++){ const b = new THREE.Mesh(geo, m); b.rotation.set(Math.PI / 2, 0, -1.7 + i * .2); b.position.set((i - 2) * .13, 0, 0); g.add(b); }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 3, 6), new THREE.MeshStandardMaterial({ color:0x5d8a34 }));
  stem.position.y = 1.7; g.add(stem);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(.75, 12, 10), new THREE.MeshBasicMaterial({ color:0xfff1a0, transparent:true, opacity:.18, depthWrite:false }));
  g.add(glow);
  return g;
}
function platformMesh(cx, z, start){
  const g = new THREE.Group();
  const bark = world.M.bark, deckY = CANOPY_Y - VL - 2.3;
  const y0 = groundY(cx, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.2, deckY - y0 + 1, 12), bark);
  trunk.position.set(cx, (deckY + y0) / 2 - .9, z); g.add(trunk);
  const deckMat = new THREE.MeshStandardMaterial({ color:0xa8743f, roughness:.9 });
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.1, .45, 18), deckMat);
  deck.position.set(cx, deckY - .22, z); deck.receiveShadow = true; g.add(deck);
  for (let i = 0; i < 10; i++){ const a = i / 10 * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .7, 6), deckMat); post.position.set(cx + Math.cos(a) * 3.2, deckY + .3, z + Math.sin(a) * 3.2); g.add(post); }
  if (!start){
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = '#c68a1a'; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#fff'; x.font = 'bold 62px Verdana, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('CHECKPOINT', 256, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    /* banner sits BEHIND the monkey (toward the start) so it never blocks the celebration camera */
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({ map:t, side:THREE.DoubleSide }));
    banner.position.set(cx, deckY + 3.6, z - 3.3); g.add(banner);
    for (const s of [-1, 1]){ const p = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 4, 6), bark); p.position.set(cx + s * 2.3, deckY + 2, z - 3.3); g.add(p); }
  }
  g.userData.deckY = deckY;
  R3.scene.add(g);
  return g;
}

/* =====================================================================
   INPUT
   ===================================================================== */
function pressDown(){
  if (S.decide){ confirmChoice(S.hl); return; }
  if (S.qte){ qteHit(); }
  holding = true;
  if (S.st === 'fly') grabLatch = 1;
}
function pressUp(){
  holding = false;
  if (S.st === 'hang' && !S.decide && !SET.auto) release();
}
box.addEventListener('pointerdown', e => {
  if (e.target.closest('button, .overlay, .panel')) return;
  e.preventDefault(); box.focus({ preventScroll:true }); pressDown();
});
window.addEventListener('pointerup', () => { if (holding) pressUp(); });
function gameKeysActive(e){
  if (e.target && /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName)) return false;
  if ($('ov').classList.contains('show') || $('panel').classList.contains('show')) return false;
  const r = box.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight;
}
document.addEventListener('keydown', e => {
  if (!gameKeysActive(e)) return;
  const k = e.key;
  if (k === ' ' || k.startsWith('Arrow') || /^[1-3adbADB]$/.test(k) || k === 'Enter') e.preventDefault(); else return;
  if (e.repeat && (k === ' ' || k === 'Enter')) return;
  keys[k.toLowerCase()] = true;
  if (S.decide){
    if (k === 'a' || k === 'A' || k === 'ArrowLeft') moveHl(-1);
    else if (k === 'd' || k === 'D' || k === 'ArrowRight') moveHl(1);
    else if (/^[1-3]$/.test(k)) confirmChoice(+k - 1);
    else if (k === ' ' || k === 'Enter') confirmChoice(S.hl);
    else if (k === 'b' || k === 'B') useBanana();
    return;
  }
  if (k === ' ') pressDown();
});
document.addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
  if (e.key === ' ' && holding) pressUp();
});

/* =====================================================================
   THE SWING
   ===================================================================== */
function catchVine(v, opts){
  S.vine = v; S.st = 'hang';
  S.theta = CATCH_TH; S.phi = Math.asin(Math.max(-1, Math.min(1, CATCH_TH / AMP)));
  v.theta = CATCH_TH;
  grabLatch = 0;
  /* auto-caught, or caught with a tap: he lets go by himself at the front of the swing */
  S.lockHang = !!(opts && opts.lock) || !holding;
  S.hangT = 0; S.waitTip = false;
  sfx('creak', .45, .9 + Math.random() * .2);
  if (SET.auto) holding = true;
}
function release(forced, auto){
  if (S.st !== 'hang') return;
  if (!forced && nodeAfter(S.cur) && nodeAfter(S.cur).type === 'check') return;   /* a skill check decides this one */
  const v = S.vine, th = S.theta, dth = AMP * Math.cos(S.phi);
  const from = vineGrip(v, th);
  const next = nodeAfter(S.cur);
  let target, kind = 'free', good = (dth > 0 && th >= GOOD_MIN) || forced;
  if (next.type === 'checkpoint'){ target = { deck:next.deck }; kind = 'deck'; good = true; }
  else if (forced && forced.vine){ target = { vine:forced.vine }; kind = 'check'; }
  else target = { vine:next.vines[0] };
  const to = target.deck ? target.deck.clone().add(new THREE.Vector3(0, 2.8, 0)) : vineGrip(target.vine, CATCH_TH);
  if (!good){                                  /* too early or on the back-swing: falls short */
    to.lerpVectors(from, to, .55); to.y -= 5;
  }
  const mid = new THREE.Vector3().lerpVectors(from, to, .5); mid.y += 1.8 + Math.max(0, th) * 2.2;
  S.fly = { from, mid, to, t:0, dur:(target.deck ? 1.35 : 1.05) / speed(), target, kind, good, next, sx:0, auto:!!auto || SET.auto, cue:false };
  S.st = 'fly'; S.vine = null;
  steer = 0;
  sfx('whoosh', .55, .9 + Math.random() * .25);
  if (S.tutorial === 'hold') tutorial('catch');
}
function bez(a, b, c, t, out){
  const u = 1 - t; return out.set(u * u * a.x + 2 * u * t * b.x + t * t * c.x, u * u * a.y + 2 * u * t * b.y + t * t * c.y, u * u * a.z + 2 * u * t * b.z + t * t * c.z);
}
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

function stepSwing(dt){
  const v = S.vine;
  const per = PERIOD / speed();
  S.phi += dt * Math.PI * 2 / per;
  S.theta = AMP * Math.sin(S.phi);
  v.theta = S.theta;
  v.pivot.rotation.x = S.theta; v.pivot.scale.y = v.stretch;
  const fwd = Math.cos(S.phi) > 0;
  /* a check is coming: slow everything as he passes the bottom */
  const next = nodeAfter(S.cur);
  if (next && next.type === 'check' && !next.done && !S.decide && fwd && S.theta > -.05 && S.st === 'hang') startDecision(next);
  /* after a choice: let go near the front */
  if (S.pendingRelease && fwd && S.theta >= .55) { const f = S.pendingRelease; S.pendingRelease = null; release(f); return; }
  /* auto-swing lets go for you */
  if (SET.auto && !S.decide && !S.pendingRelease && fwd && S.theta >= .62 && next && next.type !== 'check') release();
  /* auto-caught vines (after a check or a rescue) release by themselves too, so nobody gets stuck */
  S.hangT += dt;
  if (S.lockHang && !S.decide && !S.pendingRelease && next && next.type !== 'check' && !holding){
    const per2 = PERIOD / speed();
    if (S.hangT > per2 * .9 && !S.waitTip && !SET.auto){ S.waitTip = true; toast('Let go near the front of the swing to fly!', 2.2); }
    if (fwd && S.theta >= .62 && S.hangT > per2 * 1.4) release(null, true);   /* nobody let go: swing on, and catch for them */
  }
  else if (holding && !S.decide && !S.waitTip && S.hangT > PERIOD * 2 && !SET.auto && next && next.type !== 'check'){ S.waitTip = true; toast('Let go near the front of the swing to fly!', 2.2); }
  M.pose('hang', 'hang', 0, (c, i) => (c === 'legR' || c === 'legL') && i === 0 ? tmp2.set(0, 0, -Math.cos(S.phi) * .5) :
                                     c === 'tail' ? tmp2.set(Math.sin(S.t * 2 + i) * .15, 0, 0) : null);
  M.root.rotation.set(S.theta * .85, 0, 0);
  M.gripAt(vineGrip(v, S.theta, tmp));
}
function stepFly(dt){
  const f = S.fly;
  f.t = Math.min(1, f.t + dt / f.dur);
  const k = f.t;
  /* steering */
  const sIn = ((keys.d || keys.arrowright) ? 1 : 0) - ((keys.a || keys.arrowleft) ? 1 : 0);
  if (SET.auto && f.next && f.next.fruitPos && f.kind === 'free') steer = lerpTo(steer, f.next.fruitPos.x - bezX(f, k), dt * 3);
  else steer = Math.max(-3.5, Math.min(3.5, steer + sIn * dt * 7));
  bez(f.from, f.mid, f.to, k, tmp);
  tmp.x += steer * Math.sin(Math.PI * k) ;
  M.root.position.copy(tmp);
  M.pose('hang', 'fly', Math.sin(Math.PI * Math.min(1, k * 1.25)));
  M.root.rotation.set(.35 * Math.sin(Math.PI * k), 0, -sIn * .25);
  /* the target vine swings back to meet him */
  if (f.target.vine){ const tv = f.target.vine; tv.pivot.rotation.x = CATCH_TH * easeIO(Math.min(1, k * 1.4)); }
  checkFruit(f, tmp);
  if (f.kind === 'free' && !f.auto && !f.cue && k > .35 && !holding && !grabLatch && f.good){ f.cue = true; toast('Hold to catch the vine!', 1.2); }
  if (k >= 1){
    if (f.kind === 'timeout'){ S.st = 'wait'; return arriveTimeout(f); }
    if (f.kind === 'deck') return landDeck(f.next);
    if (f.kind === 'check') return arriveCheck(f);
    const caught = f.good && (holding || grabLatch || f.auto);
    if (caught){ S.cur = f.next; catchVine(f.target.vine); onNodeReached(); }
    else missFall(f.target.vine, 'free');
  }
}
function bezX(f, k){ return bez(f.from, f.mid, f.to, k, tmp2).x; }
function lerpTo(a, b, k){ return a + (b - a) * Math.min(1, k); }

/* fall, bounce on a giant leaf, get flung up onto a vine */
function missFall(rescueVine, why){
  S.st = 'fall';
  const p = M.root.position.clone();
  S.fall = { v:new THREE.Vector3(0, -2, -3), p, rescue:rescueVine, why, t:0 };
  sfx('miss', .7);
  if (S.mode === 'race') S.clock += 2;
  if (why === 'free') toast(SET.auto ? 'Whoops!' : 'Missed! Hold to catch the next vine.', 1.8);
}
function stepFall(dt){
  const F = S.fall; F.t += dt;
  F.v.y -= 22 * dt;
  F.p.addScaledVector(F.v, dt);
  const floor = Math.max(groundY(F.p.x, F.p.z), -0.2) + 2.2;
  M.root.position.copy(F.p);
  M.pose('fall', 'fall', 0, (c, i) => (c === 'armR' || c === 'armL') ? tmp2.set(Math.sin(S.t * 20 + i) * .4, 0, Math.cos(S.t * 17) * .3) : null);
  M.root.rotation.set(-.2, 0, Math.sin(S.t * 6) * .15);
  if (F.p.y <= floor){
    /* boing */
    S.st = 'bounce';
    const leaf = bounceLeaf(F.p);
    const to = vineGrip(F.rescue, CATCH_TH);
    const from = F.p.clone(), mid = new THREE.Vector3().lerpVectors(from, to, .5); mid.y = Math.max(from.y, to.y) + 3;
    S.fly = { from, mid, to, t:0, dur:1.25, target:{ vine:F.rescue }, kind:'rescue', good:true, leaf };
    sfx('creak', .7, 1.6);
  }
}
const leafBounceGeo = (() => { const g = new THREE.CircleGeometry(1.6, 18); g.rotateX(-Math.PI / 2); return g; })();
function bounceLeaf(p){
  const m = new THREE.Mesh(leafBounceGeo, new THREE.MeshStandardMaterial({ color:0x4fae3e, side:THREE.DoubleSide, roughness:.6 }));
  m.position.set(p.x, p.y - 2.2, p.z); R3.scene.add(m);
  return m;
}
function stepBounce(dt){
  const f = S.fly; f.t = Math.min(1, f.t + dt / f.dur);
  if (f.leaf){ f.leaf.scale.setScalar(1 + .3 * Math.sin(f.t * 12) * (1 - f.t)); if (f.t > .6) f.leaf.material.opacity = 1; }
  bez(f.from, f.mid, f.to, easeOut(f.t), tmp); M.root.position.copy(tmp);
  M.pose('fall', 'fly', f.t);
  M.root.rotation.set(-.6 * (1 - f.t), 0, 0);
  if (f.t >= 1){
    if (f.leaf){ const L = f.leaf; setTimeout(() => R3.scene.remove(L), 1500); }
    S.cur = S.nodes.find(n => n.vines.includes(f.target.vine));
    catchVine(f.target.vine, { lock:true });
    onNodeReached(true);
  }
}

/* reached a new node: tutorials, cleanup, race clock start */
function onNodeReached(){
  topUp();
  if (S.tutorial === 'catch' && S.cur && S.cur.tip !== 'catch') tutorial(null);
  const n = nodeAfter(S.cur);
  if (n && n.tip === 'catch' && !SET.auto) tutorial('hold');
  if (n && n.fruit && S.segName === 'practice') tutorial('fruit');
  if (n && n.fruit && !SET.auto && S.segName !== 'practice') toast('🍌 Fruit ahead! Steer with A / D.', 2.2);
}

/* =====================================================================
   SKILL CHECKS
   ===================================================================== */
function startDecision(node){
  node.done = true;
  clearTimeout(S.clearT); tutorial(null);
  const k = S.checkIx++;
  const item = S.items[k];
  if (!item){ node.vines.slice(1).forEach(v => v.pivot.visible = false); S.pendingRelease = { vine:node.vines[0] }; return; }
  const opts = buildOptions(item, decoyTier(S.R, k));
  opts.forEach((o, i) => { o.vine = node.vines[i]; o.lane = i; });
  S.decide = { node, item, opts, k, t0:performance.now() };
  S.hl = 1;
  tsTarget = DECIDE_SLOW;
  const sym = symbolMode(S.R, k);
  const wrap = $('opts'); wrap.innerHTML = '';
  opts.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'vopt' + (sym === 'none' ? ' nosym' : sym === 'faint' ? ' faint' : '');
    const T = o.kind === 'decoy' ? DECOY_TYPE : TYPES[o.t];
    b.innerHTML = '<span class="key">' + (i + 1) + '</span><span class="sym" aria-hidden="true">' + T.sym + '</span>' +
      '<span class="tn"' + (sym === 'all' ? '' : ' style="display:none"') + '>' + esc(T.name) + '</span>' +
      '<span class="w">' + esc(o.w) + '</span><span class="badge"></span>';
    b.setAttribute('aria-label', 'Vine ' + (i + 1) + ': ' + o.w);
    b.onpointerdown = e => { e.stopPropagation(); };
    b.onclick = e => { e.stopPropagation(); confirmChoice(i); };
    b.onmouseenter = () => { if (S.decide) { S.hl = i; paintHl(); } };
    wrap.appendChild(b); o.el = b;
  });
  paintHl();
  $('sent').innerHTML = sentHtml(item.s);
  $('coach').textContent = S.segName === 'practice'
    ? 'Time slows down. How does the next idea connect to the first? Match the symbol. A / D to pick, click or Space to grab.'
    : 'A / D to pick · click or Space to grab';
  if (S.mode === 'timed'){ S.timeMax = S.timeLeft = S.R.secs * SET.mult; S.lastTick = 99; box.classList.add('deciding'); }
  $('sentBox').classList.add('live');
  $('hHint').textContent = S.bananas && S.mode !== 'practice' ? 'B = use 🍌' : 'A / D · click';
}
function moveHl(d){ S.hl = Math.max(0, Math.min(2, S.hl + d)); paintHl(); }
function paintHl(){
  if (!S.decide) return;
  S.decide.opts.forEach((o, i) => {
    o.el.classList.toggle('hl', i === S.hl);
    o.vine.m.emissive.setHex(i === S.hl ? 0x6a5a10 : 0x000000);
  });
}
function confirmChoice(i){
  const D = S.decide; if (!D) return;
  S.decide = null; box.classList.remove('deciding');
  tsTarget = 1;
  const o = D.opts[i];
  D.opts.forEach(x => { x.el.disabled = true; x.vine.m.emissive.setHex(0); });
  S.pendingRelease = { vine:o.vine, opt:o, D };
  S.lastChoice = { D, o, secs:(performance.now() - D.t0) / 1000 };
  $('coach').textContent = '';
}
function timeOut(){
  const D = S.decide; S.decide = null; box.classList.remove('deciding'); tsTarget = 1;
  D.opts.forEach(x => { x.el.disabled = true; x.vine.m.emissive.setHex(0); });
  S.lastChoice = { D, o:null, secs:S.R.secs * SET.mult };
  /* he lets go with nowhere to go */
  S.st = 'fly';
  const from = M.root.position.clone(), to = from.clone().add(new THREE.Vector3(0, -6, -SEG * .5));
  const mid = new THREE.Vector3().lerpVectors(from, to, .5); mid.y += 1;
  S.fly = { from, mid, to, t:0, dur:.7, target:{}, kind:'timeout', good:false, next:D.node };
  S.vine = null;
}
function useBanana(){
  if (!S.decide || S.mode === 'practice' || S.bananas <= 0) return;
  S.bananas--; S.used++; sfx('success', .4, 1.4);
  if (S.mode === 'timed'){ S.timeLeft += 6; S.timeMax = Math.max(S.timeMax, S.timeLeft); toast('🍌 +6 seconds'); }
  else { S.frozen += 6; toast('🍌 Clock frozen for 6 seconds'); }
  paintHud('hBan');
}

/* the flight after a choice lands: strong, weak (sags) or decoy (snaps) */
async function arriveCheck(f){
  const { D, o } = S.lastChoice;
  const strongOpt = D.opts.find(x => x.kind === 'strong');
  S.cur = D.node;
  revealAll(D, o);
  const rec = { item:D.item, pick:o.w, kind:o.kind, strong:strongOpt.w, weakT:o.kind === 'weak' ? o.t : null,
                fix:o.fix || null, tier:o.tier || null, secs:Math.round(S.lastChoice.secs * 10) / 10 };
  recordResult(rec);
  $('sent').innerHTML = sentHtml(D.item.s, strongOpt.w, 'strong');
  if (o.kind === 'strong'){
    S.streak++; S.best = Math.max(S.best, S.streak);
    let pts = Math.round(100 * mult());
    const bonus = S.mode === 'timed' ? Math.round(Math.max(0, S.timeLeft) * 5) : 0;
    pts = (pts + bonus) * (S.mode === 'timed' ? 2 : 1);
    S.score += pts; rec.pts = pts;
    catchVine(o.vine, { lock:true });
    sfx('success', .75);
    paintHud('hScore');
    toast('✓ Strong! +' + fmtN(pts) + (S.streak > 1 ? '   🔥 ' + S.streak + ' in a row' : ''), 1.7);
    clearTimeout(S.clearT); S.clearT = setTimeout(clearOptsSoon, 1400);
    onNodeReached();
  } else if (o.kind === 'weak'){
    S.streak = 0; S.score = Math.max(0, S.score - 25); rec.pts = -25;
    if (S.mode === 'race') S.clock += 3;
    catchVine(o.vine, { lock:true });
    o.vine.m.color.setHex(0xb0a54e);
    sfx('creak', .8, .7);
    const v = o.vine; const t0 = performance.now();
    const sag = () => { const k = Math.min(1, (performance.now() - t0) / 500); v.stretch = 1 + .18 * easeOut(k); if (k < 1) requestAnimationFrame(sag); };
    sag();
    paintHud('hStreak');
    await feedback('weak', D.item, rec);
    clearOptsSoon();
    onNodeReached();
  } else {
    S.streak = 0; S.score = Math.max(0, S.score - 75); rec.pts = -75;
    if (S.mode === 'race') S.clock += 6;
    snapVine(o.vine);
    paintHud('hStreak');
    missFall(strongOpt.vine, 'decoy');
    tsTarget = READ_SLOW;
    await feedback('decoy', D.item, rec);
    clearOptsSoon();
  }
}
function arriveTimeout(f){
  const D = S.lastChoice.D, strongOpt = D.opts.find(x => x.kind === 'strong');
  revealAll(D, null);
  const rec = { item:D.item, pick:null, kind:'miss', strong:strongOpt.w, secs:S.lastChoice.secs };
  recordResult(rec);
  $('sent').innerHTML = sentHtml(D.item.s, strongOpt.w, 'strong');
  S.streak = 0; S.score = Math.max(0, S.score - 75); rec.pts = -75;
  if (S.mode === 'race') S.clock += 6;
  paintHud('hStreak');
  missFall(strongOpt.vine, 'timeout');
  tsTarget = READ_SLOW;
  feedback('miss', D.item, rec).then(clearOptsSoon);
}
function snapVine(v){
  v.snapped = true; v.lower.visible = false;
  const piece = new THREE.Mesh(vineGeo, v.m); piece.scale.set(1, VL * .45, 1);
  const p = vineGrip(v, v.theta); piece.position.set(p.x, p.y + VL * .45, p.z); R3.scene.add(piece);
  const t0 = performance.now(), y0 = piece.position.y;
  const fall = () => { const k = (performance.now() - t0) / 1000; piece.position.y = y0 - 11 * k * k; piece.rotation.z = k * 2;
    if (k < 1.4) requestAnimationFrame(fall); else R3.scene.remove(piece); };
  fall();
  sfx('creak', .9, 1.8);
}
function revealAll(D, chosen){
  D.opts.forEach(x => {
    x.el.classList.remove('nosym', 'faint', 'hl'); x.el.classList.add('revealed', 'r-' + x.kind);
    x.el.querySelector('.tn').style.display = '';
    x.el.querySelector('.badge').textContent = x.kind === 'strong' ? '✓ strong' : x.kind === 'weak' ? '~ weak' : '✕ decoy';
    if (x !== chosen && x.kind !== 'strong') x.el.classList.add('dim');
  });
}
function clearOptsSoon(){ if (S.decide) return; $('opts').innerHTML = ''; $('sentBox').classList.remove('live'); $('coach').textContent = ''; if (!S.decide) $('sent').innerHTML = idleLine(); }
function idleLine(){
  if (S.segName === 'practice') return 'Practice swing';
  return esc(S.R ? S.R.name : '') + ' · check ' + Math.min(S.checkIx + 1, S.items.length) + ' of ' + S.items.length;
}
function recordResult(rec){
  S.results.push(rec);
  TYPE_STATS[rec.item.t] = TYPE_STATS[rec.item.t] || { strong:0, weak:0, decoy:0, miss:0 };
  TYPE_STATS[rec.item.t][rec.kind]++;
}
function symbolMode(R, k){
  if (R.symbols === 'all') return 'all';
  if (R.symbols === 'fade') return k < 3 ? 'full' : k < 6 ? 'faint' : 'none';
  return 'none';
}

/* ---------- feedback panel: the world crawls while it is up ---------- */
function feedback(kind, item, rec){
  return new Promise(res => {
    const wasClock = S.clockOn; S.clockOn = false;
    tsTarget = READ_SLOW;
    const need = TYPES[item.t];
    const needLine = 'This sentence needs <strong>' + need.sym + ' ' + esc(need.name) + '</strong>: a transition that ' + esc(need.means) + '.';
    const strongLine = 'Strong pick: <strong>' + esc(rec.strong) + '</strong>.';
    let head, body;
    if (kind === 'weak'){
      const wt = TYPES[rec.weakT] || { sym:'', name:'another kind', means:'' };
      head = '〰️ Weak grab: the vine sagged';
      body = '<p>“' + esc(rec.pick) + '” is a real transition, but it’s <strong>' + wt.sym + ' ' + esc(wt.name) + '</strong>: it ' + esc(wt.means) + '.</p><p>' + needLine + ' ' + strongLine + '</p>';
    } else if (kind === 'decoy'){
      head = '💥 Snap! That vine wasn’t a transition';
      const why = rec.fix ? esc(rec.fix) : rec.tier === 'medium' ? '“' + esc(rec.pick) + '” is a little grammar word, but it doesn’t connect two ideas.' : '“' + esc(rec.pick) + '” doesn’t connect ideas at all.';
      body = '<p>' + why + '</p><p>' + needLine + ' ' + strongLine + '</p>';
    } else {
      head = '⏱ Out of time: the monkey missed';
      body = '<p>' + needLine + ' ' + strongLine + '</p><p style="color:var(--soft);font-size:.9rem">Tip: press B to spend a 🍌 for 6 more seconds, or turn up ⏱ Time.</p>';
    }
    if (S.mode === 'race') body += '<p style="color:var(--soft);font-size:.88rem">Clock paused while you read. ' + (kind === 'weak' ? '+3 s' : '+6 s') + ' added.</p>';
    const p = $('panel');
    p.className = 'panel show' + (kind === 'weak' ? '' : ' bad');
    p.innerHTML = '<h3>' + head + '</h3>' + body + '<div class="row"><button class="btn go" id="goOn">Keep swinging →</button><span style="font-size:.85rem;color:var(--soft)">or press Enter</span></div>';
    const t0 = performance.now();
    const done = () => { if (performance.now() - t0 < 350) return; p.className = 'panel'; p.innerHTML = ''; document.removeEventListener('keydown', kd, true);
      tsTarget = 1; S.clockOn = wasClock || S.mode === 'race'; res(); };
    const kd = e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation(); done(); } };
    document.addEventListener('keydown', kd, true);
    $('goOn').onclick = done;
    setTimeout(() => $('goOn') && $('goOn').focus({ preventScroll:true }), 60);
  });
}

/* =====================================================================
   BANANAS — steer into the fruit, then press as the rings meet
   ===================================================================== */
function checkFruit(f, pos){
  const n = f.next; if (!n || !n.fruit || n.fruitDone || f.kind !== 'free') return;
  const d = pos.distanceTo(n.fruitPos);
  if (d < 2.6 && !S.qte){
    n.fruitDone = true;
    S.qte = { n, t0:performance.now(), dur:(S.segName === 'practice' ? 2.2 : 1.5) * SET.mult * (SET.auto ? 1.6 : 1) };
    tsTarget = QTE_SLOW;
    $('qte').className = 'qte show';
    $('qKey').textContent = S.segName === 'practice' ? 'CLICK / SPACE when the rings match' : 'CLICK / SPACE';
    if (S.mode === 'race') S.clockPausedForQte = true;
  } else if (d < 6 && pos.z < n.fruitPos.z - 1 && !n.fruitDone){ n.fruitDone = true; toast('Missed the fruit. Steer closer next time.', 1.6); if (S.tutorial === 'fruit') tutorial(null); }
}
function qteScale(){ return 2.6 - 2.1 * Math.min(1, (performance.now() - S.qte.t0) / 1000 / S.qte.dur); }
function qteHit(){
  if (!S.qte) return;
  const ok = Math.abs(qteScale() - 1) <= .3;
  endQte(ok);
}
function endQte(ok){
  const q = S.qte; S.qte = null; tsTarget = 1; S.clockPausedForQte = false;
  const el = $('qte'); el.classList.add(ok ? 'ok' : 'no');
  setTimeout(() => el.className = 'qte', 380);
  if (ok){
    q.n.fruit.visible = false;
    if (S.bananas < 3) S.bananas++;
    S.score += 25;
    sfx('success', .5, 1.25);
    paintHud('hBan');
    toast(S.bananas >= 3 ? '🍌 Got it! (max 3)' : '🍌 Got it! Press B during a choice to use it.', 2.2);
  } else toast('Missed the fruit. No cost.', 1.4);
  if (S.tutorial === 'fruit') tutorial(null);
}
function stepQte(){
  if (!S.qte) return;
  const s = qteScale();
  $('qRing').style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  const p = toScreen(S.qte.n.fruitPos);
  $('qte').style.left = Math.max(60, Math.min(box.clientWidth - 60, p.x)) + 'px';
  $('qte').style.top = Math.max(130, Math.min(box.clientHeight - 90, p.y)) + 'px';
  if (s <= .5) endQte(false);
}

/* =====================================================================
   CHECKPOINTS
   ===================================================================== */
function landDeck(node){
  S.st = 'land'; S.cur = node; tutorial(null);
  S.clockOn = false;
  const deckTop = node.deck.clone();
  M.root.rotation.set(0, 0, 0);
  M.pose('stand');
  M.root.position.set(deckTop.x, deckTop.y, deckTop.z);
  /* feet on the deck */
  M.root.updateMatrixWorld(true);
  const foot = M.footWorld(); M.root.position.y += deckTop.y - foot.y + .05;
  celebrate(node);
}
async function celebrate(node){
  S.camMode = 'orbit'; S.orbitT = 0;
  sfx('win', .85);
  burstConfetti(M.root.position.clone().add(new THREE.Vector3(0, 2, 0)));
  await wait(.7);
  M.playCheer(true);
  await wait(SET.calm ? 1.2 : 2.6);
  M.playCheer(false); M.pose('stand');
  await segmentDone();
}
const realWait = s => new Promise(r => setTimeout(r, s * 1000));
const wait = realWait;

let confetti = [];
function burstConfetti(at){
  if (SET.calm) return;
  const cols = [0xf2c230, 0xe04a3a, 0x3a8fd6, 0x2e7d5b, 0xffffff, 0xc06bd6], g = new THREE.PlaneGeometry(.2, .13);
  for (let i = 0; i < 160; i++){
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color:cols[i % 6], side:THREE.DoubleSide }));
    m.position.copy(at).add(new THREE.Vector3((Math.random() - .5) * 2, 0, (Math.random() - .5) * 2));
    const a = Math.random() * 6.28, sp = 2 + Math.random() * 4;
    m.userData = { v:new THREE.Vector3(Math.cos(a) * sp, 5 + Math.random() * 5, Math.sin(a) * sp), r:new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), life:3.5 };
    R3.scene.add(m); confetti.push(m);
  }
}
function stepConfetti(dt){
  for (let i = confetti.length - 1; i >= 0; i--){
    const m = confetti[i], u = m.userData;
    u.v.y -= 7 * dt; u.v.multiplyScalar(.985); m.position.addScaledVector(u.v, dt);
    m.rotation.x += u.r.x * dt; m.rotation.y += u.r.y * dt; u.life -= dt;
    if (u.life <= 0){ R3.scene.remove(m); m.material.dispose(); confetti.splice(i, 1); }
  }
}

/* =====================================================================
   SEGMENTS: practice → canopies → bonus. Each ends at a checkpoint.
   ===================================================================== */
function beginSegment(k){
  S.seg = k; S.R = segRound(k); S.segName = S.R.practice ? 'practice' : 'canopy';
  S.items = drawItems(S.R); S.checkIx = 0;
  Object.assign(S, { streak:0, best:0, score:0, used:0, results:[], clock:0, frozen:0 });
  $('rndName').textContent = S.R.name;
}
async function segmentDone(){
  S.st = 'menu';
  await report();
  const id = segId(S.seg);
  const ev = evidence();
  if (id === 'bonus') bonusRuns.push(ev);
  else if (!LL.done.has(id)){
    LL.summary[id] = S.R.practice ? S.summary.c.strong + ' of ' + S.results.length + ' strong in practice'
      : S.summary.c.strong + '/' + S.results.length + ' strong · 🔥 ' + S.best + ' · ' + fmtN(S.score) + ' pts';
    LL.finish(id, ev);
  }
  /* next segment */
  const nk = S.seg + 1;
  beginSegment(nk);
  S.mode = await chooseMode(S.R, nk >= ORDER.length);
  modeChip();
  if (S.mode === 'timed' && S.bananas < 3){ S.bananas++; toast('🍌 Free banana to get you started!'); }
  if (S.mode === 'race') S.target = raceTarget(S.R);
  paintHud();
  S.camMode = 'follow';
  jumpOff(S.cur);
}
function jumpOff(node){
  /* from the deck onto the next vine */
  const next = nodeAfter(node);
  const from = M.root.position.clone(), to = vineGrip(next.vines[0], CATCH_TH);
  const mid = new THREE.Vector3().lerpVectors(from, to, .5); mid.y += 3;
  S.fly = { from, mid, to, t:0, dur:1.2, target:{ vine:next.vines[0] }, kind:'rescue', good:true };
  S.st = 'bounce';
  sfx('whoosh', .6);
  if (S.mode === 'race'){ S.clockOn = true; }
  $('sent').innerHTML = idleLine();
}
function modeChip(){
  const chip = $('modeChip');
  chip.textContent = S.mode === 'timed' ? '⏱ Timed · gold ×2' : S.mode === 'race' ? '🏁 Race the clock' : '🌱 Practice';
  chip.classList.toggle('gold', S.mode === 'timed');
  box.classList.toggle('timed', S.mode === 'timed');
}
function raceTarget(R){
  const best = MEM.bestPace ? MEM.bestPace * SET.mult : 0, par = PAR_PER_VINE * SET.mult;
  return Math.round(((best && best < par) ? best : par) * R.vines * 10) / 10;
}

/* ---------- overlays ---------- */
function showOverlay(html){ $('ovCard').innerHTML = html; $('ov').classList.add('show'); }
function hideOverlay(){ $('ov').classList.remove('show'); }
function overlayWait(html, bind){
  return new Promise(res => {
    showOverlay(html);
    const done = v => { hideOverlay(); document.removeEventListener('keydown', kd, true); res(v); };
    const kd = e => bind.keys(e, done);
    document.addEventListener('keydown', kd, true);
    bind.click(done);
  });
}
function chooseMode(R, bonus){
  const tgt = raceTarget(R), hasBest = !!MEM.bestPace;
  return overlayWait(
    '<h3>' + esc(R.name) + (bonus ? ' (bonus)' : '') + ': how do you want to swing?</h3>' +
    '<p class="lede">' + R.vines + ' skill checks to the next checkpoint. You can pick differently next time.</p>' +
    '<div class="modes">' +
      '<button class="mode timed" id="mTimed"><span class="k">press 1</span><b>⏱ Timed</b><span class="tag">GOLD ×2 POINTS</span><span class="tag">FREE 🍌</span>' +
        '<small>' + Math.round(R.secs * SET.mult) + ' seconds per check while time crawls. Time left over turns into bonus points.</small></button>' +
      '<button class="mode" id="mRace"><span class="k">press 2</span><b>🏁 Race the clock</b><span class="tag blue">BEAT ' + fmtTime(tgt) + '</span>' +
        '<small>A stopwatch runs the whole canopy. ' + (hasBest ? 'The target is your best pace so far.' : 'First time: a friendly par. Beat it!') + ' Misses and wrong vines add seconds.</small></button>' +
    '</div>',
    { keys:(e, done) => { if (e.key === '1'){ e.preventDefault(); done('timed'); } if (e.key === '2'){ e.preventDefault(); done('race'); } },
      click:done => { $('mTimed').onclick = () => done('timed'); $('mRace').onclick = () => done('race'); setTimeout(() => $('mTimed').focus({ preventScroll:true }), 50); } });
}
function report(){
  const R = S.R, n = S.results.length, c = { strong:0, weak:0, decoy:0, miss:0 };
  S.results.forEach(r => c[r.kind]++);
  let raceLine = '', beat = false, newBest = false;
  if (S.mode === 'race'){
    beat = S.clock <= S.target; if (beat) S.score += 250;
    const pace = S.clock / SET.mult / Math.max(1, n);
    newBest = !!MEM.bestPace && pace < MEM.bestPace;
    if (!MEM.bestPace || pace < MEM.bestPace){ MEM.bestPace = Math.round(pace * 100) / 100; saveMem(); }
    raceLine = fmtTime(S.clock) + ' vs. ' + fmtTime(S.target);
  }
  totalScore += S.score;
  S.summary = { c, raceLine, beat, newBest };
  const chain = S.results.map(r => {
    const mk = r.kind === 'strong' ? '✓' : r.kind === 'weak' ? '〰️ weak: ' + esc(r.pick) : r.kind === 'decoy' ? '💥 snapped: ' + esc(r.pick) : '⏱ missed';
    return '<li class="' + r.kind + '">' + sentHtml(r.item.s, r.strong).replace(/<span class="fill [^"]*">([^<]*)<\/span>/, '<b>$1</b>') +
      ' <span class="mk">' + TYPES[r.item.t].sym + ' ' + mk + '</span></li>';
  }).join('');
  const chips = ['✓ ' + c.strong + ' of ' + n + ' strong', '〰️ ' + c.weak + ' weak', '💥 ' + c.decoy + ' snapped', '🔥 best streak ' + S.best, '🍌 ' + S.used + ' used'];
  if (S.mode === 'timed') chips.splice(3, 0, '⏱ ' + c.miss + ' timed out');
  if (S.mode === 'race') chips.push('🏁 ' + raceLine + (beat ? '  🏆 beat it! +250' : ''));
  if (S.mode === 'timed') chips.push('🥇 gold ×2 applied');
  const head = R.practice ? '🌱 Practice done!' : '🏁 Checkpoint! ' + esc(R.name);
  const praise = R.practice ? 'You’ve got the moves. Now the canopy counts.'
    : c.strong === n ? 'Perfect canopy. Every vine strong!' : newBest ? 'New best pace!' : beat ? 'You beat the clock!' : 'Look at the chain you built.';
  const btn = S.seg === ORDER.length - 1 ? 'Finish (or keep swinging) →' : 'Keep swinging →';
  return overlayWait('<div class="cphead"><div><h3>' + head + '</h3><p class="lede">' + praise + '</p></div>' +
    '<div class="cpscore"><span>⭐ score</span><b id="tallyScore">0</b><button class="btn go" id="cpNext" style="display:block;margin-top:.4rem;white-space:nowrap">' + btn + '</button></div></div>' +
    '<div class="chips">' + chips.map(t => '<span class="chip hidden">' + t + '</span>').join('') + '</div><ul class="chain">' + chain + '</ul>' +
    '<p style="margin:0;font-size:.85rem;color:var(--soft)">Press Enter or the green button to keep going.</p>',
    { keys:(e, done) => { if (e.key === 'Enter' && performance.now() - t1 > 600){ e.preventDefault(); done(); } },
      click:done => { $('cpNext').onclick = () => done(); count(); } });
  var t1;
  function count(){
    t1 = performance.now();
    const chs = [...$('ovCard').querySelectorAll('.chip')];
    chs.forEach((x, i) => setTimeout(() => x.classList.remove('hidden'), SET.calm ? 0 : 200 * (i + 1)));
    const t0 = performance.now(), delay = SET.calm ? 0 : 200 * chs.length;
    const step = () => { const k = Math.min(1, Math.max(0, (performance.now() - t0 - delay) / 900)); const el = $('tallyScore');
      if (el) el.textContent = fmtN(S.score * easeOut(k)); if (k < 1) requestAnimationFrame(step); };
    step();
  }
}
function evidence(){
  const R = S.R, Sm = S.summary, c = Sm.c, n = S.results.length, lines = [];
  lines.push('Mode: ' + (S.mode === 'timed' ? 'Timed (' + Math.round(R.secs * SET.mult) + ' s per check, gold ×2)' :
    S.mode === 'race' ? 'Race the clock: ' + Sm.raceLine + (Sm.beat ? ' (beat it)' : '') : 'Practice (no clock)') +
    (SET.mult !== 1 ? ' · extra time ×' + SET.mult : '') + (SET.auto ? ' · auto-swing on' : ''));
  lines.push('Strong ' + c.strong + ' of ' + n + ' · weak ' + c.weak + ' · snapped ' + c.decoy + (S.mode === 'timed' ? ' · timed out ' + c.miss : '') +
    ' · best streak ' + S.best + ' · score ' + fmtN(S.score));
  const miss = S.results.filter(r => r.kind !== 'strong');
  if (miss.length){
    lines.push('To look at again:');
    miss.forEach(r => {
      const what = r.kind === 'weak' ? 'WEAK: chose “' + r.pick + '” (' + (TYPES[r.weakT] ? TYPES[r.weakT].name : '?') + ')'
        : r.kind === 'decoy' ? 'SNAPPED: chose “' + r.pick + '” (not a transition)' : 'TIMED OUT';
      lines.push('  • ' + what + ', needed ' + TYPES[r.item.t].name + ' → “' + r.strong + '”: ' + r.item.s);
    });
  } else lines.push('Every vine strong.');
  return lines.join('\n');
}

/* ---------- tutorial captions (practice) ---------- */
function tutorial(which){
  S.tutorial = which;
  const el = $('tip');
  const txt = { hold:'<b>Hold</b> the mouse button (or <kbd>Space</kbd>) to hang on. <b>Let go</b> near the front of the swing to fly.',
                catch:'Now <b>press and hold</b> again before you reach the next vine to catch it. <kbd>A</kbd> / <kbd>D</kbd> steer.',
                fruit:'🍌 Fruit ahead! Steer into it with <kbd>A</kbd> / <kbd>D</kbd>, then <b>click or Space</b> as the rings line up.' }[which];
  if (!txt){ el.classList.remove('show'); return; }
  el.innerHTML = txt; el.classList.add('show');
}

/* =====================================================================
   INTRO
   ===================================================================== */
async function intro(){
  const firstUndone = () => { const i = ORDER.findIndex(id => !LL.done.has(id)); return i < 0 ? ORDER.length : i; };
  S.startSeg = firstUndone();
  nextZ = 0;
  const start = makeNode({ type:'start' }); S.cur = start;
  M.pose('stand'); M.root.position.copy(start.deck); M.root.updateMatrixWorld(true);
  const foot = M.footWorld(); M.root.position.y += start.deck.y - foot.y + .05;
  S.st = 'intro'; S.camMode = 'intro';
  beginSegment(S.startSeg);
  $('sent').innerHTML = 'Ready when you are.';
  const resume = S.startSeg > 0;
  await overlayWait('<h3>🐒 Ready to swing?</h3><p class="lede">' + (resume ? 'Picking up at <b>' + esc(S.R.name) + '</b>.' :
      'Practice first: four skill checks, no clock, and the symbols are showing. The game teaches the controls as you go.') + '</p>' +
    '<ul style="margin:.2rem 0 .8rem;padding-left:1.2rem;font-size:.95rem;line-height:1.6">' +
    '<li><b>Hold</b> mouse / <kbd>Space</kbd> = hang on · <b>let go</b> = fly · <kbd>A</kbd>/<kbd>D</kbd> = steer</li>' +
    '<li>When a sentence appears, time slows. <kbd>A</kbd>/<kbd>D</kbd> pick a vine, <b>click</b> or <kbd>Space</kbd> grabs it.</li>' +
    '<li>🔊 Sound is on. The button above the game turns it off.</li></ul>' +
    '<div class="row" style="margin:0"><button class="btn go big" id="goStart">' + (resume ? 'Keep swinging →' : 'Start swinging →') + '</button><span style="font-size:.85rem;color:var(--soft)">or press Enter</span></div>',
    { keys:(e, done) => { if (e.key === 'Enter'){ e.preventDefault(); done(); } }, click:done => { $('goStart').onclick = () => done(); } });
  audioStart();
  if (firstUndone() !== S.startSeg){ S.startSeg = firstUndone(); beginSegment(S.startSeg); }   /* a save was restored meanwhile */
  const resumeNow = S.startSeg > 0;
  topUp();
  if (resumeNow){ S.mode = await chooseMode(S.R, S.startSeg >= ORDER.length); if (S.mode === 'timed' && S.bananas < 3) S.bananas++; if (S.mode === 'race') S.target = raceTarget(S.R); }
  else S.mode = 'practice';
  modeChip(); paintHud();
  S.camMode = 'follow';
  if (!resumeNow && !SET.auto) tutorial('hold');
  holding = SET.auto;
  jumpOff(start);
}

/* =====================================================================
   HUD
   ===================================================================== */
function paintHud(popWhich){
  $('hStreak').textContent = '🔥 ' + S.streak + (S.streak ? '  ×' + mult().toFixed(2).replace(/\.?0+$/, '') : '');
  $('hScore').textContent = '⭐ ' + fmtN(S.score) + (S.mode === 'timed' ? '  (gold ×2)' : '');
  $('hScore').classList.toggle('gold', S.mode === 'timed');
  $('hBan').textContent = '🍌 ' + S.bananas;
  $('hClock').hidden = S.mode !== 'race';
  if (popWhich){ const el = $(popWhich); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
}
function paintTimer(){
  const k = Math.max(0, S.timeLeft / S.timeMax);
  $('tfill').style.transform = 'scaleX(' + k + ')';
  $('tbar').classList.toggle('low', S.timeLeft < 4);
  $('ttxt').textContent = '⏱ ' + Math.max(0, S.timeLeft).toFixed(1) + ' s' + (S.timeLeft < 4 ? '  hurry!' : '');
}
function paintClock(){
  const el = $('hClock');
  el.textContent = '🏁 ' + fmtTime(S.clock) + '  / ' + fmtTime(S.target) + (S.frozen > 0 ? '  ❄ frozen' : '');
  const k = S.checkIx, pace = k ? S.clock / k : 0, need = S.target / S.R.vines;
  el.classList.toggle('ahead', k > 0 && pace <= need); el.classList.toggle('behind', k > 0 && pace > need);
}
let toastT = 0;
function toast(msg, secs){
  const el = $('toast'); el.textContent = msg; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), (secs || 1.8) * 1000);
}

/* =====================================================================
   CAMERA + LABELS
   ===================================================================== */
const camPos = new THREE.Vector3(0, 14, 8), camLook = new THREE.Vector3(0, 10, -10);
function updateCamera(dt){
  const mp = M.root.position, cx = S.cur ? S.cur.cx : 0;
  let tp, tl;
  if (S.camMode === 'orbit'){
    S.orbitT = Math.min(1, S.orbitT + dt / (SET.calm ? .6 : 1.4));
    const a = Math.PI * easeIO(S.orbitT);          /* behind → in front */
    tp = tmp.set(mp.x + Math.sin(a) * 2.2, mp.y + 1.6, mp.z + Math.cos(a) * 5.2 - (1 - Math.cos(a)) * .4);
    tl = tmp2.set(mp.x, mp.y + .9, mp.z);
    camPos.copy(tp); camLook.copy(tl);
  } else if (S.camMode === 'intro'){
    tp = tmp.set(mp.x + 3, mp.y + 2.5, mp.z + 7); tl = tmp2.set(mp.x, mp.y + .8, mp.z - 4);
    camPos.lerp(tp, 1 - Math.exp(-dt * 3)); camLook.lerp(tl, 1 - Math.exp(-dt * 3));
  } else {
    const look = S.decide ? S.decide.node.cx : cx;
    tp = tmp.set(mp.x * .72 + cx * .28, Math.max(mp.y + 2.6, groundY(mp.x, mp.z + 5) + 2), mp.z + 6.8);
    tl = tmp2.set(mp.x * .55 + look * .45, mp.y - .4, mp.z - 10);
    const k = 1 - Math.exp(-dt * (SET.calm ? 2.5 : 4));
    camPos.lerp(tp, k); camLook.lerp(tl, k);
  }
  R3.camera.position.copy(camPos); R3.camera.lookAt(camLook);
  const fov = SET.calm ? 58 : 58 + Math.min(6, S.streak * .8);
  if (Math.abs(R3.camera.fov - fov) > .05){ R3.camera.fov += (fov - R3.camera.fov) * Math.min(1, dt * 2); R3.camera.updateProjectionMatrix(); }
  R3.sun.position.set(mp.x + 20, mp.y + 40, mp.z + 15); R3.sun.target.position.copy(mp);
}
function toScreen(v3){ const p = v3.clone().project(R3.camera); return { x:(p.x + 1) / 2 * box.clientWidth, y:(1 - p.y) / 2 * box.clientHeight }; }
function placeLabels(){
  const wrap = $('opts'); if (!wrap.children.length) return;
  const D = S.decide || (S.lastChoice && S.lastChoice.D); if (!D) return;
  const minY = $('sentBox').offsetHeight + 46;
  D.opts.forEach(o => {
    if (!o.el) return;
    const p = vineGrip(o.vine, o.vine.pivot.rotation.x, tmp); p.y += 1.1;
    const s = toScreen(p);
    o.el.style.left = Math.max(70, Math.min(box.clientWidth - 70, s.x)) + 'px';
    o.el.style.top = Math.max(minY, Math.min(box.clientHeight - 80, s.y)) + 'px';
  });
}

/* =====================================================================
   FRAME
   ===================================================================== */
let last = 0;
const STEP = +(new URLSearchParams(location.search).get('step') || 0);   /* test hook: fixed time step */
const NORENDER = new URLSearchParams(location.search).has('norender');  /* test hook */
window.__render = () => R3.renderer.render(R3.scene, R3.camera);
function frame(t){
  if (window.__freeze){ last = t; requestAnimationFrame(frame); return; }
  const raw = STEP ? STEP : Math.min(.25, (t - (last || t)) / 1000); last = t;
  const rdt = Math.min(.1, raw);
  S.fps = S.fps ? S.fps * .95 + (raw > 0 ? 1 / raw : 60) * .05 : 30;
  timeScale += (tsTarget - timeScale) * Math.min(1, rdt * (tsTarget < timeScale ? 9 : 5));
  const dt = rdt * timeScale;
  S.t += dt;
  /* timers in real time */
  if (S.decide && S.mode === 'timed'){
    S.timeLeft -= raw; paintTimer();
    const whole = Math.ceil(S.timeLeft); if (whole <= 3 && whole !== S.lastTick && S.timeLeft > 0){ S.lastTick = whole; sfx('creak', .25, 2.2); }
    if (S.timeLeft <= 0) timeOut();
  }
  if (S.clockOn && !S.clockPausedForQte){ if (S.frozen > 0) S.frozen -= raw; else S.clock += raw; paintClock(); }
  if (M){
    if (S.st === 'hang') stepSwing(dt);
    else if (S.st === 'fly') stepFly(dt);
    else if (S.st === 'fall') stepFall(dt);
    else if (S.st === 'bounce') stepBounce(dt);
    M.mixer.update(raw);
    stepQte();
    /* idle vines sway; snapped/sagging handled in place */
    for (const n of S.nodes) for (const v of n.vines){
      if (v === S.vine || (S.fly && S.fly.target && S.fly.target.vine === v)) continue;
      v.sway += dt; v.pivot.rotation.x = SET.calm ? 0 : .04 * Math.sin(v.sway * 1.2); v.pivot.scale.y = v.stretch;
    }
    for (const n of S.nodes) if (n.fruit && n.fruit.visible){ n.fruit.rotation.y += dt * 1.5; }
    updateCamera(rdt);
    world.update(R3.camera.position.z, R3.camera.position, S.t, dt);
    stepConfetti(rdt);
    if (!NORENDER) R3.renderer.render(R3.scene, R3.camera);
    placeLabels();
  }
  requestAnimationFrame(frame);
}
const easeIO = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const easeOut = k => 1 - Math.pow(1 - k, 3);

/* =====================================================================
   TOOLBAR
   ===================================================================== */
function paintToggles(){
  $('sndBtn').textContent = SET.sound ? '🔊 Sound: on' : '🔇 Sound: off'; $('sndBtn').setAttribute('aria-pressed', SET.sound);
  $('calmBtn').textContent = '🐢 Calm motion: ' + (SET.calm ? 'on' : 'off'); $('calmBtn').setAttribute('aria-pressed', SET.calm);
  $('bigBtn').textContent = '🔤 Bigger text: ' + (SET.big ? 'on' : 'off'); $('bigBtn').setAttribute('aria-pressed', SET.big);
  $('autoBtn').textContent = '🤖 Auto-swing: ' + (SET.auto ? 'on' : 'off'); $('autoBtn').setAttribute('aria-pressed', SET.auto);
  $('timeBtn').textContent = '⏱ Time: ×' + SET.mult;
  box.classList.toggle('big', SET.big);
}
$('sndBtn').onclick = () => { setSound(!SET.sound); if (SET.sound) audioStart(); };
$('calmBtn').onclick = () => { SET.calm = !SET.calm; paintToggles(); };
$('bigBtn').onclick = () => { SET.big = !SET.big; paintToggles(); };
$('autoBtn').onclick = () => { SET.auto = !SET.auto; if (SET.auto) holding = true; paintToggles(); if (SET.auto) tutorial(null); };
$('timeBtn').onclick = () => {
  SET.mult = SET.mult === 1 ? 1.5 : SET.mult === 1.5 ? 2 : 1;
  if (S.decide && S.mode === 'timed'){ const k = S.timeLeft / S.timeMax; S.timeMax = S.R.secs * SET.mult; S.timeLeft = k * S.timeMax; }
  paintToggles();
};
paintToggles();

/* restoring a save mid-run reloads, so the restore lands before anything starts */
const OURS = new Set();
const baseFinish = LL.finish.bind(LL);
LL.finish = function(id, ev){ OURS.add(id); baseFinish(id, ev); };
const baseNext = LL.next.bind(LL);
LL.next = function(){
  baseNext();
  if (S.st !== 'intro' && S.st !== 'load' && [...LL.done].some(id => !OURS.has(id))) location.reload();
};

init().catch(e => { console.error(e); $('sent').textContent = 'The jungle failed to load (' + (e && e.message || e) + '). Try reloading the page.'; });
