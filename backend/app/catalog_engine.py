"""Database-backed CLSL catalogue matching for live crop inspections.

Only active, approved products and approved crop mappings are considered. This
is intentionally deterministic: the AI describes the probable issue, while the
database decides which approved CLSL records may be shown.
"""

import re
from typing import Any


ISSUE_TYPE_CATEGORIES = {
    "insect_pest": {"Insecticides"},
    "fungal_disease": {"Fungicides"},
    "bacterial_disease": {"Antibiotic / Bactericide"},
    "weed_problem": {"Weedicides"},
    "nutrient_deficiency": {"Micro Fertilizers", "Bio Stimulant"},
    "growth_stress": {"Bio Stimulant", "Plant Growth Regulator"},
}

CATEGORY_SIGNALS = (
    ({"Insecticides"}, ("insect", "whitefly", "aphid", "jassid", "thrips", "mite", "borer", "hopper", "caterpillar", "termite", "sucking pest")),
    ({"Antibiotic / Bactericide"}, ("bacterial", "bactericide")),
    ({"Fungicides"}, ("fungal", "fungus", "blight", "mildew", "rust", "smut", "scab", "wilt", "rot", "damping off", "leaf spot", "blast")),
    ({"Weedicides"}, ("weed", "herbicide", "unwanted grass")),
    ({"Micro Fertilizers", "Bio Stimulant"}, ("nutrient", "deficiency", "chlorosis", "micronutrient", "yellowing", "nutrition")),
    ({"Bio Stimulant", "Plant Growth Regulator"}, ("growth stress", "stunted", "flowering", "fruit setting", "poor growth")),
    ({"Seed Treatment"}, ("seed treatment", "seed borne", "germination")),
)

CROP_ALIASES = {
    "rice": {"rice", "paddy", "paddy rice"},
    "paddy": {"rice", "paddy", "paddy rice"},
    "tomato": {"tomato"},
    "chilli": {"chilli", "chili"},
    "chili": {"chilli", "chili"},
    "maize": {"maize", "corn"},
    "corn": {"maize", "corn"},
    "soybean": {"soybean", "soyabean"},
    "soyabean": {"soybean", "soyabean"},
    "chickpea": {"chickpea", "gram"},
    "gram": {"chickpea", "gram"},
    "sorghum": {"sorghum", "jowar"},
    "jowar": {"sorghum", "jowar"},
    "okra": {"okra", "ladyfinger", "lady finger"},
    "ladyfinger": {"okra", "ladyfinger", "lady finger"},
}


def normalize(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^a-z0-9%+.-]+", " ", value.lower()).strip()


def tokens(value: str) -> set[str]:
    ignored = {"the", "and", "for", "with", "from", "that", "this", "crop", "plant", "likely", "probable", "issue", "disease", "pest", "product", "products", "unknown", "none"}
    return {token for token in normalize(value).split() if len(token) > 2 and token not in ignored}


def crop_matches(requested: str, approved: str) -> bool:
    requested_normal = normalize(requested)
    approved_normal = normalize(approved)
    if not requested_normal or not approved_normal:
        return False
    requested_aliases = CROP_ALIASES.get(requested_normal, {requested_normal})
    approved_aliases = CROP_ALIASES.get(approved_normal, {approved_normal})
    return bool(requested_aliases & approved_aliases) or requested_normal in approved_normal or approved_normal in requested_normal


def _product_rows(conn):
    rows = conn.execute(
        """
        SELECT p.id, p.name, pc.name AS category, p.common_name, p.formulation,
               p.dose, p.use_benefits, p.packing, p.application_method,
               p.safety_information, p.image_path, p.source_page,
               array_remove(array_agg(DISTINCT c.name), NULL) AS approved_crops
        FROM products p
        JOIN product_categories pc ON pc.id = p.category_id
        LEFT JOIN product_crop_mappings pcm
          ON pcm.product_id = p.id AND pcm.approval_status = 'approved'
        LEFT JOIN crops c ON c.id = pcm.crop_id AND c.status = 'active'
        WHERE p.status = 'active' AND p.approval_status = 'approved'
        GROUP BY p.id, pc.name
        ORDER BY p.name
        """
    ).fetchall()
    return rows


