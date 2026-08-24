# Architecture

## Why no framework?

For an 8-hour, single-page assessment project, React/Vue would add a build
step, a `node_modules` folder, and a dependency-update surface for very
little payoff — the app has one screen, no routing, and moderate state
complexity. Plain JS with a single `state` object and explicit render
functions keeps every data flow visible in one file (`app.js`), which
matters more for a reviewer reading the code in one sitting than any
framework convenience would. If this grew into a multi-screen product
(order history, saved lists, user accounts), that would be the point to
introduce a framework and a real build pipeline.

## File responsibilities

```
data.js   → static product catalog (generated once, see DATA_PIPELINE.md)
i18n.js   → { key: { 'en-IN': '...', 'hi-IN': '...' } } string lookup + DOM helper
nlp.js    → pure functions: text in, structured command out. No DOM, no state.
app.js    → the only file that touches the DOM or holds mutable state
```

This separation means `nlp.js` can be unit-tested in isolation (and was —
see the test commands in `DEVELOPMENT_LOG.md`) without a browser or DOM at
all, which is why it's plain functions with no side effects.

## Command pipeline (the core of the app)

```
  mic / text input
        │
        ▼
  raw transcript, e.g. "add 2 kele jodo"
        │
        ▼
  normalize()               lowercase, strip punctuation
        │
        ▼
  extractPriceFilter()      pulls out "under 100" / "100 se kam" style clauses
        │
        ▼
  detectIntent()            longest-match-first against EN + HI trigger phrases
        │                   → add | remove | search | checkout | clearCart
        ▼
  extractQuantity()         digits, English number words, Hindi number words
        │
        ▼
  resolveTokens()           SYNONYMS dictionary: "kele" / "banana" / "केला" → "banana"
        │
        ▼
  scoreProduct() per item   word-boundary match > substring match,
        │                   category-hint bonus, price-filter bonus/penalty,
        │                   explicit disqualifiers (so "milk" won't match "milkshake")
        ▼
  best match(es) returned → app.js performs the action (add/remove/search)
        │
        ▼
  ticker log + toast        so the user sees exactly what was understood
```

Every step is a pure function that takes a string (or the parsed
intermediate) and returns a plain object — nothing here depends on the
browser, which is what let it be tested with a Node `vm` harness before
ever opening a browser tab.

## Why rule-based NLP instead of calling an LLM API?

I considered routing transcripts through an LLM for intent parsing, and rejected it for this
scope, for three reasons:

1. **Latency and reliability.** A voice assistant needs to feel instant;
   an API round-trip per utterance (plus the risk of rate limits on a free
   tier) works against that.
2. **Transparency.** A reviewer can read `nlp.js` top to bottom and see
   exactly why "add 2 bananas" became `{ intent: 'add', quantity: 2,
   canonicalTerms: ['banana'] }`. An LLM call is a black box by comparison,
   which matters when the evaluation criteria explicitly include "code
   quality" and "problem-solving approach," not just output.
3. **Fit to the domain.** Grocery commands are a narrow, repetitive
   language (add/remove/search + item + quantity + price). A ~150-line
   rule table covers the realistic phrasing space; an LLM's flexibility
   would mostly go unused while adding cost and a network dependency.

A production version serving open-ended phrasing at scale would likely add
an LLM as a *fallback* when the rule-based parser scores no confident
match — the architecture already isolates that decision to one function
(`findBestMatches`), so it's a contained change, not a rewrite.

## State model

All mutable state lives in one object in `app.js`:

```js
state = {
  lang,            // 'en-IN' | 'hi-IN' — which voice/UI language is active
  cart,            // { productId: quantity }
  activeCategory,  // current category chip filter
  searchQuery,     // current text/voice search, if any
  priceMax,        // current price ceiling filter, if any
  sortBy,          // 'relevance' | 'price-asc' | 'price-desc' | 'rating'
  history,         // { productId: timesAdded }, persisted to localStorage
}
```

Every state mutation is followed by a small, explicit set of re-renders
(`renderCatalog`, `renderCart`, `renderSuggestions`) rather than a
framework's reactivity system — there are few enough call sites that this
stays easy to follow, and it avoids a dependency purely to save ~15 lines.

## Suggestions engine

Three independent signal sources feed one `Map<productId, reason>`, so
they can't produce duplicate cards and each one degrades gracefully if it
has nothing to contribute:

1. **Goes well together** — a hand-picked `PAIR_SUGGESTIONS` table maps a
   sub-category to 1–2 complementary sub-categories (rice → dal & spices,
   bread → dairy & spreads), reflecting real Indian kitchen shopping
   patterns rather than generic "customers also bought" noise.
2. **You usually buy this** — the `history` map in `localStorage`, sorted
   by frequency, filtered to items not already in the cart.
3. **In season now** — a month-indexed `SEASONAL_CALENDAR` of keywords
   checked against produce names, recomputed from `Date()` on every
   render (so it's correct on whatever day the app is opened, not baked
   in at build time).

## Accessibility & resilience choices

- Every icon-only button has an `aria-label`; the cart and checkout modal
  use `aria-hidden`/`aria-modal` correctly; focus rings are preserved
  (`:focus-visible`) rather than suppressed.
- `prefers-reduced-motion` disables the mic pulse animation and toast
  slide-in for users who've asked for that at the OS level.
- Every voice-only feature has a typed-command equivalent, so a browser
  with no `SpeechRecognition` support (Firefox) or a denied microphone
  permission degrades to a fully keyboard-usable app rather than a dead
  end — see the `onerror` handling in `app.js`.
