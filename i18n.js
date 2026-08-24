// ==========================================================================
// i18n.js — UI string translations (English / Hindi)
// The voice NLP layer (nlp.js) understands Hindi input regardless of which
// UI language is selected; this file only controls what labels are shown.
// ==========================================================================

const I18N = {
  'en-IN': {
    tagline: 'Speak it. Shop it.',
    tapToSpeak: 'Tap to speak',
    listening: 'Listening…',
    processing: 'Thinking…',
    tickerHint: 'Try saying "add two litres of milk" or "मुझे दूध चाहिए"',
    commandPlaceholder: 'Type a command or search — e.g. "add 2 bananas" or "toothpaste under 100"',
    go: 'Go',
    under: 'Under ₹',
    sortRelevance: 'Relevance',
    sortPriceAsc: 'Price: Low to High',
    sortPriceDesc: 'Price: High to Low',
    sortRating: 'Top Rated',
    suggestionsTitle: 'You might also need',
    allProducts: 'All products',
    noResults: 'No products matched. Try another word, or check the suggestions above.',
    yourList: 'Your List',
    cartEmpty: 'Your list is empty. Say "add milk" to begin.',
    subtotal: 'Subtotal',
    tax: 'Taxes & charges (5%)',
    total: 'Total',
    clearList: 'Clear list',
    checkout: 'Checkout',
    addToList: 'Add',
    outOfStock: 'Out of stock',
    lowStock: 'Only a few left',
    seasonal: 'In season',
    orderPlaced: 'Order placed!',
    orderThanks: 'Thanks for shopping with Bol Basket. Your groceries are on the way.',
    orderId: 'Order ID',
    done: 'Done',
    micUnsupported: 'Voice input is not supported in this browser. You can still type commands above.',
    micDenied: 'Microphone access was denied. Please allow microphone access, or type your command instead.',
    resultsFor: 'Results for',
    all: 'All',
    pack: 'pack',
    packs: 'packs',
    confirmAddTitle: 'Add to your list?',
    confirmAddBtn: 'Yes, add it',
    confirmCancelBtn: 'Cancel',
    notFoundToast: 'Could not find that exact item — nothing was added',
    notFoundTicker: 'not found in catalog — nothing added',
  },
  'hi-IN': {
    tagline: 'बोलिए। खरीदिए।',
    tapToSpeak: 'बोलने के लिए टैप करें',
    listening: 'सुन रहे हैं…',
    processing: 'सोच रहे हैं…',
    tickerHint: 'बोलकर कहें "add two litres of milk" या "मुझे दूध चाहिए"',
    commandPlaceholder: 'कमांड टाइप करें या खोजें — जैसे "2 केले जोड़ो"',
    go: 'खोजें',
    under: '₹ से कम',
    sortRelevance: 'प्रासंगिकता',
    sortPriceAsc: 'कीमत: कम से ज़्यादा',
    sortPriceDesc: 'कीमत: ज़्यादा से कम',
    sortRating: 'टॉप रेटेड',
    suggestionsTitle: 'आपको यह भी चाहिए हो सकता है',
    allProducts: 'सभी उत्पाद',
    noResults: 'कोई उत्पाद नहीं मिला। कोई और शब्द आज़माएं, या ऊपर सुझाव देखें।',
    yourList: 'आपकी सूची',
    cartEmpty: 'आपकी सूची खाली है। शुरू करने के लिए "दूध जोड़ो" कहें।',
    subtotal: 'उप-योग',
    tax: 'कर व शुल्क (5%)',
    total: 'कुल',
    clearList: 'सूची खाली करें',
    checkout: 'चेकआउट',
    addToList: 'जोड़ें',
    outOfStock: 'स्टॉक में नहीं',
    lowStock: 'बहुत कम बचे हैं',
    seasonal: 'सीज़नल',
    orderPlaced: 'ऑर्डर हो गया!',
    orderThanks: 'Bol Basket से खरीदारी के लिए धन्यवाद। आपका सामान रास्ते में है।',
    orderId: 'ऑर्डर आईडी',
    done: 'हो गया',
    micUnsupported: 'इस ब्राउज़र में वॉइस इनपुट समर्थित नहीं है। आप ऊपर कमांड टाइप कर सकते हैं।',
    micDenied: 'माइक्रोफ़ोन एक्सेस अस्वीकृत कर दिया गया। कृपया एक्सेस दें, या अपनी कमांड टाइप करें।',
    resultsFor: 'इसके लिए परिणाम',
    all: 'सभी',
    pack: 'पैक',
    packs: 'पैक',
    confirmAddTitle: 'सूची में जोड़ें?',
    confirmAddBtn: 'हां, जोड़ें',
    confirmCancelBtn: 'रद्द करें',
    notFoundToast: 'यह उत्पाद नहीं मिला — कुछ नहीं जोड़ा गया',
    notFoundTicker: 'कैटलॉग में नहीं मिला — कुछ नहीं जोड़ा गया',
  }
};

function t(key, lang) {
  const dict = I18N[lang] || I18N['en-IN'];
  return dict[key] || I18N['en-IN'][key] || key;
}

function applyStaticTranslations(lang) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'), lang);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'), lang));
  });
}
