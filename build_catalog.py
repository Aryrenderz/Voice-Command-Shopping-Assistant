"""
build_catalog.py
-----------------------------------------------------------------------
Converts the raw BigBasket "Products.csv" export (27,555 rows scraped
from bigbasket.com, columns: index/product/category/sub_category/brand/
sale_price/market_price/type/rating/description) into a trimmed JSON
catalog for VoiceCart's voice-activated search feature.

What this does, and why:
  1. Keeps only rows that are plausible "shopping list" grocery/household
     items. The raw file also covers cookware, pet supplies, stationery,
     pooja items and a large cosmetics range — out of scope for a grocery
     voice assistant, so those sub-categories are dropped.
  2. Maps BigBasket's own category/sub_category taxonomy onto VoiceCart's
     9 app categories (Produce, Dairy, Bakery, Meat & Seafood, Staples &
     Grains, Spices & Condiments, Snacks, Beverages, Household & Personal
     Care) so the shopping list groups real catalog items the same way it
     already groups voice/typed entries.
  3. Cleans the data: drops rows with missing product name/brand/price,
     de-duplicates near-identical listings, rounds prices.
  4. Caps the result at a few hundred items per category. The full file
     is ~16MB / 27K rows — far more than a client-side fetch/filter needs
     for a demo, and most of the long tail is redundant SKU variants of
     the same product. Highest-rated items are kept first within each
     category so the sample stays representative.

Run:  python3 build_catalog.py
Output: catalog.json  (copy into js/data/bigbasket-catalog.json in the app)
-----------------------------------------------------------------------
"""

import json
import math
import pandas as pd

SOURCE_CSV = "BigBasket Products.csv"
OUTPUT_JSON = "catalog.json"
PER_CATEGORY_CAP = 250  # keep the client-side fetch/filter snappy

# BigBasket category -> default VoiceCart category (used when
# sub_category doesn't need its own override below).
CATEGORY_DEFAULT = {
    "Fruits & Vegetables": "Produce",
    "Bakery, Cakes & Dairy": "Dairy",
    "Eggs, Meat & Fish": "Meat & Seafood",
    "Beverages": "Beverages",
    "Foodgrains, Oil & Masala": "Staples & Grains",
    "Snacks & Branded Foods": "Snacks",
    "Gourmet & World Food": "Staples & Grains",
    "Cleaning & Household": "Household & Personal Care",
    "Baby Care": "Household & Personal Care",
}

# sub_category overrides — checked before the category default, since
# sub_category is more specific (e.g. "Masalas & Spices" should be Spices
# & Condiments even though its parent category is Foodgrains, Oil & Masala).
SUBCATEGORY_OVERRIDE = {
    "Masalas & Spices": "Spices & Condiments",
    "Sauces, Spreads & Dips": "Spices & Condiments",
    "Spreads, Sauces, Ketchup": "Spices & Condiments",
    "Pickles & Chutney": "Spices & Condiments",
    "Salt, Sugar & Jaggery": "Staples & Grains",
    "Dals & Pulses": "Staples & Grains",
    "Rice & Rice Products": "Staples & Grains",
    "Atta, Flours & Sooji": "Staples & Grains",
    "Edible Oils & Ghee": "Staples & Grains",
    "Organic Staples": "Staples & Grains",
    "Dry Fruits": "Snacks",
    "Dairy & Cheese": "Dairy",
    "Dairy": "Dairy",
    "Non Dairy": "Dairy",
    "Cookies, Rusk & Khari": "Bakery",
    "Cakes & Pastries": "Bakery",
    "Breads & Buns": "Bakery",
    "Gourmet Breads": "Bakery",
    "Bakery Snacks": "Bakery",
    "Ice Creams & Desserts": "Dairy",
    "Snacks, Dry Fruits, Nuts": "Snacks",
    "Chocolates & Biscuits": "Snacks",
    "Chocolates & Candies": "Snacks",
    "Biscuits & Cookies": "Snacks",
    "Snacks & Namkeen": "Snacks",
    "Noodle, Pasta, Vermicelli": "Snacks",
    "Pasta, Soup & Noodles": "Snacks",
    "Breakfast Cereals": "Snacks",
    "Ready To Cook & Eat": "Snacks",
    "Indian Mithai": "Snacks",
    "Drinks & Beverages": "Beverages",
    "Tea": "Beverages",
    "Oral Care": "Household & Personal Care",
    "Bath & Hand Wash": "Household & Personal Care",
    "Feminine Hygiene": "Household & Personal Care",
    "Detergents & Dishwash": "Household & Personal Care",
    "Diapers & Wipes": "Household & Personal Care",
}

