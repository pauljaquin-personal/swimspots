# Community submissions

## Local preview

Run `npm run dev`, then **Suggest a spot**. Drafts persist in browser localStorage. Submitted records persist in `.local/submissions.json` (ignored by Git, outside public assets). Review at `/review.html`. Loopback development permits review without a token; this is never enabled by Wrangler or the production configuration. Back up this file if keeping real curation work. Test files use temporary directories; browser CI uses a fresh checkout.

Submitters provide coordinates, waterbody, access, hazards and permission to publish. No contact details or accounts are collected. The form states what is private and what may become public. Do not enter sensitive location/access information. Publication permission is intentionally not restored from a saved draft.

Pending and rejected records are never returned by the public spots endpoint. A reviewer can edit the listing and must record a note and confirm access/location/hazard checks and check any provided source before approval. An approval is a listing review, not a safety assessment. Approved spots automatically join the map and receive model forecasts; they have no invented council station or water-quality match.

## Production configuration before enabling submissions

The beta database `swimspots-submissions` is provisioned in Cloudflare’s Oceania region, migration 0001 is applied, and the production binding is recorded in `wrangler.jsonc`. ADMIN_TOKEN is configured as a Worker secret. The real D1 submission/approval flow is verified on a version preview before promotion.

Optional submission photographs use a private R2 bucket bound as `SPOT_PHOTOS`. Metadata is stored with the D1 submission; the image bytes stay in R2. Pending images are available only through the authenticated reviewer endpoint. Approved images are served by the Worker from `/api/photos/<submission-id>`, so the bucket itself does not need public access.

For a separate deployment, use its own database and reviewer credential:

1. Create a D1 database (`npx wrangler d1 create swimspots-submissions`).
2. Add its actual returned ID to `wrangler.jsonc` using binding `SUBMISSIONS_DB`, database_name `swimspots-submissions`, migrations_dir `migrations`.
3. Apply `npx wrangler d1 migrations apply swimspots-submissions --remote`.
4. Set a random reviewer credential of at least 32 characters via `npx wrangler secret put ADMIN_TOKEN`. Keep it out of source control, URLs and browser storage.
5. Create the R2 bucket used by the checked-in binding: `npx wrangler r2 bucket create swimspots-photos`. Do not enable public bucket access.
6. Deploy the reviewed branch when authorised, verify unauthorized `/api/review` and `/api/review-photo/<id>` return 401, submit a controlled test record with a small JPEG, review it and confirm the image is private while pending and visible only after approval.

Until storage is configured, submission POST returns 503 with an honest explanation. The catalog and existing feeds keep working. Do not set LOCAL_REVIEW in production; it is an internal boolean in the loopback dev server, not a Wrangler variable.

The reviewer token is held only in page memory. A private note and submission fingerprint are never included in public records. There are no third-party scripts on the review page.

## Guardrails and current limits

- Server validation, 16 KB JSON payload limit, required JSON and exact same-origin writes. Photographs use a separate same-origin PUT endpoint and are limited to one JPEG, PNG or WebP image of at most 8 MB; the Worker checks both MIME type and file signature before storing the bytes.
- UUID submission references prevent duplicate retries; different data with an existing ID is rejected.
- Nearby/same-name published listings trigger an explicit duplicate acknowledgement. Pending duplicates remain visible to reviewers without leaking other submissions to visitors.
- Five submission attempts per hour per hashed client address. Production uses Cloudflare's client-IP header and the private ADMIN_TOKEN as the salt; raw IPs are not stored. Old hourly counters are removed on subsequent submissions. This is basic throttling, not a substitute for stronger bot controls if abuse occurs.
- Approval uses an atomic pending-status transition to prevent conflicting decisions. Both local and D1 storage persist across restarts; D1 migrations and statements are tested against SQLite.
- Initial release accepts mainland NZ coordinates (not Chatham Islands) and loads up to 500 records per status. Add pagination and antimeridian handling before expanding beyond those limits.
- Published records cannot yet be edited or withdrawn in this review UI; corrections currently require an administrator database update. Keep the first release in controlled curation until that workflow is added. Contributor accounts, multi-photo galleries, notifications and reputation are later work.

Back up production D1 and establish a retention policy for rejected/pending records before opening submissions broadly. No privacy contact address is invented in the UI.

The public source or information link is optional in both submission and review. Blank, omitted or whitespace-only URLs are accepted; supplied URLs must pass public HTTPS validation. Supplied links appear under **About this listing** after approval. Listings without a URL show the community review credit without an empty link.
