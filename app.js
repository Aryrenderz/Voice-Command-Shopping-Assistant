// ==========================================================================
// app.js — application state, rendering and event wiring
// ==========================================================================

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  const state = {
    lang: 'en-IN',
    cart: {},               // { productId: quantity }
    activeCategory: 'all',
    searchQuery: '',
    priceMax: null,
    sortBy: 'relevance',
    lastMatchIds: [],        // ids from the most recent voice/text command, for "did you mean"
    history: loadHistory(),  // { productId: timesAdded } persisted across sessions
  };

  const CATEGORY_ICONS = {
    'Beverages': '🥤',
    'Bakery, Cakes & Dairy': '🥛',
    'Foodgrains, Oil & Masala': '🌾',
    'Snacks & Branded Foods': '🍪',
    'Fruits & Vegetables': '🍅',
    'Eggs, Meat & Fish': '🥚',
    'Gourmet & World Food': '🍯',
  };

  // deterministic pseudo-stock flags so the demo is stable across reloads
  function stockStatus(id) {
    if (id % 17 === 0) return 'out';
    if (id % 7 === 0) return 'low';
    return 'in';
  }

  // Every unit in this catalog is sold as a single retail pack, so quantity
  // is always expressed as "N pack(s)" rather than a bare number — this is
  // shown wherever a quantity appears (product cards, cart lines, the
  // add-confirmation dialog).
  function packLabel(qty) {
    if (state.lang === 'hi-IN') return `${qty} ${t('pack', state.lang)}`;
    return `${qty} ${qty === 1 ? t('pack', state.lang) : t('packs', state.lang)}`;
  }

  // simple seasonal calendar (by month, 0-indexed) -> keywords found in produce names
  const SEASONAL_CALENDAR = {
    winter: { months: [10, 11, 0, 1], keywords: ['orange', 'guava', 'carrot', 'spinach', 'peas', 'strawberr'] },
    summer: { months: [2, 3, 4, 5], keywords: ['mango', 'watermelon', 'muskmelon', 'cucumber', 'lychee'] },
    monsoon: { months: [6, 7, 8, 9], keywords: ['corn', 'jamun', 'pear', 'plum', 'apple'] },
  };
  function currentSeasonKeywords() {
    const month = new Date().getMonth();
    for (const s of Object.values(SEASONAL_CALENDAR)) {
      if (s.months.includes(month)) return s.keywords;
    }
    return [];
  }
  function isSeasonal(product) {
    if (product.category !== 'Fruits & Vegetables') return false;
    const kws = currentSeasonKeywords();
    const name = product.name.toLowerCase();
    return kws.some(k => name.includes(k));
  }

  // "frequently bought together" — hand-picked pairs relevant to Indian kitchens
  const PAIR_SUGGESTIONS = {
    'Dairy': ['Tea', 'Coffee', 'Breakfast Cereals'],
    'Tea': ['Dairy', 'Biscuits & Cookies'],
    'Coffee': ['Dairy', 'Biscuits & Cookies'],
    'Breads & Buns': ['Dairy', 'Spreads, Sauces, Ketchup'],
    'Rice & Rice Products': ['Dals & Pulses', 'Masalas & Spices'],
    'Dals & Pulses': ['Rice & Rice Products', 'Masalas & Spices'],
    'Atta, Flours & Sooji': ['Edible Oils & Ghee', 'Dals & Pulses'],
    'Fresh Vegetables': ['Masalas & Spices', 'Edible Oils & Ghee'],
    'Noodle, Pasta, Vermicelli': ['Spreads, Sauces, Ketchup'],
    'Eggs': ['Bread', 'Breads & Buns'],
  };

  function loadHistory() {
    try {
      const raw = localStorage.getItem('bolbasket_history');
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveHistory() {
    try { localStorage.setItem('bolbasket_history', JSON.stringify(state.history)); }
    catch (e) { /* storage unavailable — fail silently, app still works */ }
  }

  const productById = new Map(PRODUCTS.map(p => [p.id, p]));

  // ---------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------
  const $ = sel => document.querySelector(sel);
  const micButton = $('#micButton');
  const homeButton = $('#homeButton');
  const brandHomeButton = $('#brandHomeButton');
  const micStatus = $('#micStatus');
  const ticker = $('#tickerInner');
  const cmdForm = $('#commandForm');
  const cmdInput = $('#commandInput');
  const categoryChips = $('#categoryChips');
  const maxPriceInput = $('#maxPrice');
  const sortSelect = $('#sortSelect');
  const productGrid = $('#productGrid');
  const emptyState = $('#emptyState');
  const resultsHeading = $('#resultsHeading');
  const resultsCount = $('#resultsCount');
  const suggestionsSection = $('#suggestionsSection');
  const suggestionScroll = $('#suggestionScroll');
  const cartDrawer = $('#cartDrawer');
  const cartOverlay = $('#cartOverlay');
  const cartToggle = $('#cartToggle');
  const cartClose = $('#cartClose');
  const cartItemsEl = $('#cartItems');
  const cartEmptyMsg = $('#cartEmptyMsg');
  const cartCountEl = $('#cartCount');
  const cartSubtotalEl = $('#cartSubtotal');
  const cartTaxEl = $('#cartTax');
  const cartTotalEl = $('#cartTotal');
  const clearCartBtn = $('#clearCartBtn');
  const checkoutBtn = $('#checkoutBtn');
  const checkoutOverlay = $('#checkoutOverlay');
  const checkoutModal = $('#checkoutModal');
  const checkoutCard = $('#checkoutCard');
  const confirmOverlay = $('#confirmOverlay');
  const confirmAddModal = $('#confirmAddModal');
  const confirmAddCard = $('#confirmAddCard');
  const toastHost = $('#toastHost');

  // ---------------------------------------------------------------------
  // Toast + ticker feedback ("visual feedback" requirement)
  // ---------------------------------------------------------------------
  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast-error' : '');
    el.textContent = msg;
    toastHost.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function logToTicker(msg, cls) {
    const line = document.createElement('span');
    line.className = 'ticker-item' + (cls ? ' ' + cls : '');
    line.textContent = msg;
    ticker.prepend(line);
    while (ticker.children.length > 6) ticker.removeChild(ticker.lastChild);
  }

  // ---------------------------------------------------------------------
  // Category chips
  // ---------------------------------------------------------------------
  function renderChips() {
    const categories = ['all', ...new Set(PRODUCTS.map(p => p.category))];
    categoryChips.innerHTML = '';
    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (state.activeCategory === cat ? ' is-active' : '');
      btn.type = 'button';
      btn.dataset.tagIcon = cat === 'all' ? '🛒' : (CATEGORY_ICONS[cat] || '•');
      btn.textContent = cat === 'all' ? t('all', state.lang) : cat;
      btn.addEventListener('click', () => {
        state.activeCategory = cat;
        renderChips();
        renderCatalog();
      });
      categoryChips.appendChild(btn);
    });
  }

  // ---------------------------------------------------------------------
  // Catalog filtering + rendering
  // ---------------------------------------------------------------------
  function getFilteredProducts() {
    let list = PRODUCTS.slice();
    if (state.activeCategory !== 'all') {
      list = list.filter(p => p.category === state.activeCategory);
    }
    if (state.searchQuery) {
      const cmd = parseCommand(state.searchQuery);
      const matches = findBestMatches(PRODUCTS, cmd, 60);
      const matchIds = new Set(matches.map(p => p.id));
      list = list.filter(p => matchIds.has(p.id));
      // preserve relevance order when a search is active and sort is 'relevance'
      if (state.sortBy === 'relevance') {
        const order = matches.map(p => p.id);
        list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      }
    }
    if (state.priceMax != null && !isNaN(state.priceMax)) {
      list = list.filter(p => p.price <= state.priceMax);
    }
    if (state.sortBy === 'price-asc') list.sort((a, b) => a.price - b.price);
    if (state.sortBy === 'price-desc') list.sort((a, b) => b.price - a.price);
    if (state.sortBy === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return list;
  }

  function productCardHTML(p) {
    const qty = state.cart[p.id] || 0;
    const stock = stockStatus(p.id);
    const seasonal = isSeasonal(p);
    const discount = p.mrp > p.price;
    let badge = '';
    if (stock === 'out') badge = `<span class="badge out">${t('outOfStock', state.lang)}</span>`;
    else if (stock === 'low') badge = `<span class="badge low">${t('lowStock', state.lang)}</span>`;
    else if (seasonal) badge = `<span class="badge season">${t('seasonal', state.lang)}</span>`;

    const controls = qty > 0
      ? `<div class="qty-stepper">
           <button type="button" data-action="dec" data-id="${p.id}" aria-label="Decrease quantity">−</button>
           <span>${packLabel(qty)}</span>
           <button type="button" data-action="inc" data-id="${p.id}" aria-label="Increase quantity" ${stock === 'out' ? 'disabled' : ''}>+</button>
         </div>`
      : `<button class="add-btn" type="button" data-action="add" data-id="${p.id}" ${stock === 'out' ? 'disabled' : ''}>
           + ${t('addToList', state.lang)}
         </button>`;

    return `
      <article class="product-card">
        ${badge}
        <span class="cat-tag">${p.subCategory}</span>
        <h3 class="p-name">${escapeHTML(p.name)}</h3>
        <span class="p-brand">${escapeHTML(p.brand || '')}</span>
        ${p.rating ? `<span class="p-rating">★ ${p.rating.toFixed(1)}</span>` : ''}
        <div class="price-row">
          <span class="p-price">₹${p.price}</span>
          ${discount ? `<span class="p-mrp">₹${p.mrp}</span>` : ''}
        </div>
        ${controls}
      </article>`;
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function renderCatalog() {
    const list = getFilteredProducts();
    productGrid.innerHTML = list.map(productCardHTML).join('');
    emptyState.hidden = list.length > 0;
    const itemsWord = state.lang === 'hi-IN' ? 'उत्पाद' : (list.length === 1 ? 'item' : 'items');
    resultsCount.textContent = list.length ? `${list.length} ${itemsWord}` : '';
    resultsHeading.textContent = state.searchQuery
      ? `${t('resultsFor', state.lang)} "${state.searchQuery}"`
      : t('allProducts', state.lang);
    bindCardEvents();
  }

  function bindCardEvents() {
    productGrid.querySelectorAll('[data-action="add"]').forEach(btn => {
      btn.addEventListener('click', () => requestAddToCart(Number(btn.dataset.id), 1));
    });
    productGrid.querySelectorAll('[data-action="inc"]').forEach(btn => {
      btn.addEventListener('click', () => addToCart(Number(btn.dataset.id), 1, false));
    });
    productGrid.querySelectorAll('[data-action="dec"]').forEach(btn => {
      btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.id), 1));
    });
  }

  // ---------------------------------------------------------------------
  // Cart operations
  // ---------------------------------------------------------------------
  function addToCart(id, qty, showToast) {
    const product = productById.get(id);
    if (!product) return;
    if (stockStatus(id) === 'out') {
      toast(`${product.name} — ${t('outOfStock', state.lang)}`, 'error');
      offerSubstitutes(product);
      return;
    }
    state.cart[id] = (state.cart[id] || 0) + qty;
    state.history[id] = (state.history[id] || 0) + qty;
    saveHistory();
    if (showToast) toast(`✓ ${product.name} × ${packLabel(qty)}`);
    renderCatalog();
    renderCart();
    renderSuggestions();
  }

  // Shows a confirmation dialog with the product's details before it's
  // actually added — this is the gate that stops a misheard/mismatched
  // voice command, or a stray click, from silently changing the cart.
  // Quantity adjustments on items already in the cart (+/- steppers) skip
  // this, since that item was already explicitly confirmed once.
  function requestAddToCart(id, qty, sourceLabel) {
    const product = productById.get(id);
    if (!product) return;

    if (stockStatus(id) === 'out') {
      toast(`${product.name} — ${t('outOfStock', state.lang)}`, 'error');
      offerSubstitutes(product);
      return;
    }

    const lineTotal = (product.price * qty).toFixed(0);
    confirmAddCard.innerHTML = `
      <h3 class="confirm-title">${t('confirmAddTitle', state.lang)}</h3>
      <div class="confirm-product">
        <div>
          <div class="cp-name">${escapeHTML(product.name)}</div>
          <div class="cp-meta">${escapeHTML(product.brand || '')} ${product.brand ? '·' : ''} ${product.subCategory}</div>
          <div class="cp-qty">${packLabel(qty)} · ₹${product.price} ${state.lang === 'hi-IN' ? 'प्रति पैक' : 'per pack'}</div>
        </div>
        <div class="cp-price">₹${lineTotal}</div>
      </div>
      <div class="confirm-actions">
        <button type="button" class="confirm-cancel" id="confirmCancelBtn">${t('confirmCancelBtn', state.lang)}</button>
        <button type="button" class="confirm-ok" id="confirmOkBtn">${t('confirmAddBtn', state.lang)}</button>
      </div>
    `;
    confirmAddModal.classList.add('is-open');
    confirmAddModal.setAttribute('aria-hidden', 'false');
    confirmOverlay.hidden = false;

    const closeConfirm = () => {
      confirmAddModal.classList.remove('is-open');
      confirmAddModal.setAttribute('aria-hidden', 'true');
      confirmOverlay.hidden = true;
    };

    document.getElementById('confirmOkBtn').addEventListener('click', () => {
      closeConfirm();
      addToCart(id, qty, true);
      if (sourceLabel) logToTicker(sourceLabel, 'log-add');
    });
    document.getElementById('confirmCancelBtn').addEventListener('click', () => {
      closeConfirm();
      toast(state.lang === 'hi-IN' ? 'नहीं जोड़ा गया' : 'Not added', 'error');
    });
    confirmOverlay.addEventListener('click', closeConfirm, { once: true });
  }

  function removeFromCart(id, qty) {
    const product = productById.get(id);
    if (!state.cart[id]) return;
    state.cart[id] -= qty;
    if (state.cart[id] <= 0) delete state.cart[id];
    renderCatalog();
    renderCart();
    renderSuggestions();
    if (product) toast(`− ${product.name}`);
  }

  function setCartQty(id, qty) {
    if (qty <= 0) { delete state.cart[id]; }
    else { state.cart[id] = qty; }
    renderCatalog();
    renderCart();
    renderSuggestions();
  }

  function clearCart() {
    state.cart = {};
    renderCatalog();
    renderCart();
    renderSuggestions();
    toast(t('clearList', state.lang));
  }

  function cartLineHTML(id, qty) {
    const p = productById.get(id);
    if (!p) return '';
    return `
      <div class="cart-line">
        <div class="cl-info">
          <div class="cl-name">${escapeHTML(p.name)}</div>
          <div class="cl-sub">${p.subCategory} · ₹${p.price}</div>
          <div class="cl-qty">
            <button type="button" data-action="dec" data-id="${id}" aria-label="Decrease">−</button>
            <span>${packLabel(qty)}</span>
            <button type="button" data-action="inc" data-id="${id}" aria-label="Increase">+</button>
          </div>
          <button class="cl-remove" type="button" data-action="del" data-id="${id}">${state.lang === 'hi-IN' ? 'हटाएं' : 'Remove'}</button>
        </div>
        <div class="cl-price">₹${(p.price * qty).toFixed(0)}</div>
      </div>`;
  }

  function renderCart() {
    const ids = Object.keys(state.cart).map(Number);
    cartItemsEl.innerHTML = ids.map(id => cartLineHTML(id, state.cart[id])).join('');
    cartEmptyMsg.hidden = ids.length > 0;

    cartItemsEl.querySelectorAll('[data-action="inc"]').forEach(btn =>
      btn.addEventListener('click', () => addToCart(Number(btn.dataset.id), 1, false)));
    cartItemsEl.querySelectorAll('[data-action="dec"]').forEach(btn =>
      btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.id), 1)));
    cartItemsEl.querySelectorAll('[data-action="del"]').forEach(btn =>
      btn.addEventListener('click', () => setCartQty(Number(btn.dataset.id), 0)));

    const subtotal = ids.reduce((sum, id) => sum + productById.get(id).price * state.cart[id], 0);
    const tax = subtotal * 0.05;
    cartSubtotalEl.textContent = `₹${subtotal.toFixed(0)}`;
    cartTaxEl.textContent = `₹${tax.toFixed(0)}`;
    cartTotalEl.textContent = `₹${(subtotal + tax).toFixed(0)}`;

    const totalCount = ids.reduce((sum, id) => sum + state.cart[id], 0);
    cartCountEl.textContent = totalCount;
    checkoutBtn.disabled = totalCount === 0;
  }

  // ---------------------------------------------------------------------
  // Smart suggestions
  // ---------------------------------------------------------------------
  function renderSuggestions() {
    const cartIds = Object.keys(state.cart).map(Number);
    const inCart = new Set(cartIds);
    const picks = new Map(); // id -> reason label

    // 1. frequently bought together, based on current cart's sub-categories
    cartIds.forEach(id => {
      const p = productById.get(id);
      const pairs = PAIR_SUGGESTIONS[p.subCategory] || [];
      pairs.forEach(subCat => {
        PRODUCTS.filter(x => x.subCategory === subCat && !inCart.has(x.id) && stockStatus(x.id) !== 'out')
          .slice(0, 2)
          .forEach(x => { if (!picks.has(x.id)) picks.set(x.id, 'pairsWith'); });
      });
    });

    // 2. your usual picks, from persisted history, not already in cart
    const historyIds = Object.entries(state.history)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => Number(id))
      .filter(id => !inCart.has(id) && productById.has(id) && stockStatus(id) !== 'out');
    historyIds.slice(0, 3).forEach(id => { if (!picks.has(id)) picks.set(id, 'usual'); });

    // 3. seasonal picks
    PRODUCTS.filter(p => isSeasonal(p) && !inCart.has(p.id) && stockStatus(p.id) !== 'out')
      .slice(0, 2)
      .forEach(p => { if (!picks.has(p.id)) picks.set(p.id, 'seasonal'); });

    const finalPicks = [...picks.entries()].slice(0, 8);
    suggestionsSection.hidden = finalPicks.length === 0;
    if (!finalPicks.length) return;

    const labelFor = reason => ({
      pairsWith: state.lang === 'hi-IN' ? 'साथ में लें' : 'Goes well together',
      usual: state.lang === 'hi-IN' ? 'आपकी पसंद' : 'You usually buy this',
      seasonal: state.lang === 'hi-IN' ? 'सीज़नल' : 'In season now',
    }[reason]);

    suggestionScroll.innerHTML = finalPicks.map(([id, reason]) => {
      const p = productById.get(id);
      return `
        <div class="sugg-card">
          <span class="sugg-badge">${labelFor(reason)}</span>
          <div class="sugg-name">${escapeHTML(p.name)}</div>
          <div class="sugg-price">₹${p.price}</div>
          <button type="button" data-id="${p.id}">+ ${t('addToList', state.lang)}</button>
        </div>`;
    }).join('');

    suggestionScroll.querySelectorAll('button').forEach(btn =>
      btn.addEventListener('click', () => requestAddToCart(Number(btn.dataset.id), 1)));
  }

  function offerSubstitutes(unavailableProduct) {
    const alts = PRODUCTS.filter(p =>
      p.subCategory === unavailableProduct.subCategory &&
      p.id !== unavailableProduct.id &&
      stockStatus(p.id) !== 'out'
    ).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);
    if (!alts.length) return;
    state.activeCategory = 'all';
    state.searchQuery = '';
    productGrid.innerHTML = alts.map(productCardHTML).join('');
    resultsHeading.textContent = state.lang === 'hi-IN' ? 'इसके बदले ये आज़माएं' : 'Try these instead';
    resultsCount.textContent = '';
    emptyState.hidden = true;
    bindCardEvents();
    logToTicker(
      state.lang === 'hi-IN'
        ? `${unavailableProduct.name} स्टॉक में नहीं है — विकल्प दिखाए गए`
        : `${unavailableProduct.name} is out of stock — showing substitutes`,
      'log-info'
    );
  }

  // ---------------------------------------------------------------------
  // Command execution (shared by voice + typed input)
  // ---------------------------------------------------------------------
  function executeCommand(rawText) {
    const cmd = parseCommand(rawText);

    if (cmd.intent === 'clearCart') {
      clearCart();
      logToTicker(`"${rawText}" → ${state.lang === 'hi-IN' ? 'सूची खाली की गई' : 'list cleared'}`, 'log-remove');
      return;
    }

    if (cmd.intent === 'checkout') {
      openCheckout();
      logToTicker(`"${rawText}" → ${state.lang === 'hi-IN' ? 'चेकआउट खोला गया' : 'opening checkout'}`, 'log-info');
      return;
    }

    if (cmd.intent === 'search') {
      state.searchQuery = cmd.rawQuery || rawText;
      state.activeCategory = 'all';
      state.priceMax = cmd.priceMax;
      maxPriceInput.value = cmd.priceMax || '';
      renderChips();
      renderCatalog();
      const results = getFilteredProducts();
      logToTicker(
        `"${rawText}" → ${results.length} ${state.lang === 'hi-IN' ? 'परिणाम मिले' : 'results found'}`,
        'log-info'
      );
      return;
    }

    // add / remove: resolve to a specific product using the strict
    // confident-match resolver — if the exact item asked for isn't in the
    // catalog (wrong flavour, wrong brand, not stocked at all), this
    // returns null rather than guessing at the closest-sounding substitute,
    // and nothing gets added.
    const best = findConfidentMatch(PRODUCTS, cmd);
    if (!best) {
      logToTicker(`"${rawText}" → ${t('notFoundTicker', state.lang)}`, 'log-remove');
      toast(t('notFoundToast', state.lang), 'error');
      return;
    }

    if (cmd.intent === 'remove') {
      if (state.cart[best.id]) {
        removeFromCart(best.id, state.cart[best.id]);
        logToTicker(`"${rawText}" → ${state.lang === 'hi-IN' ? 'हटाया गया' : 'removed'}: ${best.name}`, 'log-remove');
      } else {
        logToTicker(
          `"${rawText}" → ${best.name} ${state.lang === 'hi-IN' ? 'सूची में नहीं थी' : 'was not in your list'}`,
          'log-info'
        );
      }
      return;
    }

    // add — ask for confirmation before it actually lands in the cart
    if (stockStatus(best.id) === 'out') {
      logToTicker(`"${rawText}" → ${best.name} ${state.lang === 'hi-IN' ? 'स्टॉक में नहीं' : 'is out of stock'}`, 'log-info');
      requestAddToCart(best.id, cmd.quantity); // will trigger substitute offer
      return;
    }
    const addedLabel = `"${rawText}" → ${state.lang === 'hi-IN' ? 'जोड़ा गया' : 'added'}: ${best.name} × ${packLabel(cmd.quantity)}`;
    requestAddToCart(best.id, cmd.quantity, addedLabel);
  }

  // ---------------------------------------------------------------------
  // Speech recognition
  // ---------------------------------------------------------------------
  // Browsers ask for microphone permission again on every recognition.start()
  // call unless something keeps the mic "actively granted" between uses. The
  // fix: request access once via getUserMedia (the single real permission
  // prompt for the whole visit) and hold that stream open in memory for the
  // life of the page. SpeechRecognition then reuses the already-granted
  // permission instead of negotiating it fresh each click. The stream is
  // only released when the page is closed/navigated away from, which is
  // also the only point the permission grant should reset.
  let recognition = null;
  let listening = false;
  let micStream = null;          // held open for the page's lifetime once granted
  let micPermissionState = 'unrequested'; // 'unrequested' | 'requesting' | 'granted' | 'denied'

  function setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micStatus.textContent = t('micUnsupported', state.lang);
      micButton.disabled = true;
      micButton.style.opacity = '0.5';
      return;
    }
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = state.lang;

    recognition.onstart = () => {
      listening = true;
      micButton.classList.add('listening');
      micButton.setAttribute('aria-pressed', 'true');
      micStatus.textContent = t('listening', state.lang);
    };

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (event.results[event.results.length - 1].isFinal) {
        micStatus.textContent = t('processing', state.lang);
        cmdInput.value = transcript;
        executeCommand(transcript);
      }
    };

    recognition.onerror = (event) => {
      listening = false;
      micButton.classList.remove('listening');
      micButton.setAttribute('aria-pressed', 'false');
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        micPermissionState = 'denied';
        toast(t('micDenied', state.lang), 'error');
      } else if (event.error === 'no-speech') {
        toast(state.lang === 'hi-IN' ? 'कुछ सुनाई नहीं दिया' : 'Did not catch that — try again', 'error');
      } else {
        toast(state.lang === 'hi-IN' ? 'वॉइस में समस्या हुई' : 'Voice recognition error', 'error');
      }
      micStatus.textContent = t('tapToSpeak', state.lang);
    };

    recognition.onend = () => {
      listening = false;
      micButton.classList.remove('listening');
      micButton.setAttribute('aria-pressed', 'false');
      micStatus.textContent = t('tapToSpeak', state.lang);
    };
  }

  // One-time (per page load) permission request. Once granted, we never
  // call getUserMedia again for the rest of the page's life — even if the
  // held stream's tracks later end for some unrelated browser reason (tab
  // backgrounded, power-saving, etc). Re-checking "is the stream still
  // live" here was the actual bug: it caused a second real getUserMedia()
  // call — and therefore a second permission prompt — the moment that
  // stream naturally lapsed, which defeats the whole point of holding it
  // open in the first place. The permission grant itself doesn't go away
  // just because a track ended, so we don't need to re-verify it.
  async function ensureMicPermission() {
    if (micPermissionState === 'granted') return true;
    if (micPermissionState === 'denied') return false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Older browsers without the modern API — let SpeechRecognition handle
      // its own prompt directly; nothing more we can do to control it.
      return true;
    }
    micPermissionState = 'requesting';
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micPermissionState = 'granted';
      return true;
    } catch (err) {
      micPermissionState = 'denied';
      toast(t('micDenied', state.lang), 'error');
      micStatus.textContent = t('tapToSpeak', state.lang);
      return false;
    }
  }

  // Release the mic the moment the page is actually closed/navigated away
  // from — this is the only point the permission grant should "reset".
  function releaseMicOnUnload() {
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }
  }
  window.addEventListener('pagehide', releaseMicOnUnload);
  window.addEventListener('beforeunload', releaseMicOnUnload);

  // Defensive extra: if the browser itself already reports the microphone
  // as granted or denied for this origin (e.g. the page was reloaded, not
  // freshly opened), reflect that immediately instead of waiting to find
  // out on the next click. Not all browsers support this query, so it's
  // wrapped and ignored where unavailable — the click-time flow above
  // still works correctly either way.
  async function syncKnownMicPermission() {
    if (!navigator.permissions || !navigator.permissions.query) return;
    try {
      const status = await navigator.permissions.query({ name: 'microphone' });
      if (status.state === 'granted' || status.state === 'denied') {
        micPermissionState = status.state;
      }
      status.onchange = () => {
        if (status.state === 'denied') micPermissionState = 'denied';
      };
    } catch (e) { /* Permissions API doesn't support 'microphone' in this browser */ }
  }

  micButton.addEventListener('click', async () => {
    if (!recognition) return;
    if (listening) { recognition.stop(); return; }

    const allowed = await ensureMicPermission();
    if (!allowed) return;

    try { recognition.lang = state.lang; recognition.start(); }
    catch (e) { /* already started */ }
  });

  // ---------------------------------------------------------------------
  // Language toggle
  // ---------------------------------------------------------------------
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.lang = btn.dataset.lang;
      applyStaticTranslations(state.lang);
      renderChips();
      renderCatalog();
      renderCart();
      renderSuggestions();
      micStatus.textContent = t('tapToSpeak', state.lang);
    });
  });

  // ---------------------------------------------------------------------
  // Text command form (fallback + always-available search)
  // ---------------------------------------------------------------------
  cmdForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = cmdInput.value.trim();
    if (!val) return;
    executeCommand(val);
  });

  maxPriceInput.addEventListener('input', () => {
    const v = maxPriceInput.value;
    state.priceMax = v === '' ? null : Number(v);
    renderCatalog();
  });

  sortSelect.addEventListener('change', () => {
    state.sortBy = sortSelect.value;
    renderCatalog();
  });

  // ---------------------------------------------------------------------
  // Cart drawer open/close
  // ---------------------------------------------------------------------
  function openCart() {
    cartDrawer.classList.add('is-open');
    cartDrawer.setAttribute('aria-hidden', 'false');
    cartOverlay.hidden = false;
  }
  function closeCart() {
    cartDrawer.classList.remove('is-open');
    cartDrawer.setAttribute('aria-hidden', 'true');
    cartOverlay.hidden = true;
  }
  cartToggle.addEventListener('click', openCart);
  cartClose.addEventListener('click', closeCart);
  cartOverlay.addEventListener('click', closeCart);
  clearCartBtn.addEventListener('click', clearCart);

  // ---------------------------------------------------------------------
  // Home — returns to the initial landing view: full catalog, no active
  // search/filters, any open drawers or modals closed. This does NOT touch
  // the cart itself (going "home" is navigation, not a reset of your list).
  // ---------------------------------------------------------------------
  function goHome() {
    state.activeCategory = 'all';
    state.searchQuery = '';
    state.priceMax = null;
    state.sortBy = 'relevance';

    cmdInput.value = '';
    maxPriceInput.value = '';
    sortSelect.value = 'relevance';

    closeCart();
    if (checkoutModal.classList.contains('is-open')) {
      checkoutModal.classList.remove('is-open');
      checkoutModal.setAttribute('aria-hidden', 'true');
      checkoutOverlay.hidden = true;
    }
    if (confirmAddModal.classList.contains('is-open')) {
      confirmAddModal.classList.remove('is-open');
      confirmAddModal.setAttribute('aria-hidden', 'true');
      confirmOverlay.hidden = true;
    }

    renderChips();
    renderCatalog();
    renderSuggestions();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  homeButton.addEventListener('click', goHome);
  brandHomeButton.addEventListener('click', goHome);

  // ---------------------------------------------------------------------
  // Checkout modal
  // ---------------------------------------------------------------------
  function openCheckout() {
    const ids = Object.keys(state.cart).map(Number);
    if (!ids.length) { toast(state.lang === 'hi-IN' ? 'सूची खाली है' : 'Your list is empty', 'error'); return; }
    const orderId = 'BB' + Math.floor(100000 + Math.random() * 900000);
    checkoutCard.innerHTML = `
      <div class="stamp">✓</div>
      <h3>${t('orderPlaced', state.lang)}</h3>
      <p>${t('orderThanks', state.lang)}</p>
      <div class="order-id">${t('orderId', state.lang)}: ${orderId}</div>
      <button class="modal-close" type="button" id="checkoutDoneBtn">${t('done', state.lang)}</button>
    `;
    checkoutModal.classList.add('is-open');
    checkoutModal.setAttribute('aria-hidden', 'false');
    checkoutOverlay.hidden = false;
    closeCart();
    document.getElementById('checkoutDoneBtn').addEventListener('click', () => {
      checkoutModal.classList.remove('is-open');
      checkoutModal.setAttribute('aria-hidden', 'true');
      checkoutOverlay.hidden = true;
      clearCart();
    });
  }
  checkoutBtn.addEventListener('click', openCheckout);
  checkoutOverlay.addEventListener('click', () => {
    checkoutModal.classList.remove('is-open');
    checkoutModal.setAttribute('aria-hidden', 'true');
    checkoutOverlay.hidden = true;
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  function init() {
    applyStaticTranslations(state.lang);
    renderChips();
    renderCatalog();
    renderCart();
    renderSuggestions();
    setupRecognition();
    syncKnownMicPermission();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