# sub_categories to drop outright even if their parent category is kept
# (mostly niche Beauty & Hygiene / Gourmet lines out of scope for a
# grocery shopping-list assistant).
DROP_SUBCATEGORIES = {
    "Skin Care", "Hair Care", "Fragrances & Deos", "Men's Grooming",
    "Makeup", "Health & Medicine", "Mothers & Maternity",
    "Cooking & Baking Needs",  # mostly gadgets/bakeware, not ingredients
    "Stationery", "Pooja Needs", "Party & Festive Needs", "Car & Shoe Care",
    "Feeding & Nursing", "Baby Accessories",  # bottles/gear, not consumables
    "Flower Bouquets, Bunches",
}

KEEP_TOP_CATEGORIES = set(CATEGORY_DEFAULT.keys()) | {"Beauty & Hygiene"}
# Beauty & Hygiene has no blanket default on purpose — only the curated
# sub-categories in SUBCATEGORY_OVERRIDE (Oral Care, Bath & Hand Wash,
# Feminine Hygiene) survive; everything else under it (skin care, makeup,
# fragrances, etc.) is dropped by map_category() returning None.


def map_category(category: str, sub_category: str) -> str | None:
    if sub_category in DROP_SUBCATEGORIES:
        return None
    if sub_category in SUBCATEGORY_OVERRIDE:
        return SUBCATEGORY_OVERRIDE[sub_category]
    return CATEGORY_DEFAULT.get(category)


def main():
    df = pd.read_csv(SOURCE_CSV)

    # Basic cleaning: require a product name, brand and a positive price.
    df = df.dropna(subset=["product", "brand", "sale_price"])
    df = df[df["sale_price"] > 0]

    # Only rows from a category we actually map somewhere.
    df = df[df["category"].isin(KEEP_TOP_CATEGORIES)]

    df["app_category"] = df.apply(
        lambda r: map_category(r["category"], r["sub_category"]), axis=1
    )
    df = df.dropna(subset=["app_category"])

    # De-duplicate near-identical listings (same product+brand, keep the
    # highest-rated / first one).
    df["rating"] = df["rating"].fillna(0)
    df = df.sort_values("rating", ascending=False)
    df = df.drop_duplicates(subset=["product", "brand"], keep="first")

    # Cap per app category, highest-rated first, so the sample stays a
    # representative cross-section rather than one huge bucket.
    df["_rank"] = df.groupby("app_category").cumcount()
    capped = df[df["_rank"] < PER_CATEGORY_CAP]

    records = []
    for _, row in capped.iterrows():
        records.append({
            "name": str(row["product"]).strip(),
            "brand": str(row["brand"]).strip(),
            "category": row["app_category"],
            "price": round(float(row["sale_price"]), 2),
            "rating": None if math.isnan(row["rating"]) or row["rating"] == 0 else round(float(row["rating"]), 1),
        })

    records.sort(key=lambda r: (r["category"], r["name"]))

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(records)} products to {OUTPUT_JSON}")
    counts = {}
    for r in records:
        counts[r["category"]] = counts.get(r["category"], 0) + 1
    for cat, n in sorted(counts.items()):
        print(f"  {cat}: {n}")


if __name__ == "__main__":
    main()
