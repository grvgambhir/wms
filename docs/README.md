# docs — cross-project product notes

Shared documentation for the Como Lake 2027 WMS monorepo (not owned by a single app).

For participant-app history and Como delivery plans, prefer `wms_participant/context_docs/` (that app’s `docs/` folder is a legacy mirror).

## Files

| Doc | Purpose | Trust level |
|---|---|---|
| [`TESTING_GUIDE.md`](TESTING_GUIDE.md) | Click-path testing: List A (RFP demo A1–A8) + List B. Last walked Sep 2026. | Primary how-to-test |
| [`REMAINING_WORK.md`](REMAINING_WORK.md) | Gaps, verified bugs, client decisions (D3/D4/D6/D8). | Primary “what’s left” |
| [`AWS_SETUP_STEPS.md`](AWS_SETUP_STEPS.md) | Cognito / AWS setup used for identity. | Ops reference |

Also at repo root (outside this folder): `BACKEND_DB_RFP_AUDIT.md` — older backend/DB vs RFP audit; prefer current backend README + this ledger for day-to-day work.

## How this relates to app READMEs

| Need | Go here |
|---|---|
| Install / run / per-app progress | Each project’s `README.md` |
| End-to-end “click this, expect that” | `TESTING_GUIDE.md` |
| Product/infra gaps & decisions | `REMAINING_WORK.md` |
| World Rugby prototype | `rugby_world/README.md` (not covered here) |

## Quick start for testers

```bash
cd /path/to/wms
npm run setup
# fill Cognito + backend .env files
npm run db:up && npm run migrate && npm run seed
npm run dev
```

Then open admin `:5173` and participant `:8081` and follow `TESTING_GUIDE.md`.

When product behaviour changes for testers, update `TESTING_GUIDE.md` in the same change set if you can.
