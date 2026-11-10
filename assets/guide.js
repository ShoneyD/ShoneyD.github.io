/* ===========================================================================
   guide.js — "read the directions first" for hosted lesson pages.

   Loaded AFTER lesson.js and BEFORE student.js on pages rendered with the
   guide on (the default; `guide: false` in a lesson source turns it off).
   Pages that never link this file are untouched.

   Per part (stage):
     1. The stage body is split at runtime into STEPS: a run of directions
        (prose, figures, lists) is a LEAD; a question with its stems, answer
        box, keys and self-check is a Q. Nodes are only wrapped, never changed,
        so student.js's save fingerprint is unaffected.
     2. ARRIVING at directions: the red box pulses and a light sweeps round it
        twice, then stops. Only after that do the first few words get their
        "start reading here" highlight. A "Read this first" flag and an
        "I read it" button stay until the button is pressed.
     3. The CURRENT QUESTION gets a "You're here" tag above it on the left, a
        big 👉 in the margin (bobbing gently when the question isn't centred on
        screen), and its Q-number and bold words highlighted. It moves on when
        a typed answer loses focus or a dropdown is picked.
     4. SOFT NUDGE: starting a question while its directions are unread shakes
        the flag and scrolls back once. Nothing is ever locked.
     5. JUMP PILL: if the current step is off screen, a pill at the edge of what
        the student can see takes them back.
     6. PUZZLE beside each Next button: one piece per question, a piece added
        for each answer. The last piece clicks in with a glow when the student
        reaches the bottom with everything done; missing slots glow yellow if
        not. Pressing Next with pieces missing asks "Are you sure?".
     7. If the page scrolls past the general "How this works" box to reach the
        first directions, a "How does this work? 👆" tip links back to it.

   Inside a Canvas iframe the page is as tall as its content, so Canvas
   scrolls, not the iframe, and position:fixed would pin to the iframe. The
   visible band is measured with IntersectionObservers on 100px strips (they
   report against the top-level viewport, cross-origin included) and floating
   things are placed in document coordinates inside that band.

   Theme colours are tokens with fallbacks, as in student.js. The puzzle
   landscapes are artwork, so their palettes are literal colours.
   Honours prefers-reduced-motion throughout.
   =========================================================================== */
