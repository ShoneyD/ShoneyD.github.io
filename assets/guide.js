/* ===========================================================================
   guide.js — "read the directions first" for hosted lesson pages.

   Loaded AFTER lesson.js and BEFORE student.js, only on pages rendered with
   the guide on (the default since 10 Nov 2026; `guide: false` in a lesson
   source turns it off). Pages that never link this file are untouched.

   What it does, per part (stage):
     1. Splits the stage body at runtime into STEPS: a run of directions
        (prose, figures, lists) is a LEAD; a question with its stems, answer
        box, keys and self-check is a Q. Nothing in the markup changes; nodes
        are only wrapped, so student.js's save fingerprint is unaffected.
     2. When a part opens, its first lead is outlined in red with a bouncing
        "Read this first" flag and an "I read it" button. Directions that sit
        between questions get the same treatment when the student reaches them.
     3. The current question is outlined with a "You're here" tag. It moves on
        when a typed answer loses focus or a dropdown is picked. Clicking any
        other question makes that one current.
     4. SOFT NUDGE: starting a question while its directions are still unread
        shakes the flag and scrolls back to the directions — once per lead.
        Nothing is ever locked.
     5. If the current step is out of view, a "Jump to current question" pill
        appears at the edge of what the student can see.

   Inside a Canvas iframe the page is usually as tall as its content, so the
   iframe never scrolls itself; Canvas does. position:fixed would pin to the
   iframe, not the screen. So the visible band is measured with an
   IntersectionObserver on a full-height sentinel (it reports against the
   top-level viewport, cross-origin included), and the pill is placed in
   document coordinates inside that band.

   Colours are tokens with fallbacks, as in student.js (activities have no
   shared stylesheet; this keeps the same habit). Honours reduced motion.
   =========================================================================== */
