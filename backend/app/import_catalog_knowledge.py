"""Import crop and problem knowledge explicitly printed in the CLSL catalogue.

This importer is intentionally conservative. A mapping is created only when one
of the configured catalogue phrases occurs in a product's use/benefit text. It
does not infer registrations, doses, or recommendations from external sources.
"""

import json
import re
import sys
import uuid
from pathlib import Path

from .config import INITIAL_ADMIN_EMPLOYEE_CODE
from .db import connection


CATALOG_NOTE = "Catalog-derived: explicit wording in CLSL English Catalogue 2023"

# Canonical crop name followed by literal catalogue spellings/aliases. Generic
# catalogue groups are retained because some records state only a crop group.
CROP_RULES: dict[str, tuple[str, ...]] = {
    "Apple": ("apple",),
    "Black Gram": ("black gram", "blackgram"),
    "Brinjal": ("brinjal",),
    "Chickpea": ("chickpea", "chickprea"),
    "Chilli": ("chilli", "chillies", "chilies"),
    "Cotton": ("cotton",),
    "Garlic": ("garlic",),
    "Grapes": ("grape", "grapes"),
    "Groundnut": ("groundnut", "ground nut"),
    "Ladyfinger / Okra": ("ladyfinger", "lady finger", "okra"),
    "Maize": ("maize", "corn"),
    "Mango": ("mango",),
    "Onion": ("onion",),
    "Paddy / Rice": ("paddy", "rice"),
    "Papaya": ("papaya",),
    "Pineapple": ("pineapple", "pineapples"),
    "Potato": ("potato",),
    "Soybean": ("soybean", "soyabean"),
    "Sugarcane": ("sugarcane",),
    "Sorghum": ("sorghum", "jowar"),
    "Tea": ("tea",),
    "Tobacco": ("tobacco",),
    "Tomato": ("tomato", "tomatoes"),
    "Turmeric": ("turmeric",),
    "Wheat": ("wheat",),
    "Cereals": ("cereal", "cereals"),
    "Fruits": ("fruit crops", "fruits"),
    "Oilseed Crops": ("oil seed crop", "oilseed crop"),
    "Plantation Crops": ("plantation crop", "plantation crops"),
    "Pulses": ("pulse crop", "pulses crop"),
    "Vegetables": ("vegetable crops", "vegetables"),
}