(function () {
  'use strict';
  if (typeof LL === 'undefined' || !LL) return;
  if (typeof GUIDE !== 'undefined' && GUIDE === false) return;

  var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MEMBER = '.stems, .abox, details.check, .keys';     /* belongs to the question above it */
  var TAIL   = '.done-look, .row';                        /* end of the steps */
  var ARRIVE_MS = REDUCE ? 0 : 2800;                      /* two pulses / two sweeps */
  var WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
  function word(n) { return WORDS[n] || String(n); }

  /* ------------------------------------------------------------------ CSS */
  var A = 'var(--alert,#ff6b6b)', OA = 'var(--on-alert,#1a0d0d)', AC = 'var(--accent,#6fbde3)',
      OAC = 'var(--on-accent,#0f1216)', W = 'var(--warn,#e8a94e)', HL = 'var(--hl,#4a3d12)',
      G = 'var(--gold,#f2c75c)';
  var css = [
    /* steps: constant padding, so moving the highlight never shifts the layout */
    '.gd-lead,.gd-q{position:relative;border-radius:14px;margin:.35rem -.8rem;scroll-margin-top:5rem;padding:1rem .8rem .55rem;transition:box-shadow .25s ease}',
    '.gd-lead{margin-top:1.1rem}',
    '.stage-body>.gd-lead:first-child{margin-top:2.4rem}',          /* clear of the previous part's bar */
    '.stage{scroll-margin-top:2.8rem}',
    '.gd-lead.gd-on{box-shadow:0 0 0 3px ' + A + '}',
    '.gd-lead.gd-on.gd-arrive{animation:gd-pulse 1.4s ease-in-out 2}',
    '@keyframes gd-pulse{0%,100%{box-shadow:0 0 0 3px ' + A + '}50%{box-shadow:0 0 0 7px ' + A + '}}',
    '@property --gd-ang{syntax:"<angle>";inherits:false;initial-value:0deg}',
    '.gd-lead::before{content:"";position:absolute;inset:-6px;border-radius:18px;padding:4px;pointer-events:none;opacity:0;' +
      'background:conic-gradient(from var(--gd-ang),transparent 0 62%,' + A + ' 78%,' + OA + ' 86%,' + A + ' 92%,transparent 100%);filter:blur(3px);' +
      '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;' +
      'mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}',
    '.gd-lead.gd-on.gd-arrive::before{animation:gd-sweep 1.4s linear 2}',
    '@keyframes gd-sweep{0%{--gd-ang:0deg;opacity:0}10%{opacity:.9}90%{opacity:.9}100%{--gd-ang:360deg;opacity:0}}',
    '.gd-flag{position:absolute;top:-1.05rem;right:1rem;z-index:5;display:none;align-items:center;gap:.4rem;background:' + A + ';color:' + OA +
      ';border-radius:999px;padding:.3rem .85rem;font-weight:700;font-size:.9rem;box-shadow:0 4px 14px rgba(0,0,0,.35);white-space:nowrap}',
    '.gd-lead.gd-on>.gd-flag{display:flex}',
    /* the arrow bounces only while the box is arriving (same 2.8s), then rests */
    '.gd-arrow{display:inline-block;font-size:1.05rem}',
    '.gd-lead.gd-arrive .gd-arrow{animation:gd-bob .7s ease-in-out 4}',
    '@keyframes gd-bob{0%,100%{transform:translateY(-2px)}50%{transform:translateY(4px)}}',
    '.gd-flag.gd-shake{animation:gd-shake .5s ease 2}',
    '@keyframes gd-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}',
    '.gd-ackrow{display:none;margin:.75rem 0 .2rem}',
    '.gd-lead.gd-on .gd-ackrow{display:block}',
    '.gd-ack{font:inherit;font-weight:700;cursor:pointer;border:0;border-radius:10px;padding:.6rem 1.1rem;background:' + A + ';color:' + OA + '}',
    /* start reading here — only after the arrival animation has finished */
    '.gd-start{border-radius:4px;padding:0 .15em;margin:0 -.15em;box-decoration-break:clone;-webkit-box-decoration-break:clone}',
    '.gd-lead.gd-on.gd-read .gd-start{background:linear-gradient(' + HL + ',' + HL + ') no-repeat 0 0/100% 100%;animation:gd-wipe .7s ease-out both,gd-glint .6s ease-in-out .75s 2}',
    '@keyframes gd-wipe{from{background-size:0 100%}to{background-size:100% 100%}}',
    '@keyframes gd-glint{0%,100%{box-shadow:0 0 0 0 ' + W + '}50%{box-shadow:0 0 0 3px ' + W + '}}',
    /* "How does this work?" */
    '.gd-howto{position:absolute;top:-1.05rem;left:1rem;z-index:5;display:none;cursor:pointer;font:inherit;font-size:.85rem;font-weight:700;' +
      'border:1px solid ' + AC + ';background:var(--card,#1d2128);color:' + AC + ';border-radius:999px;padding:.2rem .75rem}',
    '.gd-lead.gd-showhow>.gd-howto{display:block}',
    '.gd-flash{animation:gd-flash 1s ease-in-out 2}',
    '@keyframes gd-flash{0%,100%{box-shadow:0 0 0 0 ' + AC + '}50%{box-shadow:0 0 0 5px ' + AC + '}}',
    /* the current question */
    '.gd-q.gd-cur{box-shadow:0 0 0 3px ' + AC + '}',
    '.gd-tag{position:absolute;top:-.95rem;left:1rem;display:none;background:' + AC + ';color:' + OAC +
      ';border-radius:999px;padding:.15rem .75rem;font-weight:700;font-size:.82rem}',
    '.gd-q.gd-cur>.gd-tag{display:block}',
    '.gd-hand{position:absolute;left:-3.4rem;top:.85rem;font-size:2rem;line-height:1;display:none;pointer-events:none}',
    /* the hand bounces three times when it arrives, when she jumps back to it,
       or when she scrolls back past it; otherwise it rests */
    '.gd-hand-i{display:inline-block}',
    '.gd-q.gd-wave .gd-hand-i{animation:gd-poke .8s ease-in-out 3}',
    '@keyframes gd-poke{0%,100%{transform:none}50%{transform:translate(6px,-2px)}}',      /* starts and ends at rest: no jump */
    '.gd-q.gd-cur>.gd-hand{display:block}',

    '@media (max-width:54rem){.gd-q{padding-left:3.3rem}.gd-hand{left:.2rem;font-size:1.7rem}}',
    '.gd-q.gd-cur p.q strong{background:' + HL + ';border-radius:4px;padding:0 .12em;animation:gd-glint .6s ease-in-out 2}',
    /* Next row + puzzle */
    '.row.gd-row{display:flex;align-items:center;gap:1rem 1.25rem;flex-wrap:wrap}',
    '.row.gd-ready .btn.go{box-shadow:0 0 0 3px var(--calm,#5ecb92)}',
    '.gd-puz{display:flex;flex-direction:column;align-items:center;gap:.25rem}',
    '.gd-frame{width:16rem;max-width:100%;padding:5px;border-radius:10px;background:var(--card,#1d2128);' +
      'border:3px solid var(--soft,#c5cdd8);box-shadow:inset 0 0 0 2px var(--line,#2e343d),0 4px 14px rgba(0,0,0,.3)}',
    '.gd-frame svg{display:block;width:100%;height:auto;border-radius:4px;overflow:visible}',
    '.gd-slot{fill:var(--field,#232830);stroke:var(--field-line,#414a56);stroke-width:1;stroke-dasharray:3 3}',
    '.gd-slot.gd-miss{animation:gd-miss 1.1s ease-in-out 2}',
    '@keyframes gd-miss{0%,100%{fill:var(--field,#232830)}50%{fill:' + W + ';stroke:' + W + '}}',
    '.gd-pc{opacity:0;transform-box:fill-box;transform-origin:center}',
    '.gd-pc.gd-in{opacity:1}',
    '.gd-pc.gd-pop{animation:gd-pop .8s ease-out both}',
    '@keyframes gd-pop{from{opacity:.4;transform:scale(1.08)}to{opacity:1;transform:scale(1)}}',
    '.gd-pc.gd-final{animation:gd-final 1.6s cubic-bezier(.4,0,.2,1) both}',
    '@keyframes gd-final{0%{opacity:0;transform:translate(30px,-40px) rotate(6deg)}80%{opacity:1;transform:translate(0,0) rotate(0) scale(1.03)}100%{opacity:1;transform:none}}',
    '.gd-pc.gd-click{animation:gd-click .7s ease-out both}',
    '@keyframes gd-click{0%{transform:scale(1)}40%{transform:scale(1.06)}100%{transform:scale(1)}}',
    '.gd-edge{fill:none;stroke:rgba(255,255,255,.4);stroke-width:.8}',
    '.gd-fly{position:absolute;z-index:70;pointer-events:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.45))}',
    '.gd-frame.gd-win{animation:gd-win 1.8s ease-in-out 2;border-color:' + G + '}',
    '@keyframes gd-win{0%,100%{box-shadow:inset 0 0 0 2px var(--line,#2e343d),0 0 0 0 ' + G + '}50%{box-shadow:inset 0 0 0 2px var(--line,#2e343d),0 0 22px 6px ' + G + '}}',
    '.gd-cap{font-size:.8rem;font-weight:700;color:var(--soft,#c5cdd8)}',
    '.gd-confirm{flex-basis:100%;display:none;border:2px solid ' + W + ';background:var(--warn-soft,#38290f);border-radius:12px;padding:.75rem 1rem}',
    '.gd-confirm.show{display:block}',
    '.gd-confirm p{margin:0 0 .6rem;font-weight:700}',
    '.gd-confirm button{font:inherit;font-weight:700;cursor:pointer;border-radius:10px;padding:.5rem 1rem;margin-right:.5rem;border:2px solid ' + W + '}',
    '.gd-keep{background:' + W + ';color:var(--on-accent,#0f1216)}',
    '.gd-anyway{background:transparent;color:var(--ink,#f3f5f8)}',
    /* jump pill */
    '.gd-pill{position:absolute;left:50%;transform:translateX(-50%);z-index:60;display:none;cursor:pointer;border:0;border-radius:999px;padding:.6rem 1.15rem;' +
      'font:inherit;font-weight:700;background:' + AC + ';color:' + OAC + ';box-shadow:0 6px 18px rgba(0,0,0,.4)}',
    '.gd-pill.gd-alert{background:' + A + ';color:' + OA + '}',
    '.gd-pill.show{display:block}',
    '.gd-ack:focus-visible,.gd-pill:focus-visible,.gd-howto:focus-visible,.gd-confirm button:focus-visible{outline:3px solid var(--ink,#f3f5f8);outline-offset:2px}',
    '.gd-sentinel{position:absolute;top:0;left:0;width:1px;pointer-events:none;visibility:hidden}',
    '@media (prefers-reduced-motion: reduce){.gd-lead.gd-on.gd-arrive,.gd-lead.gd-on.gd-arrive::before,.gd-arrow,.gd-flag.gd-shake,' +
      '.gd-lead.gd-on.gd-read .gd-start,.gd-q.gd-wave .gd-hand-i,.gd-q.gd-cur p.q strong,.gd-slot.gd-miss,.gd-pc.gd-pop,.gd-pc.gd-final,.gd-pc.gd-click,' +
      '.gd-frame.gd-win,.gd-flash{animation:none}}'
  ].join('');
  var tag = document.createElement('style');
  tag.textContent = css;
  document.head.appendChild(tag);

  /* ---------------------------------------------------------- utilities */
  function field(q)   { return q.querySelector('textarea[data-q], input[data-q], select[data-q]'); }
  function filledEl(f){ return !!(f && String(f.value).trim()); }
  function filled(q)  { return filledEl(field(q)); }
  var anchor = null, glideId = 0;
  function nativeScroll(el, block, how) {
    try { el.scrollIntoView({ behavior: how, block: block || 'center' }); }
    catch (e) { el.scrollIntoView(); }
  }
  function scrollTo(el, block) {
    /* The glide needs to know where the middle of the screen is. That is only
       certain when the page fills the screen (Canvas header and footer both out
       of view); otherwise let the browser do its own smooth scroll. */
    var docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    var fills = band && (window.self === window.top || (band.top > 2 && band.bottom < docH - 2));
    if (REDUCE || !fills) { nativeScroll(el, block, REDUCE ? 'auto' : 'smooth'); return; }
    var r = el.getBoundingClientRect();
    var top = r.top + window.scrollY, bottom = r.bottom + window.scrollY;
    var bh = band.bottom - band.top, from = (band.top + band.bottom) / 2;
    var to = block === 'start' ? top - 80 + bh / 2
           : block === 'nearest' ? (top < band.top + 60 ? top - 80 + bh / 2 : bottom > band.bottom - 60 ? bottom + 60 - bh / 2 : from)
           : (top + bottom) / 2;
    if (Math.abs(to - from) < 4) return;
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.setAttribute('aria-hidden', 'true');
      anchor.style.cssText = 'position:absolute;left:0;width:1px;height:1px;pointer-events:none;visibility:hidden';
      document.body.appendChild(anchor);
    }
    var dur = Math.min(1300, 720 + Math.abs(to - from) * .45), t0 = null, id = ++glideId;
    var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    function step(ts) {
      if (id !== glideId) return;                        /* a newer scroll took over */
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      anchor.style.top = Math.round(from + (to - from) * ease(k)) + 'px';
      anchor.scrollIntoView({ behavior: 'instant', block: 'center' });
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function docRect(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
  }
  function restart(el, cls) { el.classList.remove(cls); void el.getBoundingClientRect(); el.classList.add(cls); }

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

  /* Wrap the first five words of the directions. Range.extractContents splits
     any <strong>/<em> it cuts through, so the markup stays valid. */
  function markStart(L) {
    var p = L.querySelector('p, li');
    if (!p) return;
    var walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), node, words = 0, endNode = null, endOff = 0, done = false;
    while (!done && (node = walker.nextNode())) {
      var re = /\S+/g, m;
      while ((m = re.exec(node.data))) {
        words++;
        endNode = node; endOff = m.index + m[0].length;
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

  /* Arrival: two pulses and two sweeps, THEN the first words light up. */
  function arrive(el) {
    if (!el || !el.classList.contains('gd-lead')) return;
    clearTimeout(el._gdT);
    el.classList.remove('gd-read');
    restart(el, 'gd-arrive');
    el._gdT = setTimeout(function () {
      el.classList.remove('gd-arrive');
      restart(el, 'gd-read');
    }, ARRIVE_MS);
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
        if (first) {
          var how = document.createElement('button');
          how.type = 'button'; how.className = 'gd-howto';
          how.textContent = '❓ How does this work? 👆';
          L.insertBefore(how, L.firstChild);
        }
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
      t.textContent = 'You’re here';
      var hand = document.createElement('span');
      hand.className = 'gd-hand'; hand.setAttribute('aria-hidden', 'true');
      hand.innerHTML = '<span class="gd-hand-i">👉</span>';
      Q.insertBefore(hand, Q.firstChild);
      Q.insertBefore(t, Q.firstChild);
      steps.push({ kind: 'q', el: Q });
    });

    buildPuzzle(stage);
    return (STEPS[stage.id] = steps);
  }

  /* ================================================================ PUZZLE
     One landscape per part, cut into as many jigsaw pieces as the part has
     answer boxes. Piece i belongs to answer box i. */
  var PALETTES = [
    { sky: ['#ff8f5a', '#ffd7a1'], sun: '#fff1c1', far: '#a172b8', near: '#6c4a92', snow: '#f6dbe8',
      hill1: '#4d8f5f', hill2: '#2f6b4a', lake: ['#ffb27f', '#c07aa8'], tree: '#1f4a33', bird: '#4a2f5a' },
    { sky: ['#5fb6ee', '#d6f0ff'], sun: '#fff59a', far: '#86a6d3', near: '#58799f', snow: '#ffffff',
      hill1: '#7cc77c', hill2: '#4b9e57', lake: ['#8fd3f2', '#4e9cc8'], tree: '#2e6b3c', bird: '#2d4a66' },
    { sky: ['#0b1d3a', '#2f4a7d'], sun: '#f3efcf', far: '#34466d', near: '#1f2c4f', snow: '#cfd9ee',
      hill1: '#21523f', hill2: '#163a2d', lake: ['#24406c', '#0f2240'], tree: '#0d261c', bird: '#a8b8d8', night: true }
  ];

  /* A lesson can supply its own pictures (`puzzle:` in the lesson source →
     const PUZZLE = [{src, alt}, ...]), e.g. Korean dishes for a food unit or a
     Gothic ruin for Gothic literature. Parts take them in turn. Without it,
     the painted landscapes below are used. */
  var PICS = (typeof PUZZLE !== 'undefined' && PUZZLE && PUZZLE.length) ? PUZZLE.map(function (p) {
    return typeof p === 'string' ? { src: p, alt: '' } : p;
  }) : null;

  function photo(id, pic) {
    return '<defs><g id="' + id + '-scene"><rect width="300" height="200" fill="var(--field,#232830)"/>' +
      '<image href="' + pic.src.replace(/"/g, '&quot;') + '" width="300" height="200" preserveAspectRatio="xMidYMid slice"/></g></defs>';
  }

  function scene(id, pal) {
    var Wd = 300, H = 200, s = [];
    s.push('<linearGradient id="' + id + '-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + pal.sky[0] + '"/><stop offset="1" stop-color="' + pal.sky[1] + '"/></linearGradient>');
    s.push('<linearGradient id="' + id + '-lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + pal.lake[0] + '"/><stop offset="1" stop-color="' + pal.lake[1] + '"/></linearGradient>');
    s.push('<radialGradient id="' + id + '-glow"><stop offset="0" stop-color="' + pal.sun + '" stop-opacity=".9"/><stop offset="1" stop-color="' + pal.sun + '" stop-opacity="0"/></radialGradient>');
    var g = ['<g id="' + id + '-scene">'];
    g.push('<rect width="' + Wd + '" height="' + H + '" fill="url(#' + id + '-sky)"/>');
    if (pal.night) {
      [[20,18],[48,40],[80,12],[120,30],[160,16],[205,38],[240,14],[275,30],[95,52],[180,50]].forEach(function (p) {
        g.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.1" fill="#fff" opacity=".85"/>');
      });
      g.push('<path d="M10 70 C70 20 130 60 190 25 S280 40 300 15" fill="none" stroke="#6ff0b4" stroke-width="7" opacity=".35"/>');
      g.push('<path d="M0 60 C60 30 140 70 200 35 S270 45 300 30" fill="none" stroke="#8be0ff" stroke-width="4" opacity=".3"/>');
    }
    g.push('<circle cx="222" cy="58" r="34" fill="url(#' + id + '-glow)"/>');
    g.push('<circle cx="222" cy="58" r="16" fill="' + pal.sun + '"/>');
    g.push('<path d="M0 120 L40 82 L70 104 L112 60 L150 98 L188 70 L230 106 L262 80 L300 104 L300 200 L0 200Z" fill="' + pal.far + '"/>');
    g.push('<path d="M0 140 L52 96 L90 128 L132 84 L176 126 L214 100 L258 134 L300 112 L300 200 L0 200Z" fill="' + pal.near + '"/>');
    g.push('<path d="M132 84 L121 96 L128 94 L134 99 L141 95 L146 97Z M52 96 L44 103 L50 102 L56 106 L61 101Z" fill="' + pal.snow + '"/>');
    g.push('<path d="M0 150 C50 130 100 140 150 148 S250 132 300 142 L300 200 L0 200Z" fill="' + pal.hill1 + '"/>');
    g.push('<rect y="160" width="' + Wd + '" height="40" fill="url(#' + id + '-lake)"/>');
    g.push('<g stroke="' + pal.sun + '" stroke-width="1.6" opacity=".55"><path d="M206 168 H238"/><path d="M212 175 H232"/><path d="M216 182 H228"/></g>');
    g.push('<path d="M0 172 C30 160 60 164 92 170 L92 200 L0 200Z" fill="' + pal.hill2 + '"/>');
    g.push('<path d="M300 168 C270 158 238 162 214 172 L214 200 L300 200Z" fill="' + pal.hill2 + '"/>');
    [[14,170],[28,166],[44,168],[60,165],[256,165],[272,163],[288,166]].forEach(function (t, i) {
      var h = 16 + (i % 3) * 5;
      g.push('<path d="M' + t[0] + ' ' + (t[1] - h) + ' L' + (t[0] - 6) + ' ' + t[1] + ' L' + (t[0] + 6) + ' ' + t[1] + 'Z" fill="' + pal.tree + '"/>');
    });
    g.push('<path d="M70 40 q5 -5 10 0 q5 -5 10 0 M100 52 q4 -4 8 0 q4 -4 8 0" fill="none" stroke="' + pal.bird + '" stroke-width="1.6"/>');
    g.push('</g>');
    return '<defs>' + s.join('') + g.join('') + '</defs>';
  }

  /* jigsaw geometry ---------------------------------------------------- */
  function rowsFor(n) {
    var r = Math.max(1, Math.round(Math.sqrt(n / 1.5)));
    var base = Math.floor(n / r), extra = n % r, out = [];
    for (var i = 0; i < r; i++) out.push(base + (i < extra ? 1 : 0));
    return out;
  }
  function knob(c, w, h, d, fwd, horiz, fixed) {
    /* one tab on an edge; `fixed` is the edge's constant coordinate */
    var P = function (along, off) { return horiz ? (along + ' ' + (fixed + off)) : ((fixed + off) + ' ' + along); };
    var a = fwd ? c - w / 2 : c + w / 2, b = fwd ? c + w / 2 : c - w / 2, s = fwd ? 1 : -1;
    return ' L' + P(a, 0) +
           ' C' + P(a, d * h * .2) + ' ' + P(c - s * w * .75, d * h) + ' ' + P(c, d * h) +
           ' C' + P(c + s * w * .75, d * h) + ' ' + P(b, d * h * .2) + ' ' + P(b, 0);
  }
  function edge(x1, x2, fixed, tabs, horiz) {
    var fwd = x2 > x1, lo = Math.min(x1, x2), hi = Math.max(x1, x2);
    var t = tabs.filter(function (k) { return k.c > lo && k.c < hi; })
                .sort(function (p, q) { return fwd ? p.c - q.c : q.c - p.c; });
    var out = '';
    t.forEach(function (k) { out += knob(k.c, k.w, k.h, k.d, fwd, horiz, fixed); });
    return out + ' L' + (horiz ? (x2 + ' ' + fixed) : (fixed + ' ' + x2));
  }
  function pieces(n) {
    var Wd = 300, H = 200, rows = rowsFor(n), R = rows.length, rh = H / R;
    var cuts = rows.map(function (k) { var xs = []; for (var j = 0; j <= k; j++) xs.push(Wd * j / k); return xs; });
    var vtabs = rows.map(function (k, r) {           /* one tab on each inner vertical cut */
      var out = []; for (var j = 1; j < k; j++) out.push([{ c: rh * r + rh / 2, w: rh * .34, h: Math.min(Wd / k, rh) * .2, d: (j + r) % 2 ? 1 : -1 }]);
      return out;
    });
    var htabs = [];                                   /* boundary below row r */
    for (var r = 0; r < R - 1; r++) {
      var all = cuts[r].concat(cuts[r + 1]).sort(function (a, b) { return a - b; });
      var tabs = [];
      for (var j = 0; j < rows[r]; j++) {
        var u0 = cuts[r][j], u1 = cuts[r][j + 1], best = null;
        for (var m = 0; m < all.length - 1; m++) {
          var a = Math.max(all[m], u0), b = Math.min(all[m + 1], u1);
          if (b - a > 0 && (!best || b - a > best[1] - best[0])) best = [a, b];
        }
        var w = Math.min(rh * .34, Wd / rows[r] * .3);
        if (best && best[1] - best[0] > w * 1.9) tabs.push({ c: (best[0] + best[1]) / 2, w: w, h: rh * .2, d: j % 2 ? -1 : 1 });
      }
      htabs.push(tabs);
    }
    var out = [];
    for (r = 0; r < R; r++) {
      var y0 = rh * r, y1 = rh * (r + 1);
      for (var c = 0; c < rows[r]; c++) {
        var a2 = cuts[r][c], b2 = cuts[r][c + 1];
        var d = 'M' + a2 + ' ' + y0;
        d += r > 0 ? edge(a2, b2, y0, htabs[r - 1], true) : ' L' + b2 + ' ' + y0;
        d += c < rows[r] - 1 ? edge(y0, y1, b2, vtabs[r][c], false) : ' L' + b2 + ' ' + y1;
        d += r < R - 1 ? edge(b2, a2, y1, htabs[r], true) : ' L' + a2 + ' ' + y1;
        d += c > 0 ? edge(y1, y0, a2, vtabs[r][c - 1], false) : ' L' + a2 + ' ' + y0;
        out.push(d + ' Z');
      }
    }
    return out;
  }

  var PUZ = {};                       /* stage id -> {el, frame, pcs, slots, fields, won, cap} */
  var stageIndex = 0;

  function buildPuzzle(stage) {
    var body = stage.querySelector('.stage-body');
    var row = body && body.querySelector(':scope > .row');
    var fields = Array.prototype.slice.call(stage.querySelectorAll('[data-q]'));
    if (!row || !fields.length || PUZ[stage.id]) return;
    var idx = stageIndex++;
    var id = 'gdp-' + stage.id, pal = PALETTES[idx % PALETTES.length], pic = PICS ? PICS[idx % PICS.length] : null;
    var paths = pieces(fields.length);
    var what = pic && pic.alt ? pic.alt.replace(/[<>"&]/g, '') : 'A landscape';
    var svg = '<svg viewBox="-12 -12 324 224" role="img" aria-label="' + what + ', as a puzzle with ' + word(fields.length) +
      ' pieces, one for each question in this part.">' + (pic ? photo(id, pic) : scene(id, pal)) +
      paths.map(function (d, i) { return '<clipPath id="' + id + '-c' + i + '"><path d="' + d + '"/></clipPath>'; }).join('') +
      paths.map(function (d) { return '<path class="gd-slot" d="' + d + '"/>'; }).join('') +
      paths.map(function (d, i) {
        return '<g class="gd-pc" data-i="' + i + '"><g clip-path="url(#' + id + '-c' + i + ')"><use href="#' + id + '-scene"/></g>' +
               '<path class="gd-edge" d="' + d + '"/></g>';
      }).join('') + '</svg>';
    var puz = document.createElement('div');
    puz.className = 'gd-puz';
    puz.innerHTML = '<div class="gd-frame">' + svg + '</div><span class="gd-cap"></span>';
    var conf = document.createElement('div');
    conf.className = 'gd-confirm';
    conf.setAttribute('role', 'alert');
    conf.innerHTML = '<p></p><button type="button" class="gd-keep">Keep working</button><button type="button" class="gd-anyway">Go on anyway →</button>';
    row.classList.add('gd-row');
    row.appendChild(puz);
    row.appendChild(conf);
    var P = PUZ[stage.id] = {
      el: puz, frame: puz.querySelector('.gd-frame'), cap: puz.querySelector('.gd-cap'), conf: conf,
      pcs: Array.prototype.slice.call(puz.querySelectorAll('.gd-pc')),
      slots: Array.prototype.slice.call(puz.querySelectorAll('.gd-slot')),
      fields: fields, won: false, last: -1, seen: false
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var was = P.seen; P.seen = e.isIntersecting && e.intersectionRatio >= .5;
          if (P.seen && !was) reachBottom(stage);
        });
      }, { threshold: [0, .5, 1] }).observe(P.frame);
    }
    syncPuzzle(stage, true);
  }

  function missing(P) { return P.fields.filter(function (f) { return !filledEl(f); }).length; }

  /* Show a piece for every answered box. The piece that completes the picture
     is held back until the puzzle is on screen, so its click-in is seen. */
  function syncPuzzle(stage, quiet) {
    var P = PUZ[stage.id]; if (!P) return;
    var miss = missing(P), total = P.fields.length, flying = false;
    P.fields.forEach(function (f, i) {
      var pc = P.pcs[i], on = filledEl(f);
      if (on && !pc.classList.contains('gd-in') && !pc._gdFly) {
        if (quiet) { pc.classList.add('gd-in'); return; }
        flying = true;
        if (miss === 0 && !P.won) {                      /* the last piece: held for the finale */
          P.last = i;
          flyPiece(stage, i, function (far) { if (P.seen) finale(stage, !far); });
          return;
        }
        flyPiece(stage, i, function () {
          if (!filledEl(P.fields[i])) return;            /* cleared while it flew */
          pc.classList.add('gd-in'); restart(pc, 'gd-pop');
        });
      }
      if (!on) { pc.classList.remove('gd-in', 'gd-pop', 'gd-final'); }
    });
    if (miss > 0) { P.won = false; P.frame.classList.remove('gd-win'); }
    if (quiet && miss === 0) P.won = true;
    P.cap.textContent = miss === 0 ? '🧩 Picture complete!' : '🧩 ' + word(total - miss) + ' of ' + word(total) + ' pieces';
    if (!flying && miss === 0 && !P.won && P.seen) finale(stage);
  }

  /* A finished answer sends its piece out of the answer box and down toward
     the puzzle. If the puzzle is far below, the piece heads down and fades,
     so the student still sees it leave. */
  function flyPiece(stage, i, then) {
    var P = PUZ[stage.id], pc = P.pcs[i], box = P.fields[i].closest('.abox') || P.fields[i];
    if (REDUCE || !document.body.animate || !P.slots[i].getBBox) { then(true); return; }
    var id = 'gdp-' + stage.id, d = P.slots[i].getAttribute('d'), bb = P.slots[i].getBBox();
    var pad = 8, vw = bb.width + pad * 2, vh = bb.height + pad * 2, W0 = 78, H0 = Math.round(W0 * vh / vw);
    var fly = document.createElement('div');
    fly.className = 'gd-fly';
    fly.innerHTML = '<svg viewBox="' + (bb.x - pad) + ' ' + (bb.y - pad) + ' ' + vw + ' ' + vh + '" width="' + W0 + '" height="' + H0 + '">' +
      '<g clip-path="url(#' + id + '-c' + i + ')"><use href="#' + id + '-scene"/></g><path class="gd-edge" d="' + d + '"/></svg>';
    var br = box.getBoundingClientRect();
    var x0 = br.right + window.scrollX - W0 - 18, y0 = br.top + window.scrollY + 8;
    fly.style.left = x0 + 'px'; fly.style.top = y0 + 'px';
    document.body.appendChild(fly);
    var sr = P.slots[i].getBoundingClientRect();
    var tx = sr.left + window.scrollX + sr.width / 2 - (x0 + W0 / 2);
    var ty = sr.top + window.scrollY + sr.height / 2 - (y0 + H0 / 2);
    var far = Math.abs(ty) > 650;
    var endScale = far ? .8 : Math.max(.3, (sr.width * vw / Math.max(bb.width, 1)) / W0);
    if (far) { tx = tx * .25; ty = 280; }
    pc._gdFly = true;
    /* unhurried: rise gently out of the box, pause, then glide to the slot */
    pc._gdFlyAnim = fly.animate([
      { transform: 'translate(0,6px) scale(.7)', opacity: 0, easing: 'ease-out' },
      { transform: 'translate(0,-26px) scale(1)', opacity: 1, offset: .22 },
      { transform: 'translate(0,-26px) scale(1)', opacity: 1, offset: .38, easing: 'cubic-bezier(.4,0,.2,1)' },
      { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(' + endScale + ')', opacity: far ? 0 : 1 }
    ], { duration: far ? 2000 : 2200 });
    pc._gdFlyAnim.onfinish = function () { fly.remove(); pc._gdFly = false; then(far); };
  }

  /* The picture stays incomplete until the last piece is actually in. If it
     flew all the way into its slot it just clicks home; if it faded on the
     way (puzzle far below), it glides in when the puzzle comes into view. */
  function finale(stage, landed) {
    var P = PUZ[stage.id]; if (!P || P.won) return;
    var i = P.last >= 0 ? P.last : P.pcs.length - 1;
    var pc = P.pcs[i];
    if (pc._gdFly) return;                               /* still in the air: its landing calls back */
    P.won = true;
    P.pcs.forEach(function (p, k) { if (k !== i) p.classList.add('gd-in'); });
    pc.classList.add('gd-in');
    restart(pc, landed ? 'gd-click' : 'gd-final');
    setTimeout(function () { restart(P.frame, 'gd-win'); }, REDUCE ? 0 : (landed ? 350 : 1300));
  }

  function glowMissing(P) {
    P.slots.forEach(function (s, i) { if (!filledEl(P.fields[i])) restart(s, 'gd-miss'); else s.classList.remove('gd-miss'); });
  }

  function reachBottom(stage) {
    var P = PUZ[stage.id]; if (!P || !stage.classList.contains('active')) return;
    if (missing(P) === 0) finale(stage); else glowMissing(P);
  }

  /* Next with pieces missing: pulse the gaps and ask. Capture phase, so the
     button's own onclick (LL.finish) never runs unless they choose to go on. */
  document.addEventListener('click', function (e) {
    var go = e.target.closest && e.target.closest('.row.gd-row .btn.go');
    if (!go) return;
    var stage = go.closest('.stage'), P = stage && PUZ[stage.id];
    if (!P || P.bypass) return;
    var n = missing(P);
    if (!n) return;
    e.stopPropagation(); e.preventDefault();
    glowMissing(P);
    P.conf.querySelector('p').textContent = 'Are you sure? There ' + (n === 1 ? 'is' : 'are') + ' still ' + word(n) +
      ' more question' + (n === 1 ? '' : 's') + ' to answer in this part.';
    P.conf.classList.add('show');
    P.conf.querySelector('.gd-keep').focus({ preventScroll: true });
  }, true);

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.gd-confirm button');
    if (!b) return;
    var stage = b.closest('.stage'), P = PUZ[stage.id], arr = STEPS[stage.id] || [];
    P.conf.classList.remove('show');
    if (b.classList.contains('gd-anyway')) { P.bypass = true; LL.finish(stage.id); P.bypass = false; return; }
    for (var i = 0; i < arr.length; i++) if (arr[i].kind === 'q' && !filled(arr[i].el)) {
      setCurrent(stage, i, 'scroll');
      var f = field(arr[i].el);
      if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (x) {} }, REDUCE ? 0 : 500);
      return;
    }
  });

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
  /* A lead counts as met once any question under it has an answer. Without
     this, directions the student plainly got past could flag up again. */
  function ackAnswered(stage) {
    var arr = STEPS[stage.id] || [], lead = null;
    arr.forEach(function (s) {
      if (s.kind === 'lead') lead = s;
      else if (lead && !lead.acked && filled(s.el)) lead.acked = true;
    });
  }

  function clearMarks(stage) {
    (STEPS[stage.id] || []).forEach(function (s) { s.el.classList.remove('gd-on', 'gd-cur', 'gd-off'); });
    var row = stage.querySelector('.stage-body > .row');
    if (row) row.classList.remove('gd-ready');
  }

  /* Put the finger level with the middle of the question's first line, so it
     points at "Q8." rather than at the box above it. */
  function aimHand(q) {
    var hand = q.querySelector('.gd-hand'), pq = q.querySelector('p.q');
    if (!hand || !pq) return;
    var lh = parseFloat(getComputedStyle(pq).lineHeight) || pq.getBoundingClientRect().height;
    var top = pq.getBoundingClientRect().top - q.getBoundingClientRect().top;
    hand.style.top = Math.round(top + (lh - hand.offsetHeight) / 2) + 'px';
  }

  function wave(q) {
    if (!q || !q.classList.contains('gd-q')) return;
    clearTimeout(q._gdW);
    restart(q, 'gd-wave');
    q._gdW = setTimeout(function () { q.classList.remove('gd-wave'); }, 2500);
  }

  function setCurrent(stage, i, how) {
    var arr = STEPS[stage.id]; if (!arr) return;
    var prev = cur;
    clearMarks(stage);
    curStage = stage;
    if (i >= arr.length) {                               /* every step done */
      cur = null;
      var row = stage.querySelector('.stage-body > .row');
      if (row) { row.classList.add('gd-ready'); cur = { kind: 'end', el: row }; if (how) scrollTo(row, 'center'); }
      placePill();
      return;
    }
    cur = arr[i];
    cur.el.classList.add(cur.kind === 'lead' ? 'gd-on' : 'gd-cur');
    if (cur.kind === 'q') { aimHand(cur.el); if (prev !== cur) wave(cur.el); }
    if (cur.kind === 'lead' && prev !== cur) arrive(cur.el);
    if (cur.kind === 'q') {
      var g = governingLead(arr, i);                   /* unread directions above keep their flag */
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
        var answeredAfter = false;   /* a lead with answered questions after it has been met */
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
    syncPuzzle(stage, true);
    /* lesson.js has already put the top of the part on screen; only scroll
       ourselves when the place to start is further down */
    setCurrent(stage, i, i === 0 ? null : how);
  }

  function pending(s) { return s.kind === 'q' ? !filled(s.el) : !s.acked; }
  function advanceFrom(stage, i) {
    var arr = STEPS[stage.id];
    ackAnswered(stage);
    var n = -1, k;
    for (k = i + 1; k < arr.length; k++) if (pending(arr[k])) { n = k; break; }
    if (n < 0) for (k = 0; k < i; k++) if (arr[k].kind === 'q' && !filled(arr[k].el)) { n = k; break; }   /* a skipped one */
    if (n < 0) n = arr.length;                               /* everything answered */
    setCurrent(stage, n, 'scroll');
  }

  /* ------------------------------------------------------------- events */
  document.addEventListener('click', function (e) {
    var ack = e.target.closest && e.target.closest('.gd-ack');
    if (ack) {
      var hit = stepOf(ack); if (!hit) return;
      hit.s.acked = true;
      hit.s.el.classList.remove('gd-on', 'gd-showhow');
      var arr = STEPS[hit.stage.id], n = hit.i + 1;
      setCurrent(hit.stage, n, null);
      var f = arr[n] && arr[n].kind === 'q' && field(arr[n].el);
      if (arr[n]) scrollTo(arr[n].el, 'center');
      if (f) { try { f.focus({ preventScroll: true }); } catch (x) { f.focus(); } }
      return;
    }
    var how = e.target.closest && e.target.closest('.gd-howto');
    if (how) {
      var steps = document.querySelector('.steps');
      how.closest('.gd-lead').classList.remove('gd-showhow');
      if (steps) { scrollTo(steps, 'center'); setTimeout(function () { restart(steps, 'gd-flash'); }, REDUCE ? 0 : 450); }
      return;
    }
    if (e.target.closest && e.target.closest('.ll-go')) {          /* student.js restore */
      setTimeout(function () {
        Object.keys(STEPS).forEach(function (id) { STEPS[id].forEach(function (s) { if (s.kind === 'lead') s.acked = false; }); });
        Object.keys(PUZ).forEach(function (id) { syncPuzzle(document.getElementById(id), true); });
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
    if (g && nudged && nudged.has(g.el)) { g.acked = true; g = null; }   /* nudged once already: let them go */
    if (g && (!nudged || !nudged.has(g.el))) {
      /* soft nudge: they jumped past the directions — say so once */
      if (nudged) nudged.add(g.el);
      setCurrent(hit.stage, arr.indexOf(g), null);
      var flag = g.el.querySelector('.gd-flag');
      if (flag) restart(flag, 'gd-shake');
      arrive(g.el);
      scrollTo(g.el, 'start');
      return;
    }
    if (cur !== hit.s) setCurrent(hit.stage, hit.i, null);
  });

  /* An answer marks its directions as met; then move on if this was the
     current step, or if the current step was those (now met) directions. */
  function answered(hit) {
    ackAnswered(hit.stage);
    if (cur === hit.s || (cur && cur.kind === 'lead' && cur.acked)) advanceFrom(hit.stage, hit.i);
  }

  /* a dropdown counts the moment something is picked */
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t.dataset || t.dataset.q === undefined) return;
    var hit = stepOf(t);
    if (hit) syncPuzzle(hit.stage);
    if (t.tagName !== 'SELECT' || !t.value || !hit) return;
    answered(hit);
  });

  /* typed answers count when the student leaves the box with something in it */
  document.addEventListener('focusout', function (e) {
    var t = e.target;
    if (t.tagName === 'SELECT' || !t.dataset || t.dataset.q === undefined) return;
    var hit = stepOf(t);
    if (hit) syncPuzzle(hit.stage);
    if (!String(t.value).trim() || !hit) return;
    var to = e.relatedTarget;
    if (to && hit.s.el.contains(to)) return;             /* still inside this question (keys, stems) */
    /* let a click on another question land first; it may set its own current */
    setTimeout(function () { answered(hit); }, 0);
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
      if (st.classList.contains('done')) {
        clearMarks(st);
        if (PUZ[st.id]) PUZ[st.id].conf.classList.remove('show');
        if (curStage === st) { cur = null; placePill(); }
      }
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('.stage[data-part]'), function (st) {
    if (st.hidden) stageIndex++;                          /* keep each part's landscape stable across ?part= views */
    else segment(st);
    mo.observe(st, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  });

  /* ---------------------------------------------- what can the student see? */
  var pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'gd-pill';
  document.body.appendChild(pill);
  /* Pressing the pill must not take focus: leaving a typed box counts as
     finishing it, which would move "current" on before the jump happens. */
  pill.addEventListener('mousedown', function (e) { e.preventDefault(); });
  pill.addEventListener('click', function () {
    if (!cur) return;
    scrollTo(cur.el, cur.kind === 'lead' ? 'start' : 'center');
    if (cur.kind === 'lead') setTimeout(function () { arrive(cur.el); }, REDUCE ? 0 : 450);
    if (cur.kind === 'q') {
      var f = field(cur.el), q = cur.el;
      setTimeout(function () { wave(q); }, REDUCE ? 0 : 900);
      if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (x) {} }, REDUCE ? 0 : 900);
    }
  });

  /* A single full-height sentinel is not enough: mid-page its visible FRACTION
     stays constant while scrolling, so the observer never fires. A stack of
     100px strips changes every few pixels. */
  var band = null;                      /* {top, bottom}, document coords */
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
  window.addEventListener('scroll', function () {        /* standalone, the window scrolls: exact */
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
    if (cur.kind === 'q') {
      if (visible && cur._gdGone) wave(cur.el);
      cur._gdGone = !visible;
    }
    if (visible) { pill.classList.remove('show'); return; }
    var below = r.top >= band.bottom - margin;
    var what = cur.kind === 'lead' ? 'the directions' : (cur.kind === 'end' ? 'the Next button' : 'current question');
    pill.textContent = 'Jump to ' + what + ' ' + (below ? '👇' : '👆');
    pill.classList.toggle('gd-alert', cur.kind === 'lead');
    pill.style.top = (below ? band.bottom - 48 - 70 : band.top + 70) + 'px';
    pill.classList.add('show');
  }

  /* The first part is already open when this file runs. Mark it, then make
     sure its directions are on screen: the Canvas page around the iframe may
     be scrolled anywhere. If that scroll skipped the general "How this works"
     box, offer the way back to it. */
  var start = document.querySelector('.stage.active:not(.done)');
  if (start) setTimeout(function () {
    open(start, null);
    setTimeout(function () {
      if (!cur || cur.kind === 'end') return;
      var r = docRect(cur.el);
      var inView = band && r.top >= band.top && r.top <= band.bottom - 160;
      if (!inView) { scrollTo(cur.el, 'start'); if (cur.kind === 'lead') setTimeout(function () { arrive(cur.el); }, 500); }
      setTimeout(function () {
        var steps = document.querySelector('.steps');
        if (!steps || !band || !cur || cur.kind !== 'lead') return;
        if (docRect(steps).bottom < band.top + 20) cur.el.classList.add('gd-showhow');
      }, REDUCE ? 50 : 900);
    }, 500);
  }, 50);

  window.LLGuide = { refresh: function () { var a = document.querySelector('.stage.active:not(.done)'); if (a) open(a, 'scroll'); } };
})();