def recommend(conn, diagnosis: dict[str, Any]) -> list[dict[str, Any]]:
    confidence = diagnosis.get("confidence")
    needs_more_information = diagnosis.get("needs_more_information") is True or diagnosis.get("additional_information_required") is True
    issue_type = normalize(diagnosis.get("issue_type"))
    if (
        diagnosis.get("issue_detected") is not True
        or needs_more_information
        or not isinstance(confidence, (int, float))
        or confidence < 0.60
        or issue_type in {"", "unknown", "none", "insufficient evidence"}
    ):
        return []

    crop = str(diagnosis.get("catalog_crop") or diagnosis.get("crop") or "")
    if not crop:
        return []
    likely_issue = normalize(diagnosis.get("likely_issue"))
    issue_text = " ".join(
        str(part or "")
        for part in [
            issue_type,
            likely_issue,
            *(diagnosis.get("observed_symptoms") or []),
            *(diagnosis.get("probable_causes") or []),
        ]
    )
    allowed_categories = set(ISSUE_TYPE_CATEGORIES.get(issue_type, set()))
    normalized_issue = normalize(issue_text)
    for categories, signals in CATEGORY_SIGNALS:
        if any(signal in normalized_issue for signal in signals):
            allowed_categories.update(categories)
    if "sheath blight" in normalized_issue:
        allowed_categories.add("Antibiotic / Bactericide")
    if not allowed_categories:
        return []

    issue_tokens = tokens(issue_text)
    primary_categories = ISSUE_TYPE_CATEGORIES.get(issue_type, set())
    results: list[dict[str, Any]] = []
    for product in _product_rows(conn):
        if product["category"] not in allowed_categories:
            continue
        approved_crops = product["approved_crops"] or []
        matched_crop = next((item for item in approved_crops if crop_matches(crop, item)), "") if crop else ""
        # A crop-specific assessment must not fall back to a product that lacks
        # an approved mapping in the PostgreSQL catalogue master.
        if crop and not matched_crop:
            continue
        haystack = normalize(" ".join(str(product[field] or "") for field in ("name", "common_name", "use_benefits", "formulation")))
        target_score = 20 if likely_issue and likely_issue in haystack else sum(4 for token in issue_tokens if token in haystack)
        category_score = 10 if product["category"] in primary_categories else 6
        score = target_score + category_score + (8 if matched_crop else 0)
        threshold = 14 if diagnosis.get("additional_information_required") else 10
        if score < threshold:
            continue
        reason = (
            f"{matched_crop} is in the approved crop map and the product record mentions {diagnosis.get('likely_issue') or 'the probable problem'}"
            if target_score else f"{matched_crop or 'The selected crop'} is in the approved crop map and the product category fits the probable problem"
        )
        results.append(
            {
                "id": product["id"],
                "name": product["name"],
                "category": product["category"],
                "commonName": product["common_name"] or "",
                "formulation": product["formulation"] or "",
                "dose": product["dose"] or "",
                "useBenefits": product["use_benefits"] or "",
                "packing": product["packing"] or "",
                "applicationMethod": product["application_method"] or "",
                "safetyInformation": product["safety_information"] or "",
                "image": product["image_path"] or "",
                "sourcePage": product["source_page"] or 0,
                "approvedCrops": approved_crops,
                "matchScore": score,
                "matchReason": reason,
                "matchTier": "primary" if product["category"] in primary_categories else "supporting",
            }
        )
    return sorted(results, key=lambda row: (row["matchTier"] != "primary", -row["matchScore"], row["name"]))[: (6 if diagnosis.get("additional_information_required") else 12)]