# issue_type, canonical name, and literal phrases found in catalogue prose.
PROBLEM_RULES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    ("bacterial_disease", "Bacterial blast", ("bacterial blast",)),
    ("bacterial_disease", "Bacterial diseases", ("bacterial diseases",)),
    ("fungal_disease", "Anthracnose", ("anthracnose",)),
    ("fungal_disease", "Blast", ("blast",)),
    ("fungal_disease", "Black scurf", ("black scurf",)),
    ("fungal_disease", "Collar rot", ("collar rot",)),
    ("fungal_disease", "Damping-off", ("damping off", "damping-off")),
    ("fungal_disease", "Dieback", ("die back", "dieback")),
    ("fungal_disease", "Downy mildew", ("downy mildew", "downey mildew")),
    ("fungal_disease", "Early blight", ("early blight",)),
    ("fungal_disease", "Fusarium", ("fusarium",)),
    ("fungal_disease", "Fruit rot", ("fruit rot",)),
    ("fungal_disease", "Late blight", ("late blight",)),
    ("fungal_disease", "Leaf blotch", ("leaf blotch", "leafblotch")),
    ("fungal_disease", "Leaf spot", ("leaf spot",)),
    ("fungal_disease", "Powdery mildew", ("powdery mildew",)),
    ("fungal_disease", "Premature leaf fall", ("premature leaf fall",)),
    ("fungal_disease", "Purple blotch", ("purple blotch",)),
    ("fungal_disease", "Rhizoctonia", ("rhizoctonia",)),
    ("fungal_disease", "Root rot", ("root rot", "root rots")),
    ("fungal_disease", "Rust", ("rust", "rusts")),
    ("fungal_disease", "Scab", ("scab",)),
    ("fungal_disease", "Seed rot", ("seed rot", "seed rots")),
    ("fungal_disease", "Seed/soil-borne fungal diseases", ("seed/soil-borne fungal diseases", "seed borne diseases")),
    ("fungal_disease", "Sheath blight", ("sheath blight", "seathblight")),
    ("fungal_disease", "Sheath rot", ("sheath rot",)),
    ("fungal_disease", "Smut", ("smut",)),
    ("fungal_disease", "Stem rot", ("stem rot",)),
    ("fungal_disease", "Tikka disease", ("tika", "tikka")),
    ("fungal_disease", "Wilt", ("wilt",)),
    ("fungal_disease", "Yellow rust", ("yellow rust",)),
    ("fungal_disease", "Red rot", ("red rot",)),
    ("insect_pest", "Aphids", ("aphid", "aphids")),
    ("insect_pest", "Bollworms", ("bollworm", "bollworms", "ballworm")),
    ("insect_pest", "Brown planthopper", ("brown plant hopper", "brown planthopper", "bph")),
    ("insect_pest", "Caterpillars", ("caterpillar", "caterpillars")),
    ("insect_pest", "Chewing pests", ("chewing pest", "chewing pests")),
    ("insect_pest", "Diamondback moth", ("diamondback moth", "dimond backmoth")),
    ("insect_pest", "Earhead bugs", ("earhead bug", "earhead bugs")),
    ("insect_pest", "Fall armyworm", ("fall armyworm",)),
    ("insect_pest", "Fruit borer", ("fruit borer", "fruit borers")),
    ("insect_pest", "Green leafhopper", ("green leaf hopper", "glh")),
    ("insect_pest", "Hairy caterpillar", ("hairy caterpillar",)),
    ("insect_pest", "Jassids", ("jassid", "jassids")),
    ("insect_pest", "Leaf folders", ("leaf folder", "leaf folders")),
    ("insect_pest", "Leafhoppers", ("leafhopper", "leafhoppers", "leaf hoppers")),
    ("insect_pest", "Leaf miners", ("leaf miner", "leaf miners", "leafminers")),
    ("insect_pest", "Mealybugs", ("mealybug", "mealybugs")),
    ("insect_pest", "Mites", ("mite", "mites")),
    ("insect_pest", "Planthoppers", ("planthopper", "planthoppers", "plant hopper", "plant hoppers")),
    ("insect_pest", "Pod borer", ("pod borer", "pod borers")),
    ("insect_pest", "Root borers", ("root borer", "root borers")),
    ("insect_pest", "Root grubs", ("root grub", "root grubs")),
    ("insect_pest", "Shoot borers", ("shoot borer", "shoot borers")),
    ("insect_pest", "Spotted bollworm", ("spotted bollworm",)),
    ("insect_pest", "Stem borers", ("stem borer", "stem borers")),
    ("insect_pest", "Sucking pests", ("sucking pest", "sucking pests")),
    ("insect_pest", "Termites", ("termite", "termites", "termits")),
    ("insect_pest", "Thrips", ("thrips",)),
    ("insect_pest", "Tobacco caterpillar", ("tobacco caterpillar",)),
    ("insect_pest", "White-backed planthopper", ("white backed plant hopper", "white-backed plant hopper", "wbph")),
    ("insect_pest", "White grubs", ("white grub", "white grubs")),
    ("insect_pest", "Whiteflies", ("whitefly", "whiteflies", "white fly")),
    ("insect_pest", "Wireworms", ("wire worm", "wireworm", "wireworms")),
    ("weed_problem", "Annual grasses", ("annual grass", "annual grasses")),
    ("weed_problem", "Aquatic broadleaf weeds", ("aquatic broad leaves weeds", "aquatic broadleaf weeds")),
    ("weed_problem", "Barnyard grass", ("barnyard grass",)),
    ("weed_problem", "Broadleaf weeds", ("broadleaf weed", "broadleaf weeds", "broad leaf weed", "broad leaves weeds", "broad-leaved weeds")),
    ("weed_problem", "Crabgrass", ("crabgrass",)),
    ("weed_problem", "Crowfoot grass", ("crowfoot grass",)),
    ("weed_problem", "Grassy weeds", ("grassy weed", "grassy weeds")),
    ("weed_problem", "Parthenium", ("parthenium",)),
    ("weed_problem", "Phalaris minor", ("phalaris minor",)),
    ("weed_problem", "Sedges", ("sedge", "sedges")),
    ("weed_problem", "Nut grass / Cyperus", ("nut grass", "cyperus")),
    ("weed_problem", "Perennial grasses", ("perennial grass", "perennial grasses")),
    ("weed_problem", "Woody weeds", ("woody plants",)),
    ("nutrient_deficiency", "Sulphur deficiency", ("deficiency of sulphur", "sulphur deficiency")),
    ("growth_stress", "Adverse weather stress", ("adverse weather conditions",)),
    ("growth_stress", "Excessive vegetative growth", ("excessive vegetative",)),
    ("growth_stress", "Flower or fruit drop", ("flower and fruit drop", "flower/fruit drop", "premature shedding")),
    ("growth_stress", "Poor flowering", ("improve flowering", "promotes early", "uniform flowering")),
    ("growth_stress", "Poor fruit setting", ("fruit setting",)),
)


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.casefold()).strip()


def contains_phrase(text: str, phrase: str) -> bool:
    normalized_phrase = normalize(phrase)
    return bool(normalized_phrase and re.search(rf"\b{re.escape(normalized_phrase)}\b", text))


