(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const PHONE = '<a href="tel:+420519425986">519 425 986</a>';
  const KEY = "autotrim-kosik";
  const money = new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 });
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const plural = (n, a, b, c) => (n === 1 ? a : n >= 2 && n <= 4 ? b : c);

  // ilustrace zboží posílá PHP v <template id="ill-…"> (_sablona/katalog.php)
  const ill = (k) => document.getElementById("ill-" + k)?.innerHTML || "";

  /* ---------- košík v prohlížeči (nemusí být dostupné úložiště) ---------- */
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  const saveCart = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {} };

  const state = { cat: "vse", sel: {}, stock: false, q: "" };
  let data = null, byId = {}, cats = {};

  const tabsEl = $("[data-tabs]"), facetsEl = $("[data-facets]"), prodsEl = $("[data-prods]");
  const emptyEl = $("[data-empty]"), countEl = $("[data-count-text]"), searchEl = $("[data-search]");

  function poptavkaUrl(skupina, dil) {
    const q = new URLSearchParams();
    if (skupina) q.set("skupina", skupina);
    if (dil) q.set("dil", dil);
    return `index.html?${q}#poptavka`;
  }

  /* ---------- filtrování ---------- */
  function matches(p, skip) {
    if (state.cat !== "vse" && p.kat !== state.cat) return false;
    if (state.stock && p.sklad < 1) return false;
    for (const [f, set] of Object.entries(state.sel)) {
      if (f === skip || !set.size) continue;
      if (!(p.filtry[f] || []).some((v) => set.has(v))) return false;
    }
    if (state.q) {
      const hay = norm([p.znacka, p.nazev, p.kratce, ...Object.values(p.parametry)].join(" "));
      if (!norm(state.q).split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  function renderTabs() {
    const n = (id) => data.produkty.filter((p) => id === "vse" || p.kat === id).length;
    tabsEl.innerHTML = [{ id: "vse", nazev: "Vše" }, ...data.kategorie]
      .map((c) => `<button type="button" class="tab" data-cat="${c.id}" aria-pressed="${state.cat === c.id}">${esc(c.nazev)} <small>${n(c.id)}</small></button>`)
      .join("");
  }

  function renderFacets() {
    const c = cats[state.cat];
    let html = "";
    if (c) {
      for (const f of c.filtry) {
        const counts = new Map();
        data.produkty.filter((p) => p.kat === c.id).forEach((p) => (p.filtry[f.id] || []).forEach((v) => counts.set(v, 0)));
        data.produkty.filter((p) => matches(p, f.id)).forEach((p) => (p.filtry[f.id] || []).forEach((v) => counts.set(v, counts.get(v) + 1)));
        const set = state.sel[f.id] || new Set();
        const vals = [...counts.keys()].sort((a, b) => a.localeCompare(b, "cs", { numeric: true }));
        html += `<div class="facet"><h3>${esc(f.nazev)}</h3><div class="chips">${vals
          .map((v) => `<button type="button" class="chip" data-f="${f.id}" data-v="${esc(v)}" aria-pressed="${set.has(v)}">${esc(v)} <small>${counts.get(v)}</small></button>`)
          .join("")}</div></div>`;
      }
    }
    html += `<div class="facet"><label class="check"><input type="checkbox" data-stock ${state.stock ? "checked" : ""}><span>Jen zboží skladem</span></label></div>`;
    const active = state.stock || Object.values(state.sel).some((s) => s.size);
    if (active) html += `<button type="button" class="link-btn facets__reset" data-reset>Zrušit filtry</button>`;
    html += c
      ? `<div class="advice"><b>Nevíte, co vybrat?</b><p>${esc(c.rada)}</p><a class="link-btn" href="${poptavkaUrl(c.poptavka.skupina, c.poptavka.dil)}">Poptat přes formulář <span aria-hidden="true">→</span></a></div>`
      : `<div class="advice"><b>Hledáte jiný díl?</b><p>Brzdy, filtry nebo díly motoru dohledáme přesně pro vaše auto.</p><a class="link-btn" href="index.html#poptavka">Poptat přes formulář <span aria-hidden="true">→</span></a></div>`;
    facetsEl.innerHTML = html;
  }

  function availHtml(p) {
    if (p.sklad < 1) return `<span class="avail is-out">Není skladem</span>`;
    if (p.sklad === 1) return `<span class="avail is-low">Poslední kus</span>`;
    return `<span class="avail">Skladem ${p.sklad > 5 ? "5+" : p.sklad} ks</span>`;
  }

  function actionHtml(p) {
    if (p.sklad < 1) {
      return `<div class="prod__out">Na objednávku obvykle do druhého dne.<a class="link-btn" href="${poptavkaUrl(cats[p.kat].poptavka.skupina, `${p.znacka} ${p.nazev}`)}">Poptat</a></div>`;
    }
    const n = cart[p.id] || 0;
    if (!n) return `<button type="button" class="btn btn--main" data-add="${p.id}">Do košíku</button>`;
    return `<div class="qty" role="group" aria-label="Počet kusů v košíku: ${esc(p.nazev)}">
      <button type="button" data-dec="${p.id}" aria-label="Ubrat kus">−</button>
      <output aria-live="polite">${n} v košíku</output>
      <button type="button" data-inc="${p.id}" aria-label="Přidat kus" ${n >= p.sklad ? "disabled" : ""}>+</button></div>`;
  }

  function prodHtml(p) {
    const specs = Object.entries(p.parametry).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
    return `<article class="prod" data-id="${p.id}">
      <a class="prod__img" href="produkt-${encodeURIComponent(p.id)}.html" tabindex="-1" aria-hidden="true">${ill(cats[p.kat].ill)}</a>
      <div class="prod__body">
        <p class="prod__brand">${esc(p.znacka)}</p>
        <h3 class="prod__name"><a href="produkt-${encodeURIComponent(p.id)}.html">${esc(p.nazev)}</a></h3>
        <p class="prod__short">${esc(p.kratce)}</p>
        <dl class="prod__specs">${specs}</dl>
        <div class="prod__foot"><b class="prod__price">${money.format(p.cena)}</b>${availHtml(p)}</div>
        <div data-act>${actionHtml(p)}</div>
      </div>
    </article>`;
  }

  function renderProds() {
    const list = data.produkty.filter((p) => matches(p)).sort((a, b) => (b.sklad > 0) - (a.sklad > 0));
    prodsEl.innerHTML = list.map(prodHtml).join("");
    emptyEl.hidden = list.length > 0;
    countEl.textContent = `${list.length} ${plural(list.length, "položka", "položky", "položek")}`;
  }

  function renderAll() { renderTabs(); renderFacets(); renderProds(); }

  /* ---------- košík ---------- */
  const dlg = $("[data-cart]"), listEl = $("[data-cart-list]"), sumEl = $("[data-cart-sum]");
  const order = $("[data-order]"), done = $("[data-done]"), body = $("[data-cart-body]");
  const msg = $("[data-msg]"), submit = $("[data-submit]");

  const items = () => Object.entries(cart).filter(([id, n]) => byId[id] && n > 0).map(([id, n]) => ({ p: byId[id], n }));
  const total = () => items().reduce((s, { p, n }) => s + p.cena * n, 0);

  function setQty(id, n, focusSel) {
    const p = byId[id];
    if (!p) return;
    n = Math.max(0, Math.min(n, p.sklad));
    if (n) cart[id] = n; else delete cart[id];
    saveCart();
    const box = $(`[data-id="${id}"] [data-act]`);
    if (box) {
      box.innerHTML = actionHtml(p);
      if (focusSel) (box.querySelector(focusSel) || box.querySelector("button"))?.focus();
    }
    renderCart();
  }

  function renderCart() {
    const its = items();
    const count = its.reduce((s, i) => s + i.n, 0);
    const sum = total();
    $$("[data-count]").forEach((c) => { c.textContent = count; c.hidden = !count; });
    const head = $(".head__cart");
    head.setAttribute("aria-label", count ? `Košík, ${count} ${plural(count, "kus", "kusy", "kusů")}, ${money.format(sum)}` : "Košík, prázdný");
    $("[data-dock-text]").textContent = count ? `Košík · ${count} ks · ${money.format(sum)}` : "Košík";
    $("[data-dock]").classList.toggle("is-on", count > 0);
    document.body.classList.toggle("has-items", count > 0);

    $("[data-cart-empty]").hidden = its.length > 0;
    sumEl.hidden = order.hidden = !its.length;
    $("[data-cart-total]").textContent = money.format(sum);
    listEl.innerHTML = its.map(({ p, n }) => `<li class="cart__item" data-id="${p.id}">
      <div><b>${esc(p.znacka)} ${esc(p.nazev)}</b><small>${esc(p.kratce)} · ${money.format(p.cena)}/ks</small></div>
      <span class="cart__price">${money.format(p.cena * n)}</span>
      <div class="cart__row">
        <div class="qty qty--sm" role="group" aria-label="Počet kusů">
          <button type="button" data-dec="${p.id}" aria-label="Ubrat kus">−</button>
          <output>${n}</output>
          <button type="button" data-inc="${p.id}" aria-label="Přidat kus" ${n >= p.sklad ? "disabled" : ""}>+</button>
        </div>
        <button type="button" class="cart__rm" data-rm="${p.id}">Odebrat</button>
      </div></li>`).join("");
  }

  function bump() {
    const h = $(".head__cart");
    if (reduce.matches) return;
    h.classList.remove("is-bump"); void h.offsetWidth; h.classList.add("is-bump");
  }

  function openCart() {
    if (!dlg.open) dlg.showModal();
  }
  function closeCart() {
    dlg.close();
  }
  dlg.addEventListener("close", () => {
    if (!done.hidden) { done.hidden = true; body.hidden = false; }
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeCart(); });

  /* ---------- události ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    const d = t.dataset;
    if (d.cat) {
      state.cat = d.cat; state.sel = {};
      history.replaceState(null, "", d.cat === "vse" ? location.pathname : `#${d.cat}`);
      renderAll();
      $(`[data-cat="${d.cat}"]`).focus();
    } else if (d.f) {
      const set = (state.sel[d.f] ||= new Set());
      set.has(d.v) ? set.delete(d.v) : set.add(d.v);
      renderFacets(); renderProds();
      $(`[data-f="${d.f}"][data-v="${CSS.escape(d.v)}"]`)?.focus();
    } else if ("reset" in d) {
      state.sel = {}; state.stock = false;
      renderFacets(); renderProds();
      facetsEl.querySelector("button, input")?.focus();
    } else if (d.add) {
      setQty(d.add, 1, "[data-inc]"); bump();
    } else if (d.inc) {
      setQty(d.inc, (cart[d.inc] || 0) + 1, "[data-inc]"); bump();
      if (t.closest(".cart")) listEl.querySelector(`[data-id="${d.inc}"] [data-inc]`)?.focus();
    } else if (d.dec) {
      setQty(d.dec, (cart[d.dec] || 0) - 1, "[data-dec]");
      if (t.closest(".cart")) (listEl.querySelector(`[data-id="${d.dec}"] [data-dec]`) || $(".cart__x")).focus();
    } else if (d.rm) {
      setQty(d.rm, 0);
      (listEl.querySelector("[data-rm]") || $(".cart__x")).focus();
    } else if ("cartOpen" in d) {
      openCart();
    } else if ("cartClose" in d) {
      closeCart();
    }
  });
  facetsEl?.addEventListener("change", (e) => {
    if (e.target.matches("[data-stock]")) { state.stock = e.target.checked; renderFacets(); renderProds(); $("[data-stock]").focus(); }
  });
  let qt;
  searchEl?.addEventListener("input", () => {
    clearTimeout(qt);
    qt = setTimeout(() => { state.q = searchEl.value.trim(); renderFacets(); renderProds(); }, 120);
  });
  addEventListener("hashchange", () => {
    if (!prodsEl) return;
    const id = location.hash.slice(1);
    if (cats[id] && id !== state.cat) { state.cat = id; state.sel = {}; renderAll(); }
  });

  /* ---------- objednávka ---------- */
  const ts = $("[data-ts]");
  const MESSAGES = {
    jmeno: "Vyplňte jméno.",
    telefon: "Zadejte telefon, na kterém vás zastihneme.",
    email: "E-mail nemá správný tvar.",
    souhlas: "Bez souhlasu nemůžeme objednávku zpracovat.",
  };
  function setError(name, text) {
    const el = order.elements[name];
    if (!el) return;
    const box = el.closest(".field, .check");
    box.classList.add("is-bad");
    el.setAttribute("aria-invalid", "true");
    if (box.classList.contains("field") && !box.querySelector(".field__err")) {
      const s = document.createElement("span");
      s.className = "field__err"; s.id = "err-" + name; s.textContent = text;
      box.appendChild(s);
      el.setAttribute("aria-describedby", s.id);
    }
  }
  function clearError(el) {
    const box = el.closest(".field, .check");
    if (!box) return;
    box.classList.remove("is-bad");
    el.removeAttribute("aria-invalid");
    box.querySelector(".field__err")?.remove();
  }
  function validate() {
    const v = (n) => (order.elements[n].value || "").trim();
    const bad = [];
    if (!v("jmeno")) bad.push("jmeno");
    if ((v("telefon").match(/\d/g) || []).length < 9) bad.push("telefon");
    if (v("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) bad.push("email");
    if (!order.elements.souhlas.checked) bad.push("souhlas");
    return bad;
  }
  const showMsg = (html) => { msg.innerHTML = html; msg.hidden = false; };

  order.addEventListener("input", (e) => clearError(e.target));
  order.addEventListener("change", (e) => clearError(e.target));
  order.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.hidden = true;
    $$(".is-bad", order).forEach((b) => b.classList.remove("is-bad"));
    $$(".field__err", order).forEach((x) => x.remove());
    const bad = validate();
    if (bad.length) {
      bad.forEach((n) => setError(n, MESSAGES[n]));
      showMsg("Zkontrolujte prosím označená pole.");
      order.elements[bad[0]].focus();
      return;
    }
    $("[data-items]").value = JSON.stringify(items().map(({ p, n }) => ({ id: p.id, ks: n })));
    submit.disabled = true;
    submit.textContent = "Odesílám…";
    try {
      const res = await fetch(order.action, { method: "POST", body: new FormData(order), headers: { Accept: "application/json" } });
      const r = await res.json().catch(() => null);
      if (res.ok && r && r.ok) {
        cart = {}; saveCart();
        order.reset();
        if (ts) ts.value = String(Date.now());
        renderCart();
        if (prodsEl) renderProds();
        $$(".pdp__info[data-id]").forEach((el) => { if (byId[el.dataset.id]) $("[data-act]", el).innerHTML = actionHtml(byId[el.dataset.id]); });
        $("[data-done-id]").textContent = r.id || "";
        body.hidden = true;
        done.hidden = false;
        done.focus();
        return;
      }
      if (r && r.errors) {
        Object.keys(r.errors).forEach((n) => setError(n, r.errors[n]));
        showMsg(esc(r.message || "Zkontrolujte prosím označená pole."));
      } else {
        showMsg((r && esc(r.message)) || `Objednávku se nepodařilo odeslat. Zkuste to prosím znovu, nebo zavolejte na ${PHONE}.`);
      }
    } catch (err) {
      showMsg(`Objednávku se nepodařilo odeslat (chyba spojení). Zavolejte nám prosím na ${PHONE}.`);
    } finally {
      submit.disabled = false;
      submit.textContent = "Objednat k vyzvednutí";
    }
  });

  /* ---------- zboží: PHP ho vkládá do stránky (katalog z Google Tabulky) ---------- */
  try {
    data = JSON.parse($("#katalog-data").textContent);
    data.kategorie.forEach((c) => (cats[c.id] = c));
    data.produkty.forEach((p) => (byId[p.id] = p));
    // košík může obsahovat zboží, které mezitím zmizelo nebo ho je méně
    Object.keys(cart).forEach((id) => { if (!byId[id] || byId[id].sklad < 1) delete cart[id]; else cart[id] = Math.min(cart[id], byId[id].sklad); });
    saveCart();
    const h = location.hash.slice(1);
    if (cats[h]) state.cat = h;
    if (prodsEl) renderAll();
    // podstránka produktu: tlačítko podle stavu košíku
    $$(".pdp__info[data-id]").forEach((el) => { if (byId[el.dataset.id]) $("[data-act]", el).innerHTML = actionHtml(byId[el.dataset.id]); });
    renderCart();
  } catch (err) {
    if (prodsEl) countEl.innerHTML = `Zboží se nepodařilo načíst. Obnovte prosím stránku, nebo zavolejte na ${PHONE}.`;
  }

  if (ts) ts.value = String(Date.now());
  const y = $("[data-year]");
  if (y) y.textContent = new Date().getFullYear();
})();
