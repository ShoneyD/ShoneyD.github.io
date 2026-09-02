/* ===========================================================================
   LESSON PAGE ENGINE — shared by every hosted lesson page.

   The page itself declares only its own facts, in an inline <script> that runs
   BEFORE this file:

     LESSON, LESSON_ID, OUTCOMES, PARTS, REWARDS   required
     AGENDA                                        optional (renders if present)
     KEYS                                          optional click-to-insert banks

   Everything below is machinery and is identical on every page. Fix a bug here
   once and every lesson gets the fix. Do not copy this file into a page.

   KEYS looks like:
     const KEYS = [
       { host: 'keys-i1', chars: [...], field: 'input.kor[data-q]' },
       { host: 'keys-m2', chars: [...], field: 'textarea[data-q]'  }
     ];
   =========================================================================== */

/* ---- which part are we showing? ---- */
const wanted = new URLSearchParams(location.search).get('part');
const ACTIVE = PARTS[wanted] ? wanted : null;      /* null = show everything */
const ALL_STAGES = [...document.querySelectorAll('.stage[data-part]')].map(s => s.id);
const ORDER = ALL_STAGES.filter(id =>
  !ACTIVE || document.getElementById(id).dataset.part === ACTIVE);

const ACTIVITY_TITLE = ACTIVE
  ? LESSON + ' — ' + PARTS[ACTIVE].title
  : LESSON + ' — all parts';

const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function applyScope(){
  document.querySelectorAll('.stage[data-part]').forEach(s => {
    s.hidden = !ORDER.includes(s.id);
  });
  document.querySelectorAll('[data-partsep]').forEach(p => {
    /* the section heading only earns its place when several parts are shown */
    p.hidden = !!ACTIVE;
  });
  if (ACTIVE){
    document.getElementById('pagetitle').textContent = LESSON + ' — ' + PARTS[ACTIVE].title;
    document.getElementById('pagesub').textContent = PARTS[ACTIVE].sub;
    document.getElementById('turninLede').textContent =
      'One button. It collects this section — ready to paste into your ' + PARTS[ACTIVE].title + ' assignment.';
  }

  /* Outcomes and the lesson ID are teacher information. Preview only. */
  const preview = !ACTIVE;
  const idEl  = document.getElementById('lessonid');
  const outEl = document.getElementById('outcomes');
  if (idEl)  idEl.hidden  = !preview;
  if (outEl) outEl.hidden = !preview;
  if (preview){
    if (idEl) idEl.textContent = LESSON_ID;
    const list = document.getElementById('outcomelist');
    if (list) list.innerHTML = Object.keys(OUTCOMES).map(k =>
      '<li><span class="oid">' + LESSON_ID + '.' + k + '</span> — ' + OUTCOMES[k] + '</li>').join('');
  }

  renderAgenda();

  const sheet = document.getElementById('sheet');
  if (sheet) sheet.hidden = ACTIVE ? !PARTS[ACTIVE].sheet : false;
  /* first stage of the scoped set opens straight away */
  if (ORDER.length) document.getElementById(ORDER[0]).classList.add('active');
}

/* The agenda renders in every part. The current row is bold AND says
   "you're here" in words — weight alone disappears in a screen reader and
   is easy to skim past. Silently does nothing on a page with no agenda. */
function renderAgenda(){
  const host = document.getElementById('agendalist');
  if (!host || typeof AGENDA === 'undefined') return;
  host.innerHTML = AGENDA.map(row => {
    const here = ACTIVE && row.part === ACTIVE;
    return '<li class="' + (here ? 'here' : '') + '">' + esc(row.label) +
           ' <span class="mins">— ' + row.mins + ' min</span>' +
           (here ? ' <span class="you">← you’re here</span>' : '') + '</li>';
  }).join('');
}

