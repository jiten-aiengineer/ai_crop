from datetime import datetime
from pathlib import Path

from app.dealer_routes import _dealer_report_pdf

rows = [{
    "redeemed_at": datetime.now(),
    "amount_redeemed": 125,
    "purchase_reference": "INV-1001",
    "credit_note_id": None,
    "coupon_code": "A7Q2K9M",
    "campaign_name": "Welcome Offer",
    "rules": {"products": ["CLSL Test Product"], "packings": ["500 ml"]},
}]
Path("/tmp/dealer-report.pdf").write_bytes(
    _dealer_report_pdf({"name": "Test Dealer", "dealer_code": "DLR-TEST"}, rows, "month")
)