(function () {
  'use strict';
  if (typeof LL === 'undefined' || !LL) return;
  if (typeof GUIDE !== 'undefined' && GUIDE === false) return;

  var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MEMBER = '.stems, .abox, details.check, .keys';       /* belongs to the question above it */
  var TAIL   = '.done-look, .row';                          /* end of the steps */

  /* ------------------------------------------------------------------ CSS */
  var css =
    /* padding is constant so moving the highlight never shifts the layout */
    '.gd-lead,.gd-q{position:relative;border-radius:14px;margin:.35rem -.8rem;scroll-margin-top:2.6rem;' +
      'padding:1rem .8rem .55rem;transition:box-shadow .25s ease}' +
    '.gd-lead{margin-top:1rem}' +
    '.gd-lead.gd-on{box-shadow:0 0 0 3px var(--alert,#ff6b6b);animation:gd-pulse 1.8s ease-in-out infinite}' +
    '@keyframes gd-pulse{0%,100%{box-shadow:0 0 0 3px var(--alert,#ff6b6b)}50%{box-shadow:0 0 0 7px var(--alert,#ff6b6b)}}' +
    '.gd-flag{position:absolute;top:-1.05rem;right:1rem;z-index:5;display:none;align-items:center;gap:.4rem;' +
      'background:var(--alert,#ff6b6b);color:var(--on-alert,#1a0d0d);border-radius:999px;padding:.3rem .85rem;' +
      'font-weight:700;font-size:.9rem;box-shadow:0 4px 14px rgba(0,0,0,.35);white-space:nowrap}' +
    '.gd-lead.gd-on>.gd-flag{display:flex}' +
    '.gd-arrow{display:inline-block;font-size:1.05rem;animation:gd-bob .9s ease-in-out infinite}' +
    '@keyframes gd-bob{0%,100%{transform:translateY(-2px)}50%{transform:translateY(4px)}}' +
    '.gd-flag.gd-shake{animation:gd-shake .5s ease 2}' +
    '@keyframes gd-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}' +
    '.gd-ackrow{display:none;margin:.75rem 0 .2rem}' +
    '.gd-lead.gd-on .gd-ackrow{display:block}' +
    '.gd-ack{font:inherit;font-weight:700;cursor:pointer;border:0;border-radius:10px;padding:.6rem 1.1rem;' +
      'background:var(--alert,#ff6b6b);color:var(--on-alert,#1a0d0d)}' +
    '.gd-ack:focus-visible,.gd-pill:focus-visible{outline:3px solid var(--ink,#f3f5f8);outline-offset:2px}' +
    '.gd-q.gd-cur{box-shadow:0 0 0 3px var(--accent,#6fbde3)}' +
    '.gd-tag{position:absolute;top:-.95rem;right:1rem;display:none;background:var(--accent,#6fbde3);' +
      'color:var(--on-accent,#0f1216);border-radius:999px;padding:.2rem .75rem;font-weight:700;font-size:.82rem}' +
    '.gd-q.gd-cur>.gd-tag{display:block}' +
    '.row.gd-ready .btn{box-shadow:0 0 0 3px var(--calm,#5ecb92)}' +
    '.gd-readytag{display:none;margin-left:.75rem;font-weight:700;color:var(--calm,#5ecb92)}' +
    '.row.gd-ready .gd-readytag{display:inline}' +
    '.gd-pill{position:absolute;left:50%;transform:translateX(-50%);z-index:60;display:none;cursor:pointer;' +
      'border:0;border-radius:999px;padding:.6rem 1.15rem;font:inherit;font-weight:700;' +
      'background:var(--accent,#6fbde3);color:var(--on-accent,#0f1216);box-shadow:0 6px 18px rgba(0,0,0,.4)}' +
    '.gd-pill.gd-alert{background:var(--alert,#ff6b6b);color:var(--on-alert,#1a0d0d)}' +
    '.gd-pill.show{display:block}' +
    '.gd-sentinel{position:absolute;top:0;left:0;width:1px;pointer-events:none;visibility:hidden}' +
    /* arrival: a soft light sweeps once round the directions box */
    '@property --gd-ang{syntax:"<angle>";inherits:false;initial-value:0deg}' +
    '.gd-lead::before{content:"";position:absolute;inset:-6px;border-radius:18px;padding:4px;pointer-events:none;' +
      'opacity:0;background:conic-gradient(from var(--gd-ang),transparent 0 62%,var(--alert,#ff6b6b) 78%,' +
      'var(--on-alert,#fff) 86%,var(--alert,#ff6b6b) 92%,transparent 100%);filter:blur(3px);' +
      '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;' +
      'mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}' +
    '.gd-lead.gd-on.gd-arrive::before{animation:gd-sweep 1.4s linear 2}' +
    '@keyframes gd-sweep{0%{--gd-ang:0deg;opacity:0}10%{opacity:.9}90%{opacity:.9}100%{--gd-ang:360deg;opacity:0}}' +
    /* where to start reading: the first few words, lightly marked */
    '.gd-start{background:linear-gradient(var(--hl,#4a3d12),var(--hl,#4a3d12)) no-repeat 0 0/100% 100%;' +
      'border-radius:4px;padding:0 .15em;margin:0 -.15em;box-decoration-break:clone;-webkit-box-decoration-break:clone}' +
    '.gd-lead.gd-on.gd-arrive .gd-start{animation:gd-wipe .7s ease-out both,gd-nudge .5s ease-in-out .75s 3}' +
    '@keyframes gd-wipe{from{background-size:0 100%}to{background-size:100% 100%}}' +
    '@keyframes gd-nudge{0%,100%{box-shadow:0 0 0 0 var(--warn,#e8a94e)}50%{box-shadow:0 0 0 3px var(--warn,#e8a94e)}}' +
    '@media (prefers-reduced-motion: reduce){.gd-lead.gd-on,.gd-arrow,.gd-flag.gd-shake,.gd-lead.gd-arrive::before,.gd-lead.gd-arrive .gd-start{animation:none}}';
  var tag = document.createElement('style');
  tag.textContent = css;
  document.head.appendChild(tag);

  /* ---------------------------------------------------------- utilities */
  function field(q)   { return q.querySelector('textarea[data-q], input[data-q], select[data-q]'); }
  function filled(q)  { var f = field(q); return !!(f && String(f.value).trim()); }
  function scrollTo(el, block) {
    try { el.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: block || 'center' }); }
    catch (e) { el.scrollIntoView(); }
  }
  function docRect(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
  }

  /* ------------------------------------------------- split a stage into steps */
  var STEPS = {};                     /* stage id -> [{kind, el, acked}] */

  function wrap(nodes, cls) {
    var box = document.createElement('div');
    box.className = cls;
    nodes[0].parentNode.insertBefore(box, nodes[0]);
    nodes.forEach(function (n) { box.appendChild(n); });
    return box;
  }

  function substantial(nodes) {
    var t = nodes.map(function (n) { return n.matches('h2,h3') ? '' : n.textContent; }).join(' ');
    return t.replace(/\s+/g, ' ').trim().length > 30 ||
           nodes.some(function (n) { return n.matches('figure, table, ul, ol, svg') || n.querySelector('figure, table, svg'); });
  }

  /* Wrap the first few words of the directions so the student can see where
     to start reading. Range.extractContents splits any <strong>/<em> it cuts
     through, so the markup stays valid. */
  function markStart(L) {
    var p = L.querySelector('p, li');
    if (!p) return;
    var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), node, words = 0, endNode = null, endOff = 0;
    var done = false;
    while (!done && (node = walker.nextNode())) {
      var re = /\S+/g, m;
      while ((m = re.exec(node.data))) {
        words++;
        endNode = node; endOff = m.index + m[0].length;      /* fewer than 5 words: take them all */
        if (words === 5) { done = true; break; }
      }
    }
    if (!endNode) return;
    try {
      var r = document.createRange();
      r.setStart(p, 0); r.setEnd(endNode, endOff);
      var span = document.createElement('span');
      span.className = 'gd-start';
      span.appendChild(r.extractContents());
      r.insertNode(span);
    } catch (e) { /* leave the paragraph exactly as it was */ }
  }

  function arrive(el) {
    if (!el || !el.classList.contains('gd-lead')) return;
    el.classList.remove('gd-arrive'); void el.offsetWidth;
    el.classList.add('gd-arrive');
    clearTimeout(el._gdT);
    el._gdT = setTimeout(function () { el.classList.remove('gd-arrive'); }, 3200);
  }

  function segment(stage) {
    if (STEPS[stage.id]) return STEPS[stage.id];
    var body = stage.querySelector('.stage-body');
    var steps = [];
    if (!body) return (STEPS[stage.id] = steps);

    var kids = Array.prototype.slice.call(body.children);
    var lead = [], q = null, groups = [];
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.matches(TAIL)) break;
      if (k.matches('p.q')) {
        groups.push({ lead: lead, q: [k] }); lead = []; q = groups[groups.length - 1].q;
      } else if (q && k.matches(MEMBER)) {
        q.push(k);
      } else {
        q = null; lead.push(k);
      }
    }
    var first = true;
    groups.forEach(function (g) {
      if (g.lead.length && substantial(g.lead)) {
        var L = wrap(g.lead, 'gd-lead');
        markStart(L);
        var flag = document.createElement('div');
        flag.className = 'gd-flag';
        flag.setAttribute('aria-hidden', 'true');
        flag.innerHTML = '<span>👀 ' + (first ? 'Read this first' : 'New directions — read first') +
                         '</span><span class="gd-arrow">⬇</span>';
        L.insertBefore(flag, L.firstChild);
        var row = document.createElement('div');
        row.className = 'gd-ackrow';
        row.innerHTML = '<button type="button" class="gd-ack">✓ I read it' +
                        (first ? ' — start the questions' : '') + '</button>';
        L.appendChild(row);
        steps.push({ kind: 'lead', el: L, acked: false });
      }
      first = false;
      var Q = wrap(g.q, 'gd-q');
      var t = document.createElement('span');
      t.className = 'gd-tag'; t.setAttribute('aria-hidden', 'true');
      t.textContent = '👈 You’re here';
      Q.insertBefore(t, Q.firstChild);
      steps.push({ kind: 'q', el: Q });
    });

    var nextRow = body.querySelector('.row');
    if (nextRow && !nextRow.querySelector('.gd-readytag')) {
      var rt = document.createElement('span');
      rt.className = 'gd-readytag';
      rt.textContent = '✓ All answered — press this when you’re ready';
      nextRow.appendChild(rt);
    }
    return (STEPS[stage.id] = steps);
  }

  /* -------------------------------------------------------------- state */
  var curStage = null, cur = null, nudged = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

  function stepOf(el) {
    var st = el.closest('.stage'); if (!st || !STEPS[st.id]) return null;
    var box = el.closest('.gd-q, .gd-lead');
    var arr = STEPS[st.id];
    for (var i = 0; i < arr.length; i++) if (arr[i].el === box) return { stage: st, i: i, s: arr[i] };
    return null;
  }

  /* the unread lead that governs step i (nearest lead at or before it) */
  function governingLead(arr, i) {
    for (var j = i; j >= 0; j--) if (arr[j].kind === 'lead') return arr[j].acked ? null : arr[j];
    return null;
  }

  function clearMarks(stage) {
    (STEPS[stage.id] || []).forEach(function (s) { s.el.classList.remove('gd-on', 'gd-cur'); });
    var row = stage.querySelector('.stage-body > .row');
    if (row) row.classList.remove('gd-ready');
  }

  function setCurrent(stage, i, how) {
    var arr = STEPS[stage.id]; if (!arr) return;
    clearMarks(stage);
    curStage = stage;
    if (i >= arr.length) {                               /* every step done */
      cur = null;
      var row = stage.querySelector('.stage-body > .row');
      if (row) { row.classList.add('gd-ready'); cur = { kind: 'end', el: row }; if (how === 'scroll') scrollTo(row, 'center'); }
      placePill();
      return;
    }
    cur = arr[i];
    cur.el.classList.add(cur.kind === 'lead' ? 'gd-on' : 'gd-cur');
    if (cur.kind === 'lead') arrive(cur.el);
    if (cur.kind === 'q') {
      /* any unread directions still above it keep their flag */
      var g = governingLead(arr, i);
      if (g) g.el.classList.add('gd-on');
    }
    if (how === 'scroll') scrollTo(cur.el, cur.kind === 'lead' ? 'start' : 'center');
    else if (how === 'nearest') scrollTo(cur.el, 'nearest');
    placePill();
  }

  /* where should a freshly opened (or restored) stage start? */
  function firstOpen(stage) {
    var arr = segment(stage);
    var i = 0;
    for (; i < arr.length; i++) {
      var s = arr[i];
      if (s.kind === 'q' && !filled(s.el)) break;
      if (s.kind === 'lead') {
        /* a lead with answered questions after it has clearly been met */
        var answeredAfter = false;
        for (var j = i + 1; j < arr.length && arr[j].kind === 'q'; j++) if (filled(arr[j].el)) answeredAfter = true;
        if (!answeredAfter && !s.acked) break;
        s.acked = true;
      }
    }
    return i;
  }

  function open(stage, how) {
    if (!stage || stage.hidden || stage.id === 'turnin') return;
    if (!stage.classList.contains('active') || stage.classList.contains('done')) return;
    var i = firstOpen(stage);
    /* lesson.js has already put the top of the part on screen; only scroll
       ourselves when the place to start is further down */
    setCurrent(stage, i, i === 0 ? null : how);
  }

  function advanceFrom(stage, i) {
    var arr = STEPS[stage.id];
    var n = i + 1;
    while (n < arr.length && arr[n].kind === 'q' && filled(arr[n].el)) n++;
    var next = arr[n];
    setCurrent(stage, n, next && next.kind === 'lead' ? 'scroll' : 'nearest');
  }

  /* ------------------------------------------------------------- events */
  document.addEventListener('click', function (e) {
    var ack = e.target.closest && e.target.closest('.gd-ack');
    if (ack) {
      var hit = stepOf(ack); if (!hit) return;
      hit.s.acked = true;
      hit.s.el.classList.remove('gd-on');
      var arr = STEPS[hit.stage.id], n = hit.i + 1;
      setCurrent(hit.stage, n, null);
      var f = arr[n] && arr[n].kind === 'q' && field(arr[n].el);
      if (arr[n]) scrollTo(arr[n].el, 'center');
      if (f) { try { f.focus({ preventScroll: true }); } catch (x) { f.focus(); } }
      return;
    }
    if (e.target.closest && e.target.closest('.ll-go')) {          /* student.js restore */
      setTimeout(function () {
        Object.keys(STEPS).forEach(function (id) { STEPS[id].forEach(function (s) { if (s.kind === 'lead') s.acked = false; }); });
        var a = document.querySelector('.stage.active:not(.done)');
        if (a) open(a, 'scroll');
      }, 900);
    }
  });

  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!t.dataset || t.dataset.q === undefined) return;
    var hit = stepOf(t); if (!hit || hit.s.kind !== 'q') return;
    var arr = STEPS[hit.stage.id];
    var g = governingLead(arr, hit.i);
    if (g && (!nudged || !nudged.has(g.el))) {
      /* soft nudge: they jumped past the directions — say so once */
      if (nudged) nudged.add(g.el);
      setCurrent(hit.stage, arr.indexOf(g), null);
      var flag = g.el.querySelector('.gd-flag');
      if (flag) { flag.classList.remove('gd-shake'); void flag.offsetWidth; flag.classList.add('gd-shake'); }
      scrollTo(g.el, 'start');
      return;
    }
    if (cur !== hit.s) setCurrent(hit.stage, hit.i, null);
  });

  /* a dropdown counts the moment something is picked */
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.tagName !== 'SELECT' || !t.dataset || t.dataset.q === undefined || !t.value) return;
    var hit = stepOf(t); if (hit && hit.s === cur) advanceFrom(hit.stage, hit.i);
  });

  /* typed answers count when the student leaves the box with something in it */
  document.addEventListener('focusout', function (e) {
    var t = e.target;
    if (t.tagName === 'SELECT' || !t.dataset || t.dataset.q === undefined) return;
    if (!String(t.value).trim()) return;
    var hit = stepOf(t); if (!hit || hit.s !== cur) return;
    var to = e.relatedTarget;
    if (to && hit.s.el.contains(to)) return;             /* still inside this question (keys, stems) */
    /* let a click on another question land first; it may set its own current */
    setTimeout(function () { if (cur === hit.s) advanceFrom(hit.stage, hit.i); }, 0);
  });

  /* ------------------------------------------------- the stage lifecycle */
  var mo = new MutationObserver(function (list) {
    list.forEach(function (m) {
      var st = m.target;
      if (!st.classList || !st.classList.contains('stage')) return;
      var was = (m.oldValue || '').split(/\s+/);
      var nowActive = st.classList.contains('active') && !st.classList.contains('done');
      if (nowActive && was.indexOf('active') === -1) {
        /* lesson.js lands the part first; wait for its scroll to settle */
        setTimeout(function () { open(st, 'scroll'); }, 950);
      }
      if (st.classList.contains('done')) { clearMarks(st); if (curStage === st) { cur = null; placePill(); } }
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.stage[data-part]'), function (st) {
    segment(st);
    mo.observe(st, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  });

  /* ------------------------------------------------------- jump pill */
  var pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'gd-pill';
  document.body.appendChild(pill);
  pill.addEventListener('click', function () {
    if (!cur) return;
    scrollTo(cur.el, cur.kind === 'lead' ? 'start' : 'center');
    if (cur.kind === 'lead') setTimeout(function () { arrive(cur.el); }, REDUCE ? 0 : 450);
    if (cur.kind === 'q') {
      var f = field(cur.el);
      if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (x) {} }, REDUCE ? 0 : 450);
    }
  });

  /* What can the student see? A single full-height sentinel is not enough:
     mid-page, its visible FRACTION stays constant while scrolling, so the
     observer never fires. A stack of 100px strips changes every few pixels. */
  var band = null;                      /* {top, bottom} of what the student can see, document coords */
  var strips = document.createElement('div');
  strips.className = 'gd-sentinel';
  document.body.appendChild(strips);
  var seen = new Map(), io = null, STRIP = 100;
  function recompute() {
    var top = Infinity, bot = -Infinity;
    seen.forEach(function (r) { if (r.top < top) top = r.top; if (r.bottom > bot) bot = r.bottom; });
    band = isFinite(top) ? { top: top, bottom: bot } : null;
    placePill();
  }
  function buildStrips() {
    var H = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    var n = Math.ceil(H / STRIP);
    if (strips.childElementCount === n) return;
    if (io) io.disconnect();
    seen.clear();
    strips.innerHTML = '';
    strips.style.height = H + 'px';
    if (!('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) seen.set(e.target, {
          top: e.intersectionRect.top + window.scrollY, bottom: e.intersectionRect.bottom + window.scrollY });
        else seen.delete(e.target);
      });
      recompute();
    }, { threshold: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1] });
    for (var k = 0; k < n; k++) {
      var d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:0;width:1px;top:' + (k * STRIP) + 'px;height:' + STRIP + 'px';
      strips.appendChild(d); io.observe(d);
    }
  }
  buildStrips();
  if (window.ResizeObserver) new ResizeObserver(function () { buildStrips(); }).observe(document.body);

  /* standalone (not in an iframe) the window scrolls, and that is exact */
  window.addEventListener('scroll', function () {
    if (window.self === window.top) {
      band = { top: window.scrollY, bottom: window.scrollY + window.innerHeight };
      placePill();
    }
  }, { passive: true });

  function placePill() {
    if (!cur || !band || !curStage || !curStage.classList.contains('active')) { pill.classList.remove('show'); return; }
    var r = docRect(cur.el);
    var margin = 40;
    var visible = r.bottom > band.top + margin && r.top < band.bottom - margin;
    if (visible) { pill.classList.remove('show'); return; }
    var below = r.top >= band.bottom - margin;
    var what = cur.kind === 'lead' ? 'the directions' : (cur.kind === 'end' ? 'the Next button' : 'current question');
    pill.textContent = 'Jump to ' + what + ' ' + (below ? '👇' : '👆');
    pill.classList.toggle('gd-alert', cur.kind === 'lead');
    var h = 48;
    pill.style.top = (below ? band.bottom - h - 70 : band.top + 70) + 'px';
    pill.classList.add('show');
  }

  /* The first part is already open when this file runs. Mark it, then make
     sure its directions are actually on screen: the Canvas page around the
     iframe may be scrolled anywhere. Only scroll if they are not in view. */
  var start = document.querySelector('.stage.active:not(.done)');
  if (start) setTimeout(function () {
    open(start, null);
    setTimeout(function () {
      if (!cur || cur.kind === 'end') return;
      var r = docRect(cur.el);
      var inView = band && r.top >= band.top && r.top <= band.bottom - 160;
      if (!inView) { scrollTo(cur.el, 'start'); if (cur.kind === 'lead') setTimeout(function () { arrive(cur.el); }, 500); }
    }, 500);
  }, 50);

  window.LLGuide = { refresh: function () { var a = document.querySelector('.stage.active:not(.done)'); if (a) open(a, 'scroll'); } };
})();
