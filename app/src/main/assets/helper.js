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

  // Cambia una lista normal (<select>) visible que tenga una opción con ese texto
  function selectByOption(text) {
    var want = alts(text), docs = allDocs();
    for (var pass = 0; pass < 2; pass++) {
      for (var d = 0; d < docs.length; d++) {
        var sels = docs[d].querySelectorAll('select');
        for (var i = 0; i < sels.length; i++) {
          var s = sels[i];
          if (!visible(s) || s.disabled) continue;
          for (var j = 0; j < s.options.length; j++) {
            var o = norm(s.options[j].text);
            var hit = want.some(function (w) { return pass === 0 ? o === w : o.indexOf(w) === 0; });
            if (hit) {
              var win = s.ownerDocument.defaultView || window;
              var desc = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value');
              if (desc && desc.set) desc.set.call(s, s.options[j].value); else s.selectedIndex = j;
              s.dispatchEvent(new Event('input', { bubbles: true }));
              s.dispatchEvent(new Event('change', { bubbles: true }));
              flash(s);
              return s.options[j].text;
            }
          }
        }
      }
    }
    return null;
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

  window.__pve = {
    insert: function (text) {
      var el = target();
      if (!el) return 'NOFIELD';
      undoStack.push({ el: el, val: getVal(el) });
      if (undoStack.length > 30) undoStack.shift();
      setVal(el, text, false);
      flash(el);
      return 'OK';
    },
    undo: function () {
      var u = undoStack.pop();
      if (!u || !u.el.isConnected) return 'NOUNDO';
      setVal(u.el, u.val, false);
      flash(u.el);
      return 'OK';
    },
    // Un botón de voz: primero intenta las listas normales (Category, Language);
    // si no, escribe en la casilla de búsqueda y toca la opción.
    insertSelect: function (text) {
      var got = selectByOption(text);
      if (got) { report('SEL_OK:' + got); return 'DONE'; }
      var el = target();
      if (!el || (el.tagName === 'TEXTAREA')) el = searchBox();
      if (!el) return 'NOFIELD';
      typeAndPick(el, text, function (ok) { report((ok ? 'SEL_OK:' : 'SEL_NONE:') + text.split('|')[0]); });
      return 'PENDING';
    },

    // Todo de una vez: tipo de voz → idioma → voz
    configVoice: function (tipo, idioma, nombre) {
      var steps = [];
      if (tipo) steps.push(['sel', tipo]);
      if (idioma) steps.push(['sel', idioma]);
      if (nombre) steps.push(['voz', nombre]);
      var i = 0;
      (function next() {
        if (i >= steps.length) { report('VOZ_OK:' + (nombre || '').split('|')[0]); return; }
        var st = steps[i++];
        if (st[0] === 'sel') {
          var tries = 0;
          (function trySel() {
            tries++;
            var got = selectByOption(st[1]);
            if (got) setTimeout(next, 900);
            else if (tries < 8) setTimeout(trySel, 400);
            else report('VOZ_FAIL:' + st[1].split('|')[0]);
          })();
        } else {
          var tries2 = 0;
          (function tryBox() {
            tries2++;
            var box = searchBox();
            if (box) typeAndPick(box, st[1], function (ok) {
              report(ok ? 'VOZ_OK:' + st[1].split('|')[0] : 'VOZ_FAIL:' + st[1].split('|')[0]);
            });
            else if (tries2 < 8) setTimeout(tryBox, 400);
            else report('VOZ_FAIL:' + st[1].split('|')[0]);
          })();
        }
      })();
      return 'PENDING';
    }
  };
})();
