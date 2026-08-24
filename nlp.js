// ==========================================================================
// nlp.js — lightweight rule-based command understanding
//
// This is not a machine-learning model; it is a transparent, debuggable
// pipeline that covers the phrasing patterns a grocery voice assistant
// realistically needs, in English and Hindi (Devanagari + common
// transliteration). See docs/APPROACH.md for why this design was chosen
// over a heavier NLP library for an 8-hour scoped project.
//
// Pipeline: normalize -> strip price filter -> detect intent -> extract
// quantity -> resolve remaining words to a product via synonym expansion
// and token-overlap scoring against the catalog.
// ==========================================================================

// ---- 1. Synonym / vocabulary table --------------------------------------
// Maps colloquial English, Hindi transliteration, and Devanagari terms to a
// canonical English search token that appears in the product catalog
// (name, brand or sub-category). This is what lets "doodh", "milk" and
// "दूध" all resolve to the same shelf.
const SYNONYMS = {
  // dairy
  'doodh': 'milk', 'दूध': 'milk', 'milk': 'milk',
  'dahi': 'curd', 'दही': 'curd', 'curd': 'curd', 'yogurt': 'curd', 'yoghurt': 'curd',
  'paneer': 'paneer', 'पनीर': 'paneer',
  'makhan': 'butter', 'मक्खन': 'butter', 'butter': 'butter',
  'ghee': 'ghee', 'घी': 'ghee',
  'cheese': 'cheese', 'चीज़': 'cheese',
  // staples
  'chawal': 'rice', 'चावल': 'rice', 'rice': 'rice',
  'atta': 'atta', 'आटा': 'atta', 'flour': 'atta', 'maida': 'maida',
  'cheeni': 'sugar', 'चीनी': 'sugar', 'sugar': 'sugar', 'shakkar': 'sugar',
  'namak': 'salt', 'नमक': 'salt', 'salt': 'salt',
  'tel': 'oil', 'तेल': 'oil', 'oil': 'oil',
  'dal': 'dal', 'दाल': 'dal', 'daal': 'dal', 'lentil': 'dal', 'lentils': 'dal',
  'besan': 'besan', 'बेसन': 'besan',
  // beverages
  'chai': 'tea', 'चाय': 'tea', 'tea': 'tea',
  'coffee': 'coffee', 'कॉफ़ी': 'coffee', 'kaafi': 'coffee',
  'pani': 'water', 'पानी': 'water', 'water': 'water',
  'juice': 'juice', 'जूस': 'juice', 'ras': 'juice',
  'cold drink': 'soft drink', 'thanda': 'soft drink', 'soda': 'soft drink',
  // produce
  'pyaz': 'onion', 'प्याज': 'onion', 'onion': 'onion', 'onions': 'onion',
  'aloo': 'potato', 'आलू': 'potato', 'potato': 'potato', 'potatoes': 'potato', 'batata': 'potato',
  'tamatar': 'tomato', 'टमाटर': 'tomato', 'tomato': 'tomato', 'tomatoes': 'tomato',
  'seb': 'apple', 'सेब': 'apple', 'apple': 'apple', 'apples': 'apple',
  'kela': 'banana', 'केला': 'banana', 'banana': 'banana', 'bananas': 'banana', 'kele': 'banana',
  'santra': 'orange', 'संतरा': 'orange', 'orange': 'orange', 'oranges': 'orange',
  'nimbu': 'lemon', 'नींबू': 'lemon', 'lemon': 'lemon', 'lime': 'lemon',
  'adrak': 'ginger', 'अदरक': 'ginger', 'ginger': 'ginger',
  'lehsun': 'garlic', 'लहसुन': 'garlic', 'garlic': 'garlic',
  'hari mirch': 'chilli', 'मिर्च': 'chilli', 'chilli': 'chilli', 'chili': 'chilli', 'pepper': 'chilli',
  'dhaniya': 'coriander', 'धनिया': 'coriander', 'coriander': 'coriander',
  // proteins
  'ande': 'egg', 'अंडे': 'egg', 'anda': 'egg', 'egg': 'egg', 'eggs': 'egg',
  'machli': 'fish', 'मछली': 'fish', 'fish': 'fish',
  'murgi': 'chicken', 'मुर्गी': 'chicken', 'chicken': 'chicken',
  // bakery / snacks
  'bread': 'bread', 'ब्रेड': 'bread', 'pav': 'bread', 'roti': 'roti',
  'biscuit': 'biscuit', 'बिस्किट': 'biscuit', 'biscuits': 'biscuit', 'cookie': 'biscuit', 'cookies': 'biscuit',
  'namkeen': 'namkeen', 'नमकीन': 'namkeen', 'chips': 'chips', 'chips ': 'chips',
  'chocolate': 'chocolate', 'चॉकलेट': 'chocolate', 'chocolates': 'chocolate', 'candy': 'candy',
  'noodles': 'noodle', 'noodle': 'noodle', 'maggi': 'noodle', 'pasta': 'pasta',
  'cereal': 'cereal', 'cornflakes': 'cereal',
  'toothpaste': 'toothpaste', 'soap': 'soap', 'shampoo': 'shampoo',
};

