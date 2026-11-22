(function () {
  'use strict';

  // ---- Configuration (single place to edit) ----
  var API_URL = 'https://script.google.com/macros/s/AKfycbyTH3sqC6vCKKcw2L7Azrd4sy1tjGz5U8W_q07KIlI_X6A3yOusi0OzNAsqeQlXKn_KQw/exec';
  var INITIALS = 'P&S';                // shown in the header circle
  var CONTACTS = 'Pierluca o Samantha';        // names shown in the Italian delivery note
  var TIMEOUT_MS = 15000;
  var LS_LANG = 'ln_lang';
  var LS_RESA = 'ln_resa';

  var state = { lang: 'fr', data: null, cat: null, onlyAvail: false };
  var $ = function (id) { return document.getElementById(id); };

  // ---- helpers ----
  function t(key) { return key.split('.').reduce(function (o, k) { return o && o[k]; }, window.I18N[state.lang]) || ''; }
  function fmt(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }
  function el(tag, props, kids) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'class') n.className = props[k];
      else if (k === 'text') n.textContent = props[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), props[k]);
      else n.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function safeUrl(u) { return /^https:\/\//i.test(String(u || '')) ? u : ''; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function pick(p, base) { return p[base + '_' + state.lang] || p[base + '_fr'] || ''; }

  function api(method, payload) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var opts = { signal: ctrl.signal };
    var url = API_URL;
    if (method === 'POST') {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
      opts.body = JSON.stringify(payload);
    } else {
      url += '?action=list';
    }
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('http');
      return r.json();
    }).finally(function () { clearTimeout(timer); });
  }

  // ---- language ----
  function initLang() {
    var saved = lsGet(LS_LANG);
    state.lang = saved === 'it' || saved === 'fr' ? saved :
      (/^it/i.test(navigator.language || '') ? 'it' : 'fr');
  }
  function setLang(l) {
    state.lang = l; lsSet(LS_LANG, l);
    state.cat = null;
    applyStatic(); render();
  }
  function applyStatic() {
    var L = window.I18N[state.lang];
    document.documentElement.lang = L.htmlLang;
    document.title = L.pageTitle;
    $('initials').textContent = INITIALS;
    $('heroTitle').textContent = L.heroTitle;
    var cfg = state.data && state.data.config;
    $('heroMessage').textContent = cfg ? (cfg['message_' + state.lang] || '') : '';
    ['how1', 'how2', 'how3'].forEach(function (k) { $(k).textContent = L[k]; });
    $('howTitle').textContent = L.howTitle;
    $('onlyAvailLabel').textContent = L.onlyAvailable;
    $('langSwitch').setAttribute('aria-label', L.langLabel);
    Array.prototype.forEach.call($('langSwitch').querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', b.dataset.lang === state.lang ? 'true' : 'false');
    });
  }

  // ---- theme (only present after reveal) ----
  function applyTheme(theme) {
    var root = document.documentElement;
    if (!theme) { root.removeAttribute('data-theme'); return; }
    var name = typeof theme === 'string' ? theme : theme.name;
    if (/^[a-z0-9-]{1,20}$/i.test(name || '')) root.setAttribute('data-theme', name);
    if (theme && typeof theme === 'object' && theme.vars) {
      Object.keys(theme.vars).forEach(function (k) {
        if (/^--[a-z0-9-]{1,30}$/.test(k) && /^#[0-9a-f]{3,8}$/i.test(String(theme.vars[k]))) root.style.setProperty(k, theme.vars[k]);
      });
    }
  }

  // ---- load ----
  function setStatus(msg, withRetry) {
    var s = $('status'); s.textContent = '';
    if (msg) s.appendChild(el('p', { text: msg }));
    if (withRetry) s.appendChild(el('button', { class: 'btn-outline', type: 'button', text: t('retry'), onclick: load }));
  }
  function load() {
    $('controls').hidden = true; $('grid').textContent = '';
    setStatus(t('loading'));
    api('GET').then(function (d) {
      if (!d || !d.ok) throw new Error('bad');
      state.data = d;
      setStatus('');
      applyTheme(d.config && d.config.theme);
      applyStatic(); render();
    }).catch(function () { setStatus(t('errorNetwork'), true); });
  }

  // ---- list rendering ----
  function status(p) {
    if (p.restant > 0) return null;
    var rs = p.reservations || [];
    var bought = rs.length > 0 && rs.every(function (r) { return r.statut === 'acheté'; });
    return { bought: bought, names: rs.map(function (r) { return r.nom; }).join(', ') };
  }
  function render() {
    if (!state.data) return;
    var cfg = state.data.config || {};
    var prods = state.data.products || [];
    var grid = $('grid'); grid.textContent = '';
    if (cfg.liste_ouverte === false) setStatus(t('closedList')); else if (!$('status').querySelector('button')) setStatus('');

    // chips
    var cats = [];
    prods.forEach(function (p) { var c = pick(p, 'categorie'); if (c && cats.indexOf(c) < 0) cats.push(c); });
    var chips = $('chips'); chips.textContent = '';
    [null].concat(cats).forEach(function (c) {
      var b = el('button', { class: 'chip', type: 'button', role: 'tab', text: c === null ? t('all') : c,
        'aria-selected': state.cat === c ? 'true' : 'false', onclick: function () { state.cat = c; render(); } });
      chips.appendChild(b);
    });

    var left = prods.filter(function (p) { return p.restant > 0; }).length;
    $('counter').textContent = fmt(t('counter'), { total: prods.length, left: left });
    $('controls').hidden = false;

    var shown = prods.filter(function (p) {
      if (state.cat !== null && pick(p, 'categorie') !== state.cat) return false;
      if (state.onlyAvail && p.restant <= 0) return false;
      return true;
    });
    if (!shown.length) { grid.appendChild(el('p', { class: 'status', text: t('empty') })); return; }
    shown.forEach(function (p) { grid.appendChild(card(p, cfg.liste_ouverte !== false)); });
  }

  function card(p, open) {
    var st = status(p);
    var img = safeUrl(p.image_url);
    var thumb = img ? el('img', { class: 'thumb', src: img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
                    : el('div', { class: 'thumb' });
    var meta = [];
    if (p.prix_indicatif) meta.push(fmt(t('priceFrom'), { price: String(p.prix_indicatif).replace('.', state.lang === 'fr' || state.lang === 'it' ? ',' : '.') }));
    if (p.quantite > 1 && p.restant > 0) meta.push(fmt(t('remaining'), { n: p.restant }));
    var foot = el('div', { class: 'card-foot' });
    if (st) {
      foot.appendChild(el('span', { class: 'badge ' + (st.bought ? 'offered' : 'resa'), text: st.bought ? t('badgeOffered') : t('badgeReserved') }));
      if (st.names) foot.appendChild(el('span', { class: 'meta', text: fmt(t('offeredBy'), { name: st.names }) }));
    } else if (open) {
      foot.appendChild(el('button', { class: 'btn-outline', type: 'button', text: t('offer'), onclick: function () { openSheet(p); } }));
    }
    return el('article', { class: 'card' + (st ? ' unavail' : '') }, [
      thumb,
      el('div', { class: 'card-body' }, [
        el('span', { class: 'shop', text: p.boutique || '' }),
        el('span', { class: 'pname', text: pick(p, 'nom') }),
        meta.length ? el('span', { class: 'meta', text: meta.join(' · ') }) : null,
        foot
      ])
    ]);
  }

  // ---- booking sheet ----
  var lastFocus = null;
  function closeSheet(reload) {
    $('overlay').hidden = true; $('sheet').textContent = '';
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    if (reload) load();
  }
  function head(p) {
    var img = safeUrl(p.image_url);
    return el('div', { class: 'sheet-head' }, [
      img ? el('img', { class: 'thumb', src: img, alt: '', referrerpolicy: 'no-referrer' }) : el('div', { class: 'thumb' }),
      el('div', {}, [el('span', { class: 'shop', text: p.boutique || '' }), el('div', { class: 'pname', text: pick(p, 'nom') })])
    ]);
  }
  function showSheet(nodes) {
    var sheet = $('sheet'); sheet.textContent = '';
    sheet.appendChild(el('div', { class: 'handle' }));
    nodes.forEach(function (n) { sheet.appendChild(n); });
    $('overlay').hidden = false; document.body.style.overflow = 'hidden';
  }
  function errText(e) {
    var map = window.I18N[state.lang].errors;
    var code = e && e.error || e && e.code || 'generic';
    return fmt(map[code] || map.generic, { restant: e && e.restant });
  }

  function openSheet(p) {
    lastFocus = document.activeElement;
    var qty = 1, max = Math.min(p.restant, 20);
    var name = el('input', { id: 'f_name', type: 'text', maxlength: '60', autocomplete: 'given-name', required: 'required' });
    var email = el('input', { id: 'f_email', type: 'email', autocomplete: 'email', required: 'required', inputmode: 'email' });
    var hp = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    var err = el('p', { class: 'err', role: 'alert' });
    var submit = el('button', { class: 'btn-primary', type: 'submit', text: t('submit') });

    var kids = [head(p)];
    var form = el('form', { novalidate: 'novalidate' }, [
      el('div', { class: 'field' }, [el('label', { for: 'f_name', text: t('name') }), name]),
      el('div', { class: 'field' }, [el('label', { for: 'f_email', text: t('email') }), email, el('span', { class: 'hint', text: t('emailHint') })]),
      el('div', { class: 'hp' }, [hp])
    ]);
    if (p.restant > 1) {
      var out = el('output', { text: '1' });
      var minus = el('button', { type: 'button', 'aria-label': t('decrease'), text: '−' });
      var plus = el('button', { type: 'button', 'aria-label': t('increase'), text: '+' });
      var sync = function () { out.textContent = String(qty); minus.disabled = qty <= 1; plus.disabled = qty >= max; };
      minus.addEventListener('click', function () { if (qty > 1) { qty--; sync(); } });
      plus.addEventListener('click', function () { if (qty < max) { qty++; sync(); } });
      sync();
      form.appendChild(el('div', { class: 'field' }, [el('label', { text: t('quantity') }), el('div', { class: 'stepper' }, [minus, out, plus])]));
    }
    if (state.lang === 'it' && t('deliveryNote')) {
      form.appendChild(el('div', { class: 'info', text: fmt(t('deliveryNote'), { contacts: CONTACTS }) }));
    }
    form.appendChild(err);
    form.appendChild(el('div', { class: 'actions' }, [submit, el('button', { class: 'btn-link', type: 'button', text: t('close'), onclick: function () { closeSheet(false); } })]));
    kids.push(form);
    showSheet(kids);
    name.focus();

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.textContent = '';
      var n = name.value.trim(), m = email.value.trim();
      if (!n || /[<>]/.test(n) || n.length > 60) { err.textContent = errText({ error: 'invalid_name' }); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) { err.textContent = errText({ error: 'invalid_email' }); return; }
      submit.disabled = true; submit.textContent = t('sending');
      api('POST', { action: 'reserve', product_id: p.id, produit_id: p.id, quantite: qty, nom: n, email: m, langue: state.lang, website: hp.value })
        .then(function (r) {
          if (!r || !r.ok) { err.textContent = errText(r); submit.disabled = false; submit.textContent = t('submit'); if (r && (r.error === 'sold_out' || r.error === 'not_enough')) load(); return; }
          saveToken(p, r);
          showDone(p, n, r);
        })
        .catch(function () { err.textContent = errText({ error: 'network' }); submit.disabled = false; submit.textContent = t('submit'); });
    });
  }

  function saveToken(p, r) {
    var list = [];
    try { list = JSON.parse(lsGet(LS_RESA) || '[]'); } catch (e) { list = []; }
    list.push({ id: r.id_resa, token: r.token, product: p.id });
    lsSet(LS_RESA, JSON.stringify(list.slice(-30)));
  }

  function showDone(p, name, r) {
    var msg = el('p', { text: t('thanksText') });
    var shop = safeUrl(p.url);
    var tick = el('div', { class: 'tick', 'aria-hidden': 'true' });
    tick.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    var info = el('p', { class: 'err', role: 'alert' });
    var actions = el('div', { class: 'actions' });
    if (shop) actions.appendChild(el('a', { class: 'btn-primary', href: shop, target: '_blank', rel: 'noopener noreferrer', text: fmt(t('goToShop'), { shop: p.boutique || '' }) }));
    var bought = el('button', { class: 'btn-outline', type: 'button', text: t('iBoughtIt'), onclick: function () {
      bought.disabled = true;
      api('POST', { action: 'confirm', token: r.token }).then(function (x) {
        if (x && x.ok) { msg.textContent = t('boughtOk'); bought.hidden = true; cancel.hidden = true; } else { info.textContent = errText(x); bought.disabled = false; }
      }).catch(function () { info.textContent = errText({ error: 'network' }); bought.disabled = false; });
    } });
    var cancel = el('button', { class: 'btn-link', type: 'button', text: t('cancelResa'), onclick: function () {
      cancel.disabled = true;
      api('POST', { action: 'cancel', token: r.token }).then(function (x) {
        if (x && x.ok) { closeSheet(true); } else { info.textContent = errText(x); cancel.disabled = false; }
      }).catch(function () { info.textContent = errText({ error: 'network' }); cancel.disabled = false; });
    } });
    actions.appendChild(bought); actions.appendChild(cancel);
    actions.appendChild(el('button', { class: 'btn-link', type: 'button', text: t('close'), onclick: function () { closeSheet(true); } }));
    showSheet([head(p), el('div', { class: 'done' }, [tick, el('h2', { text: fmt(t('thanks'), { name: name }) }), msg, info, actions])]);
  }

  // ---- init ----
  document.addEventListener('DOMContentLoaded', function () {
    initLang(); applyStatic();
    Array.prototype.forEach.call($('langSwitch').querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () { setLang(b.dataset.lang); });
    });
    $('onlyAvail').addEventListener('change', function (e) { state.onlyAvail = e.target.checked; render(); });
    $('overlay').addEventListener('click', function (e) { if (e.target === $('overlay')) closeSheet(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('overlay').hidden) closeSheet(false); });
    load();
  });
})();
