# Task: fix `db:types` — it has never worked

`npm run db:types` emits only `public.pgmigrations`. Every repository since has therefore used
raw `pool.query` with hand-written row interfaces — exactly the drift and typo risk the typed
query layer was chosen to prevent. Both previous reports flagged it and neither fixed it.

Repo: `/Users/gauravgambhir/Desktop/Code_Life/wms/wms_backend`. **Node 22.**

There are now 111 tables across `core`, `restricted`, `ops` and `audit`. Almost certainly the
generator is only looking at `public`.

**Small task — do not turn it into a refactor.**

1. Find out why (schema filter, search path, or the wrong tool for a multi-schema database).
2. Fix it so `src/db/types.ts` covers all four schemas, and commit the generated file.
3. If `kysely-codegen` genuinely cannot do multi-schema here, say so and propose one
   alternative rather than working around it. A wrong tool named is more useful than a
   workaround shipped.
4. Add a README line: when to re-run it (after every migration) and what breaks if you forget.
5. **Do not rewrite existing repositories to use the types.** That is a separate change and
   would collide with work in `src/registration/*`. Generate, verify it compiles, stop.

Prove it: `src/db/types.ts` contains `core.registration_entry`, `core.quota_pool`,
`restricted.evidence_document` and `audit.activity_log`; `npm run typecheck` clean;
`npm test` unchanged.

Report what was wrong, whether the fix survives `migrate:down`/`up`, and anything that made
you want to change a repository (note it, do not do it).
