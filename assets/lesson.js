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
   behaves like typing rather than like a chart to copy from. Backspace works
   normally. Pages with no KEYS get nothing and cost nothing. ---------- */
let lastField = null;
document.addEventListener('focusin', e => {
  if (e.target.dataset && e.target.dataset.q !== undefined) lastField = e.target;
});
function fieldInScope(f){
  const st = f.closest('.stage');
  return st && !st.hidden;
}
function buildKeys(hostId, chars, fallbackSelector){
  const host = document.getElementById(hostId);
  if (!host) return;
  chars.forEach(ch => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = ch;
    b.setAttribute('aria-label', 'Insert ' + ch);
    b.addEventListener('click', () => {
      const inStage = host.closest('.stage');
      const f = (lastField && fieldInScope(lastField) && lastField.closest('.stage') === inStage)
              ? lastField
              : inStage.querySelector(fallbackSelector);
      if (!f) return;
      const a = f.selectionStart ?? f.value.length, z = f.selectionEnd ?? f.value.length;
      f.value = f.value.slice(0, a) + ch + f.value.slice(z);
      f.focus();
      f.setSelectionRange(a + ch.length, a + ch.length);
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
