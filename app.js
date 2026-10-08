(function () {
  "use strict";
  var BUILD = window.HUDDLE_BUILD || '1';

  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var app = document.getElementById("app");
  var stack = [];
  var timers = [];

  // ---------- утилиты ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "success" || kind === "warning") tg.HapticFeedback.notificationOccurred(kind);
      else tg.HapticFeedback.impactOccurred(kind || "light");
    } catch (e) { /* не в Telegram */ }
  }
  function clearTimers() {
    timers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
    timers = [];
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem("huddle:" + key));
      localStorage.setItem("huddle:" + key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  // ---------- прогресс ----------
  function getSeen(k) { return store("seen:" + k) || []; }
  function markSeen(k, item) {
    var s = getSeen(k);
    if (s.indexOf(item) < 0) { s.push(item); store("seen:" + k, s); }
  }
  function isSeen(k, item) { return getSeen(k).indexOf(item) >= 0; }
  function orderBySeen(k, items) {
    var s = getSeen(k);
    return shuffle(items.filter(function (x) { return s.indexOf(x) < 0; }))
      .concat(shuffle(items.filter(function (x) { return s.indexOf(x) >= 0; })));
  }
  function gameParts(setId, g) {
    var base = setId + ":" + g.id;
    if (g.type === "iceberg") return g.layers.map(function (l, i) { return { key: base + ":" + i, items: l.cards }; });
    if (g.type === "countdownList") return [{ key: base, items: g.rounds.map(function (_, i) { return "r" + i; }) }];
    if (g.type === "debate") return [{ key: base, items: g.topics }];
    if (g.type === "tasks") return [{ key: base, items: g.cards.map(function (c) { return c.text; }) }];
    if (g.type === "truthDare") return [{ key: base + ":t", items: g.truth }, { key: base + ":d", items: g.dare }];
    return [{ key: base, items: g.cards }];
  }
  function progress(parts) {
    var done = 0, total = 0;
    parts.forEach(function (p) {
      var s = getSeen(p.key);
      total += p.items.length;
      done += p.items.filter(function (x) { return s.indexOf(x) >= 0; }).length;
    });
    return { done: done, total: total };
  }
  function progLabel(pr) {
    if (!pr.done) return "";
    return pr.done === pr.total ? ' <span class="prog full">✓ пройдено</span>' : ' <span class="prog">' + pr.done + " / " + pr.total + "</span>";
  }
  function resetSet(set) {
    set.games.forEach(function (g) {
      gameParts(set.id, g).forEach(function (p) { store("seen:" + p.key, []); });
    });
  }

  // ---------- игроки ----------
  var players = store("players") || [];
  var tgName = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user.first_name : "";
  if (!players.length && tgName) players = [tgName];

  // ---------- навигация ----------
  function go(screen, params, replace) {
    clearTimers();
    if (replace) stack.pop();
    stack.push({ screen: screen, params: params || {} });
    render();
  }
  function back() {
    clearTimers();
    if (stack.length > 1) stack.pop();
    render();
  }
  function render() {
    var top = stack[stack.length - 1];
    document.body.className = "";
    app.innerHTML = "";
    screens[top.screen](top.params);
    window.scrollTo(0, 0);
    if (tg) {
      if (stack.length > 1) tg.BackButton.show(); else tg.BackButton.hide();
      tg.MainButton.hide();
    }
  }
  if (tg) tg.BackButton.onClick(back);

  function h(html) { app.insertAdjacentHTML("beforeend", html); }
  function on(sel, fn) {
    var els = app.querySelectorAll(sel);
    for (var i = 0; i < els.length; i++) els[i].addEventListener("click", fn);
  }
  function header(title, sub) {
    h('<header class="top">' + (stack.length > 1 ? '<button class="back" data-back>←</button>' : "") +
      "<div><h1>" + esc(title) + "</h1>" + (sub ? '<p class="muted">' + esc(sub) + "</p>" : "") + "</div></header>");
    on("[data-back]", back);
  }

  // Карточка с листанием (общий движок для простых колод)
  function deck(opts) {
    var cards = orderBySeen(opts.key, opts.cards);
    var i = 0;
    function draw() {
      var box = app.querySelector("[data-deck]");
      if (i >= cards.length) {
        box.innerHTML = '<div class="card end"><p class="big">Колода закончилась 🎉</p>' +
          '<button class="btn" data-restart>Перемешать и сыграть ещё</button></div>';
        box.querySelector("[data-restart]").onclick = function () { cards = orderBySeen(opts.key, opts.cards); i = 0; draw(); };
        return;
      }
      box.innerHTML =
        '<div class="counter">' + (i + 1) + " / " + cards.length + "</div>" +
        '<div class="card flip">' + (isSeen(opts.key, cards[i]) ? '<span class="seen">уже было</span>' : "") + (opts.prefix ? '<p class="prefix">' + esc(opts.prefix) + "</p>" : "") +
        '<p class="big">' + esc(cards[i]) + "</p></div>" +
        (opts.action ? '<button class="btn" data-action>' + esc(opts.action) + "</button>" : "") +
        '<div class="row">' + (i > 0 ? '<button class="btn ghost" style="flex:0 0 56px" data-prev aria-label="Назад">←</button>' : "") + '<button class="btn ghost" data-skip>Пропустить</button>' +
        '<button class="btn ' + (opts.action ? "ghost" : "") + '" data-next>Дальше</button></div>';
      box.querySelector("[data-next]").onclick = function () { markSeen(opts.key, cards[i]); i++; haptic("light"); draw(); };
      box.querySelector("[data-skip]").onclick = function () { i++; draw(); };
      if (i > 0) box.querySelector("[data-prev]").onclick = function () { i--; draw(); };
      if (opts.action) box.querySelector("[data-action]").onclick = function () { opts.onAction(box); };
    }
    h('<section data-deck></section>');
    draw();
  }

  // Обратный отсчёт 3-2-1 поверх экрана
  function countdown(message, done) {
    var n = 3;
    var ov = document.createElement("div");
    ov.className = "overlay";
    document.body.appendChild(ov);
    function tick() {
      if (n === 0) {
        ov.innerHTML = '<div class="count go">' + esc(message) + "</div>";
        haptic("success");
        timers.push(setTimeout(function () { ov.remove(); if (done) done(); }, 1600));
        return;
      }
      ov.innerHTML = '<div class="count">' + n + "</div>";
      haptic("medium");
      n--;
      timers.push(setTimeout(tick, 800));
    }
    tick();
  }

  // Таймер-кольцо
  function ring(container, seconds, onEnd) {
    var left = seconds;
    var C = 2 * Math.PI * 44;
    container.innerHTML =
      '<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="track"/>' +
      '<circle cx="50" cy="50" r="44" class="bar" stroke-dasharray="' + C + '" stroke-dashoffset="0"/></svg>' +
      '<span class="secs">' + left + "</span></div>";
    var bar = container.querySelector(".bar");
    var secs = container.querySelector(".secs");
    var t = setInterval(function () {
      left--;
      secs.textContent = Math.max(left, 0);
      bar.setAttribute("stroke-dashoffset", String(C * (1 - left / seconds)));
      if (left <= 5 && left > 0) haptic("light");
      if (left <= 0) { clearInterval(t); haptic("warning"); secs.textContent = "Стоп!"; if (onEnd) onEnd(); }
    }, 1000);
    timers.push(t);
  }

  // ---------- экраны ----------
  var screens = {};

  screens.home = function () {
    h('<div class="hero"><div class="logo">Huddle</div><p class="muted">игры для своих</p></div>');
    h('<a class="tile" href="case.html?case=tikhaya-noch&v=' + BUILD + '" style="text-decoration:none;color:inherit"><span class="tag dim">Детектив · тест</span><h2>Тихая ночь</h2>' +
      "<p>Новогодняя ночь, загородный дом под Петербургом. Полиция говорит — несчастный случай. Сестра погибшего так не думает.</p></a>");
    var caseKey = "huddle:case:tikhaya-noch";
    var hasCase = false;
    try { hasCase = !!localStorage.getItem(caseKey); } catch (e) {}
    if (hasCase) h('<button class="link" data-reset-case style="margin:-4px auto 14px">Сбросить прогресс «Тихой ночи»</button>');
    h('<button class="tile accent" data-set="friends-lite"><span class="tag">Бесплатно</span>' +
      '<h2>Друзья · Лайт</h2><p>Айсберг, «Кто из нас», дебаты и ещё 5 игр для компании</p></button>');
    h('<button class="tile" data-set="friends-hot"><span class="tag">Прототип · 18+</span>' +
      '<h2>Близкие друзья · Огонь</h2><p>Секреты, деньги, зависть и правда в лицо — для тех, кто давно вместе</p></button>');
    h('<button class="tile" data-set="love-hot"><span class="tag">Прототип · 18+</span>' +
      '<h2>Близкие · Про отношения</h2><p>Для друзей и подруг: свидания, бывшие, ревность и «почти было»</p></button>');
    h('<div class="tile soon"><span class="tag dim">Скоро</span><h2>Пары · Знакомство · Коллеги</h2>' +
      "<p>Новые наборы и уровни: лайт, с перчинкой и огонь 18+</p></div>");
    on("[data-set]", function (e) { go("setIntro", { setId: e.currentTarget.getAttribute("data-set") }); });
    if (hasCase) on("[data-reset-case]", function () {
      confirmMsg("Начать «Тихую ночь» с самого начала? Улики, доска и отчёты сотрутся.", function () {
        try { localStorage.removeItem(caseKey); } catch (e) {}
        go("home", {}, true);
        alertMsg("Готово. Дело начнётся с заставки.");
      });
    });
  };

  screens.setIntro = function (p) {
    var set = window.HUDDLE_SETS[p.setId];
    header(set.title, set.subtitle);
    h('<div class="cover">' + set.games.map(function (g) { return "<span>" + g.emoji + "</span>"; }).join("") + "</div>");
    h('<div class="card"><p class="prefix">Внутри</p><div class="chips">' + set.games.map(function (g) {
      return '<span class="chip">' + g.emoji + " " + esc(g.title) + "</span>";
    }).join("") + "</div></div>");
    h('<ul class="rules">' + (set.intro || []).map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>");
    h('<button class="btn" data-go>Поехали</button>');
    on("[data-go]", function () { go("set", p, true); });
  };

  screens.set = function (p) {
    var set = window.HUDDLE_SETS[p.setId];
    header(set.title, set.subtitle);
    h('<div class="players"><div class="players-head"><b>Кто играет</b><span class="muted">' +
      (players.length < 2 ? "добавь хотя бы двоих" : "в игре: " + players.length) + "</span></div>" +
      '<div class="chips">' + players.map(function (n, i) {
        return '<span class="chip">' + esc(n) + ' <button data-del="' + i + '" aria-label="Удалить">×</button></span>';
      }).join("") + "</div>" +
      '<form class="add" data-add><input maxlength="20" placeholder="Имя игрока" /><button class="btn small">+</button></form></div>');
    app.querySelector("[data-add]").onsubmit = function (e) {
      e.preventDefault();
      var inp = e.target.querySelector("input");
      var v = inp.value.trim();
      if (v) { players.push(v); store("players", players); go("set", p, true); }
    };
    on("[data-del]", function (e) {
      players.splice(+e.currentTarget.getAttribute("data-del"), 1);
      store("players", players); go("set", p, true);
    });
    h('<p class="hint">Порядок на вечер: начните с «Айсберга», потом чередуйте быстрые игры и закончите заданием из «Вместе». Любую карточку можно пропустить.</p>');
    set.games.forEach(function (g, i) {
      var pr = progress(gameParts(set.id, g));
      h('<button class="game' + (pr.done === pr.total ? " done" : "") + '" data-game="' + i + '"><span class="emoji">' + g.emoji + "</span>" +
        "<span><b>" + esc(g.title) + progLabel(pr) + '</b><span class="muted">' + esc(g.blurb) + "</span></span></button>");
    });
    h('<button class="link" data-reset>Сбросить прогресс набора</button>');
    on("[data-reset]", function () {
      confirmMsg("Сбросить отметки о пройденных вопросах и играх?", function () { resetSet(set); go("set", p, true); });
    });
    on("[data-game]", function (e) {
      var g = set.games[+e.currentTarget.getAttribute("data-game")];
      var needs = g.type === "debate" || (g.type === "tasks");
      if (needs && players.length < 2) { alertMsg("Добавь хотя бы двоих игроков сверху"); return; }
      go(g.type === "iceberg" ? "iceberg" : "rules", { game: g, setId: set.id });
    });
  };

  function alertMsg(text) {
    if (tg && tg.showAlert) tg.showAlert(text); else window.alert(text);
  }

  function confirmMsg(text, yes) {
    if (tg && tg.showConfirm) tg.showConfirm(text, function (ok) { if (ok) yes(); });
    else if (window.confirm(text)) yes();
  }

  screens.rules = function (p) {
    var g = p.game;
    header(g.title, g.blurb);
    h('<div class="cover big-emoji">' + g.emoji + "</div>");
    h('<div class="card"><p class="prefix">Как играть</p><ol class="rules">' + (g.rules || []).map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ol></div>");
    h('<button class="btn" data-play>Понятно, начинаем</button>');
    on("[data-play]", function () { go(g.type, p, true); });
  };

  // Айсберг
  screens.iceberg = function (p) {
    var g = p.game;
    var layer = p.layer;
    if (layer === undefined) {
      document.body.className = "sea l0";
      header(g.title, "Чем глубже — тем честнее");
      h('<div class="berg">' + bergSvg() + "</div>");
      h('<ol class="layers">' + g.layers.map(function (l, i) {
        var pr = progress([{ key: p.setId + ":" + g.id + ":" + i, items: l.cards }]);
        return '<li class="lay l' + i + '" data-jump="' + i + '"><b>' + esc(l.name) + "</b> — " + esc(l.sub) + progLabel(pr) + "</li>";
      }).join("") + "</ol>");
      h('<ul class="rules">' + (g.rules || []).map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("") + "</ul>");
      h('<p class="hint">Можно начать с верхушки или сразу нырнуть — нажми на нужный слой. Переключаться можно в любой момент.</p>');
      h('<button class="btn" data-start>Начать с верхушки</button>');
      on("[data-jump]", function (e) { go("iceberg", { game: g, setId: p.setId, layer: +e.currentTarget.getAttribute("data-jump") }, true); });
      on("[data-start]", function () { go("iceberg", { game: g, setId: p.setId, layer: 0 }, true); });
      return;
    }
    var L = g.layers[layer];
    document.body.className = "sea l" + layer;
    header(L.name, L.sub);
    h('<div class="depth">' + g.layers.map(function (_, i) {
      return '<span class="seg' + (i <= layer ? " on" : "") + '" data-seg="' + i + '"></span>';
    }).join("") + "</div>");
    on("[data-seg]", function (e) { var n = +e.currentTarget.getAttribute("data-seg"); if (n !== layer) go("iceberg", { game: g, setId: p.setId, layer: n }, true); });
    var lkey = p.setId + ":" + g.id + ":" + layer;
    var cards = orderBySeen(lkey, L.cards);
    var i = 0;
    h('<section data-ice></section>');
    var box = app.querySelector("[data-ice]");
    function draw() {
      var last = layer === g.layers.length - 1;
      if (i >= cards.length) {
        box.innerHTML = '<div class="card"><p class="big">' +
          (last ? "Вы дошли до самой глубины. Теперь вы знаете друг друга чуть лучше 🤍" : "Слой пройден. Готовы нырнуть?") + "</p></div>" +
          (last ? '<button class="btn" data-up>Всплыть на верхушку</button>'
                : '<button class="btn" data-dive>Нырнуть: ' + esc(g.layers[layer + 1].name) + "</button>") +
          (layer > 0 ? '<button class="btn ghost" data-rise>Всплыть на слой выше</button>' : "") +
          '<button class="link" data-prev>← К последнему вопросу</button>';
      } else {
        box.innerHTML = '<div class="counter">' + (i + 1) + " / " + cards.length + "</div>" +
          '<div class="card flip">' + (isSeen(lkey, cards[i]) ? '<span class="seen">уже было</span>' : "") + '<p class="big">' + esc(cards[i]) + "</p></div>" +
          '<div class="row">' + (i > 0 ? '<button class="btn ghost" style="flex:0 0 56px" data-prev aria-label="Назад">←</button>' : "") + '<button class="btn ghost" data-skip>Пропустить</button><button class="btn" data-next>Дальше</button></div>' +
          (layer > 0 ? '<button class="link" data-rise>↑ Всплыть на слой выше</button>' : "");
      }
      bind();
    }
    function bind() {
      var q = function (s) { return box.querySelector(s); };
      if (q("[data-next]")) q("[data-next]").onclick = function () { markSeen(lkey, cards[i]); i++; haptic("light"); draw(); };
      if (q("[data-skip]")) q("[data-skip]").onclick = function () { i++; draw(); };
      if (q("[data-prev]")) q("[data-prev]").onclick = function () { i--; draw(); };
      if (q("[data-dive]")) q("[data-dive]").onclick = function () { dive(layer + 1); };
      if (q("[data-rise]")) q("[data-rise]").onclick = function () { go("iceberg", { game: g, setId: p.setId, layer: layer - 1 }, true); };
      if (q("[data-up]")) q("[data-up]").onclick = function () { go("iceberg", { game: g, setId: p.setId, layer: 0 }, true); };
    }
    function dive(next) {
      haptic("heavy");
      var ov = document.createElement("div");
      ov.className = "dive l" + next;
      ov.innerHTML = "<p>Вы " + (next === 1 ? "под водой" : "на глубине") + "</p><span>" + esc(g.layers[next].sub) + "</span>";
      document.body.appendChild(ov);
      timers.push(setTimeout(function () { ov.remove(); go("iceberg", { game: g, setId: p.setId, layer: next }, true); }, 1500));
    }
    draw();
  };

  function bergSvg() {
    return '<svg viewBox="0 0 300 220" aria-hidden="true">' +
      '<rect x="0" y="70" width="300" height="150" class="water"/>' +
      '<polygon points="150,10 190,70 110,70" class="ice top"/>' +
      '<polygon points="110,70 190,70 225,140 75,140" class="ice mid"/>' +
      '<polygon points="75,140 225,140 190,210 110,210" class="ice deep"/>' +
      '<line x1="0" y1="70" x2="300" y2="70" class="line"/></svg>';
  }

  // Кто из нас — голосуем пальцем
  screens.vote = function (p) {
    header(p.game.title, "На счёт три все показывают пальцем");
    deck({
      key: p.setId + ":" + p.game.id,
      cards: p.game.cards,
      prefix: p.game.prefix,
      action: "Голосуем! 3, 2, 1…",
      onAction: function () { countdown("Показывайте! 👉"); }
    });
  };

  // 10 из 10, но — все одновременно
  screens.tenBut = function (p) {
    header(p.game.title, "Все одновременно: 👍 беру или 👎 нет уж");
    deck({
      key: p.setId + ":" + p.game.id,
      cards: p.game.cards,
      action: "Решаем! 3, 2, 1…",
      onAction: function () { countdown("👍 или 👎?"); }
    });
  };

  screens.cards = function (p) {
    header(p.game.title, p.game.blurb);
    deck({ cards: p.game.cards, key: p.setId + ":" + p.game.id });
  };

  // Я никогда не… — кто делал, загибает палец
  screens.never = function (p) {
    header(p.game.title, "Кто делал — загибает палец");
    deck({
      key: p.setId + ":" + p.game.id,
      cards: p.game.cards,
      prefix: p.game.prefix,
      action: "3, 2, 1 — кто делал?",
      onAction: function () { countdown("Кто делал — загибайте палец ✋"); }
    });
  };

  // Правда или действие — ход по кругу
  screens.truthDare = function (p) {
    var g = p.game, base = p.setId + ":" + g.id;
    var decks = { t: { key: base + ":t", all: g.truth, name: "Правда" }, d: { key: base + ":d", all: g.dare, name: "Действие" } };
    decks.t.cards = orderBySeen(decks.t.key, g.truth); decks.d.cards = orderBySeen(decks.d.key, g.dare);
    decks.t.i = 0; decks.d.i = 0;
    var turn = 0, cur = null;
    header(g.title, "Ход по кругу: правда или действие");
    h('<section data-td></section>');
    var box = app.querySelector("[data-td]");
    function who() { return players.length ? players[turn % players.length] : ""; }
    function take(k) {
      var d = decks[k];
      if (d.i >= d.cards.length) { d.cards = orderBySeen(d.key, d.all); d.i = 0; }
      cur = { k: k, text: d.cards[d.i] }; d.i++;
      haptic("medium"); draw();
    }
    function draw() {
      var name = who();
      if (!cur) {
        box.innerHTML = '<div class="card"><p class="prefix">' + (name ? "Ходит" : "Выбирай") + '</p><p class="big">' + (name ? esc(name) : "Правда или действие?") + "</p></div>" +
          '<div class="row"><button class="btn ghost" data-pick="t">Правда</button><button class="btn" data-pick="d">Действие</button></div>';
        box.querySelectorAll("[data-pick]").forEach(function (b) { b.onclick = function () { take(b.getAttribute("data-pick")); }; });
        return;
      }
      var d = decks[cur.k];
      box.innerHTML = '<div class="card flip">' + (isSeen(d.key, cur.text) ? '<span class="seen">уже было</span>' : "") +
        '<p class="prefix">' + esc(d.name) + (name ? " · " + esc(name) : "") + '</p><p class="big">' + esc(cur.text) + "</p></div>" +
        '<button class="btn" data-done>' + (players.length ? "Готово — ход следующему" : "Готово") + "</button>" +
        '<button class="btn ghost" data-other>Другая карточка</button>';
      box.querySelector("[data-done]").onclick = function () { markSeen(d.key, cur.text); cur = null; turn++; haptic("light"); draw(); };
      box.querySelector("[data-other]").onclick = function () { take(cur.k); };
    }
    draw();
  };

  // Выбери число
  screens.number = function (p) {
    var g = p.game;
    var nkey = p.setId + ":" + g.id;
    var mapping = shuffle(g.cards);
    header(g.title, "Называй число — и выполняй");
    h('<div class="grid" data-grid></div><button class="btn ghost" data-reshuffle>Перемешать заново</button>');
    function draw() {
      app.querySelector("[data-grid]").innerHTML = mapping.map(function (_, i) {
        return '<button class="num' + (isSeen(nkey, mapping[i]) ? " used" : "") + '" data-n="' + i + '">' + (i + 1) + "</button>";
      }).join("");
      on("[data-n]", function (e) {
        var n = +e.currentTarget.getAttribute("data-n");
        markSeen(nkey, mapping[n]); haptic("medium");
        showSheet('<p class="prefix">Число ' + (n + 1) + '</p><p class="big">' + esc(mapping[n]) + "</p>", draw);
      });
    }
    on("[data-reshuffle]", function () { mapping = shuffle(g.cards); draw(); });
    draw();
  };

  function showSheet(inner, onClose) {
    var ov = document.createElement("div");
    ov.className = "sheet-wrap";
    ov.innerHTML = '<div class="sheet card flip">' + inner + '<button class="btn" data-close>Готово</button></div>';
    document.body.appendChild(ov);
    ov.querySelector("[data-close]").onclick = function () { ov.remove(); if (onClose) onClose(); };
  }

  // 5-4-3-2-1
  screens.countdownList = function (p) {
    var g = p.game;
    var ckey = p.setId + ":" + g.id;
    var order = orderBySeen(ckey, g.rounds.map(function (_, i) { return "r" + i; }));
    var rounds = order.map(function (id) { return g.rounds[+id.slice(1)]; });
    var r = 0;
    header(g.title, "60 секунд на весь раунд");
    h('<section data-r></section>');
    var box = app.querySelector("[data-r]");
    function draw() {
      clearTimers();
      if (r >= rounds.length) {
        box.innerHTML = '<div class="card"><p class="big">Все раунды сыграны 🎉</p></div><button class="btn" data-again>Ещё раз</button>';
        box.querySelector("[data-again]").onclick = function () { rounds = shuffle(g.rounds); order = []; r = 0; draw(); };
        return;
      }
      var nums = [5, 4, 3, 2, 1];
      box.innerHTML = '<div class="counter">Раунд ' + (r + 1) + " / " + rounds.length + "</div>" +
        '<div class="card"><ul class="five">' + rounds[r].map(function (t, i) {
          return "<li><b>" + nums[i] + "</b> " + esc(t) + "</li>";
        }).join("") + "</ul></div>" +
        '<div data-timer class="timer-slot"></div>' +
        '<div class="row">' + (r > 0 ? '<button class="btn ghost" style="flex:0 0 56px" data-prev>←</button>' : "") + '<button class="btn" data-go>Старт: 60 секунд</button><button class="btn ghost" data-next>Следующий</button></div>';
      box.querySelector("[data-go]").onclick = function (e) {
        e.currentTarget.disabled = true;
        if (order[r]) markSeen(ckey, order[r]);
        ring(box.querySelector("[data-timer]"), g.seconds);
      };
      box.querySelector("[data-next]").onclick = function () { r++; draw(); };
      if (r > 0) box.querySelector("[data-prev]").onclick = function () { r--; draw(); };
    }
    draw();
  };

  // Протестую!
  var scores = {};
  screens.debate = function (p) {
    var g = p.game;
    var topics = orderBySeen(p.setId + ":" + g.id, g.topics);
    var t = 0;
    header(g.title, "Жребий решает, кто за, а кто против");
    h('<section data-d></section>');
    var box = app.querySelector("[data-d]");

    function setup() {
      clearTimers();
      if (t >= topics.length) { topics = shuffle(g.topics); t = 0; }
      var pair = shuffle(players).slice(0, 2);
      var pro = pair[0], con = pair[1];
      box.innerHTML = '<div class="card flip"><p class="prefix">Тема</p><p class="big">' + esc(topics[t]) + "</p></div>" +
        '<div class="sides"><div class="side pro"><span>ЗА</span><b>' + esc(pro) + '</b></div>' +
        '<div class="side con"><span>ПРОТИВ</span><b>' + esc(con) + "</b></div></div>" +
        '<div class="row"><button class="btn ghost" data-reroll>Другая тема</button><button class="btn" data-begin>Начать дебаты</button></div>' +
        scoreboard();
      box.querySelector("[data-reroll]").onclick = function () { t++; setup(); };
      box.querySelector("[data-begin]").onclick = function () { run(pro, con, 0, 0); };
    }

    // stage: раунд, part: 0 — первый спикер, 1 — второй
    function run(pro, con, stage, part) {
      clearTimers();
      if (stage >= g.rounds.length) { vote(pro, con); return; }
      var R = g.rounds[stage];
      var who = R.both ? pro + " и " + con : (part === 0 ? pro : con);
      var secs = R.both || R.each;
      box.innerHTML = '<div class="counter">Раунд ' + (stage + 1) + " из " + g.rounds.length + " · " + esc(R.name) + "</div>" +
        '<div class="card"><p class="prefix">' + esc(topics[t]) + '</p><p class="big">Говорит: ' + esc(who) + "</p>" +
        (R.both ? '<p class="muted">Свободный спор, перебивать можно</p>' : "") + "</div>" +
        '<div data-timer class="timer-slot"></div><button class="btn ghost" data-skipround>Дальше</button>';
      var next = function () {
        if (!R.both && part === 0) run(pro, con, stage, 1);
        else run(pro, con, stage + 1, 0);
      };
      ring(box.querySelector("[data-timer]"), secs, function () { timers.push(setTimeout(next, 1200)); });
      box.querySelector("[data-skipround]").onclick = next;
    }

    function vote(pro, con) {
      box.innerHTML = '<div class="card"><p class="big">Судьи, кто убедительнее?</p><p class="muted">Голосуйте руками, победителя отметьте здесь</p></div>' +
        '<div class="row"><button class="btn" data-win="' + esc(pro) + '">' + esc(pro) + '</button><button class="btn" data-win="' + esc(con) + '">' + esc(con) + "</button></div>";
      box.querySelectorAll("[data-win]").forEach(function (b) {
        b.onclick = function () {
          var w = b.getAttribute("data-win");
          scores[w] = (scores[w] || 0) + 1;
          markSeen(p.setId + ":" + g.id, topics[t]);
          haptic("success");
          t++;
          setup();
        };
      });
    }

    function scoreboard() {
      var names = Object.keys(scores);
      if (!names.length) return "";
      return '<div class="score"><b>Счёт</b> ' + names.sort(function (a, b) { return scores[b] - scores[a]; })
        .map(function (n) { return esc(n) + " — " + scores[n]; }).join(" · ") + "</div>";
    }
    setup();
  };

  // Вместе
  screens.tasks = function (p) {
    var g = p.game;
    var tkey = p.setId + ":" + g.id;
    header(g.title, "Выбирайте число — за ним спрятано задание");
    h('<div class="grid" data-grid></div>');
    app.querySelector("[data-grid]").innerHTML = g.cards.map(function (c, i) {
      return '<button class="num' + (isSeen(tkey, c.text) ? " used" : "") + '" data-t="' + i + '">' + (i + 1) + "</button>";
    }).join("");
    on("[data-t]", function (e) {
      var n = +e.currentTarget.getAttribute("data-t");
      var c = g.cards[n];
      markSeen(tkey, c.text);
      haptic("medium");
      showSheet('<p class="prefix">Задание ' + (n + 1) + '</p><p class="big">' + esc(c.text) + "</p>", function () {
        if (c.flow) go(c.flow, p); else go("tasks", p, true);
      });
    });
  };

  // Анонимные вопросы: телефон по кругу
  screens.anon = function () {
    header("Анонимные вопросы", "Передавайте телефон по кругу");
    var qs = [];
    var k = 0;
    h('<section data-a></section>');
    var box = app.querySelector("[data-a]");
    function ask() {
      if (k >= players.length) { reveal(shuffle(qs), 0); return; }
      box.innerHTML = '<div class="card"><p class="prefix">Телефон у игрока</p><p class="big">' + esc(players[k]) + "</p>" +
        '<textarea maxlength="200" placeholder="Вопрос для всей компании…"></textarea></div>' +
        '<button class="btn" data-save>Спрятать и передать дальше</button>';
      box.querySelector("[data-save]").onclick = function () {
        var v = box.querySelector("textarea").value.trim();
        if (v) qs.push(v);
        k++; haptic("light"); ask();
      };
    }
    function reveal(list, i) {
      if (!list.length) { box.innerHTML = '<div class="card"><p class="big">Никто ничего не написал 🙈</p></div>'; return; }
      if (i >= list.length) { box.innerHTML = '<div class="card"><p class="big">Вопросы закончились 🎉</p></div>'; return; }
      box.innerHTML = '<div class="counter">' + (i + 1) + " / " + list.length + '</div><div class="card flip"><p class="big">' + esc(list[i]) + "</p></div>" +
        '<div class="row">' + (i > 0 ? '<button class="btn ghost" style="flex:0 0 56px" data-prev>←</button>' : "") + '<button class="btn" data-next>Следующий</button></div>';
      box.querySelector("[data-next]").onclick = function () { reveal(list, i + 1); };
      if (i > 0) box.querySelector("[data-prev]").onclick = function () { reveal(list, i - 1); };
    }
    ask();
  };

  // Пантомима: каждому тайно выдаётся, кого изображать (не себя)
  screens.mime = function () {
    header("Кого ты изображаешь", "Передавайте телефон по кругу");
    var targets = derange(players);
    var k = 0;
    h('<section data-m></section>');
    var box = app.querySelector("[data-m]");
    function step() {
      if (k >= players.length) {
        box.innerHTML = '<div class="card"><p class="big">Все знают свою роль. Показываем по очереди, остальные угадывают!</p></div>';
        return;
      }
      box.innerHTML = '<div class="card"><p class="prefix">Телефон у игрока</p><p class="big">' + esc(players[k]) + '</p><p class="muted">Остальные, не подглядывайте</p></div>' +
        '<button class="btn" data-show>Показать мне</button>';
      box.querySelector("[data-show]").onclick = function () {
        box.innerHTML = '<div class="card flip"><p class="prefix">Ты изображаешь</p><p class="big">' + esc(targets[k]) + "</p></div>" +
          '<button class="btn" data-hide>Запомнил(а), скрыть и передать</button>';
        box.querySelector("[data-hide]").onclick = function () { k++; step(); };
      };
    }
    step();
  };

  function derange(arr) {
    if (arr.length < 2) return arr.slice();
    var out;
    do { out = shuffle(arr); } while (out.some(function (v, i) { return v === arr[i]; }));
    return out;
  }

  // ---------- старт ----------
  var st = document.createElement("style");
  st.textContent = ".seen{display:inline-block;align-self:flex-start;font-size:12px;padding:3px 9px;border-radius:999px;background:var(--soft);color:var(--muted);margin-bottom:10px}" +
    ".prog{font-size:12px;font-weight:600;color:var(--accent);margin-left:6px}.prog.full{color:#3fbf7f}" +
    ".game.done,.task.done{opacity:.6}.task.done .n{color:#3fbf7f}.depth .seg{height:12px;cursor:pointer}.lay{cursor:pointer}.cover{display:flex;gap:8px;font-size:34px;padding:0 0 14px;flex-wrap:wrap}.cover.big-emoji{font-size:64px}.rules{margin:0 0 16px 20px;line-height:1.5;font-size:16px}.rules li{margin-bottom:6px}.card .rules{margin-bottom:0}";
  document.head.appendChild(st);
  if (tg && tg.initData) document.documentElement.classList.add("tg");
  if (tg) {
    tg.ready();
    tg.expand();
    document.documentElement.setAttribute("data-theme", tg.colorScheme === "light" ? "light" : "dark");
    tg.onEvent("themeChanged", function () {
      document.documentElement.setAttribute("data-theme", tg.colorScheme === "light" ? "light" : "dark");
    });
  }
  go("home");
})();
