/* ===========================================================================
   student.js — two behaviours layered over the LL engine. Linked by every
   hosted lesson page AND every activity, and loaded LAST, after the engine
   (the shared lesson.js, or an activity's own inline copy).

     1. SAVE / RESTORE — a student who closes the tab gets their answers and
        their finished parts back AUTOMATICALLY, and lands on the part they
        were on. (Until 18 Nov 2026 this was an offer bar; typing before
        clicking it saved the empty page over the old work, and inside a
        Canvas iframe the bar was usually off screen. That is how Joy's
        Korean 1A final lost its answers.) A visible line says whether this
        browser is saving at all.
     2. CELEBRATION    — finishing a part shows a card where the student is
        actually looking, which then flies up and docks as the star in
        #earned. The old top-bar star sat above the instructions, in the
        region students never read.

   It touches no page markup: it injects its own CSS and WRAPS LL.finish and
   LL.award rather than replacing them. Every storage call is wrapped — a
   browser that blocks storage loses the save quietly and everything else on
   the page still works.
   =========================================================================== */
(function () {
  'use strict';

  if (typeof LL === 'undefined' || !LL || !LL.done) return;   /* no engine here */

  var REDUCED = !!(window.matchMedia &&
                   window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var STAGES  = (typeof ORDER !== 'undefined' && ORDER && ORDER.length) ? ORDER : [];
  if (!STAGES.length) return;

  /* ------------------------------------------------ storage, defensively */
  var PART    = new URLSearchParams(location.search).get('part') || '';
  var KEY     = 'll:' + location.pathname + ':' + PART;
  var MAX_AGE = 45 * 24 * 60 * 60 * 1000;          /* 45 days */

  var S = (function () {
    try {
      var s = window.localStorage;
      s.setItem('__llprobe', '1'); s.removeItem('__llprobe');
      return s;
    } catch (e) { return null; }                   /* blocked: feature is simply off */
  })();

  function read()   { if (!S) return null;
                      try { return JSON.parse(S.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function write(o) { if (!S) return;
                      try { S.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
  function drop()   { if (!S) return;
                      try { S.removeItem(KEY); } catch (e) {} }
  /* one level of undo: the last save before a restore or a Start over */
  var BAK = KEY + ':bak';
  function backup(o){ if (!S || !o) return;
                      try { S.setItem(BAK, JSON.stringify(o)); } catch (e) {} }

  /* ------------------------------------------------------ page identity
     Two guards, because activities SHUFFLE their content on every load, so
     question text is not stable there and cannot identify the page.

       FP (page level)  — the stage list and how many answer boxes each stage
                          holds. Changes when the lesson gains or loses a
                          question, which is when a whole save is worthless.
       per-field check  — each answer is stored next to its own question text
                          and only restored if that question is still in that
                          slot. A shuffled activity therefore restores the
                          student's PROGRESS without ever pasting an answer
                          underneath a different question. */
  function fields(id) {
    var st = document.getElementById(id);
    return st ? [].slice.call(st.querySelectorAll('[data-q]')) : [];
  }
  var FP = (function () {
    var s = STAGES.map(function (id) { return id + ':' + fields(id).length; }).join('|');
    var h = 5381, i;
    for (i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  })();

  /* ------------------------------------------------------------- saving */
  function snapshot() {
    var f = {};
    STAGES.forEach(function (id) {
      f[id] = fields(id).map(function (el) { return [el.dataset.q || '', el.value]; });
    });
    return { v: FP, t: Date.now(), f: f,
             d: STAGES.filter(function (id) { return LL.done.has(id); }),
             x: LL.extra || {}, s: LL.summary || {} };
  }
  function worthKeeping(o) {
    if (o.d && o.d.length) return true;
    for (var k in o.f) {
      for (var i = 0; i < o.f[k].length; i++) {
        if (o.f[k][i] && String(o.f[k][i][1]).trim()) return true;
      }
    }
    return false;
  }
  /* Never drops on its own: an empty page is never written over a real save.
     Only "Start over" clears a save, and it backs it up first. */
  var timer = null;
  function saveNow() {
    clearTimeout(timer); timer = null;
    var snap = snapshot();
    if (worthKeeping(snap)) { write(snap); stamp(snap.t); }
  }
  function save() {
    clearTimeout(timer);
    timer = setTimeout(saveNow, 400);
  }
  function onEdit(e) {
    if (e.target && e.target.dataset && e.target.dataset.q !== undefined) save();
  }
  document.addEventListener('input', onEdit);
  document.addEventListener('change', onEdit);
  /* closing the tab inside the 400ms debounce used to lose the last words */
  window.addEventListener('pagehide', function () { if (timer) saveNow(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && timer) saveNow();
  });

  /* ----------------------------------------------------- save status line
     One line at the top of every part on screen and in the turn-in panel.
     A browser that blocks storage (private window, some school setups, some
     browsers inside a Canvas iframe) gets a warning instead of silence. */
  function clock(t) {
    var d = new Date(t), h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2);
    return ((h % 12) || 12) + ':' + m + (h >= 12 ? 'pm' : 'am');
  }
  function stamp(t) {
    var els = document.querySelectorAll('.ll-save');
    for (var i = 0; i < els.length; i++) {
      if (!S) {
        els[i].className = 'll-save ll-save-off';
        els[i].textContent = '⚠ This browser is not saving your work. Before you close it, press Copy and turn in what you have.';
      } else {
        els[i].className = 'll-save';
        els[i].textContent = t ? '💾 Saved on this computer · ' + clock(t)
                               : '💾 Your answers save on this computer as you type.';
      }
    }
  }
  function addStatusLines() {
    var hosts = STAGES.map(function (id) { return document.getElementById(id); });
    hosts.push(document.getElementById('turnin'));
    hosts.forEach(function (h) {
      if (!h || h.querySelector(':scope > .ll-save')) return;
      var p = document.createElement('p');
      p.className = 'll-save'; p.setAttribute('role', 'status');
      h.insertBefore(p, h.firstChild);
    });
  }

  /* ----------------------------------------------------------- restoring */
  var origAward  = LL.award.bind(LL);
  var origFinish = LL.finish.bind(LL);
  var origNext   = LL.next.bind(LL);

  /* LL.finish() calls award() and then next(), and next() scrolls 120ms later
     — which drags the viewport away from the celebration while it is still
     animating in. Hold the advance until the card has finished, then let it
     run. The student reads the card, THEN the page moves. */
  var celebrating = false, pendingNext = false;
  LL.next = function () {
    if (celebrating) { pendingNext = true; return; }
    origNext();
  };
  function releaseNext() {
    celebrating = false;
    if (pendingNext) { pendingNext = false; origNext(); }
  }

  /* Where was the student looking when they finished? Measured BEFORE the
     engine collapses the part: once it collapses, everything they were reading
     shrinks to a one-line bar far above them, and a card placed over that bar
     lands off screen. Viewport-relative, so it survives the page shrinking. */
  var lookAt = null;
  function eyeLine(id) {
    var st = document.getElementById(id);
    var el = document.activeElement;
    if (!el || !st || !st.contains(el) || el === document.body)
      el = st ? [].slice.call(st.querySelectorAll('button.go')).pop() : null;
    if (!el) return null;
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    if (r.bottom < 0 || r.top > vh) return null;    /* not on screen: no use */
    return r.top + r.height / 2;
  }
  LL.finish = function (id, extraEvidence) {
    lookAt = eyeLine(id);
    origFinish(id, extraEvidence);
    lookAt = null;
    save();
  };

  function silentComplete(id) {
    var st = document.getElementById(id);
    if (!st) return;
    LL.done.add(id);
    st.classList.remove('active', 'open');
    st.classList.add('done');
    if (LL.refreshSummary) LL.refreshSummary(id);
    origAward(id);                                  /* dock the star, no fanfare */
  }

  function restore(saved) {
    /* First by slot (cheap, exact); if the question in that slot changed
       (shuffled activity, or the lesson was edited since), by question text
       anywhere on the page. An answer is never pasted under a question it
       was not written for. */
    var pool = {}, skipped = 0, used = {};
    Object.keys(saved.f || {}).forEach(function (id) {
      (saved.f[id] || []).forEach(function (pair, i) {
        if (!pair || !pair[0] || !String(pair[1]).trim()) return;
        (pool[pair[0]] = pool[pair[0]] || []).push(id + '#' + i);
      });
    });
    function take(q) {
      var list = pool[q] || [];
      for (var k = 0; k < list.length; k++) if (!used[list[k]]) { used[list[k]] = 1; return list[k]; }
      return null;
    }
    STAGES.forEach(function (id) {
      var vals = (saved.f && saved.f[id]) || [];
      fields(id).forEach(function (el, i) {
        var q = el.dataset.q || '', pair = vals[i];
        if (pair && pair[0] === q && !used[id + '#' + i]) {
          used[id + '#' + i] = 1; el.value = pair[1]; return;
        }
        var ref = take(q);
        if (ref) {
          var bits = ref.split('#');
          el.value = saved.f[bits[0]][+bits[1]][1];
        } else if (pair && String(pair[1]).trim()) skipped++;
      });
    });
    if (skipped) console.info('[student.js] ' + skipped +
      ' answer(s) not restored: their question is no longer on the page.');
    LL.extra   = saved.x || {};
    LL.summary = saved.s || {};
    STAGES.forEach(function (id) {
      if (saved.d && saved.d.indexOf(id) !== -1) silentComplete(id);
    });
    celebrating = false; pendingNext = false;
    origNext();                                     /* lands them on the part they were on */
    try { document.dispatchEvent(new CustomEvent('ll:restored')); } catch (e) {}
  }

  function whenWord(t) {
    var d = new Date(t), now = new Date();
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2);
    var ap = h >= 12 ? 'pm' : 'am'; h = (h % 12) || 12;
    var when = (d.toDateString() === now.toDateString()) ? 'earlier today' : 'on ' + days[d.getDay()];
    return when + ' at ' + h + ':' + m + ap;
  }

  function restoredNotice(saved) {
    var n = (saved.d || []).length;
    var bar = document.createElement('div');
    bar.className = 'll-restore';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<span class="ll-restore-t"></span>' +
      '<button type="button" class="ll-btn ll-fresh">Start over</button>';
    bar.querySelector('.ll-restore-t').textContent =
      '✓ Your work from ' + whenWord(saved.t) + ' is back' +
      (n ? ' — ' + n + (n === 1 ? ' part' : ' parts') + ' already finished.' : '.');
    var host = document.querySelector('.stage.active:not(.done)') || document.body;
    host.insertBefore(bar, host === document.body ? host.firstChild : host.querySelector('.ll-save') ? host.querySelector('.ll-save').nextSibling : host.firstChild);
    var fresh = bar.querySelector('.ll-fresh'), armed = false;
    fresh.addEventListener('click', function () {
      if (!armed) {                                  /* two taps, no browser dialog */
        armed = true;
        fresh.textContent = 'Yes, clear my answers';
        bar.querySelector('.ll-restore-t').textContent =
          'Start over? Your answers will be cleared. (A backup is kept on this computer.)';
        return;
      }
      backup(read()); drop(); submitted = true; location.reload();
    });
  }

  /* -------------------------------------- the "are you sure" on tab close */
  var submitted = false;
  function hasText() {
    var els = document.querySelectorAll('[data-q]');
    for (var i = 0; i < els.length; i++) if (els[i].value.trim()) return true;
    return false;
  }
  window.addEventListener('beforeunload', function (e) {
    if (submitted || (!hasText() && !LL.done.size)) return;
    e.preventDefault();
    e.returnValue = '';
  });
  var copyBtn = document.getElementById('copyAll');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    setTimeout(function () { submitted = true; }, 0);   /* copied: stop nagging */
  });

  /* --------------------------------------------------------- celebration */
  LL.award = function (id) {
    var r = (typeof REWARDS !== 'undefined') ? REWARDS[id] : null;
    if (!r) return;
    var msg = (STAGES[STAGES.length - 1] === id) ? 'All done — go turn it in.' : r.msg;
    celebrate(r.star, msg, id, function () { origAward(id); });
  };

  function celebrate(star, msg, stageId, dock) {
    var card = document.createElement('div');
    card.className = 'll-cel';
    card.setAttribute('aria-hidden', 'true');       /* #earned is the aria-live region */
    card.innerHTML = '<span class="ll-cel-star"></span><span class="ll-cel-msg"></span>';
    card.querySelector('.ll-cel-star').textContent = star;
    card.querySelector('.ll-cel-msg').textContent  = msg;
    document.body.appendChild(card);

    /* Placed over the part they just finished, in document coordinates.
       position:fixed would centre on the IFRAME's viewport, which inside a
       Canvas page can be scrolled off screen entirely. */
    var st = document.getElementById(stageId);
    var r  = st ? st.getBoundingClientRect()
                : { left: 0, top: 0, width: document.documentElement.clientWidth, height: 240 };
    var cw = card.offsetWidth, ch = card.offsetHeight;
    var x  = window.scrollX + r.left + r.width / 2 - cw / 2;
    var y;
    if (lookAt !== null) {
      /* just ABOVE the button they pressed — the button was on screen, so
         the space above it is too, even when an iframe is taller than the
         screen. Only if there's no room above does it go just below. */
      var vy = lookAt - ch - 28;
      if (vy < 8) vy = lookAt + 28;
      y = window.scrollY + vy;
    } else {
      y = window.scrollY + r.top + Math.min(r.height / 2, 170) - ch / 2;
    }
    card.style.left = Math.max(8, x) + 'px';
    card.style.top  = Math.max(8, y) + 'px';

    celebrating = true;
    requestAnimationFrame(function () { card.classList.add('in'); });

    setTimeout(function () {
      var bar = document.getElementById('earned');
      if (REDUCED || !bar) {
        card.classList.add('out');
      } else {
        var br = bar.getBoundingClientRect();
        var dx = (window.scrollX + br.left + 14) - (parseFloat(card.style.left) + cw / 2);
        var dy = (window.scrollY + br.top + br.height / 2) - (parseFloat(card.style.top) + ch / 2);
        card.classList.add('fly');
        card.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.18)';
        card.style.opacity   = '0';
      }
      setTimeout(function () {
        dock();                                     /* the star appears in #earned */
        if (card.parentNode) card.parentNode.removeChild(card);
        releaseNext();                              /* now the page may move */
      }, REDUCED ? 420 : 560);
    }, REDUCED ? 1900 : 1600);
  }

  /* ---------------------------------------------------------------- CSS
     Injected rather than added to lesson.css, because activities are
     self-contained and carry no shared stylesheet. Tokens where they exist,
     fallbacks where they don't. */
  var css = document.createElement('style');
  css.textContent = [
    '.ll-restore{position:relative;z-index:60;display:flex;flex-wrap:wrap;gap:.6rem;',
      'align-items:center;padding:.7rem 1rem;margin:0 0 1rem;border-radius:10px;',
      'border:1px solid var(--warn-line,#6b5124);background:var(--warn-soft,#38290f);',
      'color:var(--ink,#f3f5f8);font-size:.95rem;font-family:inherit}',
    '.ll-restore-t{flex:1 1 15rem;font-weight:600}',
    '.ll-save{margin:0 0 .6rem;font-size:.85rem;color:var(--soft,#c5cdd8)}',
    '.ll-save-off{font-weight:700;font-size:.95rem;padding:.55rem .8rem;border-radius:8px;',
      'border:1px solid var(--warn-line,#6b5124);background:var(--warn-soft,#38290f);',
      'color:var(--ink,#f3f5f8)}',
    '.ll-btn{font:inherit;font-weight:700;cursor:pointer;border-radius:8px;padding:.45rem .9rem;',
      'border:1px solid var(--accent-line,#2b5a72);background:var(--accent,#6fbde3);',
      'color:var(--on-accent,#0f1216)}',
    '.ll-btn.ll-fresh{background:transparent;color:var(--soft,#c5cdd8);',
      'border-color:var(--line,#2e343d)}',
    '.ll-cel{position:absolute;z-index:80;pointer-events:none;display:flex;',
      'flex-direction:column;align-items:center;gap:.45rem;padding:1.15rem 1.7rem;',
      'border-radius:16px;background:var(--card,#1d2128);border:2px solid var(--gold,#f2c75c);',
      'box-shadow:0 14px 38px rgba(0,0,0,.45);opacity:0;transform:scale(.4);',
      'transition:opacity .3s ease,transform .42s cubic-bezier(.2,1.5,.4,1)}',
    '.ll-cel.in{opacity:1;transform:scale(1)}',
    '.ll-cel.fly{transition:opacity .5s ease,transform .55s cubic-bezier(.5,0,.75,.4)}',
    '.ll-cel.out{opacity:0;transition:opacity .36s ease}',
    '.ll-cel-star{font-size:2.7rem;line-height:1;color:var(--gold,#f2c75c)}',
    '.ll-cel-msg{font-size:1.05rem;font-weight:800;line-height:1.3;text-align:center;',
      'max-width:17rem;color:var(--gold,#f2c75c)}',
    '@media (prefers-reduced-motion:reduce){',
      '.ll-cel{transition:opacity .3s ease}.ll-cel.in{transform:none}}'
  ].join('');
  document.head.appendChild(css);

  /* ------------------------------------------------------------ on load */
  addStatusLines();
  var saved = read();
  if (saved && (Date.now() - saved.t) > MAX_AGE) { backup(saved); drop(); saved = null; }
  if (saved && worthKeeping(saved)) {
    /* An edited lesson (saved.v !== FP) no longer throws the save away:
       restore() matches answers to questions by their text. */
    backup(saved);
    restore(saved);
    restoredNotice(saved);
    stamp(saved.t);
  } else stamp(null);
})();
