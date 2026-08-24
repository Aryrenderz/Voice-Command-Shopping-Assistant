# Development log

A step-by-step record of how this was built, roughly in the order it
happened, for anyone reviewing the process rather than just the output.

## 1. Read the brief and scope it

Read the assessment PDF and identified the four hard requirements (voice
input, smart suggestions, list management, voice search) plus the two soft
constraints that shape everything else: an 8-hour time budget and a
"minimalist, mobile-friendly" UI. Decided upfront to skip a backend/database
— the brief's own examples (AWS/Firebase) are infrastructure for a
persistence layer this scope doesn't need, since `localStorage` covers the
one thing that needs to persist (purchase history for suggestions).

## 2. Inspect and curate the dataset

Unzipped `BigBasket_Products_csv.zip` (~38,000 rows, 11 categories). Filtered
to 6 grocery-relevant categories, then noticed a first-pass extraction
(top-rated items per sub-category) surfaced flavoured milkshakes above
plain milk — the dataset's rating field rewards niche products with
passionate small review pools. Added a second, explicit "staples" pass with
per-keyword exclusion lists (documented in full in `DATA_PIPELINE.md`) and
verified the fix by grepping the output for "milk" until plain "Toned Milk"
outranked "Milkshake." Final catalog: 284 products.

## 3. Design the visual language before writing markup

Rejected the two AI-generic defaults (cream background + terracotta serif;
near-black + acid accent) in favor of a concept grounded in the subject
matter: a neighbourhood grocery counter digitized — an ink-charcoal header
like a shop signboard, a warm receipt-paper canvas, marigold and teal
accents pulled from spice tins and produce crates, and the cart styled as
an actual perforated till receipt in a monospace font. Picked Fraunces
(display) + Inter (body) + IBM Plex Mono (prices/receipt) as the type
system.

## 4. Build the NLP layer first, independently of any UI

Wrote `nlp.js` as pure functions (text in, structured command out) before
touching the DOM, specifically so it could be tested without a browser.
Built a Node `vm`-based test harness and ran ~15 realistic commands through
it — English and Hindi, add/remove/search/checkout, with quantities and
price filters — before wiring anything to a screen. This caught the
milk-vs-milkshake scoring bug (word-boundary matches now outweigh substring
matches) at the data/logic layer, where it was fast to fix and verify,
rather than later inside a full UI.

## 5. Build the app shell, styling, and state layer

Wrote `index.html` (semantic structure, ARIA labels from the start rather
than retrofitted), `style.css` (the token system from step 3), and `app.js`
(one `state` object, explicit render functions, no framework — see
`ARCHITECTURE.md` for the reasoning).

## 6. Wire up the Web Speech API

Added `SpeechRecognition`/`webkitSpeechRecognition` with a language switch
(`en-IN` / `hi-IN`), an `onerror` handler covering `not-allowed` (denied mic
permission), `no-speech`, and generic failures, and a feature-detection
fallback that disables the mic button and points to the typed-command box
when the API isn't present at all (Firefox).

## 7. Add smart suggestions and simulated stock/seasonality

Built the three-signal suggestion engine (pairs / history / seasonal — see
`ARCHITECTURE.md`), a deterministic pseudo-stock function (`id % 17` / `id
% 17` and `% 7`) so out-of-stock and low-stock demos are stable across
reloads rather than random, and a month-indexed seasonal calendar for
produce.

## 8. End-to-end testing in a real browser

Used Playwright (headless Chromium) to drive the actual app — not just the
logic in isolation — through: adding items by typed command, opening the
cart, switching to Hindi mid-session, searching with a price filter,
completing checkout, removing an item (including the empty-cart edge case,
which correctly reported "was not in your list" rather than erroring),
triggering the out-of-stock substitute flow, and rendering at a 390px
mobile viewport. Confirmed zero console errors at every step and fixed the
`resultsCount` label, which was still hardcoded in English after a language
switch.

## 9. Fix: repeated microphone permission prompts

Found that `recognition.start()` was negotiating microphone access fresh on
every mic button tap rather than reusing the browser's existing grant.
Fixed by requesting the microphone once via `getUserMedia` on the first tap
and holding that stream open in memory for the page's lifetime; every
later tap checks the held stream is still live instead of asking again.
The stream (and with it, the active grant) is only released on
`pagehide`/`beforeunload`, so the permission prompt appears exactly once
per visit and "resets" only when the tab or site is actually closed.
Verified with a Playwright test that counted `getUserMedia` calls across
four separate mic clicks — one call total, confirmed against a fake-device
Chromium instance.

