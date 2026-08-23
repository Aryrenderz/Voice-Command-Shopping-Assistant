/**
 * data.js
 * -----------------------------------------------------------------------
 * Static reference data used by the assistant: category keywords, a mock
 * product catalog (stand-in for a real product API), seasonal picks,
 * substitute suggestions and "goes well with" pairings.
 *
 * Localized for the Indian grocery market: Indian brands, INR pricing,
 * Indian staples/spices as their own category, produce and seasonal
 * items matched to Indian crop seasons, and Indian-language voice input.
 *
 * In a production system this file would be replaced by calls to a real
 * product/catalog service (e.g. a quick-commerce or supermarket API). For
 * an assessment scope it is kept as structured, easily-swappable local
 * data so the rest of the app (NLP, UI, suggestion engine) does not need
 * to change when a real backend is introduced later.
 * -----------------------------------------------------------------------
 */

// Map of category -> list of keywords used to auto-categorize free-text
// item names (English + common Hindi/transliterated terms, since Indian
// shoppers routinely mix languages — "doodh" alongside "milk").
const CATEGORY_KEYWORDS = {
  Produce: ['onion', 'pyaz', 'tomato', 'tamatar', 'potato', 'aloo', 'brinjal',
    'baingan', 'okra', 'bhindi', 'spinach', 'palak', 'cauliflower', 'gobi',
    'cabbage', 'patta gobi', 'carrot', 'gajar', 'cucumber', 'kheera',
    'capsicum', 'shimla mirch', 'garlic', 'lehsun', 'ginger', 'adrak',
    'lemon', 'nimbu', 'mango', 'aam', 'banana', 'kela', 'apple', 'seb',
    'papaya', 'guava', 'amrud', 'pomegranate', 'anar', 'grapes', 'angoor',
    'coriander leaves', 'dhania patta', 'mint', 'pudina', 'curry leaves'],
  Dairy: ['milk', 'doodh', 'paneer', 'curd', 'dahi', 'yogurt', 'yoghurt',
    'ghee', 'butter', 'makhan', 'cheese', 'cream', 'buttermilk', 'chaas',
    'lassi', 'egg', 'eggs', 'anda'],
  Bakery: ['bread', 'pav', 'bun', 'rusk', 'khari', 'cake', 'toast'],
  'Meat & Seafood': ['chicken', 'murgi', 'mutton', 'lamb', 'fish', 'machli',
    'prawns', 'shrimp', 'rohu', 'pomfret'],
  'Staples & Grains': ['atta', 'wheat flour', 'maida', 'rice', 'chawal',
    'basmati', 'dal', 'lentil', 'moong', 'toor', 'arhar', 'chana',
    'rajma', 'besan', 'poha', 'sooji', 'rava', 'oats', 'sugar', 'chini',
    'jaggery', 'gur', 'sunflower oil', 'mustard oil', 'cooking oil', 'vanaspati'],
  'Spices & Condiments': ['masala', 'turmeric', 'haldi', 'chilli powder',
    'mirchi powder', 'cumin', 'jeera', 'coriander powder', 'dhania powder',
    'garam masala', 'salt', 'namak', 'pickle', 'achaar', 'sauce', 'ketchup',
    'chutney', 'papad'],
  Snacks: ['namkeen', 'bhujia', 'chips', 'biscuit', 'cookies', 'chocolate',
    'mixture', 'sev', 'nuts', 'mathri', 'samosa', 'popcorn', 'noodles'],
  Beverages: ['tea', 'chai', 'coffee', 'juice', 'water', 'pani', 'soda',
    'cola', 'soft drink', 'cold drink'],
  'Household & Personal Care': ['detergent', 'soap', 'sabun', 'shampoo',
    'toothpaste', 'toilet cleaner', 'dishwash', 'tissue', 'phenyl',
    'agarbatti', 'hair oil', 'sanitary'],
};

