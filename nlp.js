/**
 * nlp.js
 * -----------------------------------------------------------------------
 * A small, dependency-free rule-based NLP layer.
 *
 * Why rule-based rather than a hosted NLU API? The assessment allows any
 * free-tier AI/ML service, but a lightweight intent grammar keeps the app
 * fully client-side (no API keys, no backend, no per-request cost or
 * latency) while still comfortably covering the phrasing patterns listed
 * in the brief ("Add milk" / "I need apples" / "I want to buy bananas").
 * The parser is isolated in this file so it can be swapped for a call to
 * a hosted NLU service later without touching UI code — `parseCommand()`
 * is the only function the rest of the app depends on.
 * -----------------------------------------------------------------------
 */

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, dozen: 12,
};

// Phrase groups that signal each intent. Longer / more specific phrases
// are listed first so they match before a shorter generic one does.
const INTENT_PATTERNS = [
  {
    intent: 'remove',
    patterns: [
      /^(?:remove|delete|take off|take .* off my list)\s+(.+)/i,
      /^(.+?)\s+(?:off my list|off the list)$/i,
    ],
  },
  {
    intent: 'search',
    patterns: [
      /^(?:find me|find|search for|look for|show me)\s+(.+)/i,
    ],
  },
  {
    intent: 'clear',
    patterns: [
      /^(?:clear|empty)\s+(?:my\s+)?(?:the\s+)?(?:shopping\s+)?list$/i,
    ],
  },
  {
    intent: 'add',
    patterns: [
      /^add\s+(.+?)(?:\s+to\s+(?:my\s+)?(?:the\s+)?list)?$/i,
      /^(?:i\s+)?(?:need|want to buy|want|would like|have to buy)\s+(.+)/i,
      /^(?:buy|get|put)\s+(.+?)(?:\s+on\s+(?:my\s+)?(?:the\s+)?list)?$/i,
    ],
  },
];

// Extracts a leading quantity (digit or number-word) from an item phrase.
// Returns { quantity, rest }.
function extractQuantity(phrase) {
  const trimmed = phrase.trim();

  // Digit form: "2 bottles of water", "5 oranges"
  const digitMatch = trimmed.match(/^(\d+)\s+(.*)$/);
  if (digitMatch) {
    return { quantity: parseInt(digitMatch[1], 10), rest: digitMatch[2] };
  }

  // Word form: "two bottles of water", "a dozen eggs"
  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  if (WORD_NUMBERS[firstWord] !== undefined) {
    const rest = trimmed.slice(firstWord.length).trim();
    return { quantity: WORD_NUMBERS[firstWord], rest };
  }

  return { quantity: 1, rest: trimmed };
}

// Strips filler units so "2 kg atta", "500 grams paneer" or "2 bottles of
// water" resolve to a clean item name with quantity/unit remembered for
// display. Covers both English count units and metric units common on
// Indian labels (kg, litre, gram, ml, packet).
function extractUnit(phrase) {
  const unitMatch = phrase.match(
    /^(bottles?|cans?|bags?|boxes?|packs?|packets?|loaves?|kgs?|kilograms?|grams?|g|litres?|liters?|l|ml|dozens?)\s+(?:of\s+)?(.+)$/i
  );
  if (unitMatch) {
    return { unit: unitMatch[1].toLowerCase(), rest: unitMatch[2] };
  }
  return { unit: null, rest: phrase };
}

// Pulls a price ceiling out of phrases like "under $5" / "less than 5
// dollars" / "under ₹100" / "less than 100 rupees" / "under 50 rs".
function extractPriceLimit(phrase) {
  const match = phrase.match(/(?:under|below|less than)\s+(?:₹|rs\.?|inr)?\s?(\d+(?:\.\d+)?)\s?(?:rupees|rs\.?|inr)?/i);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Parses a raw transcript (or typed string) into a structured command.
 * Returns:
 *   { intent: 'add'|'remove'|'search'|'clear'|'unknown',
 *     item: string|null,
 *     quantity: number,
 *     unit: string|null,
 *     priceLimit: number|null,
 *     raw: string }
 */
function parseCommand(rawText) {
  const raw = rawText.trim();
  const priceLimit = extractPriceLimit(raw);

  for (const group of INTENT_PATTERNS) {
    for (const pattern of group.patterns) {
      const match = raw.match(pattern);
      if (match) {
        if (group.intent === 'clear') {
          return { intent: 'clear', item: null, quantity: 1, unit: null, priceLimit: null, raw };
        }
        let phrase = (match[1] || '').trim();
        // Strip trailing "under ₹100" style clauses out of the item text.
        phrase = phrase.replace(/(?:under|below|less than)\s+(?:₹|\$|rs\.?|inr)?\s?\d+(?:\.\d+)?\s?(?:rupees|rs\.?|inr)?/i, '').trim();
        // Strip trailing "from my list" / "off my list" / "from the list" clauses.
        phrase = phrase.replace(/\s+(?:from|off)\s+(?:my|the)\s+list$/i, '').trim();
        const { quantity, rest: afterQty } = extractQuantity(phrase);
        const { unit, rest: itemName } = extractUnit(afterQty);
        const cleanName = itemName.replace(/^(to|for)\s+/i, '').trim();
        if (cleanName) {
          return {
            intent: group.intent,
            item: cleanName,
            quantity,
            unit,
            priceLimit,
            raw,
          };
        }
      }
    }
  }

  return { intent: 'unknown', item: null, quantity: 1, unit: null, priceLimit, raw };
}
