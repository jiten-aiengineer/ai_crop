import csv
import json
import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT / "backend"))
EMPLOYEE_CSV = PROJECT_ROOT / "backend" / "private-import" / "employees.csv"
PRODUCT_JSON = PROJECT_ROOT / "app" / "data" / "products.json"
SALES_CONTACT_JSON = PROJECT_ROOT / "app" / "data" / "sales-contacts.json"
MIGRATION = PROJECT_ROOT / "backend" / "database" / "migrations" / "001_initial.sql"
OPERATIONAL_MIGRATION = PROJECT_ROOT / "backend" / "database" / "migrations" / "002_operational_data.sql"
S3_PERSISTENCE_MIGRATION = PROJECT_ROOT / "backend" / "database" / "migrations" / "003_s3_inspection_persistence.sql"


class ProductImportContractTests(unittest.TestCase):
    def test_catalogue_has_expected_products_and_categories(self):
        products = json.loads(PRODUCT_JSON.read_text(encoding="utf-8"))
        self.assertEqual(73, len(products))
        self.assertEqual(73, len({item["id"] for item in products}))
        self.assertEqual(73, len({item["name"].casefold() for item in products}))
        self.assertEqual(9, len({item["category"] for item in products}))
        for product in products:
            self.assertTrue(product["id"])
            self.assertTrue(product["name"])
            self.assertTrue(product["category"])
            self.assertIsInstance(product.get("sourcePage"), int)

    def test_manager_approved_cib_crop_map_is_authoritative(self):
        products = json.loads(PRODUCT_JSON.read_text(encoding="utf-8"))
        self.assertEqual(283, sum(len(product.get("approvedCrops", [])) for product in products))
        expected_without_approved_crops = {
            "croplod", "kingam-gold", "liffwet", "magnastik", "p-dozer", "rustblast", "samyojan"
        }
        for product in products:
            self.assertEqual(product["id"] in expected_without_approved_crops, not bool(product.get("approvedCrops")), product["id"])
            self.assertEqual("CLSL manager-approved CIB crop update", product.get("cropMappingSource"))

    def test_catalogue_knowledge_rules_cover_core_grounding_examples(self):
        from app.import_catalog_knowledge import CROP_RULES, PROBLEM_RULES

        self.assertIn("Paddy / Rice", CROP_RULES)
        self.assertIn("Tomato", CROP_RULES)
        problem_names = {name for _, name, _ in PROBLEM_RULES}
        self.assertIn("Sheath blight", problem_names)
        self.assertIn("Brown planthopper", problem_names)
        self.assertIn("Broadleaf weeds", problem_names)


class EmployeeImportContractTests(unittest.TestCase):
    @unittest.skipUnless(EMPLOYEE_CSV.exists(), "Private employee import is not present")
    def test_employee_import_is_safe_and_complete(self):
        with EMPLOYEE_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        self.assertEqual(212, len(rows))
        self.assertEqual(212, len({row["employee_code"] for row in rows}))
        office_emails = [row["office_email"] for row in rows if row["office_email"]]
        self.assertEqual(124, len(office_emails))
        self.assertEqual(len(office_emails), len(set(office_emails)))
        self.assertTrue(all(email.endswith("@croplifescience.com") for email in office_emails))
        admin = next(row for row in rows if row["employee_code"] == "CLSL-1415")
        self.assertEqual("Jiten Advani", admin["full_name"])

    def test_importer_rejects_employee_self_manager_links(self):
        importer = (PROJECT_ROOT / "backend" / "app" / "import_employees.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("reporting_manager_name.casefold() == full_name.casefold()", importer)

    def test_public_sales_directory_contains_only_work_contact_fields(self):
        contacts = json.loads(SALES_CONTACT_JSON.read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(contacts), 80)
        allowed = {"name", "designation", "state", "territory", "city", "email", "phone"}
        approved_call_only_contacts = {"Omnarayan Sharma"}
        for contact in contacts:
            self.assertEqual(allowed, set(contact))
            if contact["email"]:
                self.assertTrue(contact["email"].endswith("@croplifescience.com"))
            else:
                self.assertIn(contact["name"], approved_call_only_contacts)
                self.assertTrue(contact["phone"].startswith("+91"))
            self.assertNotIn("personal", " ".join(contact).casefold())


class MigrationContractTests(unittest.TestCase):
    def test_initial_schema_contains_employee_and_product_governance(self):
        sql = MIGRATION.read_text(encoding="utf-8").lower()
        required_tables = {
            "employees",
            "roles",
            "employee_roles",
            "product_categories",
            "products",
            "crops",
            "problems",
            "product_crop_mappings",
            "product_problem_mappings",
            "approval_requests",
            "audit_logs",
            "app_settings",
        }
        for table in required_tables:
            self.assertIn(f"create table {table}", sql)
        self.assertIn("until_replacement_model_trained_validated_and_operational", sql)

    def test_operational_schema_covers_production_capture_and_review(self):
        sql = OPERATIONAL_MIGRATION.read_text(encoding="utf-8").lower()
        required_tables = {
            "organizational_units",
            "inspections",
            "inspection_images",
            "ai_predictions",
            "expert_reviews",
            "inspection_recommendations",
            "weather_snapshots",
            "ai_usage",
        }
        for table in required_tables:
            self.assertIn(f"create table {table}", sql)
        self.assertIn("consent_for_training", sql)
        self.assertIn("retention_status", sql)
        self.assertIn("prediction_role", sql)

    def test_s3_persistence_schema_keeps_private_image_references_and_provider_audits(self):
        sql = S3_PERSISTENCE_MIGRATION.read_text(encoding="utf-8").lower()
        self.assertIn("storage_bucket", sql)
        self.assertIn("image_storage_status", sql)
        self.assertIn("image_storage_failures", sql)
        self.assertIn("create table if not exists ai_provider_results", sql)
        self.assertIn("unique(inspection_id, provider, model_name)", sql)


if __name__ == "__main__":
    unittest.main()