// Small hand-written fallback catalog — used only if the real BigBasket
// catalog (js/data/bigbasket-catalog.json, ~2,250 products, see
// js/data/build_catalog.py) fails to load, e.g. the app is opened via
// file:// without a local server, or the fetch fails while offline.
// Kept intentionally tiny; the real catalog is the one users see day to day.
const FALLBACK_CATALOG = [
  { name: 'Toned Milk (1L)', brand: 'Amul', category: 'Dairy', price: 66 },
  { name: 'Butter (100g)', brand: 'Amul', category: 'Dairy', price: 56 },
  { name: 'Paneer (200g)', brand: 'Amul', category: 'Dairy', price: 90 },
  { name: 'Curd (400g)', brand: 'Mother Dairy', category: 'Dairy', price: 40 },
  { name: 'Cow Ghee (500ml)', brand: 'Amul', category: 'Dairy', price: 320 },
  { name: 'Bread (400g)', brand: 'Britannia', category: 'Bakery', price: 45 },
  { name: 'Whole Wheat Atta (5kg)', brand: 'Aashirvaad', category: 'Staples & Grains', price: 255 },
  { name: 'Basmati Rice (1kg)', brand: 'India Gate', category: 'Staples & Grains', price: 120 },
  { name: 'Toor Dal (1kg)', brand: 'Tata Sampann', category: 'Staples & Grains', price: 165 },
  { name: 'Sunflower Oil (1L)', brand: 'Fortune', category: 'Staples & Grains', price: 145 },
  { name: 'Iodized Salt (1kg)', brand: 'Tata', category: 'Spices & Condiments', price: 28 },
  { name: 'Garam Masala (100g)', brand: 'Everest', category: 'Spices & Condiments', price: 95 },
  { name: 'Turmeric Powder (100g)', brand: 'MDH', category: 'Spices & Condiments', price: 45 },
  { name: 'Tomato Ketchup (500g)', brand: 'Kissan', category: 'Spices & Condiments', price: 120 },
  { name: '2-Minute Noodles (4-pack)', brand: 'Maggi', category: 'Snacks', price: 56 },
  { name: 'Aloo Bhujia (200g)', brand: "Haldiram's", category: 'Snacks', price: 55 },
  { name: 'Parle-G Biscuits (200g)', brand: 'Parle', category: 'Snacks', price: 20 },
  { name: 'Good Day Biscuits (150g)', brand: 'Britannia', category: 'Snacks', price: 35 },
  { name: 'Tea Gold (250g)', brand: 'Tata Tea', category: 'Beverages', price: 140 },
  { name: 'Classic Instant Coffee (50g)', brand: 'Nescafé', category: 'Beverages', price: 165 },
  { name: 'Mixed Fruit Juice (1L)', brand: 'Real', category: 'Beverages', price: 110 },
  { name: 'Packaged Drinking Water (1L)', brand: 'Bisleri', category: 'Beverages', price: 20 },
  { name: 'Strong Teeth Toothpaste (200g)', brand: 'Colgate', category: 'Household & Personal Care', price: 95 },
  { name: 'Dishwash Gel (500ml)', brand: 'Vim', category: 'Household & Personal Care', price: 99 },
  { name: 'Onion (1kg)', brand: 'Farm Fresh', category: 'Produce', price: 35 },
  { name: 'Tomato (1kg)', brand: 'Farm Fresh', category: 'Produce', price: 40 },
  { name: 'Potato (1kg)', brand: 'Farm Fresh', category: 'Produce', price: 28 },
  { name: 'Alphonso Mango (1kg)', brand: 'Farm Fresh', category: 'Produce', price: 150 },
  { name: 'Banana (1 dozen)', brand: 'Farm Fresh', category: 'Produce', price: 60 },
  { name: 'Chicken Curry Cut (1kg)', brand: 'Licious', category: 'Meat & Seafood', price: 220 },
];

