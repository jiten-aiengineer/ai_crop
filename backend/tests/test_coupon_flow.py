import unittest

from fastapi import HTTPException

from backend.app.coupon_routes import (
    _normalise_coupon_code,
    _redemption_amount,
    _validate_purchase_scope,
)


class CouponPayloadTests(unittest.TestCase):
    def test_plain_code_is_normalised(self):
        self.assertEqual(_normalise_coupon_code(" ab2cd3e "), "AB2CD3E")

    def test_coupon_url_is_supported(self):
        self.assertEqual(
            _normalise_coupon_code("https://ai.croplifescience.com/rewards?coupon=AB2CD3E"),
            "AB2CD3E",
        )

    def test_json_qr_is_supported(self):
        self.assertEqual(_normalise_coupon_code('{"coupon_code":"AB2CD3E"}'), "AB2CD3E")

    def test_farmer_referral_qr_is_not_a_coupon(self):
        with self.assertRaises(HTTPException) as error:
            _normalise_coupon_code("https://ai.croplifescience.com/?ref=AB2CD3E")
        self.assertEqual(error.exception.status_code, 400)


class CouponRedemptionRuleTests(unittest.TestCase):
    def test_fixed_discount_amount(self):
        coupon = {"discount_type": "fixed_amount", "discount_value": 100, "rules": {}}
        self.assertEqual(_redemption_amount(coupon, None), 100)
        self.assertEqual(_redemption_amount(coupon, 75), 75)

    def test_percentage_discount_uses_bill_amount_and_cap(self):
        coupon = {
            "discount_type": "percentage",
            "discount_value": 20,
            "rules": {"max_discount": 150},
        }
        self.assertEqual(_redemption_amount(coupon, 500), 100)
        self.assertEqual(_redemption_amount(coupon, 1000), 150)

    def test_percentage_discount_requires_bill_amount(self):
        coupon = {"discount_type": "percentage", "discount_value": 10, "rules": {}}
        with self.assertRaises(HTTPException):
            _redemption_amount(coupon, None)

    def test_product_and_pack_scope_are_enforced(self):
        rules = {"products": ["CLSL Shield"], "packings": ["500 ml"]}
        self.assertEqual(
            _validate_purchase_scope(rules, "clsl shield", "500 ML"),
            ("clsl shield", "500 ML"),
        )
        with self.assertRaises(HTTPException):
            _validate_purchase_scope(rules, "Another product", "500 ml")


if __name__ == "__main__":
    unittest.main()
