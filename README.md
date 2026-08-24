# Bol Basket — Voice Command Shopping Assistant

A bilingual (English + Hindi) voice-controlled grocery shopping list. Say
**"add milk"** or **"मुझे दूध चाहिए"** and watch it land in your cart — with
smart suggestions, out-of-stock substitutes, and a receipt-style checkout
along the way.

Built as a technical assessment project against the brief in
[`docs/assignment-brief.md`](docs/assignment-brief.md). The 200-word approach
summary the brief asks for is in [`docs/APPROACH.md`](docs/APPROACH.md); the
full build log is in [`docs/DEVELOPMENT_LOG.md`](docs/DEVELOPMENT_LOG.md).

**Live demo:** **[Launch Voice-Command Shopping Assistant](https://voice-command-shopping-assistant-murex-nu.vercel.app/)**

**Note:** Please ensure you allow microphone permissions in your browser when prompted so the voice recognition features work properly.

## Local Setup Instructions

If you want to run this project locally on your machine:

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Aryrenderz/Voice-Command-Shopping-Assistant.git](https://github.com/Aryrenderz/Voice-Command-Shopping-Assistant.git)
   cd Voice-Command-Shopping-Assistant

## What it does

| Requirement from the brief | How it's implemented |
|---|---|
| Voice command recognition | Web Speech API (`SpeechRecognition`), tap-to-talk |
| NLP for varied phrasing | Rule-based parser (`nlp.js`) — handles "add X", "I need X", "buy X", "get me X" as the same intent |
| Multilingual input | English (`en-IN`) and Hindi (`hi-IN`) voice recognition, plus a Hindi/English synonym dictionary so "milk", "doodh" and "दूध" all resolve to the same product |
| Product recommendations | "You usually buy this" — based on a persisted local history of what you've added before |
| Seasonal recommendations | Produce tagged "In season" based on the current month against a simple seasonal calendar |
| Substitutes | Out-of-stock items automatically surface 4 alternatives from the same shelf |
| Add / remove / modify items | Voice or typed commands, plus +/− steppers on every product card and cart line |
| Auto-categorization | Every product carries its BigBasket category & sub-category, used for filter chips and grouping |
| Quantity via voice | "add 2 bananas", "teen Kele add karo", "ek kilo chawal" — digits, English number words, and Hindi number words all parse |
| Voice-activated search | "find toothpaste", "ढूंढो टूथपेस्ट" |
| Price range filtering | "toothpaste under 100", "tea under 300 rupees", "500 rupaye se kam", plus a manual price field in the UI |
| Minimalist, visual-feedback UI | Ticker log + toasts show exactly what was heard and what action was taken, in real time |
| Confirm before committing | Every add — by voice, typed command, or a product card's own button — opens a confirmation dialog with the product's name, brand, category, quantity, and price; nothing reaches the cart until you confirm |
| Only add what's actually available | A strict matcher requires the exact item (or, for a plain category word, the right shelf) to genuinely be in the catalog before it's offered for confirmation — a request for something not stocked (e.g. a flavour that isn't sold) resolves to "not found," never a silent substitute |
| Loading / error states | Mic listening animation, disabled controls for out-of-stock items, friendly no-match / no-speech / mic-denied messages |

## Tech stack

Plain **HTML / CSS / JavaScript** — no build step, no framework, no bundler.
This was a deliberate choice for an 8-hour assessment: it keeps the whole
project auditable in four small files, runs instantly from a static host,
and needs zero dependency maintenance. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the reasoning and the
data/control flow.

- **Voice input:** browser-native Web Speech API (Chrome/Edge on desktop &
  Android; Safari has partial support — see [Browser support](#browser-support))
- **Data:** a curated ~280-item subset of the provided BigBasket product
  catalog, baked into `data.js` at build time (see
  [`docs/DATA_PIPELINE.md`](docs/DATA_PIPELINE.md))
- **Persistence:** `localStorage`, used only for your "usual picks" history
  (nothing leaves your browser)

## Running it locally

No install, no build. Any static file server works because the app only
uses relative script tags — opening `index.html` directly also works in most
browsers, though some browsers block microphone access on the `file://`
protocol, so a local server is recommended:

```bash
cd voice-shopping-assistant
python3 -m http.server 8000
# then open http://localhost:8000
```

or, with Node installed:

```bash
npx serve .
```

Grant microphone permission when prompted, tap the mic button, and speak. If
your browser doesn't support the Web Speech API, the text box above the
product grid accepts the exact same commands typed instead of spoken — every
voice feature has a typed fallback.

## Deployment

This is a static site (HTML/CSS/JS, no server-side code), so any static host
works. Two free options that fit the brief's "AWS / Firebase / Google Cloud"
suggestion:

**GitHub Pages** (simplest, matches the GitHub-repo deliverable directly):
1. Push this folder to a GitHub repository
2. Repo Settings → Pages → Deploy from branch → `main` / root
3. Your app is live at `https://<username>.github.io/<repo>/`

**Netlify / Vercel** (also free, slightly faster to set up from a fresh repo):
1. Import the GitHub repo on either platform
2. Framework preset: "Other" / static — no build command needed
3. Publish directory: `/`

Either way, note that the Web Speech API requires HTTPS (or `localhost`) to
access the microphone — both options serve over HTTPS by default, so no
extra configuration is needed there.

## Browser support

The Web Speech API is not part of a web standard yet, so support varies:

| Browser | Voice input |
|---|---|
| Chrome / Edge (desktop & Android) | ✅ Full support, both languages |
| Safari (macOS/iOS) | ⚠️ Partial — works but can be less reliable with Hindi |
| Firefox | ❌ Not supported — the app detects this and shows the typed-command box as the primary input instead |

This is why every voice feature is mirrored by the text command bar: the app
is fully usable with a keyboard on any browser.

## Project structure

```
voice-shopping-assistant/
├── index.html          # App shell / markup
├── style.css            # Design system + all styling
├── data.js               # Curated product catalog (generated from the BigBasket CSV)
├── i18n.js                # English / Hindi UI string dictionary
├── nlp.js                  # Command parsing + product matching (the "brain")
├── app.js                   # State, rendering, event wiring, speech recognition
├── products.json              # Same catalog as data.js, as plain JSON (for reference/reuse)
└── docs/
    ├── assignment-brief.md      # The original brief, for reference
    ├── APPROACH.md                # 200-word write-up (the brief's deliverable #3)
    ├── ARCHITECTURE.md              # How the pieces fit together and why
    ├── DATA_PIPELINE.md               # How the BigBasket CSV became data.js
    └── DEVELOPMENT_LOG.md               # Step-by-step build log
```

## Known limitations

- Voice recognition quality depends entirely on the browser's built-in
  engine — Anthropic/Claude did not train or fine-tune any speech model here.
- The product catalog is a curated ~280-item slice of the ~38,000-row
  BigBasket dataset (grocery-relevant categories only), not the full file —
  see `docs/DATA_PIPELINE.md` for why and how.
- "Out of stock" / "low stock" flags are simulated deterministically (not
  live inventory) so the demo behaves consistently across reloads.
- There's no backend or real payment step — checkout generates a mock order
  ID and clears the cart, matching the brief's scope (a shopping *list*
  manager, not a payment system).