// Substitute suggestions: shown when the given item is added, offering a
// commonly-requested alternative (e.g. dietary preference or "out of
// stock" stand-in). Chosen for relevance to Indian kitchens.
const SUBSTITUTES = {
  milk: 'soy milk',
  'toned milk': 'double toned milk',
  sugar: 'jaggery',
  ghee: 'vanaspati',
  paneer: 'tofu',
  maida: 'atta',
  rice: 'brown rice',
  butter: 'margarine',
};

// "Goes well with" pairings, used to power the "you might also need"
// suggestion chips once an item is added — tuned to common Indian meals.
const PAIRINGS = {
  dal: ['rice', 'ghee'],
  atta: ['ghee', 'dal'],
  tea: ['milk', 'sugar'],
  chai: ['milk', 'sugar'],
  maggi: ['ketchup'],
  dosa: ['sambar', 'chutney'],
  poha: ['peanuts', 'curry leaves'],
  bread: ['butter', 'jam'],
  rice: ['dal', 'curd'],
  paratha: ['curd', 'pickle'],
};

// Seasonal picks by month (0 = January ... 11 = December), matched to
// Indian crop seasons rather than a Western produce calendar. A real
// system would source this from a mandi/produce-calendar API.
const SEASONAL_ITEMS = {
  0: ['carrot', 'peas'],
  1: ['spinach', 'methi'],
  2: ['mustard greens', 'strawberries'],
  3: ['mango', 'watermelon'],
  4: ['mango', 'litchi'],
  5: ['jackfruit', 'muskmelon'],
  6: ['corn', 'jamun'],
  7: ['pear', 'apple'],
  8: ['pomegranate', 'guava'],
  9: ['sweet potato', 'custard apple'],
  10: ['orange', 'carrot'],
  11: ['strawberries', 'peas'],
};

// Languages offered in the language picker. BCP-47 codes are what the
// Web Speech API (SpeechRecognition) expects for the `lang` property.
// Indian English plus the major Indian languages Chrome's speech engine
// supports, with Hindi given top billing alongside English (India).
const SUPPORTED_LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'हिन्दी' },
  { code: 'bn-IN', label: 'বাংলা' },
  { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'te-IN', label: 'తెలుగు' },
  { code: 'mr-IN', label: 'मराठी' },
  { code: 'gu-IN', label: 'ગુજરાતી' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
];

// Categorizes free-text item names in three passes, from most to least
// specific. A naive "first substring match wins" approach mis-files
// compound phrases — e.g. "potato chips" would match Produce's "potato"
// before Snacks' "chips" ever gets a chance, and "tomato ketchup" would
// land in Produce instead of Spices & Condiments. Noun phrases put the
// head noun last ("potato CHIPS", "tomato KETCHUP"), so pass 2 scans
// words from right to left looking for an exact keyword match before
// falling back to loose substring matching.
function categorize(itemName) {
  const lower = itemName.toLowerCase().trim();
  const words = lower.split(/\s+/);

  // Pass 1: multi-word keywords (e.g. "curry leaves", "garam masala")
  // are unambiguous on their own — take the longest match.
  let best = null;
  let bestLen = 0;
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (kw.includes(' ') && lower.includes(kw) && kw.length > bestLen) {
        best = category;
        bestLen = kw.length;
      }
    }
  }
  if (best) return best;

  // Pass 2: exact match against the head noun, scanning right to left
  // ("potato chips" -> checks "chips" first, matches Snacks).
  for (let i = words.length - 1; i >= 0; i--) {
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.includes(words[i])) return category;
    }
  }

  // Pass 3: fallback loose substring match (handles plurals/variants
  // like "tomatoes" matching keyword "tomato"), longest keyword wins.
  let bestCategory = 'Other';
  let bestSubLen = 0;
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw) && kw.length > bestSubLen) {
        bestCategory = category;
        bestSubLen = kw.length;
      }
    }
  }
  return bestCategory;
}
