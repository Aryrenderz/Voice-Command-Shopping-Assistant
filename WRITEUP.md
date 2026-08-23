# Approach (deliverable #3)

VoiceCart is a dependency-free client-side app — plain HTML, CSS and
JavaScript — localized for the Indian grocery market, so it loads
instantly, needs no API keys or backend, and is easy to review and host.
The Web Speech API handles voice capture across eight Indian languages; a
rule-based NLP module (`nlp.js`) turns transcripts like "Add 2 kg atta"
into structured commands, covering metric units, rupee price filters, and
mixed Hindi/English phrasing without an external NLU service's cost or
latency.

Voice search runs against a real dataset: ~2,250 products distilled from
BigBasket's public 27K-row catalog via an ETL script that filters out
non-grocery noise and maps BigBasket's taxonomy onto the app's own
category set. Items are auto-categorized with a word-boundary-aware
matcher, and smart suggestions combine seasonal picks (matched to Indian
crop seasons), pairing rules, and local purchase history.

The interface is mobile-first with a large mic target, spoken
confirmations, and a text-box fallback. Microphone permission is
requested once via `getUserMedia` and cached, rather than re-prompting on
every tap. State persists in `localStorage`. Code is split into
`data.js` / `nlp.js` / `app.js` by responsibility, each documented so
design trade-offs stay visible.