// canonical token -> which sub_category / keyword to bias search towards
// (helps disambiguate short generic words like "oil" or "juice")
const CATEGORY_HINTS = {
  milk: 'Dairy', curd: 'Dairy', paneer: 'Dairy', butter: 'Dairy', cheese: 'Dairy',
  rice: 'Rice & Rice Products', atta: 'Atta, Flours & Sooji', maida: 'Atta, Flours & Sooji',
  sugar: 'Salt, Sugar & Jaggery', salt: 'Salt, Sugar & Jaggery', oil: 'Edible Oils & Ghee',
  ghee: 'Edible Oils & Ghee', dal: 'Dals & Pulses', tea: 'Tea', coffee: 'Coffee',
  water: 'Water', juice: 'Fruit Juices & Drinks', 'soft drink': 'Energy & Soft Drinks',
  onion: 'Fresh Vegetables', potato: 'Fresh Vegetables', tomato: 'Fresh Vegetables',
  ginger: 'Fresh Vegetables', garlic: 'Fresh Vegetables', chilli: 'Fresh Vegetables',
  coriander: 'Fresh Vegetables', apple: 'Fresh Fruits', banana: 'Fresh Fruits',
  orange: 'Fresh Fruits', lemon: 'Fresh Fruits', egg: 'Eggs', fish: 'Fish & Seafood',
  chicken: 'Eggs, Meat & Fish', bread: 'Breads & Buns', biscuit: 'Biscuits & Cookies',
  namkeen: 'Snacks & Namkeen', chips: 'Snacks & Namkeen', chocolate: 'Chocolates & Candies',
  noodle: 'Noodle, Pasta, Vermicelli', pasta: 'Noodle, Pasta, Vermicelli', cereal: 'Breakfast Cereals',
};

// ---- 2. Intent trigger phrases (checked longest-first) -------------------
const INTENT_PHRASES = {
  remove: [
    'remove', 'delete', 'take off', 'take out', 'hata do', 'hatao', 'हटा दो', 'हटाओ', 'निकाल दो',
  ],
  clearCart: [
    'clear my list', 'clear the list', 'clear cart', 'empty my list', 'empty the cart',
    'सूची खाली करो', 'सूची साफ़ करो', 'list khali karo',
  ],
  checkout: [
    'checkout', 'check out', 'place order', 'place my order', 'buy now', 'complete my order',
    'चेकआउट करो', 'ऑर्डर करो', 'ऑर्डर प्लेस करो', 'order karo',
  ],
  search: [
    'find me', 'find', 'search for', 'search', 'show me', 'look for', 'do you have',
    'ढूंढो', 'ढूंढ दो', 'खोजो', 'दिखाओ', 'dhoondo', 'dikhao', 'khojo',
  ],
  add: [
    'add', 'i need', 'i want to buy', 'i want', 'buy', 'get me', 'put', 'i would like',
    'jodo', 'jod do', 'chahiye', 'le lo', 'joड़ो',
    'जोड़ो', 'जोड़ दो', 'चाहिए', 'ले लो', 'ले आओ', 'मुझे', 'मंगवा दो',
  ],
};

