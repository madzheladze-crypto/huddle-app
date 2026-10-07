// dc-lite: маленький движок для детективных дел Huddle.
// Дело = разметка (шаблон с {{ дырами }}, <sc-if>, <sc-for>) + класс с логикой (state + renderVals).
// Движок перерисовывает экран при каждом setState и аккуратно правит DOM на месте,
// чтобы не терялся фокус в полях и не рвалось перетаскивание на доске.
(function () {
  var EVENTS = ['click', 'input', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel'];
  var ATTR_EVENT = { onclick: 'click', oninput: 'input', onpointerdown: 'pointerdown', onpointermove: 'pointermove', onpointerup: 'pointerup', onpointercancel: 'pointercancel' };
  var BOOL = { disabled: 1, checked: 1, hidden: 1 };
  var HOLE = /\{\{\s*([\w.$]+)\s*\}\}/g;

  function DCLogic() { this.state = {}; this._rt = null; }
  DCLogic.prototype.setState = function (patch) {
    var p = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = Object.assign({}, this.state, p);
    if (this._rt) this._rt.schedule();
  };
  window.DCLogic = DCLogic;

  function lookup(path, scopes) {
    var parts = path.split('.');
    for (var i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i] && Object.prototype.hasOwnProperty.call(scopes[i], parts[0])) {
        var v = scopes[i][parts[0]];
        for (var j = 1; j < parts.length; j++) { if (v == null) return undefined; v = v[parts[j]]; }
        return v;
      }
    }
    return undefined;
  }
  function interp(str, scopes) {
    return str.replace(HOLE, function (_, p) { var v = lookup(p, scopes); return v == null || v === false ? '' : String(v); });
  }
  function soleHole(str) { var m = /^\s*\{\{\s*([\w.$]+)\s*\}\}\s*$/.exec(str); return m ? m[1] : null; }

  function Runtime(mount, templateHtml, Component, opts) {
    this.mount = mount; this.opts = opts || {};
    var t = document.createElement('template'); t.innerHTML = templateHtml; this.tpl = t.content;
    this.comp = new Component({}); this.comp._rt = this;
    this.handlers = []; this.pending = false;
    var self = this;
    EVENTS.forEach(function (type) {
      mount.addEventListener(type, function (e) { self.dispatch(type, e); }, type === 'pointermove' ? { passive: true } : false);
    });
  }
  Runtime.prototype.schedule = function () {
    var self = this;
    if (this.pending) return; this.pending = true;
    (window.requestAnimationFrame || setTimeout)(function () { self.pending = false; self.render(); });
  };
  Runtime.prototype.dispatch = function (type, e) {
    var el = e.target, stopped = false;
    while (el && el !== this.mount.parentNode) {
      var idx = el.getAttribute && el.getAttribute('data-h-' + type);
      if (idx != null) {
        var fn = this.handlers[+idx];
        if (typeof fn === 'function') {
          var cur = el;
          var ev = {
            type: type, target: e.target, currentTarget: cur, clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId,
            button: e.button, nativeEvent: e,
            stopPropagation: function () { stopped = true; }, preventDefault: function () { e.preventDefault(); }
          };
          fn(ev);
          if (stopped) return;
        }
      }
      el = el.parentNode;
    }
  };
  Runtime.prototype.render = function () {
    var vals = this.comp.renderVals();
    if (this.opts.extraVals) Object.assign(vals, this.opts.extraVals(this.comp));
    this.handlers = [];
    var frag = document.createDocumentFragment();
    this.build(this.tpl, [vals], frag);
    morphChildren(this.mount, frag);
    if (this.opts.afterRender) this.opts.afterRender(this.comp);
  };
  Runtime.prototype.build = function (src, scopes, out) {
    var kids = src.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 3) { out.appendChild(document.createTextNode(interp(n.nodeValue, scopes))); continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toLowerCase();
      if (tag === 'sc-if') {
        var key = soleHole(n.getAttribute('value') || '');
        if (key && lookup(key, scopes)) this.build(n, scopes, out);
        continue;
      }
      if (tag === 'sc-for') {
        var list = lookup(soleHole(n.getAttribute('list') || '') || '', scopes) || [];
        var as = n.getAttribute('as') || 'item';
        for (var k = 0; k < list.length; k++) { var sc = {}; sc[as] = list[k]; this.build(n, scopes.concat([sc]), out); }
        continue;
      }
      var el = document.createElement(tag);
      for (var a = 0; a < n.attributes.length; a++) {
        var at = n.attributes[a], name = at.name.toLowerCase(), val = at.value;
        if (name.indexOf('hint-') === 0) continue;
        if (ATTR_EVENT[name]) {
          var fk = soleHole(val), fn = fk ? lookup(fk, scopes) : null;
          if (typeof fn === 'function') { this.handlers.push(fn); el.setAttribute('data-h-' + ATTR_EVENT[name], String(this.handlers.length - 1)); }
          continue;
        }
        if (BOOL[name]) { var bk = soleHole(val); if (bk ? lookup(bk, scopes) : true) el.setAttribute(name, ''); continue; }
        el.setAttribute(name, interp(val, scopes));
      }
      this.build(n, scopes, el);
      out.appendChild(el);
    }
  };

  // --- аккуратная правка DOM на месте ---
  function morphChildren(parent, next) {
    var a = parent.firstChild, b = next.firstChild;
    while (b) {
      var nb = b.nextSibling;
      if (!a) { parent.appendChild(b); }
      else if (same(a, b)) { patch(a, b); a = a.nextSibling; }
      else { parent.replaceChild(b, a); a = b.nextSibling; }
      b = nb;
    }
    while (a) { var na = a.nextSibling; parent.removeChild(a); a = na; }
  }
  function same(a, b) { return a.nodeType === b.nodeType && (a.nodeType !== 1 || a.tagName === b.tagName); }
  function patch(a, b) {
    if (a.nodeType === 3) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    var i, at;
    for (i = a.attributes.length - 1; i >= 0; i--) { at = a.attributes[i]; if (!b.hasAttribute(at.name)) a.removeAttribute(at.name); }
    for (i = 0; i < b.attributes.length; i++) { at = b.attributes[i]; if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value); }
    if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') {
      var v = b.getAttribute('value') || '';
      if (document.activeElement !== a && a.value !== v) a.value = v;
      if (a.disabled !== b.hasAttribute('disabled')) a.disabled = b.hasAttribute('disabled');
      return;
    }
    if (a.tagName === 'BUTTON') a.disabled = b.hasAttribute('disabled');
    morphChildren(a, b);
  }

  window.DCLite = {
    start: function (mount, templateHtml, Component, opts) {
      var rt = new Runtime(mount, templateHtml, Component, opts);
      if (opts && opts.beforeFirst) opts.beforeFirst(rt.comp);
      rt.render();
      return rt;
    }
  };
})();
