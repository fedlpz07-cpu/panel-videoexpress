// Ayudante que se inyecta dentro de VideoExpress.
// Recuerda la última casilla tocada y permite reemplazar su texto.
(function () {
  if (window.__pve) return;
  var last = null;
  var undoStack = [];

  function editable(el) {
    if (!el || !el.tagName) return false;
    var t = el.tagName;
    if (t === 'TEXTAREA') return !el.disabled && !el.readOnly;
    if (t === 'INPUT') {
      var ty = (el.getAttribute('type') || 'text').toLowerCase();
      return ['text', 'search', 'email', 'url', 'tel', 'number'].indexOf(ty) >= 0 && !el.disabled && !el.readOnly;
    }
    return !!el.isContentEditable;
  }

  function watch(doc) {
    try {
      doc.addEventListener('focusin', function (e) { if (editable(e.target)) last = e.target; }, true);
      doc.addEventListener('pointerdown', function (e) { if (editable(e.target)) last = e.target; }, true);
    } catch (e) {}
  }
  watch(document);

  // También vigilar iframes del mismo sitio (por si Clone Voice abre dentro de uno)
  function watchFrames() {
    var fr = document.querySelectorAll('iframe');
    for (var i = 0; i < fr.length; i++) {
      try {
        var d = fr[i].contentDocument;
        if (d && !d.__pveWatched) { d.__pveWatched = true; watch(d); }
      } catch (e) {}
    }
  }
  watchFrames();
  setInterval(watchFrames, 2000);

  function target() {
    var a = document.activeElement;
    if (editable(a)) return a;
    if (last && last.isConnected) return last;
    return null;
  }

  function getVal(el) { return el.isContentEditable ? el.innerText : el.value; }

  function setVal(el, text, focus) {
    if (el.isContentEditable) {
      el.focus();
      var doc = el.ownerDocument;
      doc.execCommand('selectAll', false, null);
      doc.execCommand('insertText', false, text);
      return;
    }
    var win = el.ownerDocument.defaultView || window;
    var proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (focus) { try { el.focus(); } catch (e) {} }
    if (desc && desc.set) desc.set.call(el, text); else el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  }

  function flash(el) {
    var o = el.style.outline, off = el.style.outlineOffset;
    el.style.outline = '3px solid #22c55e';
    el.style.outlineOffset = '1px';
    setTimeout(function () { el.style.outline = o; el.style.outlineOffset = off; }, 900);
  }

  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var cs = (el.ownerDocument.defaultView || window).getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  }

  // Busca en las listas desplegables la opción que coincide con el texto
  function findOption(text, input) {
    var n = norm(text);
    var doc = input.ownerDocument;
    var all = doc.querySelectorAll('[role=option],[role=menuitem],li,option,button,a,div,span,p,label');
    var best = null, bestScore = 1e9;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el === input || el.contains(input) || el.querySelector('input,textarea')) continue;
      var t = norm(el.innerText || el.textContent);
      if (!t || t.indexOf(n) < 0 || t.length > n.length + 60) continue;
      if (!visible(el)) continue;
      var score = t.length - n.length;
      if (t === n) score -= 1000;
      var role = el.getAttribute('role');
      if (role === 'option' || role === 'menuitem' || el.tagName === 'LI' || el.tagName === 'OPTION') score -= 500;
      // preferir lo que está debajo de la casilla (la lista desplegada)
      var ri = input.getBoundingClientRect(), re = el.getBoundingClientRect();
      if (re.top < ri.bottom - 2 && Math.abs(re.top - ri.top) < 2) score += 200;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  function clickEl(el) {
    var opts = { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView || window };
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup'].forEach(function (ev) {
      try {
        el.dispatchEvent(ev.indexOf('pointer') === 0 ? new PointerEvent(ev, opts) : new MouseEvent(ev, opts));
      } catch (e) {}
    });
    try { el.click(); } catch (e) {}
  }

  function report(m) { try { PVE.report(m); } catch (e) {} }

  function allDocs() {
    var docs = [document], fr = document.querySelectorAll('iframe');
    for (var i = 0; i < fr.length; i++) { try { if (fr[i].contentDocument) docs.push(fr[i].contentDocument); } catch (e) {} }
    return docs;
  }

  // "Spanish|Español" = acepta cualquiera de las dos palabras
  function alts(text) { return String(text).split('|').map(norm).filter(Boolean); }

  // Una lista cuenta si se ve, o si está escondida dentro de un buscador visible
  // (VideoExpress envuelve la lista de voces con el plugin "searchableSelect").
  function selectUsable(s) {
    if (s.disabled) return false;
    if (visible(s)) return true;
    var p = s.parentElement;
    if (!p) return false;
    if (visible(p)) return true;
    var sib = p.querySelectorAll('input, button, div');
    for (var i = 0; i < sib.length; i++) if (visible(sib[i])) return true;
    return false;
  }

  // Cambia una lista de forma que VideoExpress (jQuery) se entere del cambio
  function setSelect(s, value) {
    var win = s.ownerDocument.defaultView || window;
    var jq = win.jQuery;
    if (jq) {
      var $s = jq(s);
      $s.val(value).trigger('change');
      var ss = $s.data('searchableSelect');
      if (ss) { try { if (ss.syncSelectedValue) ss.syncSelectedValue(); else if (ss.refresh) ss.refresh(); } catch (e) {} }
    } else {
      var desc = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(s, value); else s.value = value;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var shown = visible(s) ? s : (s.parentElement || s);
    flash(shown);
  }

  // Busca entre las listas usables una opción con ese texto (exacta primero)
  function selectByOption(text, onlySel) {
    var want = alts(text), docs = allDocs();
    for (var pass = 0; pass < 2; pass++) {
      for (var d = 0; d < docs.length; d++) {
        var sels = onlySel ? [onlySel] : docs[d].querySelectorAll('select');
        for (var i = 0; i < sels.length; i++) {
          var s = sels[i];
          if (!s || !selectUsable(s)) continue;
          for (var j = 0; j < s.options.length; j++) {
            var o = norm(s.options[j].text);
            var hit = want.some(function (w) { return pass === 0 ? o === w : o.indexOf(w) === 0; });
            if (hit) {
              if (s.value !== s.options[j].value) setSelect(s, s.options[j].value);
              else flash(visible(s) ? s : s.parentElement);
              return s.options[j].text;
            }
          }
        }
        if (onlySel) break;
      }
    }
    return null;
  }

  function firstUsable(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var docs = allDocs();
      for (var d = 0; d < docs.length; d++) {
        var list = docs[d].querySelectorAll(selectors[i]);
        for (var k = 0; k < list.length; k++) {
          var el = list[k];
          if (el.tagName === 'SELECT' ? selectUsable(el) : (visible(el) && !el.disabled)) return el;
        }
      }
    }
    return null;
  }

  // Casillas conocidas de VideoExpress 3.5 (vistas al inspeccionar la página)
  var FIELDS = {
    img: ['#opt_prompt', 'textarea[name="prompt"]'],
    vid: ['#opt_video_prompt', 'textarea[name="video_prompt"]'],
    voz: ['textarea[name="tts_voice_clone_text"]', 'textarea[name="text"]']
  };
  var VOICE = {
    tipo: ['select#tts_voice_category', 'select[name="category"]'],
    idioma: ['select#tts_voice_clone_lang--native', 'select[name="voice_lang"]', 'select#tts_voice_clone_lang'],
    nombre: ['select#tts_voice_clone_voice--native', 'select[name="voice"]', 'select#tts_voice_clone_voice']
  };
  // Botones de VideoExpress 3.5
  var ACTIONS = {
    crear_imagen: ['.button-generate-image-submit'],
    crear_video: ['.button-generate-talking-video', '.button-generate-video', 'button[class*="button-generate-vi"]'],
    generar_audio: ['.tts_voice_button_import'],
    crear_narracion: ['.bbm-modal .button-submit']
  };

  function openCloneVoiceTab() {
    var docs = allDocs();
    for (var d = 0; d < docs.length; d++) {
      var tabs = docs[d].querySelectorAll('a[data-toggle="tab"], a[data-bs-toggle="tab"], [role="tab"]');
      for (var i = 0; i < tabs.length; i++) {
        if (norm(tabs[i].textContent) === 'clonevoice.ai' && visible(tabs[i])) { tabs[i].click(); return true; }
      }
    }
    return false;
  }

  function setCheck(name, on) {
    var el = firstUsable(['input[name="' + name + '"]']);
    if (!el) return false;
    if (!!el.checked !== !!on) el.click();
    return true;
  }

  // Casilla de búsqueda visible (ej. "Search language..." de la voz)
  function searchBox() {
    var docs = allDocs(), best = null;
    for (var d = 0; d < docs.length; d++) {
      var ins = docs[d].querySelectorAll('input');
      for (var i = 0; i < ins.length; i++) {
        var p = norm(ins[i].getAttribute('placeholder'));
        if (editable(ins[i]) && visible(ins[i]) && p.indexOf('search') >= 0) best = ins[i];
      }
    }
    return best;
  }

  function typeAndPick(el, text, done) {
    var want = alts(text);
    el.click && el.click();
    setVal(el, String(text).split('|')[0].trim(), true);
    flash(el);
    var tries = 0;
    (function attempt() {
      tries++;
      var opt = null;
      for (var k = 0; k < want.length && !opt; k++) opt = findOption(want[k], el);
      if (opt) { clickEl(opt); done(true); }
      else if (tries < 12) setTimeout(attempt, 300);
      else {
        var ke = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
        el.dispatchEvent(new KeyboardEvent('keydown', ke));
        el.dispatchEvent(new KeyboardEvent('keyup', ke));
        done(false);
      }
    })();
  }

  // Espera hasta que una lista tenga la opción (VideoExpress las llena por internet)
  function waitSelect(selectors, text, done, tries) {
    tries = tries || 0;
    var s = firstUsable(selectors);
    var got = s ? selectByOption(text, s) : null;
    if (got) { done(got); return; }
    if (tries < 25) setTimeout(function () { waitSelect(selectors, text, done, tries + 1); }, 400);
    else done(null);
  }

  function fillEl(el, text) {
    undoStack.push({ el: el, val: getVal(el) });
    if (undoStack.length > 30) undoStack.shift();
    setVal(el, text, false);
    flash(el);
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
  }

  window.__pve = {
    // kind: 'img' | 'vid' | 'voz' | '' (cualquier casilla tocada)
    insert: function (text, kind) {
      var el = null;
      if (kind && FIELDS[kind]) el = firstUsable(FIELDS[kind]);
      if (!el) el = target();
      if (!el) return 'NOFIELD';
      fillEl(el, text);
      return 'OK';
    },
    undo: function () {
      var u = undoStack.pop();
      if (!u || !u.el.isConnected) return 'NOUNDO';
      setVal(u.el, u.val, false);
      flash(u.el);
      return 'OK';
    },
    // Un solo valor de voz (tipo, idioma o nombre)
    insertSelect: function (text) {
      var got = selectByOption(text);
      if (got) { report('SEL_OK:' + got); return 'DONE'; }
      var el = target();
      if (!el || el.tagName === 'TEXTAREA') el = searchBox();
      if (!el) return 'NOFIELD';
      typeAndPick(el, text, function (ok) { report((ok ? 'SEL_OK:' : 'SEL_NONE:') + text.split('|')[0]); });
      return 'PENDING';
    },
    // Todo de una vez: Category → Language → Voice, esperando que cada lista cargue
    configVoice: function (tipo, idioma, nombre) {
      if (!firstUsable(VOICE.tipo)) openCloneVoiceTab();
      var steps = [];
      if (tipo) steps.push(['tipo', tipo]);
      if (idioma) steps.push(['idioma', idioma]);
      if (nombre) steps.push(['nombre', nombre]);
      var i = 0;
      (function next() {
        if (i >= steps.length) {
          var t = firstUsable(FIELDS.voz);
          if (t) { try { t.focus(); } catch (e) {} }
          if (t) { try { t.scrollIntoView({ block: 'center' }); } catch (e) {} flash(t); }
          report('VOZ_OK:' + String(nombre || '').split('|')[0]);
          return;
        }
        var st = steps[i++];
        waitSelect(VOICE[st[0]], st[1], function (got) {
          if (got) setTimeout(next, 500);
          else report(firstUsable(VOICE.tipo) ? 'VOZ_FAIL:' + st[1].split('|')[0] : 'NOVOICE:');
        });
      })();
      return 'PENDING';
    },
    // Toca un botón de VideoExpress (crear imagen, audio, video…)
    click: function (action) {
      var b = firstUsable(ACTIONS[action] || []);
      if (!b) return 'NOBTN';
      if (b.disabled || b.classList.contains('disabled')) return 'BTNOFF';
      flash(b);
      b.click();
      return 'CLICKED';
    },
    // Ajustes de la ventana "Create Video From Prompt"
    applySettings: function (a) {
      if (!firstUsable(FIELDS.img)) return 'NOFORM';
      var done = [];
      if (a.tipo_imagen) { var ti = /image type/i.test(a.tipo_imagen) ? a.tipo_imagen : 'Image Type: ' + a.tipo_imagen; var g = selectByOption(ti, firstUsable(['select[name="select-type"]'])); if (g) done.push(g.replace('Image Type: ', '')); }
      var map = { modo_creativo: 'image_creative_mode', mejorar_prompt: 'auto_enhance_prompt', personaje_consistente: 'use_consistent_character', lipsync: 'talking_video', narracion: 'narration_video', galeria_publica: 'shared', modo_avanzado: 'advanced_mode' };
      var needAdv = a.solo_video != null || a.duracion != null || a.mejorar_prompt_video != null;
      if (needAdv && a.modo_avanzado == null) a.modo_avanzado = true;
      Object.keys(map).forEach(function (k) { if (a[k] != null && setCheck(map[k], a[k])) done.push(k); });
      setTimeout(function () {
        if (a.mejorar_prompt_video != null && setCheck('enhance_video_prompt', a.mejorar_prompt_video)) done.push('mejorar_prompt_video');
        if (a.solo_video != null && setCheck('video_only', a.solo_video)) done.push('solo_video');
        if (a.duracion != null) {
          setCheck('manual_video_length', true);
          var r = firstUsable(['#opt_video_duration', 'input[name="video_duration"]']);
          if (r) {
            var win = r.ownerDocument.defaultView || window;
            if (win.jQuery) win.jQuery(r).val(a.duracion).trigger('input').trigger('change');
            else { r.value = a.duracion; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }
            flash(r.parentElement || r);
            done.push(a.duracion + ' s');
          }
        }
        report('AJ_OK:' + done.length);
      }, 700);
      return 'PENDING';
    }
  };
})();