/* ================= engine ================= */
const LL = {
  extra: {}, summary: {}, done: new Set(),

  finish(id, extraEvidence){
    const stage = document.getElementById(id);
    if (extraEvidence) LL.extra[id] = extraEvidence;
    const firstTime = !LL.done.has(id);
    LL.done.add(id);
    stage.classList.remove('active', 'open');
    stage.classList.add('done');
    LL.refreshSummary(id);
    if (firstTime){ LL.award(id); LL.next(); }
  },

  collect(id){
    const stage = document.getElementById(id);
    const lines = [];
    if (LL.extra[id]) lines.push(LL.extra[id]);
    stage.querySelectorAll('[data-q]').forEach(el => {
      const a = el.value.trim();
      lines.push(el.dataset.q + '\n' + (a || '(not answered)'));
    });
    return lines;
  },

  refreshSummary(id){
    const sum = document.getElementById('sum-' + id);
    if (!sum) return;
    const fields = [...document.getElementById(id).querySelectorAll('[data-q]')];
    const blanks = fields.filter(el => !el.value.trim()).length;
    if (blanks) sum.textContent = blanks + ' left blank — tap to finish';
    else if (LL.summary[id]) sum.textContent = LL.summary[id];
    else if (fields.length) sum.textContent = fields.length + (fields.length === 1 ? ' answer saved' : ' answers saved');
    else sum.textContent = 'tap to see it again';
  },

  award(id){
    const r = REWARDS[id]; if (!r) return;
    /* the last stage of the scoped set always points at the finish */
    const msg = (ORDER[ORDER.length - 1] === id) ? 'All done — go turn it in.' : r.msg;
    const bar = document.getElementById('earned');
    [...bar.querySelectorAll('.msg')].forEach(m => m.remove());
    const s = document.createElement('span');
    s.className = 'star'; s.textContent = r.star; s.title = msg; bar.appendChild(s);
    const m = document.createElement('span');
    m.className = 'msg'; m.textContent = msg; bar.appendChild(m);
  },

  next(){
    const nextId = ORDER.find(x => !LL.done.has(x));
    const t = document.getElementById(nextId || 'turnin');
    t.classList.add('active');
    setTimeout(() => t.scrollIntoView({behavior:'smooth', block:'center'}), 120);
  },

  toggle(id){ document.getElementById(id).classList.toggle('open'); }
};

document.addEventListener('input', e => {
  if (e.target.dataset && e.target.dataset.q !== undefined){
    const st = e.target.closest('.stage');
    if (st && LL.done.has(st.id)) LL.refreshSummary(st.id);
  }
});

/* ---------------- evidence assembly ---------------- */
function buildPlain(){
  const parts = ORDER.filter(id => LL.done.has(id)).map(id =>
    '── ' + document.getElementById(id).dataset.title.toUpperCase() + ' ──\n' +
    LL.collect(id).join('\n\n'));
  return ACTIVITY_TITLE + '\n' + '='.repeat(ACTIVITY_TITLE.length) + '\n' +
         'Completed ' + LL.done.size + ' of ' + ORDER.length + ' parts.\n\n' +
         parts.join('\n\n') + '\n';
}
function buildHtml(){
  const parts = ORDER.filter(id => LL.done.has(id)).map(id => {
    const body = LL.collect(id).map(block => {
      const [q, ...rest] = block.split('\n'); const a = rest.join('\n');
      return a ? '<p style="margin:0 0 0.25rem;"><strong>'+esc(q)+'</strong></p>' +
                 '<p style="margin:0 0 1rem;padding-left:1rem;border-left:3px solid #b9c4cc;">'+
                 esc(a).replace(/\n/g,'<br>')+'</p>'
               : '<p style="margin:0 0 1rem;">'+esc(q).replace(/\n/g,'<br>')+'</p>';
    }).join('');
    return '<h4 style="margin:1rem 0 0.5rem;color:#2f6f8f;">'+
           esc(document.getElementById(id).dataset.title)+'</h4>'+body;
  });
  return '<h3 style="margin:0 0 0.25rem;">'+esc(ACTIVITY_TITLE)+'</h3>'+
         '<p style="margin:0 0 1rem;color:#555a63;font-size:0.95rem;">Completed '+
         LL.done.size+' of '+ORDER.length+' parts.</p>'+parts.join('');
}
function copyFeedback(kind, head, body){
  const box = document.getElementById('copyFb');
  box.className = 'fb show ' + kind;
  box.innerHTML = '<span class="fb-head">' + head + '</span>' + body;
}

