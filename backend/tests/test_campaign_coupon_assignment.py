import unittest
from datetime import datetime, timezone

from backend.app.farmer_auth import _issue_campaign_coupon


class _Result:
    def __init__(self, value):
        self.value = value

    def fetchone(self):
        return self.value


class _InventoryConnection:
    def __init__(self, claim_available: bool):
        self.claim_available = claim_available
        self.queries: list[str] = []

    def execute(self, query, _params):
        normalized = " ".join(query.split())
        self.queries.append(normalized)
        if normalized.startswith("SELECT 1 FROM coupons"):
            return _Result(None)
        if normalized.startswith("UPDATE coupons SET farmer_id"):
            return _Result({"id": "inventory-code"} if self.claim_available else None)
        if normalized.startswith("SELECT COUNT(*) AS count FROM coupons"):
            return _Result({"count": 1})
        if normalized.startswith("INSERT INTO coupons"):
            return _Result(None)
        raise AssertionError(f"Unexpected query: {normalized}")


class CampaignCouponAssignmentTests(unittest.TestCase):
    def campaign(self):
        return {
            "id": "campaign-id",
            "discount_value": 50,
            "end_date": None,
            "start_date": datetime.now(timezone.utc),
            "rules": {"coupon_limit": 1, "expiry_days": 30},
        }

    def test_full_pre_generated_inventory_can_still_be_assigned(self):
        conn = _InventoryConnection(claim_available=True)

        issued = _issue_campaign_coupon(conn, self.campaign(), "farmer-id")

        self.assertTrue(issued)
        self.assertTrue(any(query.startswith("UPDATE coupons SET farmer_id") for query in conn.queries))
        self.assertFalse(any(query.startswith("SELECT COUNT(*) AS count FROM coupons") for query in conn.queries))

    def test_limit_blocks_new_code_only_after_inventory_is_empty(self):
        conn = _InventoryConnection(claim_available=False)

        issued = _issue_campaign_coupon(conn, self.campaign(), "farmer-id")

        self.assertFalse(issued)
        self.assertTrue(any(query.startswith("SELECT COUNT(*) AS count FROM coupons") for query in conn.queries))


if __name__ == "__main__":
    unittest.main()
