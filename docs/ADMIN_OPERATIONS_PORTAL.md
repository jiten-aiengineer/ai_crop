# Crop Life AI — Administration Operations Portal

## Purpose

The administration portal is the controlled source for product information used by Crop Life AI. It is designed for a separate private hostname such as `admin.example.com`, not for the public farmer application.

It prevents a product from being recommended simply because it appears in old static application data. Once the private AWS integration is enabled, an inspection follows this route:

```text
Crop photo → Gemini assessment → approved PostgreSQL crop/product mappings
           → only active + approved CLSL product records → farmer result
```

If the private catalogue service is configured but unavailable, the inspection returns no product recommendation. It does not fall back to an outdated catalogue list.

## What the portal manages

| Area | Information shown or managed | Protection |
|---|---|---|
| Product catalogue | Product ID, name, category, common name, formulation, dose, uses, packing, application method, safety information, catalogue page, package image asset | Changes are submitted for approval first. |
| Crop mappings | Crops for which a product is approved | A mapping change needs Mapping Approver authority. |
| Approval queue | Proposed product changes, crop changes, submitter and decision record | A user cannot approve their own request unless they are a Super Administrator. |
| Inspections and S3 | Inspection metadata, storage status, retained image count/size, provider and recommendation IDs | Image files remain private; the portal does not create public S3 links. |
| Model observatory | Provider attempts, success/failure counts, latency, Gemini–Qwen crop/issue agreement | Agreement is an evaluation indicator, not diagnosis accuracy. |
| Access and hierarchy | Employee, Microsoft email/UPN, department, manager, active status and roles | Role information is read-only in this first portal release. |

## Role hierarchy

| Role | Can do | Cannot do by itself |
|---|---|---|
| Field Employee | Use farmer-facing crop tools once employee sign-in is enabled | Access the admin portal. |
| Manager | View operational overview, inspection/S3 metadata and model observability | Edit or publish catalogue records. |
| Catalogue Editor | Prepare a new product or amend product facts, dose, uses, image asset and crop selection | Publish the record. |
| Product Approver | Approve/reject product-master changes | Approve a crop mapping change without Mapping Approver authority. |
| Mapping Approver | Approve/reject crop applicability changes | Approve product facts without Product Approver authority. |
| Expert Review Approver | View inspection/model operational information; later validate diagnosis labels | Publish catalogue changes. |
| Employee Access Approver | View employee role/hierarchy directory; later approve access changes | Publish catalogue changes. |
| Super Administrator | Has all portal permissions | Should still use the approval record for traceability. |

`catalog_editor` is introduced by migration `004_admin_catalogue_governance.sql`. Jiten already has Product Approver, Mapping Approver and Super Administrator roles, so he can use the catalogue workflow after Microsoft sign-in is configured.

## Catalogue publication workflow

1. A Catalogue Editor opens a current product record or prepares a new one.
2. The editor records the product facts and selects approved crops.
3. The application saves an immutable proposal in `approval_requests`; it does not change `products` or `product_crop_mappings` yet.
4. A Product Approver reviews product information.
5. If the selected crops differ from the approved map, the approver must also be a Mapping Approver.
6. On approval, the product is marked `active` and `approved`, the approved crop map is updated, and an audit record is written.
7. The private inspection service immediately uses the new approved product/crop data.

## Product image handling

The first secure version records an approved application image path, for example `/products/product-name.jpg`, and shows a preview in the portal. This prevents an arbitrary external image URL from being placed in a product record.

For a completely self-service image upload workflow, add a second phase with a private S3 media area, file/virus validation, an approval state and an asset publishing job. Do not place product images in the private inspection-image bucket or make inspection images public.

## Secure admin subdomain setup

The application code is ready, but a subdomain cannot be activated until Crop Life provides the parent domain and Microsoft Entra application details.

### 1. DNS and HTTPS

Choose a hostname, for example `admin.<company-domain>`, and point its DNS record to the AWS server. Nginx should proxy that hostname to the existing Node application on port 3000 and serve a valid HTTPS certificate. The FastAPI service must remain bound to `127.0.0.1:8000`; it must not be exposed directly to the internet.

### 2. Microsoft Entra application registration

Create a single-tenant web application in the Crop Life Microsoft Entra tenant.

| Setting | Required value |
|---|---|
| Supported account type | Accounts in this organizational directory only |
| Redirect URI | `https://admin.<company-domain>/api/admin/auth/callback` |
| Front-channel logout | Optional; the portal clears its own session cookie |
| API permissions | `openid`, `profile`, `email` delegated sign-in scopes |
| Client secret | Create a long-lived secret and store it only on AWS environment configuration |

### 3. AWS environment values

Set these values on the AWS Node service and FastAPI Docker service. Never commit any real value to GitHub or Vercel.

```dotenv
# The catalogue engine used by the live inspection service
CATALOG_RECOMMENDATION_URL=http://127.0.0.1:8000/api/v1/catalog/recommendations
INTERNAL_SERVICE_TOKEN=<long-random-shared-internal-token>

# The separate administration hostname
ADMIN_PORTAL_HOSTNAME=admin.<company-domain>
ADMIN_PORTAL_ORIGIN=https://admin.<company-domain>
ADMIN_PORTAL_SESSION_SECRET=<at-least-32-random-characters>
ENTRA_TENANT_ID=<Microsoft-Entra-tenant-ID>
ENTRA_CLIENT_ID=<Microsoft-Entra-application-client-ID>
ENTRA_CLIENT_SECRET=<Microsoft-Entra-client-secret>
ADMIN_ALLOWED_EMAIL_DOMAIN=croplifescience.com
ADMIN_BACKEND_URL=http://127.0.0.1:8000
ADMIN_GATEWAY_TOKEN=<different-long-random-token>
```

`ADMIN_GATEWAY_TOKEN` is shared only between the Next.js application and the loopback FastAPI API. The browser never receives it. Microsoft login creates an HTTP-only signed session cookie; the Node application then sends the employee email and gateway token to FastAPI. FastAPI re-checks the active employee record and assigned roles in PostgreSQL on every request.

### 4. Apply and verify

1. Deploy this code to AWS and run the database migration process. Migration 004 adds only the Catalogue Editor role and database indexes.
2. Restart the FastAPI container and the Node service after adding environment values.
3. Open `https://admin.<company-domain>/admin/portal`.
4. Sign in with the approved Microsoft account for `aiengineer.2@croplifescience.com`.
5. Confirm that the portal shows the current catalogue, crops and employee roles.
6. Submit a harmless product correction, approve it, then confirm a matching inspection receives the approved PostgreSQL recommendation.

## Current database coverage

At the time this portal was added, PostgreSQL contains the supplied baseline catalogue and mapping data:

| Item | Current baseline |
|---|---:|
| CLSL products | 73 |
| Active crop master records | 31 |
| Approved product–crop mappings | 111 |
| Approved product–problem mappings | 204 |

The portal reads these records. It does not invent products, registrations, doses or crop approvals from Gemini output.