def main(path_value: str) -> None:
    products = json.loads(Path(path_value).read_text(encoding="utf-8"))
    with connection() as conn:
        admin = conn.execute(
            "SELECT id FROM employees WHERE employee_code = %s",
            (INITIAL_ADMIN_EMPLOYEE_CODE,),
        ).fetchone()
        admin_id = admin["id"] if admin else None
        approval = "approved" if admin_id else "pending"

        crop_ids: dict[str, uuid.UUID] = {}
        for name, aliases in CROP_RULES.items():
            crop_id = uuid.uuid5(uuid.NAMESPACE_URL, f"clsl-crop:{name.casefold()}")
            crop_ids[name] = crop_id
            conn.execute(
                """
                INSERT INTO crops(id, name, aliases, status)
                VALUES (%s, %s, %s::jsonb, 'active')
                ON CONFLICT (name) DO UPDATE SET
                    aliases = EXCLUDED.aliases, status = 'active', updated_at = now()
                """,
                (crop_id, name, json.dumps(list(aliases))),
            )

        problem_ids: dict[tuple[str, str], uuid.UUID] = {}
        for issue_type, name, aliases in PROBLEM_RULES:
            problem_id = uuid.uuid5(
                uuid.NAMESPACE_URL, f"clsl-problem:{issue_type}:{name.casefold()}"
            )
            problem_ids[(issue_type, name)] = problem_id
            conn.execute(
                """
                INSERT INTO problems(id, issue_type, name, aliases, status)
                VALUES (%s, %s, %s, %s::jsonb, 'active')
                ON CONFLICT (issue_type, name) DO UPDATE SET
                    aliases = EXCLUDED.aliases, status = 'active', updated_at = now()
                """,
                (problem_id, issue_type, name, json.dumps(list(aliases))),
            )

        # Rebuild only mappings owned by this catalogue importer. Manually added
        # or expert-reviewed mappings are deliberately preserved.
        conn.execute("DELETE FROM product_crop_mappings WHERE notes = %s", (CATALOG_NOTE,))
        conn.execute("DELETE FROM product_problem_mappings WHERE notes = %s", (CATALOG_NOTE,))

        crop_mapping_count = 0
        problem_mapping_count = 0
        for product in products:
            product_id = str(product["id"])
            text = normalize(str(product.get("useBenefits") or ""))
            for crop_name, aliases in CROP_RULES.items():
                if not any(contains_phrase(text, alias) for alias in aliases):
                    continue
                conn.execute(
                    """
                    INSERT INTO product_crop_mappings(
                        product_id, crop_id, approval_status, submitted_by,
                        approved_by, approved_at, notes
                    )
                    VALUES (%s, %s, %s, %s, %s,
                            CASE WHEN %s::uuid IS NULL THEN NULL ELSE now() END, %s)
                    ON CONFLICT (product_id, crop_id) DO UPDATE SET
                        approval_status = EXCLUDED.approval_status,
                        submitted_by = EXCLUDED.submitted_by,
                        approved_by = EXCLUDED.approved_by,
                        approved_at = EXCLUDED.approved_at,
                        notes = EXCLUDED.notes,
                        updated_at = now()
                    """,
                    (product_id, crop_ids[crop_name], approval, admin_id, admin_id, admin_id, CATALOG_NOTE),
                )
                crop_mapping_count += 1

            for issue_type, problem_name, aliases in PROBLEM_RULES:
                if problem_name == "Blast" and contains_phrase(text, "bacterial blast"):
                    continue
                if not any(contains_phrase(text, alias) for alias in aliases):
                    continue
                conn.execute(
                    """
                    INSERT INTO product_problem_mappings(
                        product_id, problem_id, approval_status, submitted_by,
                        approved_by, approved_at, notes
                    )
                    VALUES (%s, %s, %s, %s, %s,
                            CASE WHEN %s::uuid IS NULL THEN NULL ELSE now() END, %s)
                    ON CONFLICT (product_id, problem_id) DO UPDATE SET
                        approval_status = EXCLUDED.approval_status,
                        submitted_by = EXCLUDED.submitted_by,
                        approved_by = EXCLUDED.approved_by,
                        approved_at = EXCLUDED.approved_at,
                        notes = EXCLUDED.notes,
                        updated_at = now()
                    """,
                    (product_id, problem_ids[(issue_type, problem_name)], approval, admin_id, admin_id, admin_id, CATALOG_NOTE),
                )
                problem_mapping_count += 1

        conn.commit()
    print(
        f"Imported {len(CROP_RULES)} crops and {len(PROBLEM_RULES)} problems; "
        f"created {crop_mapping_count} crop mappings and "
        f"{problem_mapping_count} problem mappings ({approval})."
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m app.import_catalog_knowledge /path/to/products.json")
    main(sys.argv[1])
