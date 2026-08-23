# VoiceCart — Voice Command Shopping Assistant

A voice-first shopping list, localized for the **Indian grocery market**
and backed by a **real product catalog** (~2,250 items derived from
BigBasket's public product data). Speak (or type) a command like *"Add
doodh"*, *"I need 2 kg atta"* or *"Find toothpaste under ₹100"* and
VoiceCart adds, removes, searches and organizes your list — with smart
suggestions based on what's in season, what pairs with what, and what
you tend to buy.

Built as a technical assessment project. Runs entirely in the browser: no
backend, no API keys, no build step.

---

## 1. Feature coverage

| Brief requirement | Where it lives |
|---|---|
| Voice command recognition | `js/app.js` — Web Speech API (`SpeechRecognition`) |
| NLP for varied phrasing ("Add X" / "I need X" / "I want to buy X") | `js/nlp.js` — `parseCommand()`, understands Hindi/English mixed terms ("Add doodh") |
| Multilingual support | Language picker: English (India), Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada — sets `recognition.lang` |
| Product recommendations ("running low on…") | `js/app.js` — `buildSuggestions()`, powered by a local purchase-history count |
| Seasonal recommendations | `js/data.js` — `SEASONAL_ITEMS`, keyed to Indian crop seasons by month |
| Substitutes | `js/data.js` — `SUBSTITUTES` (e.g. milk → soy milk, sugar → jaggery, ghee → vanaspati); offered as a toast when a matching item is added |
| Add / remove / modify items by voice | `parseCommand()` intents `add` / `remove`, quantity + unit parsing |
| Automatic categorization | `js/data.js` — `categorize()`, with an Indian-market category set (Staples & Grains, Spices & Condiments, Household & Personal Care, etc.) |
| Quantity management ("2 kg atta", "500 grams paneer") | `nlp.js` — `extractQuantity()` / `extractUnit()`, covers metric units (kg, litre, gram, ml) alongside count units |
| Voice-activated search (brand, price range in ₹) against a **real catalog** | `nlp.js` — `extractPriceLimit()` (understands "under ₹100" / "under 100 rupees"); `app.js` — `runSearch()` against `js/data/bigbasket-catalog.json`, ~2,250 real products |
| Minimalist UI, real-time visual feedback | `index.html` + `css/style.css`, toast notifications, live transcript |
| Mobile / voice-only optimized | Mobile-first responsive layout, large tap targets, spoken confirmations via `speechSynthesis` |
| Loading / listening states | Pulsing mic animation, "Listening…" status text |
| Basic error handling | Mic permission asked once (not on every tap — see §6), no-speech timeout, unsupported-browser fallback to text input |

---

## 2. Architecture

```
voice-shopping-assistant/
├── index.html          # markup + ARIA labels
├── css/style.css        # visual design (tokens documented at the top of the file)
├── js/
│   ├── data.js           # category keywords, small fallback catalog, seasonal/substitute/pairing data
│   ├── data/
│   │   ├── bigbasket-catalog.json   # ~2,250-product catalog, fetched at runtime (see §5)
│   │   └── build_catalog.py         # ETL script: raw BigBasket CSV -> the JSON above
│   ├── nlp.js             # parseCommand(): transcript -> {intent, item, quantity, unit, priceLimit}
│   └── app.js             # speech recognition, state, rendering, search, event wiring
├── README.md
└── WRITEUP.md             # 200-word approach summary (deliverable #3)
```

**Why plain HTML/CSS/JS instead of a framework?** The brief caps the time
budget at 8 hours and asks for "clean, production-quality code" that's easy
to review. A dependency-free app removes build tooling from the equation,
loads instantly, and is trivial to host on any static file host — while
still being organized into clear, single-responsibility modules
(data / NLP / app) rather than one large script.

**Why a rule-based NLP layer instead of a hosted NLU API?** It keeps the
app fully client-side — no API keys to manage, no network latency, no
per-request cost — while still covering every phrasing pattern called out
in the brief. `parseCommand()` is the single entry point the rest of the
app depends on, so it can be swapped for a call to a hosted NLU/LLM service
later (e.g. for genuinely open-ended phrasing) without touching the UI or
state code.

**State & persistence.** The shopping list and a lightweight purchase-count
history are kept in `localStorage` (`vcsa.shoppingList.v1`,
`vcsa.itemHistory.v1`), so the list survives a page refresh without needing
an account or a database.

---

## 3. Running it locally

Voice recognition requires a "secure context" (HTTPS or `localhost`) in
every browser that supports it, so opening `index.html` directly via
`file://` will not enable the microphone (typed commands still work), and
`fetch()` of the local catalog JSON is also blocked from `file://` in most
browsers — the app falls back to a small built-in catalog in that case
(see §5).

```bash
cd voice-shopping-assistant
python3 -m http.server 8080
# then open http://localhost:8080
```

Any static server works equally well (`npx serve`, VS Code's Live Server
extension, etc.).

**Browser support:** voice input relies on `SpeechRecognition` /
`webkitSpeechRecognition`, currently shipped in Chrome, Edge and Safari
(desktop and mobile). Firefox does not yet support it — the app detects
this and automatically falls back to the text-command box with a visible
notice, so the app never breaks, it degrades.

---

## 4. Deployment

Any static host works. Two straightforward options:

### Option A — GitHub Pages (recommended, free, matches the "GitHub repo" deliverable)
1. Push this folder to a new GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Source**, choose the `main` branch and `/ (root)` folder → **Save**.
4. GitHub publishes the site at `https://<username>.github.io/<repo-name>/`
   within a minute or two.

### Option B — Firebase Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init hosting     # choose this folder as the public directory
firebase deploy
```

Both give you the "Working application URL" deliverable with zero server
code to maintain, and both serve over HTTPS — which is required for the
microphone to work at all, and for the browser to persist mic permission
so the prompt only appears once (see §6).

---

## 5. About the dataset

Voice search is backed by a **real dataset**: the [BigBasket product
catalog](https://www.kaggle.com/code/ridamahmood005/indian-grocery-supermarket-big-basket-eda)
(27,555 products scraped from bigbasket.com — product name, category,
sub_category, brand, sale_price, market_price, type, rating, description).

`js/data/build_catalog.py` is the ETL script that turns the raw CSV into
what the app actually loads, `js/data/bigbasket-catalog.json`
(~2,250 products, 328KB):

1. **Filters out non-grocery noise.** The raw export also covers cookware,
   pet supplies, stationery, pooja items and a large cosmetics range — all
   dropped, keeping only plausible "shopping list" items (a curated slice
   of Beauty & Hygiene — Oral Care, Bath & Hand Wash, Feminine Hygiene —
   is kept; skincare/makeup/fragrance is not).
2. **Maps BigBasket's own category/sub_category taxonomy onto VoiceCart's
   9 app categories** (Produce, Dairy, Bakery, Meat & Seafood, Staples &
   Grains, Spices & Condiments, Snacks, Beverages, Household & Personal
   Care), so real catalog items group into the shopping list exactly like
   voice/typed entries do.
3. **Cleans and de-duplicates**: drops rows missing a name/brand/price,
   removes near-identical listings.
4. **Caps at 250 items per category** (highest-rated first) — the full
   27K-row file is far more than a client-side fetch/filter needs for a
   demo, and most of the long tail is redundant SKU variants of the same
   product.

To regenerate it (e.g. with different caps or category rules), download
`BigBasket Products.csv` from the Kaggle dataset, place it next to
`build_catalog.py`, and run:
```bash
cd js/data
pip install pandas
python3 build_catalog.py
```

`js/app.js`'s `loadCatalog()` fetches `bigbasket-catalog.json` at startup
and swaps it in for search. If that fetch fails — most commonly because
the app was opened via `file://` instead of a local server (see §3) — it
falls back to a small ~30-item hand-written catalog in `js/data.js`
(`FALLBACK_CATALOG`), so the app still works, just with fewer search
results.

Search itself (`runSearch()`) matches on whole words first (so "dal"
doesn't also return "Sandalwood") and falls back to a plain substring
match only if that comes up empty (so partial words like "choc" still
find "Chocolate"); results are ranked by name-prefix match, then rating,
then price, and capped at 8 shown at a time with a note if there are more.

---

## 6. Try these commands

- "Add doodh" (milk)
- "I need aloo" (potatoes)
- "I want to buy paneer"
- "Add 2 kg atta"
- "Add 500 grams toor dal"
- "Remove doodh from my list"
- "Find toothpaste under ₹100"
- "Search for basmati rice"
- "Clear my list"

Switch the language dropdown before speaking to try Hindi, Bengali,
Tamil, Telugu, Marathi, Gujarati or Kannada recognition (accuracy depends
on the browser's speech engine, not on this app).

---

## 7. Mic permission is only asked once

Earlier versions of this app called `recognition.start()` directly, which
in some browsers re-triggers a permission prompt on every single tap of
the mic button. Fixed in `app.js`:

- `initMicPermission()` checks the current microphone permission via the
  Permissions API (`navigator.permissions.query({name: 'microphone'})`)
  once, on page load, and caches the result (`micPermissionState`). It
  also listens for `onchange` in case the person changes the permission
  in their browser settings mid-session.
- `ensureMicAccess()` is called before every `recognition.start()`. If
  permission is already known to be `granted`, it returns immediately —
  no prompt, no delay. Only the first time (state `prompt`/`unknown`)
  does it call `getUserMedia({audio: true})`, which triggers the
  browser's real, persistent permission dialog; the resulting media
  stream is stopped immediately afterward since `SpeechRecognition`
  captures its own audio and doesn't need it held open.
- If the person denies access, or a recognition error comes back as
  `not-allowed`/`service-not-allowed`, the state is cached as `denied` so
  the app shows the "allow it in your browser settings" message
  immediately on the next tap instead of prompting again.

**This requires a secure context** (HTTPS or `localhost`) — browsers only
persist microphone permission per-origin under HTTPS/localhost by spec,
so hosting over plain HTTP (e.g. a non-localhost IP without TLS) will
still re-prompt on every tap no matter what the app does. Both deployment
options in §4 serve over HTTPS.

---

## 8. Known limitations & next steps

Written down honestly, as part of "clean, production-quality" documentation:

- The NLP layer is rule-based, so phrasing far outside the patterns in
  `nlp.js` (e.g. a bare noun phrase like "a dozen eggs" with no verb) is
  reported as "didn't catch that" rather than guessed at. A hosted LLM/NLU
  call would generalize further; it was left out to keep the app
  dependency- and cost-free for this assessment.
- The BigBasket catalog is a static, scraped snapshot (June 2022) — no
  live stock or current pricing. It's real product/brand/price data, but
  standing in for what would be a live catalog/inventory API in
  production.
- Recommendation logic ("running low on…", pairings) is a simple frequency
  count and static pairing table rather than a trained model — intentionally
  simple and explainable for an 8-hour scope, and isolated in
  `buildSuggestions()` so it can be swapped for a real recommendation
  service later.
- Search is client-side substring/word matching over ~2,250 items, not a
  real search index — fine at this scale, but wouldn't scale to the full
  27K-row source file or a live multi-million-SKU catalog without a
  proper backend search service.
