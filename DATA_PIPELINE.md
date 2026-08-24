# Data pipeline: BigBasket CSV → `data.js`

The provided `BigBasket Products.csv` has ~38,000 rows across 11 top-level
categories, including many that aren't groceries in the sense this
assistant targets (Beauty & Hygiene, Kitchen/Garden/Pets, Cleaning &
Household). Shipping all 38,000 rows to the browser would bloat the app for
no benefit — a voice grocery assistant needs a believable, well-organized
shelf, not the entire warehouse. The curation was a one-time Python script,
not something the app does at runtime.

## Steps

1. **Filter to grocery-relevant categories.** Kept: Beverages; Bakery,
   Cakes & Dairy; Foodgrains, Oil & Masala; Snacks & Branded Foods; Fruits &
   Vegetables; Eggs, Meat & Fish. Dropped: Beauty & Hygiene, Kitchen/Garden/
   Pets, Cleaning & Household, Baby Care, and most of Gourmet & World Food
   (kept only where it overlapped the above).

2. **Guarantee common staples exist.** A first pass that only sampled the
   top-rated items per sub-category tended to surface premium/niche
   products (flavoured milkshakes ranked above plain milk, because the
   dataset's rating field skews toward niche items with fewer, more
   enthusiastic reviews). A second, explicit pass searches for ~25 staple
   keywords (milk, bread, rice, sugar, salt, atta, dal, oil, ghee, eggs,
   banana, apple, onion, potato, tomato, tea, coffee, butter, curd, paneer,
   etc.) with an exclusion list per keyword (e.g. `milk` excludes anything
   whose name also contains "shake", "frappe", "soya", "elaichi") so the
   voice assistant can reliably resolve "add milk" to an actual milk pouch.

3. **Deduplicate and merge.** The staples pass runs first so common items
   get stable, low IDs; the broader rating-sorted pass fills out the rest
   of the catalog afterward, skipping anything already picked (matched on
   a normalized name prefix).

4. **Emit `data.js`.** The final ~284-item list is serialized as
   `const PRODUCTS = [...]` — no fetch call, no build step, just a
   `<script>` tag, which keeps the app a pure static site. `products.json`
   is kept alongside as the same data in plain JSON, in case it's useful
   for re-processing later.

## Reproducing or extending it

The extraction scripts aren't part of the shipped app (they're a one-time
data step), but the logic is straightforward to redo if you want to widen
or narrow the catalog:

```python
import csv, json

TARGET_CATEGORIES = {
    'Beverages', 'Bakery, Cakes & Dairy', 'Foodgrains, Oil & Masala',
    'Snacks & Branded Foods', 'Fruits & Vegetables', 'Eggs, Meat & Fish',
}

with open('BigBasket Products.csv', encoding='utf-8') as f:
    rows = [r for r in csv.DictReader(f) if r['category'] in TARGET_CATEGORIES]

# then: sample per sub_category, dedupe by normalized name, and emit
# {id, name, brand, category, subCategory, price, mrp, rating} objects
```

Each product object has this shape:

```json
{
  "id": 1,
  "name": "Fresh Toned Milk",
  "brand": "Amul",
  "category": "Bakery, Cakes & Dairy",
  "subCategory": "Dairy",
  "price": 33.0,
  "mrp": 33.0,
  "rating": 4.2
}
```

`subCategory` is what the NLP layer's `CATEGORY_HINTS` table and the smart
suggestions' `PAIR_SUGGESTIONS` table key off — it's the most useful field
in the whole catalog for both search relevance and "goes well together"
logic.
