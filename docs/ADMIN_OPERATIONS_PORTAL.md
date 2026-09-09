# Crop Life AI — Administration Operations Portal

## Purpose

The administration portal is the controlled source for product information used by Crop Life AI. During the temporary-domain phase it is available at `https://croplifescience.duckdns.org/admin/portal`; later it can move to a separate private hostname such as `admin.example.com` without changing the data or approval model.

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
| Manager / Catalogue Manager | Prepare a new product or amend product facts, dose, uses, image asset and crop selection | Publish the record or bypass a review. |
| Senior Catalogue Manager | Directly approve and publish a catalogue change, or route it to the Managing Director | Give a final decision on a request already routed to MD review. |
| Managing Director | Final approve/reject a request routed by a Senior Catalogue Manager; may directly publish a change | Receive ordinary sales/field-user access to the portal. |
| Expert Review Approver | View inspection/model operational information; later validate diagnosis labels | Publish catalogue changes. |
| Employee Access Approver | View employee role/hierarchy directory; later approve access changes | Publish catalogue changes. |
| Super Administrator | Has all portal permissions, including publish and MD escalation actions | Should still use the approval record for traceability. |

Migration `005_catalogue_hierarchy.sql` adds the catalogue-manager, senior-catalogue-manager and managing-director roles, plus a review-stage record on every catalogue request. Jiten already has Super Administrator rights. Sales officers and field employees have no administration role and cannot open the portal.

## Catalogue publication workflow

1. A Catalogue Editor opens a current product record or prepares a new one.
2. The editor records the product facts and selects approved crops.
3. The application saves an immutable proposal in `approval_requests`; it does not change `products` or `product_crop_mappings` yet.
4. A Senior Catalogue Manager either publishes the change directly or routes it to the Managing Director.
5. A request at MD review can only be finally approved or rejected by the Managing Director (or Super Administrator).
6. If the selected crops differ from the approved map, the publisher must also have mapping authority; Senior Catalogue Manager, Managing Director and Super Administrator roles include this authority.
7. On approval, the product is marked `active` and `approved`, the approved crop map is updated, and an audit record is written.
8. The private inspection service immediately uses the new approved product/crop data.

## Product image handling

The first secure version records an approved application image path, for example `/products/product-name.jpg`, and shows a preview in the portal. This prevents an arbitrary external image URL from being placed in a product record.

For a completely self-service image upload workflow, add a second phase with a private S3 media area, file/virus validation, an approval state and an asset publishing job. Do not place product images in the private inspection-image bucket or make inspection images public.

## Temporary HTTPS login, then Microsoft Entra

Until Microsoft Entra is registered, the HTTPS temporary domain permits one named temporary account for Jiten only. The server stores a salted `scrypt` password hash, uses an HTTP-only secure session cookie, rate-limits failed sign-ins, and refuses password sign-in on non-HTTPS requests. It is not a shared admin key.

When Microsoft Entra is ready, set the Entra values below. Microsoft sign-in then becomes the active sign-in method, while FastAPI continues to check the active employee record and assigned database roles for every request.

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

# The temporary HTTPS hostname (replace later with admin.<company-domain>)
ADMIN_PORTAL_HOSTNAME=croplifescience.duckdns.org
ADMIN_PORTAL_ORIGIN=https://croplifescience.duckdns.org
ADMIN_PORTAL_SESSION_SECRET=<at-least-32-random-characters>
TEMP_ADMIN_USERNAME=jiten
TEMP_ADMIN_EMAIL=aiengineer.2@croplifescience.com
TEMP_ADMIN_PASSWORD_HASH=scrypt$16384$8$1$<salt>$<derived-key>
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
| Active crop master records | 413 |
| Approved product–crop mappings | Managed from the approved PostgreSQL catalogue |
| Approved product–problem mappings | 204 |

The portal reads these records. It does not invent products, registrations, doses or crop approvals from Gemini output.
