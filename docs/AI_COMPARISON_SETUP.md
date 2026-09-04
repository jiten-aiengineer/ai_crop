# Crop Life AI — Gemini vs Qwen evaluation

## Easiest option: local lab, no administrator key

The new standalone lab runs at **http://127.0.0.1:8001/** on the laptop with Ollama. It uses the existing Gemini settings from `.env.local`, enables local Qwen, and requires no password or administrator-key setup. It does not enable public shadow mode or expose Ollama to the internet.

From the project folder:

```powershell
npm run comparison:build
npm run comparison:start
```

Build again after updating the code; otherwise only the start command is needed after a laptop restart. Keep the service running while using the lab. Upload a photo, select **Run both models**, and open the case details. Choose **Comparison dashboard** to revisit saved cases. No second web-app process is required for this standalone mode.

The public Vercel comparison pages show **Open local comparison lab** instead of an administrator-key prompt when no remote service is configured. Use that link on the same laptop. On a phone, `127.0.0.1` refers to the phone, not this laptop. No mobile/remote bridge has been activated.

Local security is based on loopback binding, actual local peer validation, exact Host/Origin checks, a required same-origin API header, no cross-origin access and anti-framing headers. The service intentionally accepts other trusted users/processes on this laptop; it is not multi-user employee authentication. Do not put this mode behind a reverse proxy, tunnel, or public interface. The launcher disables forwarded-proxy headers. The existing bearer-key server mode remains the default when not using the local launcher.

Images and history stay in the private local database. Gemini still receives the images through its configured API; Qwen receives them locally. The public website does not receive local lab records. The remote-server instructions below remain available for a later shared setup, but are **not required for local lab use**.

## What has been implemented

The farmer-facing inspection still uses Gemini and the existing deterministic CLSL catalogue matcher. The new private evaluation service stores the same image bytes and field context, then processes Qwen separately. The farmer never waits for Qwen inference. When enabled, a durable enqueue attempt can add up to 1.5 seconds before the farmer response; a failed enqueue is reported as `comparison_status: unavailable` and does not fail Gemini.

Admin routes:

- `/admin/ai-comparison`: records, filters, agreement metrics, latency charts, health, images and side-by-side final diagnoses.
- `/admin/ai-lab`: upload 1–5 images and run Gemini, Qwen, or both without creating a farmer inspection.

Both routes require a separate administrator key through their server-side API. This is a private pilot access gate, not Microsoft employee authentication or role-based access control. Do not distribute the key to farmers. No admin data is stored in browser local storage or the PWA cache.

## Important deployment boundary

Vercel cannot reach Ollama on your laptop through `localhost:11434`. On Vercel, localhost means the Vercel runtime, not your laptop. The Python worker must run on a persistent private host, not inside a short-lived Vercel request. This change does not start Ollama, download a model, alter Windows, open a port, or expose your laptop.

For the first test, run the web app and comparison service locally. For a shared deployment, place the service on your private server and provide a reachable, authenticated HTTPS endpoint to the web backend, with appropriate network restrictions. Keep Ollama itself private. Do not expose port 11434 publicly. A private network gateway is a separate deployment step that is not configured by this change.

## Local setup — performed manually by the administrator

Use the existing project directory and Python environment. Install `backend/requirements.txt` only if its packages are not already available. No GPU or new AI Python packages are required.

Generate two different long random secrets using a password manager or Python's `secrets.token_urlsafe(32)`: one admin key and one service key. Each must be at least 32 characters. Never commit them or send them in chat.

Set these values in the web application's ignored `.env.local`:

```dotenv
GEMINI_ENABLED=true
GEMINI_API_KEY=<existing private Gemini API key>
GEMINI_MODEL=<your available image-capable Gemini model>
QWEN_ENABLED=true
QWEN_SHADOW_MODE=false
COMPARISON_SERVICE_URL=http://127.0.0.1:8001
COMPARISON_SERVICE_TOKEN=<private service key>
COMPARISON_ADMIN_TOKEN=<different private admin key>
```

`GEMINI_MODEL` takes precedence over the existing `GEMINI_VISION_MODEL`. The existing model fallback is preserved; model availability must be verified with your account. The text chatbot's model configuration is unchanged.

In the terminal that will run the private Python service, set environment variables as follows. The service does **not** automatically load the web `.env.local` file.

```powershell
$env:COMPARISON_SERVICE_TOKEN = '<same private service key>'
$env:GEMINI_API_KEY = '<same Gemini API key>'
$env:GEMINI_MODEL = '<same Gemini model as web>'
$env:GEMINI_ENABLED = 'true'
$env:QWEN_ENABLED = 'true'
$env:QWEN_SHADOW_MODE = 'false'
$env:QWEN_BASE_URL = 'http://localhost:11434'
$env:QWEN_MODEL = 'qwen3.5:9b'
$env:QWEN_TIMEOUT_SECONDS = '180'
.\.venv\Scripts\python.exe -m uvicorn backend.app.comparison:app --host 127.0.0.1 --port 8001 --workers 1
```

Do not run multiple comparison workers, use reload mode, or run several service processes against the same database. Start the web app with its usual `npm run dev` command in another terminal. Open `/admin/ai-lab` and enter the admin key. Health checks show whether the configured Qwen model exists and whether it is loaded on CPU or GPU; Gemini health reports configuration only, not successful inference.

Start with one small JPG, PNG or WebP crop photo. The lab accepts up to 3 MB total before base64 encoding to leave room for the web hosting request envelope; the normal multipart inspection keeps its existing 4 MB total limit. Confirm authorized image retention and choose **Run both models**. Both providers execute sequentially on the single-worker queue. You can leave and reopen the dashboard while a job runs. No result or benchmark is fabricated when a model is offline.