// ---- 3. Number words -------------------------------------------------------
const NUMBER_WORDS = {
  en: { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
        eleven:11, twelve:12, dozen:12, couple:2, few:3 },
  hi: { 'ek':1, 'एक':1, 'do':2, 'दो':2, 'teen':3, 'तीन':3, 'char':4, 'चार':4, 'paanch':5, 'panch':5,
        'पांच':5, 'chhe':6, 'छह':6, 'saat':7, 'सात':7, 'aath':8, 'आठ':8, 'nau':9, 'नौ':9,
        'das':10, 'दस':10, 'dus':10 },
};

const PRICE_UNIT_WORDS = ['rupees', 'rupee', 'rs', '₹', 'रुपये', 'रुपए', 'रुपया'];

// quantity/pack units and generic descriptive filler — these don't identify
// a *specific* product on their own, so they're stripped before deciding
// whether a match is confident (a product doesn't need "flavour" or "litre"
// literally in its name to count as a match for those words).
const UNIT_OR_FILLER_WORDS = [
  'litre', 'litres', 'liter', 'liters', 'ltr', 'kg', 'kilo', 'kilos', 'gram', 'grams',
  'gm', 'gms', 'ml', 'pack', 'packet', 'packets', 'packs', 'dozen', 'piece', 'pieces',
  'pcs', 'bottle', 'bottles', 'box', 'boxes', 'bag', 'bags',
  'flavor', 'flavour', 'flavoured', 'flavored', 'fresh', 'pure', 'natural', 'good',
  'some', 'any', 'nice', 'best', 'few',
  'लीटर', 'किलो', 'ग्राम', 'पैकेट', 'डिब्बा', 'बोतल', 'पीस', 'ताज़ा', 'अच्छा',
];

// ---- Utility ---------------------------------------------------------------
function normalize(str) {
  return str.toLowerCase().trim().replace(/[.,!?]/g, '').replace(/\s+/g, ' ');
}

// Tolerant word compare: exact match, or one is a simple plural/singular
// variant of the other (juice/juices, banana/bananas) — without pulling in
// a full stemming library for an 8-hour scoped project.
function wordsMatch(a, b) {
  if (a === b) return true;
  const stripS = w => (w.length > 3 && w.endsWith('s')) ? w.slice(0, -1) : w;
  return stripS(a) === stripS(b);
}


function extractQuantity(text) {
  // digits, e.g. "2", "2x", "add 3 apples"
  const digitMatch = text.match(/\b(\d{1,3})\b/);
  if (digitMatch) {
    return { qty: parseInt(digitMatch[1], 10), text: text.replace(digitMatch[0], ' ') };
  }
  const words = text.split(' ');
  for (const w of words) {
    if (NUMBER_WORDS.en[w]) return { qty: NUMBER_WORDS.en[w], text: text.replace(w, ' ') };
    if (NUMBER_WORDS.hi[w]) return { qty: NUMBER_WORDS.hi[w], text: text.replace(w, ' ') };
  }
  return { qty: 1, text };
}

// Extract a price ceiling like "under 100", "100 se kam", "₹50 se neeche"
function extractPriceFilter(text) {
  let max = null;
  let cleaned = text;
  const patterns = [
    /under\s*(?:rs\.?|₹)?\s*(\d+)/i,
    /below\s*(?:rs\.?|₹)?\s*(\d+)/i,
    /less than\s*(?:rs\.?|₹)?\s*(\d+)/i,
    /(\d+)\s*(?:rupees?|rs\.?|₹)?\s*se\s*(?:kam|neeche|niche)/i,
    /(\d+)\s*(?:रुपये|रुपए)?\s*से\s*(?:कम|नीचे)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      max = parseInt(m[1], 10);
      cleaned = text.replace(m[0], ' ');
      break;
    }
  }
  return { max, text: cleaned };
}

