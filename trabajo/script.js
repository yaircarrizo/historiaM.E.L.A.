/* =========================================================================
   script.js  -  lógica de la presentación
   Este archivo necesita, en la misma carpeta, a mapa.js y datos.js
   ========================================================================= */
(function () {
  'use strict';

  /* =====================================================================
     CONFIGURACIÓN DEL GRUPO: completá tus datos acá (solo texto entre comillas)
     Después guardá el archivo y recargá la página con F5.
     ===================================================================== */
  var GRUPO = {
    integrantes: ["Leonel Alderete", "Yair Carrizo", "Gabriel Delgado"],   // ej.: ["Yair", "Nombre 2", "Nombre 3"]
    curso: "5° 1°",                   // ej.: "5° 2ª"
    materia: "Historia"
  };
  /* ===================== fin de la configuración ===================== */

  var D = window.DATOS, M = window.MAPA;
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SMOOTH = reduce ? 'auto' : 'smooth';
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  var bar = $('#bar'), hudEl = $('#hud'), notesEl = $('#notes'), nb = $('#nb');
  var steps = [], stepScene = [], scenes = [];
  var idx = -1, curScene = 0, study = false, auto = false, autoSec = 7, tm = null, t0 = null, hudTimer = null;
  var toolsJustClosed = false;

  /* ---------- mapas ---------- */
  function buildMap(svg) {
    svg.setAttribute('viewBox', '0 0 ' + M.w + ' ' + M.h);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Mapa de América Latina');
    var g = document.createElementNS(NS, 'g');
    Object.keys(M.paths).forEach(function (c) {
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', M.paths[c]); p.setAttribute('data-c', c); g.appendChild(p);
    });
    svg.appendChild(g);
    var hl = (svg.getAttribute('data-hl') || '').split(',').filter(Boolean);
    hl.forEach(function (c) {
      if (c === 'ALL') $$('path', svg).forEach(function (p) { p.classList.add('lit'); });
      else { var p = $('path[data-c="' + c + '"]', svg); if (p) p.classList.add('lit'); }
    });
    if (svg.hasAttribute('data-all')) $$('path', svg).forEach(function (p) { p.classList.add('lit'); });
    var keys = svg.classList.contains('driven') ? Object.keys(M.cities) : (svg.getAttribute('data-cities') || '').split(',').filter(Boolean);
    keys.forEach(function (k, i) {
      var xy = M.cities[k]; if (!xy) return;
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', xy[0]); c.setAttribute('cy', xy[1]); c.setAttribute('r', 4.6);
      c.setAttribute('class', 'city'); c.setAttribute('data-k', k);
      svg.appendChild(c);
    });
  }
  $$('svg.map, svg.mini').forEach(buildMap);

  /* ---------- portada ---------- */
  (function () {
    var n = GRUPO.integrantes.filter(Boolean), el = $('#cvNames');
    el.innerHTML = '<b>' + esc(GRUPO.materia) + '</b>' +
      (n.length ? 'Integrantes: ' + esc(n.join(' · ')) : 'Integrantes: ______________________________') +
      '<br>' + (GRUPO.curso ? 'Curso: ' + esc(GRUPO.curso) : 'Curso: ______________');
  })();

  /* ---------- multimedia opcional (aparece solo si el archivo existe) ----------
     En index.html cada bloque de imagen/audio/video tiene data-src="carpeta/nombre" SIN extensión.
     Acá se prueban las extensiones de abajo, en ese orden. Si no existe ninguna, esa parte se saltea. */
  var EXT = { img: ['jpg', 'jpeg', 'png', 'webp'], video: ['mp4', 'webm'], audio: ['mp3', 'm4a', 'ogg', 'wav'] };
  var EXT_TXT = { img: '.jpg, .png o .webp', video: '.mp4 o .webm', audio: '.mp3, .m4a, .ogg o .wav' };
  function initMedia() {
    var jobs = $$('.media[data-src]').map(function (fig) {
      return new Promise(function (res) {
        var kind = fig.dataset.kind, base = fig.dataset.src, cap = $('figcaption', fig), exts = EXT[kind], k = 0, done = false, el;
        var ph = document.createElement('div'); ph.className = 'ph';
        ph.innerHTML = '<b>Pendiente:</b> <code>' + esc(base) + '</code> (' + EXT_TXT[kind] + ')<br>' + esc(fig.dataset.sug || '');
        fig.insertBefore(ph, fig.firstChild);
        function fail() { if (done) return; done = true; fig.classList.add('nomedia'); res(); }
        function ok() { if (done) return; done = true; ph.remove(); fig.insertBefore(el, fig.firstChild); res(); }
        function attempt() {
          if (done) return;
          if (k >= exts.length) { fail(); return; }
          var src = base + '.' + exts[k++];
          if (kind === 'img') { el = new Image(); el.alt = cap ? cap.textContent : ''; el.onload = ok; el.onerror = attempt; el.src = src; }
          else {
            el = document.createElement(kind); el.controls = true; el.preload = 'metadata';
            el.addEventListener('loadedmetadata', ok); el.addEventListener('error', attempt); el.src = src;
          }
        }
        attempt();
        setTimeout(fail, 10000);
      });
    });
    return Promise.all(jobs);
  }

  /* ---------- pasos ---------- */
  function collect() {
    scenes = $$('.scene').map(function (el, i) {
      return { el: el, i: i, title: el.dataset.title, who: +el.dataset.who || 1, min: +el.dataset.min || 1, opt: !!el.dataset.opt, notes: $('.notes', el), first: 0, last: -1 };
    });
    steps = []; stepScene = [];
    scenes.forEach(function (s) {
      s.first = steps.length;
      $$('.r', s.el).forEach(function (e) { if (!e.classList.contains('nomedia')) { steps.push(e); stepScene.push(s.i); } });
      s.last = steps.length - 1;
    });
  }

  function swaps() {
    $$('.stack,[data-swap]').forEach(function (c) {
      var sel = c.getAttribute('data-swap') || '.r';
      var kids = Array.prototype.filter.call(c.children, function (k) { return k.matches(sel) && k.classList.contains('r'); });
      var last = -1;
      kids.forEach(function (k, i) { if (k.classList.contains('on')) last = i; });
      kids.forEach(function (k, i) { k.classList.toggle('cur', i === last); });
    });
  }

  var ringKey = new WeakMap();
  function setRings(svg, keys) {
    var key = keys.join(',');
    if (ringKey.get(svg) === key) return;
    ringKey.set(svg, key);
    $$('.ring', svg).forEach(function (r) { r.remove(); });
    keys.forEach(function (k) {
      var xy = M.cities[k]; if (!xy) return;
      for (var j = 0; j < 3; j++) {
        var c = document.createElementNS(NS, 'circle');
        c.setAttribute('class', 'ring d' + j); c.setAttribute('cx', xy[0]); c.setAttribute('cy', xy[1]); c.setAttribute('r', 4);
        svg.appendChild(c);
      }
    });
  }

  function driveMaps() {
    $$('svg.map.driven').forEach(function (svg) {
      if (svg.hasAttribute('data-all')) return;
      var sc = svg.closest('.scene'), lit = {}, cit = {}, rings = [];
      $$('.r[data-hl],.r[data-city],.r[data-ring]', sc).forEach(function (e) {
        if (!(study || e.classList.contains('on'))) return;
        (e.dataset.hl || '').split(',').forEach(function (c) { if (c) lit[c] = 1; });
        (e.dataset.city || '').split(',').forEach(function (c) { if (c) cit[c] = 1; });
        if (!study) (e.dataset.ring || '').split(',').forEach(function (c) { if (c) rings.push(c); });
      });
      $$('path', svg).forEach(function (p) { p.classList.toggle('lit', !!lit[p.dataset.c]); });
      $$('.city', svg).forEach(function (c) { c.classList.toggle('on', !!cit[c.dataset.k]); });
      setRings(svg, rings);
    });
  }

  function paint() {
    if (study) {
      steps.forEach(function (e) { e.classList.remove('on', 'cur'); });
      $$('.cur').forEach(function (e) { e.classList.remove('cur'); });
    } else {
      steps.forEach(function (e, i) { e.classList.toggle('on', i <= idx); });
      swaps();
    }
    driveMaps();
    bar.max = steps.length || 1; bar.value = idx + 1;
  }

  /* ---------- navegación ---------- */
  function showHud(msg) {
    var s = scenes[curScene];
    hudEl.textContent = msg || ('Escena ' + (curScene + 1) + '/' + scenes.length + ' · paso ' + (idx + 1) + '/' + steps.length + (auto ? ' · auto ' + autoSec + ' s' : ''));
    hudEl.classList.add('show');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(function () { hudEl.classList.remove('show'); }, 2200);
  }
  function scrollToScene(i) { scenes[i].el.scrollIntoView({ behavior: SMOOTH, block: 'start' }); }
  function ensureVisible(el) {
    var r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ behavior: SMOOTH, block: 'center' });
  }
  function startClock() { if (!t0) t0 = Date.now(); }

  function go(n) {
    var prev = idx;
    idx = Math.max(-1, Math.min(steps.length - 1, n));
    if (study) return;
    paint();
    if (idx >= 0) startClock();
    if (idx < 0) { curScene = 0; scrollToScene(0); }
    else {
      var si = stepScene[idx], el = steps[idx];
      if (si !== curScene) {
        curScene = si;
        if (idx > prev) scrollToScene(si); else ensureVisible(el);
      } else ensureVisible(el);
    }
    updateNotes();
    showHud();
  }
  function next() { go(idx + 1); if (auto) tick(); }
  function prev() { go(idx - 1); if (auto) tick(); }
  function jump(s) {
    s = Math.max(0, Math.min(scenes.length - 1, s));
    idx = scenes[s].first - 1; curScene = s;
    if (study) { scrollToScene(s); return; }
    paint(); updateNotes(); scrollToScene(s); showHud();
  }

  /* ---------- modo automático ---------- */
  function tick() {
    clearTimeout(tm);
    if (!auto) return;
    if (idx >= steps.length - 1) { auto = false; showHud('Fin del recorrido'); return; }
    var el = steps[idx + 1];
    var t = +el.dataset.t || ((el.classList.contains('media') && el.dataset.kind !== 'img') ? 30 : autoSec);
    tm = setTimeout(next, t * 1000);
  }
  function toggleAuto() {
    auto = !auto;
    showHud(auto ? 'Modo automático: ' + autoSec + ' s por paso (P para pausar, + / − para el ritmo)' : 'Modo automático en pausa');
    if (auto) tick(); else clearTimeout(tm);
  }

  /* ---------- notas del expositor ---------- */
  function fmt(sec) { var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function updateNotes() {
    var s = scenes[curScene]; if (!s) return;
    var who = GRUPO.integrantes[s.who - 1] || ('Integrante ' + s.who);
    var acc = 0; scenes.forEach(function (x) { if (x.i <= s.i && !x.opt) acc += x.min; });
    nb.innerHTML = '<h3>' + esc(s.title) + '</h3><div class="meta"><span>Expone: <b>' + esc(who) + '</b></span><span>Tiempo sugerido: ' + s.min + ' min</span><span>Plan acumulado: ' + acc + ' min</span><span id="clock"></span></div>' +
      (s.opt ? '<p class="op">Escena opcional: pueden saltearla si van cortos de tiempo.</p>' : '') + (s.notes ? s.notes.innerHTML : '');
    tickClock();
  }
  function tickClock() { var c = $('#clock'); if (c) c.textContent = t0 ? 'Reloj: ' + fmt(Math.round((Date.now() - t0) / 1000)) : 'Reloj: 00:00'; }
  setInterval(tickClock, 1000);
  function toggleNotes() { notesEl.classList.toggle('open'); }

  /* ---------- modo estudio ---------- */
  function toggleStudy(force) {
    study = typeof force === 'boolean' ? force : !study;
    document.body.classList.toggle('study', study);
    clearTimeout(tm); auto = false;
    paint();
    if (study) {
      notesEl.classList.remove('open');
      // en el modo estudio las notas se leen debajo de cada escena
      window.scrollTo(0, 0);
      showHud('Modo estudio: todo visible con notas · E (o ☰ → Estudio) para volver a presentar');
    } else { go(idx); }
  }

  /* ---------- paneles (cronología, glosario, preguntas, vocabulario, menú, ayuda) ---------- */
  var ov = document.createElement('div'); ov.className = 'ov'; ov.id = 'ov'; document.body.appendChild(ov);
  function openOv(title, body, ready) {
    ov.innerHTML = '<button class="x" type="button">Cerrar ✕ (Esc)</button><h2>' + title + '</h2>' + body;
    ov.classList.add('open'); $('.x', ov).onclick = closeOv; if (ready) ready(); ov.scrollTop = 0;
  }
  function closeOv() { ov.classList.remove('open'); }
  function ovOpen() { return ov.classList.contains('open'); }
  function filterList(input, sel) {
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      $$(sel, ov).forEach(function (it) { it.hidden = !(!q || it.textContent.toLowerCase().indexOf(q) >= 0); });
    });
  }
  function ovTime() {
    var paises = {}; D.ev.forEach(function (e) { paises[e.p] = 1; });
    var opts = '<option value="">Todos los países</option>' + Object.keys(paises).sort().map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('');
    var list = D.ev.map(function (e) { return '<div class="it" data-p="' + esc(e.p) + '"><span class="f">' + esc(e.d) + '</span><b>' + esc(e.p) + '</b>' + (e.v ? '<span class="pa">† sin verificar</span>' : '') + '<br>' + esc(e.t) + '</div>'; }).join('');
    openOv('Cronología completa', '<input id="q1" placeholder="Buscar fecha, país o palabra…"><select id="s1">' + opts + '</select><p class="op">† = dato que no pudimos contrastar con fuente: chequéenlo antes de decirlo.</p>' + list, function () {
      var i = $('#q1', ov), s = $('#s1', ov);
      function f() { var q = i.value.toLowerCase().trim(), p = s.value; $$('.it', ov).forEach(function (it) { var okq = !q || it.textContent.toLowerCase().indexOf(q) >= 0, okp = !p || it.dataset.p === p; it.hidden = !(okq && okp); }); }
      i.addEventListener('input', f); s.addEventListener('change', f); i.focus();
    });
  }
  function ovGlos() {
    openOv('Glosario', '<input id="q2" placeholder="Buscar un término…">' + D.glos.map(function (g) { return '<div class="it"><b>' + esc(g.t) + '</b> — ' + esc(g.d) + '</div>'; }).join(''), function () { var i = $('#q2', ov); filterList(i, '.it'); i.focus(); });
  }
  function ovQA() {
    openOv('Preguntas del profe', '<input id="q3" placeholder="Buscar en las preguntas…">' + D.qa.map(function (x) { return '<div class="it"><b>' + esc(x.q) + '</b><br>' + esc(x.a) + '</div>'; }).join(''), function () { var i = $('#q3', ov); filterList(i, '.it'); i.focus(); });
  }
  function ovWords() {
    openOv('Palabras que cambian el enfoque', D.verbos.map(function (g) {
      return '<h3 class="gh">' + esc(g.t) + '</h3>' + g.i.map(function (x) { return '<div class="it"><b>' + esc(x.w) + '</b> — ' + esc(x.m) + '</div>'; }).join('');
    }).join(''));
  }
  function ovMenu() {
    openOv('Ir a una escena', scenes.map(function (s) {
      return '<button class="go" type="button" data-i="' + s.i + '">' + (s.i + 1) + '. ' + esc(s.title) + ' <span class="op">· ' + esc(GRUPO.integrantes[s.who - 1] || 'Integrante ' + s.who) + ' · ' + s.min + ' min' + (s.opt ? ' · opcional' : '') + '</span></button>';
    }).join(''), function () {
      $$('.go', ov).forEach(function (b) { b.onclick = function () { closeOv(); jump(+b.dataset.i); }; });
    });
  }
  function ovHelp() {
    var rows = [
      ['→ · Espacio · Enter · AvPág', 'Siguiente paso (aparece lo siguiente y la página baja sola)'],
      ['← · Retroceso · RePág', 'Paso anterior'],
      ['Inicio · Fin', 'Ir al principio / al final'],
      ['M', 'Menú de escenas (saltar a cualquiera)'],
      ['P', 'Modo automático (+ / − cambian el ritmo)'],
      ['N', 'Notas del expositor (solo para ustedes)'],
      ['T · G · Q · W', 'Cronología · Glosario · Preguntas del profe · Palabras que cambian el enfoque'],
      ['V', 'Reproducir / pausar el audio o video a la vista'],
      ['E', 'Modo estudio (todo visible + notas)'],
      ['F', 'Pantalla completa'],
      ['R', 'Reiniciar el reloj'],
      ['Clic · Mayús+clic', 'Siguiente / anterior con el mouse'],
      ['H · ?', 'Esta ayuda']
    ];
    openOv('Atajos', '<table>' + rows.map(function (r) { return '<tr><td><kbd>' + r[0].replace(/ · /g, '</kbd> <kbd>') + '</kbd></td><td>' + r[1] + '</td></tr>'; }).join('') + '</table><p class="op mt">En el celular: tocá el lado derecho de la pantalla para avanzar y el izquierdo para retroceder. El botón ☰ (abajo a la izquierda) reemplaza a las teclas.</p>');
  }

  function toggleMedia() {
    var s = scenes[curScene], cand = steps.slice(0, idx + 1).filter(function (e) { return e.classList.contains('media') && s.el.contains(e) && $('audio,video', e); });
    var m = cand.length ? $('audio,video', cand[cand.length - 1]) : null;
    if (!m) { showHud('No hay audio ni video a la vista'); return; }
    if (m.paused) m.play(); else m.pause();
  }

  /* ---------- teclado y toque ---------- */
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var typing = e.target && e.target.matches && e.target.matches('input,textarea,select');
    if (e.key === 'Escape') { if (ovOpen()) closeOv(); else notesEl.classList.remove('open'); return; }
    if (typing) return;
    var k = e.key;
    if (!ovOpen() && !study) {
      if (k === 'ArrowRight' || k === 'PageDown' || k === ' ' || k === 'Enter' || k === 'ArrowDown') { e.preventDefault(); next(); return; }
      if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace' || k === 'ArrowUp') { e.preventDefault(); prev(); return; }
      if (k === 'Home') { e.preventDefault(); go(-1); return; }
      if (k === 'End') { e.preventDefault(); go(steps.length - 1); return; }
    }
    switch (k.toLowerCase()) {
      case 'n': if (!study) toggleNotes(); break;
      case 'p': if (!study) toggleAuto(); break;
      case '+': case '=': autoSec = Math.min(30, autoSec + 1); showHud('Ritmo automático: ' + autoSec + ' s por paso'); break;
      case '-': autoSec = Math.max(2, autoSec - 1); showHud('Ritmo automático: ' + autoSec + ' s por paso'); break;
      case 't': ovTime(); break;
      case 'g': ovGlos(); break;
      case 'q': ovQA(); break;
      case 'w': ovWords(); break;
      case 'm': ovMenu(); break;
      case 'h': case '?': ovHelp(); break;
      case 'e': toggleStudy(); break;
      case 'v': toggleMedia(); break;
      case 'r': t0 = null; tickClock(); showHud('Reloj reiniciado'); break;
      case 'f': if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); break;
    }
  });
  window.addEventListener('pointerup', function (e) {
    if (toolsJustClosed) { toolsJustClosed = false; return; }
    if (e.pointerType !== 'touch' || study || ovOpen()) return;
    if (e.target.closest && e.target.closest('a,button,input,select,video,audio,#notes,.ov,#tools')) return;
    if (e.clientX > window.innerWidth * 0.4) next(); else prev();
  });
  window.addEventListener('click', function (e) {
    if (study || ovOpen() || e.button !== 0 || e.pointerType === 'touch' || (window.getSelection && String(window.getSelection()))) return;
    if (e.target.closest && e.target.closest('a,button,input,select,video,audio,#notes,.ov,#tools')) return;
    if (e.shiftKey) prev(); else next();
  });
  window.addEventListener('hashchange', function () { applyHash(); });

  function applyHash() {
    var h = location.hash;
    if (h === '#estudio') { if (!study) toggleStudy(true); return; }
    var m = /^#s(\d+)$/.exec(h);
    if (m) { if (study) toggleStudy(false); jump(+m[1]); }
  }

  /* ---------- botones para el celular (hacen lo mismo que M, N, E, Q, T, G, W y H) ---------- */
  (function () {
    var acciones = [
      ['Escenas', ovMenu, ''],
      ['Notas', function () { if (!study) toggleNotes(); }, 'nostudy'],
      ['Estudio', function () { toggleStudy(); }, 'est'],
      ['Preguntas', ovQA, ''],
      ['Cronología', ovTime, ''],
      ['Glosario', ovGlos, ''],
      ['Palabras', ovWords, ''],
      ['Ayuda', ovHelp, '']
    ];
    var box = document.createElement('div');
    box.id = 'tools';
    box.innerHTML = '<div class="tp" hidden>' + acciones.map(function (a, i) {
      return '<button type="button" class="tb ' + a[2] + '" data-i="' + i + '">' + a[0] + '</button>';
    }).join('') + '</div><button type="button" class="tg" aria-expanded="false" aria-label="Menú de la presentación">☰</button>';
    document.body.appendChild(box);
    var panel = $('.tp', box), toggle = $('.tg', box);
    function setOpen(v) { panel.hidden = !v; toggle.setAttribute('aria-expanded', v ? 'true' : 'false'); }
    toggle.onclick = function () { setOpen(panel.hidden); };
    panel.onclick = function (e) {
      var b = e.target.closest('.tb'); if (!b) return;
      setOpen(false);
      acciones[+b.dataset.i][1]();
      var a = document.activeElement;
      if (a && a.matches && a.matches('input')) a.blur();   // que no se abra el teclado del celular solo
    };
    document.addEventListener('pointerdown', function (e) {
      if (panel.hidden || box.contains(e.target)) return;
      setOpen(false);
      if (e.pointerType === 'touch') toolsJustClosed = true;   // ese toque solo cierra el panel, no avanza
    });
  })();

  /* ---------- arranque ---------- */
  initMedia().then(function () {
    collect();
    updateNotes();
    if (location.hash) applyHash();
    else go(-1);
    window.__app = { go: go, next: next, prev: prev, jump: jump, steps: function () { return steps; }, scenes: function () { return scenes; }, study: toggleStudy, idx: function () { return idx; } };
    document.body.setAttribute('data-ready', '1');
  });
})();