## 10. Fix: false-positive matches and missing purchase confirmation

A real test case surfaced a scoring bug: asking to "add strawberry juice"
was silently adding **Strawberry Milkshake** instead — wrong category, wrong
product. The root cause was that the matcher's "haystack" text included the
product's sub-category label (e.g. "Fruit Juices & Drinks"), so the word
"juice" matched *any* product filed under that shelf even when the word
never appeared in the product's actual name. Fixed by:

- Restricting substring/word matching to the product's own name and brand
  only — sub-category is now used solely as a same-shelf tie-breaker bonus,
  never as searchable text on its own.
- Adding a strict resolver (`findConfidentMatch`) specifically for add/remove
  actions, which requires every meaningful word in the command to be
  satisfied — either literally present in the name (for specific
  descriptors like "strawberry") or literally present *or* on the right
  shelf (for plain category words like "juice", "namkeen", where most real
  products don't spell out their own category in the name). If nothing
  clears that bar, the command resolves to **no match, no addition** —
  confirmed by testing that "add strawberry juice" (not stocked in this
  catalog) now correctly adds nothing, while "add milk" still resolves
  correctly.
- Search/browsing (`findBestMatches`) intentionally keeps looser matching,
  since showing an imperfect browsing result is harmless — only *committing*
  an item to the cart needed the stricter bar.
- Added an explicit confirmation dialog (product name, brand, category,
  quantity, price) before anything is actually added to the cart, so even
  a confident match is a human decision, not a silent action. Quantity is
  now always shown as "N pack(s)" rather than a bare number, everywhere a
  quantity appears.
- Quantity adjustments on items already in the cart (+/− steppers) were
  deliberately left un-gated — re-confirming a change to something the user
  already explicitly added would be friction without benefit.

Verified with Playwright: the exact reported bug (strawberry juice →
strawberry milk) no longer occurs; a valid add now shows the confirmation
dialog with cart untouched until confirmed; cancelling leaves the cart
unchanged; and the grid's own "+ Add" buttons go through the same
confirmation gate as voice/typed commands.

## 12. Home navigation + hardening the mic permission fix

Added a Home button (plus making the logo itself clickable) that resets the
browse view — active category, search, price filter, sort, and any open
cart/checkout/confirmation modal — back to the initial landing state,
without touching the cart itself (going home is navigation, not a reset of
your list).

While testing this, re-examined the microphone permission fix from a
previous pass and found a subtler bug in it: `ensureMicPermission()` was
re-checking `micStream.active` on every click, and calling `getUserMedia()`
again — which can surface a fresh prompt — whenever that stream's track had
ended for any unrelated browser reason (tab backgrounded, power-saving,
etc). The permission grant itself doesn't disappear just because a track
ends, so this check was undoing the original fix in exactly the situations
it was meant to cover. Removed the re-check: once granted for this page
load, the app never calls `getUserMedia()` again. Also added a
`navigator.permissions.query` pre-check on load, so a returning visitor
whose browser already remembers the grant skips the request step entirely
rather than issuing a redundant (even if silent) call.

Verified both paths with Playwright: a fresh browser context (no prior
grant) calls `getUserMedia()` exactly once across five mic clicks; a
context pre-authorized at the browser level (simulating a returning
visitor) calls it zero times, going straight to `recognition.start()`.

## 13. Documentation pass

Wrote this log, the architecture doc, the data-pipeline doc, the 200-word
approach summary, and the README last — after the app was working and
tested, so the documentation describes what was actually built rather than
what was planned.

## What I'd do next with more time

- Swap the deterministic stock simulation for a real inventory field if
  this connected to a live BigBasket-style API
- Add a fuzzy-matching library (e.g. Levenshtein distance) for
  misheard/mistyped item names, rather than relying solely on the synonym
  table
- Expand the Hindi command vocabulary with more regional phrasing variants
  (this covers common Hindi/Hinglish patterns, not every dialect)
- Add automated UI tests (the Playwright scripts used during development
  were manual/ad hoc, not committed as a test suite)