function detectIntent(text) {
  // longer/more specific phrases first to avoid "add" matching inside "add to cart... remove"
  for (const phrase of INTENT_PHRASES.clearCart) if (text.includes(phrase)) return { intent: 'clearCart', phrase };
  for (const phrase of INTENT_PHRASES.checkout) if (text.includes(phrase)) return { intent: 'checkout', phrase };
  for (const phrase of INTENT_PHRASES.remove) if (text.includes(phrase)) return { intent: 'remove', phrase };
  for (const phrase of INTENT_PHRASES.search) if (text.includes(phrase)) return { intent: 'search', phrase };
  for (const phrase of INTENT_PHRASES.add) if (text.includes(phrase)) return { intent: 'add', phrase };
  return { intent: 'search', phrase: '' }; // default: treat bare item name as a search/add candidate
}

// Resolve remaining free-text into a canonical search token + raw leftover words
function resolveTokens(text) {
  const words = text.split(' ').map(w => w.trim()).filter(Boolean);
  const canonical = [];
  const leftover = [];
  for (const w of words) {
    if (UNIT_OR_FILLER_WORDS.includes(w)) continue; // drop units/generic descriptors entirely
    if (SYNONYMS[w]) { canonical.push(SYNONYMS[w]); continue; }
    // stem-tolerant lookup: "juices" -> "juice", "bananas" -> "banana"
    const stemmed = (w.length > 3 && w.endsWith('s')) ? w.slice(0, -1) : null;
    if (stemmed && SYNONYMS[stemmed]) { canonical.push(SYNONYMS[stemmed]); continue; }
    leftover.push(w);
  }
  // also check two-word phrases (e.g. "cold drink", "hari mirch")
  const joined = words.join(' ');
  for (const key of Object.keys(SYNONYMS)) {
    if (key.includes(' ') && joined.includes(key)) canonical.push(SYNONYMS[key]);
  }
  // leftover words that are still meaningful enough to require a literal
  // match against the product (short words like "ka"/"hai" are noise)
  const leftoverSignificant = leftover.filter(w => w.length >= 3);
  return { canonical: [...new Set(canonical)], leftover, leftoverSignificant, rawQuery: joined };
}

// ---- Main entry point --------------------------------------------------
// parseCommand(rawText) -> structured command object
function parseCommand(rawText) {
  let text = normalize(rawText);

  const priceResult = extractPriceFilter(text);
  text = priceResult.text.trim();

  const { intent, phrase } = detectIntent(text);
  if (phrase) text = text.replace(phrase, ' ').trim();

  if (intent === 'clearCart' || intent === 'checkout') {
    return { intent, raw: rawText };
  }

  const qtyResult = extractQuantity(text);
  text = qtyResult.text.replace(/\s+/g, ' ').trim();

  // strip filler words common to both languages
  const filler = ['to', 'my', 'list', 'cart', 'the', 'a', 'an', 'of', 'from', 'please', 'karo', 'kar', 'do',
                  'को', 'मेरी', 'सूची', 'से', 'में', 'लिए', 'कृपया', 'मुझे', 'है', 'हैं', 'जरा', 'थोड़ा', 'थोड़ी'];
  text = text.split(' ').filter(w => !filler.includes(w)).join(' ').trim();

  const { canonical, leftover, leftoverSignificant, rawQuery } = resolveTokens(text);

  return {
    intent,
    quantity: qtyResult.qty,
    priceMax: priceResult.max,
    canonicalTerms: canonical,
    freeText: leftover.join(' '),
    leftoverSignificant,
    significantWords: [...new Set([...canonical, ...leftoverSignificant])],
    rawQuery: rawQuery || text,
    raw: rawText,
  };
}

// ---- Product matching -------------------------------------------------
// Scores a product against parsed command terms. Returns a 0-1 confidence.
// words that, if present alongside a canonical term, signal a *different*
// product (flavoured spin-offs) rather than the plain item — keeps "milk"
// from matching "milkshake", "coffee" from matching "coffee candy", etc.
const DISQUALIFYING_NEIGHBOURS = {
  milk: ['shake', 'frappe', 'candy', 'toffee'],
  butter: ['biscuit', 'cookie', 'candy', 'toffee', 'popcorn'],
  tea: ['biscuit', 'cookie', 'candy'],
  coffee: ['candy', 'toffee', 'biscuit', 'cookie'],
};

