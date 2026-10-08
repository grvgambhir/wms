# Load guarantees and §6 performance budget

Measured: 2026-09-11T05:01:37.568Z

Fixture: 14,000 athletes, one Games-scale event, PostgreSQL 18.6.

These are local Docker PostgreSQL measurements on a laptop, not production results. The useful result is the shape: which paths are near their budget and which are orders of magnitude away. The payment path uses the deterministic stub because no PSP has been selected, and the catalogue value is a direct SQL proxy because that HTTP endpoint is not built.

## Six guarantees

| Claim | Result | Evidence |
|---|---:|---|
| Overselling is impossible | PASS | 500 concurrent HTTP claims: 60 confirmed, 440 refused 409 QUOTA_FULL, zero quota constraint errors logged. |
| Retries are free | PASS | One payment plus 99 replays produced one intent, one charge, one entry, and 100 deeply identical response bodies. |
| History is complete | PASS | Save, payment, and withdrawal produced three actor/reason rows; two SIGKILL restarts retained the complete journey. |
| The past is fixed | PASS | After v3 publication, the v2 entry retained rule id/category Masters 40-49; a new v3 entry derived Open 40+. |
| Restricted data is unreachable | PASS | BEGIN/SET LOCAL ROLE app_rw proved current_user=app_rw and SELECT failed 42501; the privileged view logged every returned document. |
| Dual control is real | PASS | The same reviewer’s second signature failed 23505; one signature remained and the case stayed pending. |

## §6 measured budget

| Path | Target p95 | Measured p95 | Result | Measurement scope | Dominated by when missed |
|---|---:|---:|---:|---|---|
| Catalogue read | < 50 ms | 25.7 ms | PASS | Direct catalogue SQL proxy; no catalogue HTTP endpoint exists yet (200 samples, concurrency 20). | Within budget |
| Journey read | < 150 ms | 91.1 ms | PASS | GET registration journey (200 samples, concurrency 20). | Within budget |
| Admin queue page (50 rows) | < 200 ms | 42.1 ms | PASS | GET /v1/admin/people, the implemented keyset-paged admin list (100 samples, concurrency 10). | Within budget |
| Entry save | < 300 ms | 328.3 ms | MISS | PUT distinct entries (100 samples, concurrency 10). | Multi-statement transaction: category, quota lock, order lines, and status history |
| Quota claim under contention | < 800 ms | 1503.8 ms | MISS | The 500 simultaneous PUT claims used by guarantee 1. | Serialized lock queue on the single 60-place quota row |
| Payment capture | < 1500 ms | 121.8 ms | PASS | POST distinct payments through the deterministic local stub (50 samples, concurrency 10). | Within budget |

No product behavior was changed to improve a timing, and no index migration was added speculatively. Long-running work is isolated behind `npm run test:load`; the normal backend suite retains only the small mechanism tests and fixed-query-count assertions.
