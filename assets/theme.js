/* ===========================================================================
   LIGHT / DARK TOGGLE — shared by every hosted page that links lesson.css.

   Dark is the default. A student who reads better on a light page flips it
   here and the choice sticks in their browser. The button builds itself, so
   no page carries markup for it.

   Split out of lesson.js on 2026-09-01 so that pages which are NOT lessons —
   resources, reference sheets — can have the toggle without pulling in the
   lesson engine, which requires PARTS and friends and throws without them.
   Lesson pages load this file and then lesson.js. Do not copy it into a page.
   =========================================================================== */
(function(){
  const KEY = 'll-theme', root = document.documentElement;
  const isLight = () => root.getAttribute('data-theme') === 'light';
  try { if (localStorage.getItem(KEY) === 'light') root.setAttribute('data-theme','light'); }
  catch(e){}
  const build = () => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'themetog';
    const paint = () => {
      b.textContent = isLight() ? '☾' : '☀';
      b.title = b.ariaLabel = isLight() ? 'Switch to the dark page' : 'Switch to the light page';
    };
    b.addEventListener('click', () => {
      const light = isLight();
      if (light) root.removeAttribute('data-theme'); else root.setAttribute('data-theme','light');
      try { localStorage.setItem(KEY, light ? 'dark' : 'light'); } catch(e){}
      paint();
    });
    paint();
    document.body.appendChild(b);
  };
  if (document.body) build();
  else document.addEventListener('DOMContentLoaded', build);
})();