function scoreProduct(product, cmd) {
  // Only the product's own name + brand identify *what it is* — the
  // sub-category label ("Fruit Juices & Drinks") must NOT be searched as if
  // it were part of the product's name, or every item filed under that
  // shelf (including things that aren't juice at all) would falsely score
  // as a match for the word "juice".
  const hayTokens = `${product.name} ${product.brand}`
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let score = 0;

  for (const term of cmd.canonicalTerms) {
    const disqualifiers = DISQUALIFYING_NEIGHBOURS[term] || [];
    if (disqualifiers.some(d => hayTokens.includes(d))) continue;

    // word-boundary match only — substring checks would let "pineapple"
    // satisfy a search for "apple", which is exactly the class of wrong
    // match this project needs to avoid.
    if (hayTokens.some(tok => wordsMatch(tok, term))) score += 0.7;

    // Being on the right shelf is a weak tie-breaker only, never enough by
    // itself to confirm a match — checked as an exact category equality,
    // not by treating the shelf label's own words as searchable text.
    const hint = CATEGORY_HINTS[term];
    if (hint && product.subCategory === hint) score += 0.15;
  }

  const words = cmd.rawQuery.split(' ').filter(w => w.length > 1);
  for (const w of words) {
    if (hayTokens.some(tok => wordsMatch(tok, w))) score += 0.25;
  }

  if (cmd.priceMax != null && product.price <= cmd.priceMax) score += 0.1;
  if (cmd.priceMax != null && product.price > cmd.priceMax) score -= 0.4;

  return Math.min(score, 1.5);
}

function findBestMatches(products, cmd, limit = 8) {
  if (!cmd.canonicalTerms.length && !cmd.rawQuery) return [];
  const scored = products
    .map(p => ({ p, score: scoreProduct(p, cmd) }))
    .filter(x => x.score > 0.15)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(x => x.p);
}

// ---- Strict matching for add/remove -----------------------------------
// Unlike findBestMatches (used for browsing/search, where "closest guess"
// results are fine), an "add" or "remove" command should only ever act on
// a product if the command is FULLY satisfied by that product — otherwise
// it's safer to say "not found" than to guess and add the wrong thing.
//
// Two different kinds of words need two different bars, though:
//  - a plain category word ("juice", "namkeen", "tea") is satisfied by the
//    product's own name OR simply by being on the right shelf — most real
//    namkeen products are branded things like "Banana Chips - Lime-N-Onion"
//    that never literally say "namkeen", so requiring the literal word
//    would wrongly reject the entire category.
//  - a specific descriptor the user actually said ("strawberry", "mango")
//    is a claim about *which variant* they want, and must be literally
//    present on the product — being merely on the same shelf as a
//    strawberry-flavoured item is not the same as being that item.
function wordCoverage(product, cmd) {
  const hayTokens = `${product.name} ${product.brand}`
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const canonicalTerms = cmd.canonicalTerms || [];
  const descriptorWords = cmd.leftoverSignificant || [];
  const total = canonicalTerms.length + descriptorWords.length;
  if (!total) return 0;

  let matched = 0;
  for (const term of canonicalTerms) {
    const disqualifiers = DISQUALIFYING_NEIGHBOURS[term] || [];
    if (disqualifiers.some(d => hayTokens.includes(d))) continue;
    const literalHit = hayTokens.some(tok => wordsMatch(tok, term));
    const hint = CATEGORY_HINTS[term];
    const shelfHit = hint && product.subCategory === hint;
    if (literalHit || shelfHit) matched++;
  }
  for (const word of descriptorWords) {
    if (hayTokens.some(tok => wordsMatch(tok, word))) matched++;
  }
  return matched / total;
}

// Returns the single best product only if it satisfies every significant
// word in the command; otherwise null (meaning: don't add anything).
function findConfidentMatch(products, cmd) {
  const total = (cmd.canonicalTerms || []).length + (cmd.leftoverSignificant || []).length;
  if (!total) return null;
  const fullyCovered = products.filter(p => wordCoverage(p, cmd) === 1);
  if (!fullyCovered.length) return null;
  const scored = fullyCovered
    .map(p => ({ p, score: scoreProduct(p, cmd) }))
    .sort((a, b) => b.score - a.score);
  return scored[0].p;
}
