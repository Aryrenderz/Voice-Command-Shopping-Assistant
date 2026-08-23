/**
 * app.js
 * -----------------------------------------------------------------------
 * Application state, Web Speech API wiring, rendering and event handling.
 * Depends on data.js (CATEGORY_KEYWORDS, FALLBACK_CATALOG, SUBSTITUTES,
 * PAIRINGS, SEASONAL_ITEMS, SUPPORTED_LANGUAGES, categorize) and nlp.js
 * (parseCommand). Loaded after both in index.html.
 * -----------------------------------------------------------------------
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'vcsa.shoppingList.v1';
  const HISTORY_KEY = 'vcsa.itemHistory.v1';
  const CATALOG_URL = 'js/data/bigbasket-catalog.json';
  const SEARCH_RESULT_CAP = 8;

  /** @type {{id:string, name:string, quantity:number, unit:string|null, category:string, checked:boolean}[]} */
  let shoppingList = loadList();
  /** Frequency map of previously-added item names, used for "running low on" suggestions. */
  let itemHistory = loadHistory();
  let currentLang = 'en-IN';
  let recognition = null;
  let isListening = false;

  // The real ~2,250-item BigBasket-derived catalog, fetched at startup.
  // Starts out as the small built-in fallback so search still works
  // (with fewer results) the instant the page loads, before the fetch
  // resolves, or if it fails entirely.
  let productCatalog = FALLBACK_CATALOG;

  // Mic permission is checked/requested once and cached here so the
  // browser's permission prompt is never triggered on every tap — see
  // initMicPermission() / ensureMicAccess() below.
  let micPermissionState = 'unknown'; // 'unknown' | 'prompt' | 'granted' | 'denied'

  // ---- DOM references -------------------------------------------------
  const el = {
    micButton: document.getElementById('mic-button'),
    micStatus: document.getElementById('mic-status'),
    transcript: document.getElementById('transcript'),
    langSelect: document.getElementById('lang-select'),
    textInput: document.getElementById('text-command'),
    textForm: document.getElementById('text-form'),
    listContainer: document.getElementById('list-container'),
    emptyState: document.getElementById('empty-state'),
    suggestionRow: document.getElementById('suggestion-row'),
    searchResults: document.getElementById('search-results'),
    itemCount: document.getElementById('item-count'),
    clearCheckedBtn: document.getElementById('clear-checked'),
    toast: document.getElementById('toast'),
    supportWarning: document.getElementById('support-warning'),
  };

  // ---- Catalog loading --------------------------------------------------
  async function loadCatalog() {
    try {
      const res = await fetch(CATALOG_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        productCatalog = data;
      }
    } catch (err) {
      // Common, expected cause: the page was opened directly via file://
      // (fetch of a local JSON file is blocked by the browser) instead of
      // through a local server — see README "Running it locally". The app
      // keeps working with the small built-in fallback catalog either way.
      console.warn(`Could not load ${CATALOG_URL}; using the built-in fallback catalog.`, err);
    }
  }

  // ---- Persistence ------------------------------------------------------
  function loadList() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }
  function saveList() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shoppingList));
  }
  function loadHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveHistory() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(itemHistory));
  }

  // ---- Mic permission (requested once, not on every tap) --------------------
  // SpeechRecognition's own internal permission prompt is, in some
  // browsers, re-triggered on every start() call rather than remembered.
  // Standard getUserMedia() permissions ARE persisted per-origin by the
  // browser (as long as the page is served over HTTPS or localhost — see
  // README "Running it locally"), so this asks via getUserMedia() once,
  // caches the result, and every later tap skips straight to
  // recognition.start() without prompting again.
  async function initMicPermission() {
    if (!navigator.permissions || !navigator.permissions.query) return;
    try {
      const status = await navigator.permissions.query({ name: 'microphone' });
      micPermissionState = status.state; // 'granted' | 'denied' | 'prompt'
      status.onchange = () => {
        micPermissionState = status.state;
      };
    } catch {
      // Some browsers (e.g. Firefox) don't support querying 'microphone'
      // via the Permissions API — fall back to asking on first mic tap.
    }
  }

  async function ensureMicAccess() {
    if (micPermissionState === 'granted') return true;
    if (micPermissionState === 'denied') {
      el.micStatus.textContent = 'Microphone access was denied. Allow it in your browser settings to use voice input.';
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Only needed this to obtain (and let the browser persist) the
      // permission grant — SpeechRecognition captures its own audio, so
      // release this stream immediately rather than holding the mic open.
      stream.getTracks().forEach((track) => track.stop());
      micPermissionState = 'granted';
      return true;
    } catch {
      micPermissionState = 'denied';
      el.micStatus.textContent = 'Microphone access was denied. Allow it in your browser settings to use voice input.';
      return false;
    }
  }

  // ---- Toast / feedback --------------------------------------------------
  let toastTimer = null;
  function showToast(message, tone = 'info') {
    el.toast.textContent = message;
    el.toast.dataset.tone = tone;
    el.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('visible'), 3200);
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = currentLang;
    utterance.rate = 1.05;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  // ---- List operations --------------------------------------------------
  // explicitCategory lets a search-result "Add" button pass the category
  // the catalog already knows (real BigBasket data), instead of making
  // categorize() re-guess it from the name — more accurate, and cheaper.
  function addItem(name, quantity = 1, unit = null, explicitCategory = null) {
    const category = explicitCategory || categorize(name);
    const existing = shoppingList.find(
      (i) => i.name.toLowerCase() === name.toLowerCase() && !i.checked
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      shoppingList.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name,
        quantity,
        unit,
        category,
        checked: false,
      });
    }
    itemHistory[name.toLowerCase()] = (itemHistory[name.toLowerCase()] || 0) + 1;
    saveHistory();
    saveList();
    render();
    return category;
  }

  function removeItemByName(name) {
    const lower = name.toLowerCase();
    const before = shoppingList.length;
    shoppingList = shoppingList.filter((i) => !i.name.toLowerCase().includes(lower));
    saveList();
    render();
    return shoppingList.length < before;
  }

  function toggleChecked(id) {
    const item = shoppingList.find((i) => i.id === id);
    if (item) item.checked = !item.checked;
    saveList();
    render();
  }

  function removeById(id) {
    shoppingList = shoppingList.filter((i) => i.id !== id);
    saveList();
    render();
  }

  function clearChecked() {
    shoppingList = shoppingList.filter((i) => !i.checked);
    saveList();
    render();
  }

  function clearAll() {
    shoppingList = [];
    saveList();
    render();
  }

  // ---- Suggestions --------------------------------------------------------
  function buildSuggestions() {
    const chips = [];

    // Pairings based on items currently on the list.
    shoppingList.forEach((item) => {
      const key = item.name.toLowerCase();
      const pairs = PAIRINGS[key];
      if (pairs) {
        pairs.forEach((p) => {
          if (!shoppingList.some((i) => i.name.toLowerCase() === p)) {
            chips.push({ label: p, reason: `goes with ${item.name}` });
          }
        });
      }
    });

    // "Running low" — items bought frequently in the past but not on the
    // current list right now.
    Object.entries(itemHistory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .forEach(([name, count]) => {
        if (count >= 2 && !shoppingList.some((i) => i.name.toLowerCase() === name)) {
          chips.push({ label: name, reason: 'you buy this often' });
        }
      });

    // Seasonal picks for the current month.
    const month = new Date().getMonth();
    (SEASONAL_ITEMS[month] || []).forEach((name) => {
      if (!shoppingList.some((i) => i.name.toLowerCase() === name)) {
        chips.push({ label: name, reason: 'in season' });
      }
    });

    // De-duplicate by label, cap at 6 for a clean row.
    const seen = new Set();
    return chips.filter((c) => (seen.has(c.label) ? false : (seen.add(c.label), true))).slice(0, 6);
  }

  function renderSuggestions() {
    const chips = buildSuggestions();
    el.suggestionRow.innerHTML = '';
    if (chips.length === 0) {
      el.suggestionRow.hidden = true;
      return;
    }
    el.suggestionRow.hidden = false;
    chips.forEach((chip) => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.type = 'button';
      btn.innerHTML = `<span class="chip-label">${escapeHtml(chip.label)}</span><span class="chip-reason">${escapeHtml(chip.reason)}</span>`;
      btn.addEventListener('click', () => {
        addItem(chip.label, 1);
        showToast(`Added ${chip.label} to your list`, 'success');
        speak(`Added ${chip.label}`);
      });
      el.suggestionRow.appendChild(btn);
    });
  }

  // ---- Substitute prompt --------------------------------------------------
  function maybeOfferSubstitute(name) {
    const sub = SUBSTITUTES[name.toLowerCase()];
    if (!sub) return;
    showToast(`Prefer ${sub} instead of ${name}? Tap to swap.`, 'info');
  }

  // ---- Rendering the list ---------------------------------------------------
  function render() {
    el.listContainer.innerHTML = '';
    el.emptyState.hidden = shoppingList.length !== 0;

    const grouped = shoppingList.reduce((acc, item) => {
      (acc[item.category] = acc[item.category] || []).push(item);
      return acc;
    }, {});

    Object.keys(grouped)
      .sort()
      .forEach((category) => {
        const section = document.createElement('div');
        section.className = 'category-section';

        const heading = document.createElement('div');
        heading.className = 'category-heading';
        heading.innerHTML = `<span>${escapeHtml(category)}</span><span class="category-dash">— — — — —</span>`;
        section.appendChild(heading);

        grouped[category].forEach((item) => {
          section.appendChild(renderRow(item));
        });

        el.listContainer.appendChild(section);
      });

    const total = shoppingList.length;
    const checked = shoppingList.filter((i) => i.checked).length;
    el.itemCount.textContent = total === 0 ? 'Your list is empty' : `${checked} of ${total} checked off`;
    el.clearCheckedBtn.hidden = checked === 0;

    renderSuggestions();
  }

  function renderRow(item) {
    const row = document.createElement('div');
    row.className = 'list-row' + (item.checked ? ' checked' : '');

    const check = document.createElement('button');
    check.className = 'check-btn';
    check.type = 'button';
    check.setAttribute('aria-label', item.checked ? 'Mark as not bought' : 'Mark as bought');
    check.innerHTML = item.checked ? '✓' : '';
    check.addEventListener('click', () => toggleChecked(item.id));
    row.appendChild(check);

    const label = document.createElement('div');
    label.className = 'row-label';
    const qtyText = item.unit ? `${item.quantity} ${item.unit}${item.quantity > 1 ? 's' : ''}` : `x${item.quantity}`;
    label.innerHTML = `<span class="row-name">${escapeHtml(item.name)}</span><span class="row-qty">${escapeHtml(qtyText)}</span>`;
    row.appendChild(label);

    const remove = document.createElement('button');
    remove.className = 'remove-btn';
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${item.name}`);
    remove.textContent = '✕';
    remove.addEventListener('click', () => removeById(item.id));
    row.appendChild(remove);

    return row;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Search / voice-activated catalog lookup ------------------------------
  function runSearch(query, priceLimit) {
    const lower = query.toLowerCase().trim();
    const withinPrice = (p) => priceLimit == null || p.price <= priceLimit;

    // Whole-word match first (query as its own word in name/brand/category)
    // — a plain substring search on ~2,250 real product names returns noise
    // like "Sandalwood" for "dal" or "Matta Rice" for "atta". Only fall back
    // to loose substring matching if the word-boundary search comes up
    // empty, so partial-word queries like "choc" still find "Chocolate".
    const wordRe = new RegExp(`\\b${escapeRegex(lower)}`, 'i');
    let matches = productCatalog.filter(
      (p) => withinPrice(p) && (wordRe.test(p.name) || wordRe.test(p.brand) || wordRe.test(p.category))
    );
    if (matches.length === 0) {
      matches = productCatalog.filter((p) => {
        const matchesText = p.name.toLowerCase().includes(lower) || p.brand.toLowerCase().includes(lower)
          || p.category.toLowerCase().includes(lower);
        return withinPrice(p) && matchesText;
      });
    }

    // Rank: exact/prefix name matches first, then by rating (real
    // BigBasket ratings where available), then by price. Cap the count —
    // the real catalog has ~2,250 items, so a broad query like "milk"
    // can otherwise return well over a hundred rows.
    matches.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(lower) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(lower) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      const aRating = a.rating || 0;
      const bRating = b.rating || 0;
      if (aRating !== bRating) return bRating - aRating;
      return a.price - b.price;
    });

    const results = matches.slice(0, SEARCH_RESULT_CAP);
    renderSearchResults(results, query, matches.length);
    return matches;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function renderSearchResults(results, query, totalCount) {
    el.searchResults.innerHTML = '';
    if (results.length === 0) {
      el.searchResults.hidden = false;
      el.searchResults.innerHTML = `<p class="search-empty">No matches for "${escapeHtml(query)}". Try a different word or brand.</p>`;
      return;
    }
    el.searchResults.hidden = false;
    results.forEach((product) => {
      const card = document.createElement('div');
      card.className = 'result-card';
      const ratingText = product.rating ? ` · ★${product.rating}` : '';
      card.innerHTML = `
        <div class="result-main">
          <span class="result-name">${escapeHtml(product.name)}</span>
          <span class="result-meta">${escapeHtml(product.brand)} · ${escapeHtml(product.category)}${ratingText}</span>
        </div>
        <div class="result-price">₹${product.price.toFixed(0)}</div>
      `;
      const addBtn = document.createElement('button');
      addBtn.className = 'result-add';
      addBtn.type = 'button';
      addBtn.textContent = 'Add';
      addBtn.addEventListener('click', () => {
        addItem(product.name, 1, null, product.category);
        showToast(`Added ${product.name} to your list`, 'success');
        speak(`Added ${product.name}`);
      });
      card.appendChild(addBtn);
      el.searchResults.appendChild(card);
    });
    if (totalCount > results.length) {
      const more = document.createElement('p');
      more.className = 'search-empty';
      more.textContent = `Showing top ${results.length} of ${totalCount} matches — refine your search for more specific results.`;
      el.searchResults.appendChild(more);
    }
  }

  // ---- Command dispatch -----------------------------------------------------
  function handleTranscript(text) {
    el.transcript.textContent = `"${text}"`;
    const command = parseCommand(text);

    switch (command.intent) {
      case 'add': {
        const category = addItem(command.item, command.quantity, command.unit);
        showToast(`Added ${command.item} (${category})`, 'success');
        speak(`Added ${command.item} to your ${category} list`);
        maybeOfferSubstitute(command.item);
        break;
      }
      case 'remove': {
        const removed = removeItemByName(command.item);
        if (removed) {
          showToast(`Removed ${command.item}`, 'success');
          speak(`Removed ${command.item}`);
        } else {
          showToast(`Couldn't find ${command.item} on your list`, 'warn');
          speak(`I couldn't find ${command.item} on your list`);
        }
        break;
      }
      case 'search': {
        const results = runSearch(command.item, command.priceLimit);
        showToast(`${results.length} result${results.length === 1 ? '' : 's'} for "${command.item}"`, 'info');
        break;
      }
      case 'clear': {
        clearAll();
        showToast('List cleared', 'success');
        speak('Your list is now empty');
        break;
      }
      default: {
        showToast(`Didn't catch that as a command. Try "Add milk" or "Find toothpaste under $5".`, 'warn');
        speak(`Sorry, I didn't understand that.`);
      }
    }
  }

  // ---- Speech recognition setup ---------------------------------------------
  function setUpRecognition() {
    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      el.supportWarning.hidden = false;
      el.micButton.disabled = true;
      el.micStatus.textContent = 'Voice input is not supported in this browser — use the text box below.';
      return;
    }

    recognition = new SpeechRecognitionImpl();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = currentLang;

    recognition.onstart = () => {
      isListening = true;
      el.micButton.classList.add('listening');
      el.micStatus.textContent = 'Listening…';
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += chunk;
        else interim += chunk;
      }
      if (interim) el.transcript.textContent = `"${interim}"`;
      if (final) handleTranscript(final.trim());
    };

    recognition.onerror = (event) => {
      isListening = false;
      el.micButton.classList.remove('listening');
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        micPermissionState = 'denied';
        el.micStatus.textContent = 'Microphone access was denied. Allow it in your browser settings to use voice input.';
      } else if (event.error === 'no-speech') {
        el.micStatus.textContent = "Didn't hear anything — tap the mic and try again.";
      } else {
        el.micStatus.textContent = `Voice error: ${event.error}. You can still type commands below.`;
      }
    };

    recognition.onend = () => {
      isListening = false;
      el.micButton.classList.remove('listening');
      if (el.micStatus.textContent === 'Listening…') {
        el.micStatus.textContent = 'Tap the mic and speak a command';
      }
    };
  }

  function toggleListening() {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      return;
    }
    ensureMicAccess().then((granted) => {
      if (!granted) return;
      recognition.lang = currentLang;
      try {
        recognition.start();
      } catch (err) {
        // start() throws if called while already active; ignore.
      }
    });
  }

  // ---- Event wiring -----------------------------------------------------------
  function populateLanguages() {
    SUPPORTED_LANGUAGES.forEach((lang) => {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = lang.label;
      el.langSelect.appendChild(opt);
    });
    el.langSelect.value = currentLang;
  }

  function bindEvents() {
    el.micButton.addEventListener('click', toggleListening);

    el.langSelect.addEventListener('change', (e) => {
      currentLang = e.target.value;
      if (recognition) recognition.lang = currentLang;
    });

    el.textForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = el.textInput.value.trim();
      if (!value) return;
      handleTranscript(value);
      el.textInput.value = '';
    });

    el.clearCheckedBtn.addEventListener('click', clearChecked);
  }

  // ---- Init -----------------------------------------------------------------
  function init() {
    populateLanguages();
    setUpRecognition();
    bindEvents();
    render();
    initMicPermission();
    loadCatalog();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
