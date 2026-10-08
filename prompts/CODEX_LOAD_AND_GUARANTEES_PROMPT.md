# Task: prove the plan's six guarantees under load, and measure the budget

Repo: `wms_backend`. Backend only — no app changes, no new product features.
Reference: `wms_participant/context_docs/docs/BACKEND_DB_PLAN.md` §6 and §9.

---

## Why this is worth a whole task

§9 of the plan is titled *"How we know it worked"* and opens with: **"Every claim below is a
test, not a review comment."** Six claims are listed. Today they are review comments — the
existing suite proves each mechanism with two or three rows, which is the right unit test and
is not the same as proving the property at Games scale.

The failures this catches only appear under contention: deadlocks from lock ordering, a pool
that oversells by one under 500 simultaneous claims, an N+1 that is invisible at ten rows and
fatal at ten thousand.

§6 states p95 targets and says explicitly *"to be measured under load rather than asserted"*.
Nobody has measured them.

## The six claims — each becomes a real test

1. **Overselling is impossible.** 500 concurrent claims against a 60-place quota → **exactly**
   60 confirmed, 440 refused `409`, and **zero constraint violations logged as errors**. That
   last clause matters: a `quota_not_exceeded` violation surfacing as a 500 is a different
   (and worse) outcome than a clean 409, and a test that only counts confirmations misses it.
2. **Retries are free.** One `Idempotency-Key` replayed 100× → one charge, one entry,
   **identical response bodies** every time. Compare the bodies, not just the count.
3. **History is complete.** Every status change has a row naming actor and reason. Kill the
   service mid-journey, restart, and nothing is lost (this is F1 — five of six services used
   to die on restart).
4. **The past is fixed.** Publish rule v3; entries created under v2 keep v2's category (F3).
5. **Restricted data is unreachable.** The ordinary app role gets a **permission error** on
   `restricted.*`, and every access by the privileged role appears in `restricted.access_log`.
   Use `BEGIN; SET LOCAL ROLE app_rw; …; ROLLBACK` — **outside a transaction `SET LOCAL ROLE`
   silently does nothing** and the test passes while proving the opposite.
6. **Dual control is real.** One reviewer signing twice → unique violation, case stays pending.

If a claim cannot be proven because the feature is not built yet (dual control may still be in
progress), **say so and leave the test failing-by-skip with a named reason** — do not weaken
the claim to make it pass. Which claims are currently unprovable is itself the useful output.

## The N+1 rule

§6: *"every list endpoint has a test asserting a **fixed** query count regardless of page
size."* Implement that as a reusable helper — count statements on a connection, assert the
count is identical for a page of 10 and a page of 200. Apply it to every list endpoint that
exists. This is the failure that appears only with real data and is trivially preventable.

## Measuring §6

Produce a **measured** version of the §6 table: catalogue read < 50 ms, journey read < 150 ms,
admin queue page (50 rows) < 200 ms, entry save < 300 ms, quota claim under contention
< 800 ms, payment capture < 1500 ms.

Use a small script in `scripts/` driven by `npm run` — not a new framework and not a service
dependency. Seed enough data to be meaningful (a Games-scale event is ~14,000 athletes; say
what you seeded). Report **measured p95 against target**, and where a target is missed, say
what dominated — do not tune until it passes and then report the tuned number.

This runs against local Docker Postgres on a laptop, so the absolute numbers are not a
production result. Say that in your report. What is meaningful is the **shape**: which paths
are near their budget and which are orders of magnitude away.

## Constraints

- Do not change product behaviour to make a number better. If a query needs an index, propose
  it as a migration with the measurement that justifies it, and say what it costs on write.
- Long-running load tests must not run as part of `npm run test:backend` — keep them behind
  their own script so the normal suite stays fast.
- **Coordinate before running the suite.** Another agent is working in this repo, and
  `test/globalSetup.ts` writes the throwaway database URL to one shared file
  (`test/.tmp-database-url`). Two suites at once overwrite each other and fail confusingly.
  If your load script creates its own database, give it a distinct name.

## Definition of done

Run all three from `/Users/gauravgambhir/Desktop/Code_Life/wms` and paste the results:
`npm run test:backend`, `npm run typecheck:backend`, `npm run build:backend`.

Then paste the measured §6 table and the six-claim results — including any claim you could not
prove and why.