document.getElementById('copyAll').addEventListener('click', async () => {
  const plain = buildPlain();
  document.getElementById('previewText').value = plain;
  const blanks = ORDER.reduce((n,id) =>
    n + (LL.done.has(id) ? LL.collect(id).filter(b => b.includes('(not answered)')).length : 0), 0);

  let ok = false;
  try{
    if(navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([buildHtml()],{type:'text/html'}),
        'text/plain':new Blob([plain],{type:'text/plain'})
      })]); ok = true;
    } else if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(plain); ok = true;
    }
  }catch(e){ ok = false; }
  if(!ok){
    try{
      const ta = document.getElementById('previewText');
      document.getElementById('preview').classList.add('show');
      ta.focus(); ta.select(); ok = document.execCommand('copy');
    }catch(e){ ok = false; }
  }

  if(ok){
    copyFeedback('good','✓ Copied.',
      'Go to your Canvas assignment and click <strong>Text Submission</strong>, then click in the box and paste (Ctrl+V). Then Submit.' +
      (blanks ? '<br><br><strong>Heads up:</strong> '+blanks+' question'+(blanks>1?'s were':' was')+' left blank.' : ''));
  } else {
    document.getElementById('preview').classList.add('show');
    copyFeedback('hint','Copy it by hand — takes two seconds.',
      'Your work is in the box below. Click in it, press <strong>Ctrl+A</strong> to select all, then <strong>Ctrl+C</strong> to copy.');
  }
});
document.getElementById('showPrev').addEventListener('click', () => {
  document.getElementById('previewText').value = buildPlain();
  document.getElementById('preview').classList.toggle('show');
});

/* ---------- letter keys: an input method for a machine with no Korean
   keyboard. Inserts at the caret of the last focused answer field, so it
   behaves like typing rather than like a chart to copy from.

   SINGLE JAMO ARE COMPOSED, not pasted. Clicking ㅇ then ㅔ has to produce 에,
   not ㅇㅔ — a bank that leaves the jamo uncombined is not an input method, it
   is a wall of characters that makes the student's answer look wrong. The
   composer below is a minimal Hangul IME: it looks at the character before the
   caret and rewrites it, exactly as a real keyboard does.

   A bank entry longer than one character (a word or a whole phrase) is inserted
   verbatim with a trailing space and never composed.

   Backspace deletes the whole composed block rather than stepping back through
   its jamo. That is the one place this differs from a real IME, and it is fine:
   retyping a two-letter block is cheaper than the code to undo one.
   Pages with no KEYS get nothing and cost nothing. ---------- */
let lastField = null;
document.addEventListener('focusin', e => {
  if (e.target.dataset && e.target.dataset.q !== undefined) lastField = e.target;
});
function fieldInScope(f){
  const st = f.closest('.stage');
  return st && !st.hidden;
}

/* ---------- Hangul composition ---------- */
const HG_I = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const HG_M = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const HG_F = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
/* two vowels that fuse into one, and two final consonants that stack */
const HG_MM = {'ㅗㅏ':'ㅘ','ㅗㅐ':'ㅙ','ㅗㅣ':'ㅚ','ㅜㅓ':'ㅝ','ㅜㅔ':'ㅞ','ㅜㅣ':'ㅟ','ㅡㅣ':'ㅢ'};
const HG_FF = {'ㄱㅅ':'ㄳ','ㄴㅈ':'ㄵ','ㄴㅎ':'ㄶ','ㄹㄱ':'ㄺ','ㄹㅁ':'ㄻ','ㄹㅂ':'ㄼ',
               'ㄹㅅ':'ㄽ','ㄹㅌ':'ㄾ','ㄹㅍ':'ㄿ','ㄹㅎ':'ㅀ','ㅂㅅ':'ㅄ'};
