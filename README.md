# BlueCrow Azure Virtual Agent

Production-oriented Azure Static Web App with:
- React/Vite frontend
- Azure Functions API layer
- Azure OpenAI + Azure AI Search + Azure Speech integration
- Admin console for staging content operations (room-slide assignment, media upload, publish to prod)

## What Changed

This repository now includes:
- Public content API (`/api/content/*`) serving `slides.json` / `roomConfigurations.json` compatible shapes.
- Admin API (`/api/cms/*`) with role-gated CRUD, publish action (staging -> prod), indexer trigger, and signed upload flow.
- Frontend feature flag (`VITE_USE_CONTENT_API`) to switch runtime content source from local JSON to API.
- Lobby admin entry button and an in-app admin panel.
- Migration assets for Azure SQL (`migrations/sql/001_create_schema.sql`, `migrations/sql/002_seed_from_json.sql`).

## Architecture (Current Implementation)

- Frontend: React 19 + Vite (`App.tsx`, `components/*`)
- API: Azure Functions (TypeScript, folder-per-function model in `api/`)
- AI:
  - `/api/azure-openai` -> Azure OpenAI
  - `/api/azure-search` -> Azure AI Search (RAG context retrieval)
  - `/api/azure-tts` + `/api/azure-stt-token` -> Azure Speech
- Content:
  - Runtime source can be local JSON or `/api/content/*` (flag controlled)
  - Admin API persists a staging content snapshot in Azure Blob Storage and publishes it to a production container on demand
  - API build syncs `config/*.json` into `api/config/*` so deployed Functions can bootstrap content

## Prerequisites

- Node.js 20+
- npm
- Azure Functions Core Tools (for local Functions)
- (Recommended) Azure Static Web Apps CLI for local auth and integrated routing

## Environment Setup

### Frontend
1. Copy `.env.example` -> `.env.local`
2. Configure values (at minimum):
   - `VITE_USE_CONTENT_API=true` to use backend content API
   - `VITE_MEDIA_BLOB_CONTAINER=bluecrow-media` (media is resolved via `/api/media/{container}/{path}`)
   - `VITE_QNA_ENABLED`, `VITE_BUG_REPORT_ENABLED`
   - session/bug-report endpoints if used

### Functions
1. Copy `api/local.settings.sample.json` -> `api/local.settings.json`
2. Fill required keys for OpenAI/Search/Speech.
3. Configure admin access:
   - `ADMIN_ALLOWED_EMAILS` with allowed Entra user emails
   - optional test bypass: `ADMIN_DISABLE_AUTH=true` (not for production)
   - optional local bypass (`ADMIN_DEV_BYPASS`, `ADMIN_DEV_KEY`) for non-SWA local testing
4. Configure content/media storage:
   - `BLOB_STORAGE_CONNECTION_STRING` (or `AZURE_STORAGE_CONNECTION_STRING`)
   - `CONTENT_STORE_BLOB_CONTAINER`, `CONTENT_STORE_BLOB_NAME` (staging)
   - `CONTENT_STORE_PROD_BLOB_CONTAINER` (publish target, default `bluecrow-content-prod`)
   - Optional: `CONTENT_STORE_PROD_BLOB_NAME` (defaults to `CONTENT_STORE_BLOB_NAME`)
   - `MEDIA_BLOB_CONTAINER`
   - `KNOWLEDGE_BASE_BLOB_CONTAINER` (default `bluecrow-knowledge-base`)
   - `MEDIA_UPLOAD_SECRET` (HMAC signing key for upload tokens)
   - Optional upload limits: `MEDIA_UPLOAD_MAX_IMAGE_MB` (default `10`), `MEDIA_UPLOAD_MAX_VIDEO_MB` (default `200`), `MEDIA_UPLOAD_MAX_MB` (fallback)
   - Optional upload token lifetime: `MEDIA_UPLOAD_TTL_SECONDS` (default `300`)
   - Optional knowledge base upload limit: `KNOWLEDGE_BASE_UPLOAD_MAX_MB` (default `50`)
   - Optional: `MEDIA_BLOB_PUBLIC_ACCESS=true`, `MEDIA_PUBLIC_BASE_URL`

## Local Development

Install dependencies:

