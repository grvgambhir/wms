# scripts — monorepo helpers

Shell helpers used by the root `package.json`. Not a deployable app.

## Scripts

| File | What it does |
|---|---|
| [`node22.sh`](node22.sh) | Runs a command under Node 22 for `wms_backend` (nvm / `.nvmrc` / PATH). Used by root `migrate`, `seed`, `dev:backend`, `test:backend`, `typecheck:backend`, etc. |
| [`dev-clean.sh`](dev-clean.sh) | Clears leftover processes on local WMS ports so `npm run dev` can bind (`npm run dev:clean`). |

## What works

- Keeps backend on Node 22 even if the shell default is older.
- `dev-clean` is the first fix when `:3050`, `:5173`, or `:8081` fail to bind.

## What this is not

| Concern | Where it lives |
|---|---|
| SQL migrations / seeds | `wms_backend/` (`npm run migrate`, `seed`) |
| Participant Docker redeploy | `wms_participant/scripts/redeploy-web.sh` |
| Rugby deploy | `rugby_world/scripts/deploy.sh`, `redeploy.sh` |

## Usage

Prefer root npm aliases:

```bash
npm run dev:clean
npm run migrate
npm run dev:backend
```

Or invoke directly:

```bash
./scripts/node22.sh npm --prefix wms_backend run typecheck
./scripts/dev-clean.sh
```