After successful lab tests, enable `QWEN_SHADOW_MODE=true` in both web and service environments and restart those processes. Only enable it for the authorized internal pilot whose users know that their photos will be retained for evaluation. Normal inspection then records the existing Gemini result and queues Qwen. Disable either Qwen flag to stop future shadow submissions; already-running jobs may finish. The `.env.example` defaults are deliberately disabled.

## Storage and retention

The development repository is SQLite, separate from your employee/product PostgreSQL database. No employee or catalogue data is migrated or changed by this feature.

Default file: `.comparison-data/comparisons.sqlite3`, ignored by Git. Override with `COMPARISON_DB_PATH` to an absolute persistent path. Keep the directory private to the service account, on an encrypted disk, with restricted backups. SQLite is not encrypted by this code. It must never be put in `public/` or served as a download.

Table: `ai_comparison_runs`.

| Fields | Contents |
| --- | --- |
| `id`, `inspection_id`, `created_at`, `status` | Identity, source inspection, UTC time, queue lifecycle |
| `payload_json` | Exact validated context, original base64 image bytes and requested providers |
| `gemini_json`, `qwen_json` | Provider/model, success, elapsed milliseconds, timestamp, normalized diagnosis, final schema JSON or clean error |
| `metrics_json` | Crop/type/issue/severity matches, confidence difference, agreement score, evaluated coverage |
| `input_hash`, `contract_version` | SHA-256 fingerprint and shared prompt/schema version |
| `expert_review_status`, `expert_verified_crop`, `expert_verified_issue`, `expert_verified_severity`, `expert_notes` | Future verified labels; initially not reviewed and null |

Limits: at most 30 queued/running jobs and 1,000 retained cases. Reaching a limit rejects new submissions cleanly; nothing is silently deleted. At 4 MB of images per case, base64 plus database overhead can exceed 5 GB for 1,000 cases. There is no automatic image deletion or archival UI yet. Archive/back up the closed database through your authorized retention procedure before extending the pilot. Future production work should replace `ComparisonStore` with PostgreSQL metadata and private S3 images; do not scale this SQLite pilot indefinitely.

Interrupted running jobs become queued after service restart. Already-persisted provider results are reused. Unexpected worker exceptions are marked `interrupted` for investigation; they are not fabricated or endlessly retried. Provider timeouts/offline responses are completed failed attempts, not automatic retry loops. Queue wait is not included in provider latency. Qwen's timeout bounds the client request; it does not guarantee that Ollama immediately cancels underlying compute.

## Fairness and safety

The shared contract is `app/data/inspection-contract.json`. Both providers receive its same prompt, context, image order and image bytes; only the provider request envelope differs. Qwen never receives Gemini's diagnosis as a clue. Both use temperature 0.15. Qwen uses Ollama structured output, non-streamed image-capable chat and `think: false`; thought fields are not displayed or retained. Final-response storage is restricted to schema fields, not hidden reasoning or invented product fields.

Crop, probable issue, category and severity remain English for matching; explanatory output follows the supplied language. JPG, PNG and WebP work in the lab. Production retains its existing HEIC/HEIF input support, but a Qwen comparison records a clean unsupported-format error for those inputs rather than silently changing only Qwen's evidence. Model-reported confidence is not calibrated probability.

The diagnosis category retains the application's specific categories (for example `fungal_disease` and `insect_pest`) instead of the proposal's generic `disease`, so the existing product engine remains compatible. Only Gemini's normalized diagnosis is adapted to the current farmer response fields and passed to `catalogRecommendations`. Neither provider selects or writes products or doses. The comparison lab intentionally has no product recommendations.

## Agreement, not accuracy

| Comparison | Points |
| --- | ---: |
| Crop match | 25 |
| Issue category match | 20 |
| Probable issue name match | 35 |
| Severity match | 10 |
| Confidence difference at most 0.10 | 10 |

Scores use a fixed 100-point scale. Unknown fields do not count as agreement and earn no points; evaluated coverage is displayed separately. A score of 65 with 65% coverage is not equivalent to a fully evaluated score of 65. Failed/single-provider cases are not scored. Crop and issue match rates exclude unknown fields. Failure rates use completed attempts, excluding pending and not-requested providers. Chart latency averages use successful attempts; failed-attempt durations remain visible per record. Filters also apply to charts and summary cards.

Text matching lowercases and normalizes punctuation with limited aliases such as paddy/rice and early/mild severity. It is deliberately not semantic agronomic validation. Different synonyms may be marked as disagreements. Thresholds are high >=80, medium 50–79, low <50. Expert fields are prepared, but editing/approval workflow and real accuracy calculations are not implemented. An agronomist must supply ground-truth labels before either model can be judged accurate.

## Validation and remaining activation work

Run from the repository root:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests -v
npm run lint
npm run typecheck
npm run test:comparison
npm run build
git diff --check
```

Automated tests mock providers; they do not access the user's Ollama process, spend Gemini tokens, or prove real image-diagnosis quality. The test suite covers normalization, malformed JSON, absent confidence, provider failure/timeout, agreement, persistence/recovery, access denial, input parity and the catalogue boundary. Production activation still requires a real-image lab test, private endpoint/secret configuration and your deployment decision. No laptop service or networking was configured automatically.

API references: [Ollama vision](https://docs.ollama.com/capabilities/vision), [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [thinking controls](https://docs.ollama.com/capabilities/thinking), and [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output).