const HG_FSPLIT = Object.fromEntries(Object.entries(HG_FF).map(([k,v]) => [v,[k[0],k[1]]]));
/* A bank entry is a LETTER only if it is a lone jamo. 네 is one character but it
   is a finished syllable, so it pastes like a word rather than composing. */
function hgIsJamo(ch){
  return ch.length === 1 && (HG_I.includes(ch) || HG_M.includes(ch) || HG_F.includes(ch));
}

function hgSyl(ch){                                  /* 가 → {i,m,f}, else null */
  const c = ch ? ch.charCodeAt(0) : 0;
  if (c < 0xAC00 || c > 0xD7A3) return null;
  const n = c - 0xAC00;
  return { i: HG_I[Math.floor(n / 588)], m: HG_M[Math.floor((n % 588) / 28)], f: HG_F[n % 28] };
}
function hgMake(i, m, f){
  return String.fromCharCode(0xAC00 + (HG_I.indexOf(i) * 21 + HG_M.indexOf(m)) * 28 + HG_F.indexOf(f || ''));
}
/* Returns [charsToDeleteBeforeCaret, textToInsert]. */
function hgCompose(prev, ch){
  const isV = HG_M.includes(ch), isC = HG_I.includes(ch) || HG_F.includes(ch);
  if (!isV && !isC) return [0, ch];
  const syl = hgSyl(prev);

  if (isC){
    if (syl){
      if (!syl.f && HG_F.includes(ch))        return [1, hgMake(syl.i, syl.m, ch)];
      if (syl.f && HG_FF[syl.f + ch])         return [1, hgMake(syl.i, syl.m, HG_FF[syl.f + ch])];
    }
    return [0, ch];
  }

  /* a vowel */
  if (syl){
    if (!syl.f){
      const fused = HG_MM[syl.m + ch];
      if (fused)                              return [1, hgMake(syl.i, fused, '')];
      return [0, ch];
    }
    /* the final consonant slides forward and starts the next block: 각 + ㅏ → 가가 */
    const split = HG_FSPLIT[syl.f];
    const keep  = split ? split[0] : '';
    const moved = split ? split[1] : syl.f;
    if (!HG_I.includes(moved))                return [0, ch];
    return [1, hgMake(syl.i, syl.m, keep) + hgMake(moved, ch, '')];
  }
  if (HG_I.includes(prev))                    return [1, hgMake(prev, ch, '')];
  if (HG_M.includes(prev) && HG_MM[prev + ch]) return [1, HG_MM[prev + ch]];
  return [0, ch];
}

function buildKeys(hostId, chars, fallbackSelector){
  const host = document.getElementById(hostId);
  if (!host) return;
  chars.forEach(ch => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = ch;
    if (!hgIsJamo(ch)) b.classList.add('wide');
    b.setAttribute('aria-label', 'Insert ' + ch);
    b.addEventListener('click', () => {
      const inStage = host.closest('.stage');
      const f = (lastField && fieldInScope(lastField) && lastField.closest('.stage') === inStage)
              ? lastField
              : inStage.querySelector(fallbackSelector);
      if (!f) return;
      let a = f.selectionStart ?? f.value.length;
      const z = f.selectionEnd ?? f.value.length;
      let ins = ch, back = 0;
      if (hgIsJamo(ch)){
        [back, ins] = hgCompose(a > 0 && a === z ? f.value[a - 1] : '', ch);
      } else {
        ins = ch + ' ';                       /* a word or phrase, pasted whole */
      }
      a -= back;
      f.value = f.value.slice(0, a) + ins + f.value.slice(z);
      f.focus();
      f.setSelectionRange(a + ins.length, a + ins.length);
      f.dispatchEvent(new Event('input', { bubbles: true }));
      lastField = f;
    });
    host.appendChild(b);
  });
}

if (typeof KEYS !== 'undefined'){
  KEYS.forEach(k => buildKeys(k.host, k.chars, k.field || 'textarea[data-q], input[data-q]'));
}

applyScope();

/* ---------- light / dark ----------
   Lives in assets/theme.js now, so that non-lesson pages can use it too.
   Every hosted lesson page loads theme.js before this file. ---------- */