```bash
npm install
cd api
npm install
```

Run frontend:

```bash
npm run dev
```

Run functions:

```bash
cd api
npm start
```

If using SWA CLI (recommended for `/.auth/*` behavior and route parity):

```bash
swa start http://localhost:3000 --api-location api
```

## Bulk Media Upload To Blob

If you want to copy current static assets from `public/slides` and `public/videos` into your media blob container:

```bash
cd api
npm run upload:media -- --dry-run
npm run upload:media
```

Useful flags:
- `--overwrite` to replace existing blobs
- `--container=<name>` to target a different container
- `--concurrency=<number>` to tune parallel uploads

Notes:
- The uploader reads `BLOB_STORAGE_CONNECTION_STRING` (or `AZURE_STORAGE_CONNECTION_STRING` / `AzureWebJobsStorage`).
- Uploaded paths are preserved as `slides/...` and `videos/...` inside the container.
- This upload does not rewrite existing slide `imageUrl`/`videoUrl` values.

## Rewrite Content Store Media URLs

After uploading media to Blob, rewrite relative slide media paths in the content store to your public blob base URL:

```bash
cd api
npm run migrate:media-urls -- --dry-run --base-url="https://<storage-account>.blob.core.windows.net/<media-container>"
npm run migrate:media-urls -- --base-url="https://<storage-account>.blob.core.windows.net/<media-container>"
```

Useful flags:
- `--source=blob` to update content-store blob directly
- `--source=file` to update local `api/data/content-store.json`
- `--container=<name> --blob=<name>` for non-default content-store blob location

Notes:
- Absolute URLs (`http/https/data`) are kept as-is.
- Only relative slide `imageUrl` and `videoUrl` values are rewritten.
- A report is written to `api/data/media-url-rewrite-report.json` by default.

## Admin Console

- Open Lobby and use the discreet `Admin` side button.
- Sign in through Microsoft Entra (SWA auth endpoint `/.auth/login/aad`).
- Admin panel supports:
  - Editing slide title/description/scripts
  - Editing room metadata
  - Reordering room slide sequence
  - Assigning/removing slides in room sequence
  - Signed slide media upload flow (`/api/cms/media/upload-url` + `/api/cms/media/upload`)
  - Slide media uploader writes blob paths as `{category}/{images|videos}/{slideId}_{timestamp}_{sanitizedOriginalName}`
  - Knowledge Base tab for document upload/list/delete (`/api/cms/knowledge-base`, `/api/cms/knowledge-base/upload`, `/api/cms/knowledge-base/{id}`)
  - Knowledge base documents stored under `knowledge-base/{tag}/{timestamp}_{sanitizedName}` with blob metadata (`description`, `tag`, `uploadedby`, `uploadedat`)
  - Publish staging snapshot to production content container (`/api/cms/publish`) with metadata (`publishedAt`, `publishedVersion`, optional `publishedBy`)
  - Optional search indexer refresh trigger after publish

## SQL Migration Assets

### Schema
- `migrations/sql/001_create_schema.sql`

### Seed
- Generate from current JSON:

```bash
npm run migrate:seed-sql
```

- Output:
  - `migrations/sql/002_seed_from_json.sql`

Apply both scripts to Azure SQL in order.

## Tests

API tests added (minimal):
- `api/tests/uploadToken.test.js`
- `api/tests/contentStore.test.js`
- `api/tests/mediaUploadPath.test.js`
- `api/tests/knowledgeBase.test.js`

Run:

```bash
cd api
npm test
```

## Deployment

- GitHub Actions workflow: `.github/workflows/azure-static-web-apps-green-desert-07f771b03.yml`
- SWA config: `staticwebapp.config.json`
  - `/api/cms/*` supports anonymous routing at edge; API-level authorization is enforced in function code
  - `/api/content/*` has short cache headers
  - `/uploads/*` has immutable cache headers
- SWA application settings must include blob storage settings for content/admin persistence and media upload.

## Notes

- Azure deployment requires Blob storage configuration; local file persistence remains available for local development fallback.
- SQL migration scripts are available, but SQL is not required for the current Blob-backed admin/content runtime.
- Known content issues discovered from source data:
  - 1 missing slide image reference
  - 3 missing video references
