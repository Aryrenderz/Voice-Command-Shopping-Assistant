# Approach

I built Bol Basket as a static, dependency-free web app (HTML/CSS/JS) so it
runs anywhere with zero build tooling and stays auditable. 
The Web Speech API handles voice capture in English and Hindi; a
hand-written rule-based parser (`nlp.js`) turns the transcript into an
intent (add/remove/search/checkout), a quantity, and a canonical product
term, using a bilingual synonym table so "milk", "doodh", and "दूध" all
resolve the same way. I chose rules over an external NLP/LLM API so the
matching logic is transparent, debuggable, and free of network dependency
or latency mid-command — appropriate for a scoped assessment, though a
production version would likely add an LLM fallback for phrasing the rules
miss.

Product data comes from the provided BigBasket CSV, filtered to
grocery-relevant categories and curated so common staples (milk, rice,
sugar) resolve to plain products rather than niche variants. Smart
suggestions combine three simple signals: sub-category pairing ("goes well
together"), a `localStorage`-backed purchase history ("you usually buy
this"), and a month-based seasonal calendar. Every voice action is mirrored
by a typed command box, so the app degrades gracefully on browsers without
speech support.
