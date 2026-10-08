# START_HERE.md — read this first (Como Lake 2027)

> **You are working on the software for the Open Masters Games _Como Lake 2027_.**
> This file is the single entry point + router for every human and AI agent (Claude Code, Cursor, Codex). Read it, then follow the reading order below.
>
> **Canonical docs live here: `context_docs/docs/`.** The repo-root `docs/` folder is a **legacy mirror** — do not follow it (see [`../../docs/README.md`](../../docs/README.md)).

---

## 30-second orientation

- **Who:** We are **Stupa**, bidding to World Masters Sport (**WMS = IMGA**) to supply **OARS** — a turnkey registration + games-management software service.
- **What:** Two web portals on one governed data model — a **Participant Portal** (athletes) and an **Admin "OC Command Centre"** (Organising Committee) — for **~14,000 Masters athletes**, **40+ sports**, EN + IT, WCAG 2.2 AA.
- **The differentiator:** a **configurable Masters rules engine** (age reference date **31 Dec 2027**, youngest-member / crew-average / relay-aggregate, grades, handicap, para, judo multi-dimension) with versioning, effective dates, impact analysis and audit. **Never hardcode a rule.**
- **★ North star (REV-025):** the goal is the **full, connected OARS product** — real end-to-end journeys, both portals, **scalable to full Games load** (RFP baseline ~14k; realistic peak **~15,000–20,000**; sensible headroom, no re-architecture to grow). We build **for the 15 Sep deliverable as a real working connected portal**, not "screens to look at." **Build philosophy = connected-product-first:** thin real journeys carrying shared state, deepened over phases — nothing throwaway.
- **Target architecture (REV-025 / D7):** the full product is **not one Expo app** — it's a **shared backend (NestJS/FastAPI) + shared TS domain package + Participant app (Expo, this codebase) + a separate plain-React Admin web app**. This codebase is the **P0 demo vehicle**; at split time it becomes **`wms_participant`**, alongside **`wms_admin`** (REV-026/027). The split is Phase-B slice 1 — see `DELIVERY_PLAN_COMO2027.md` §7. **Phase-B prep started 2026-09-04** (naming decided; `wms_admin` scaffold + a domain-purity audit run in isolation, without touching this repo — the actual split waits until after the 7–8 Sep demo, REV-027).
- **The dates that drive everything:** **7–8 Sep 2026** demo (= our **P0**, first connected milestone) · **15–17 Sep 2026** UAT gate → launch readiness (= our **P1**, the primary near-term target) · phases **B–F** to Sep 2027 (full production scale + real backend). *Honest:* the 2-week P0/P1 window = a **connected working slice at POC/thin-backend depth on the target architecture**, not the whole 14k-scale system.
- **Today:** 2026-09-03. **Status:** P0 build **in progress** — shells, i18n scaffold, rules engine, and 6 scenario screens done + web-verified (scenarios 2/4/5/7/8 demonstrable). Next: connect the journeys + i18n string sweep. We revise the old athlete POC, we don't rewrite.

## Reading order

1. **[BUSINESS_OVERVIEW_COMO2027.md](./BUSINESS_OVERVIEW_COMO2027.md)** — the whole picture in plain language (Hinglish + detail): who wants what, roles, platforms, the connected journey, screen map, phases. *Start here for understanding.*
2. **[RFP_COMO2027.md](./RFP_COMO2027.md)** — the contractual source of truth (machine-readable copy of the PDF). Every requirement ID (RUL/REG/PAY/…), the timeline, the scripted demo script (§9.3), the evaluation weights.
3. **[DELIVERY_PLAN_COMO2027.md](./DELIVERY_PLAN_COMO2027.md)** — the execution plan: locked decisions, codebase reuse map, P0/P1/P2+ workstreams + tasks + acceptance. *This is what you build from.*
4. **[PROGRESS_COMO2027.md](./PROGRESS_COMO2027.md)** — living tracker: what's done/in-progress/verified + the demo runbook. *Read at session start, update at session end.*
5. **[REVISIONS.md](./REVISIONS.md)** — log of approved plan/stack/architecture changes (`REV-###`). Latest relevant: **REV-022** (the Como 2027 pivot).

**Still-valid technical references** (extend, don't discard):
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — stack, layering, folder structure (Expo/Expo Router/NativeWind/TanStack/RHF+Zod, repository pattern).
- **[DATA_MODEL.md](./DATA_MODEL.md)** — domain entities (extend for rules/teams/waitlist/exceptions/finance/comms/pre-reg).
- **[DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)** — tokens, gradients, primitives (participant WMS blue kept; add admin navy + portal shells).
- **[../../AGENTS.md](../../AGENTS.md)** — engineering rules (repository pattern, DoD, Expo-Web-first, no direct fixture imports). Still authoritative for *how* to write code.
- **[../../README.md](../../README.md)** — how to run/build/debug the app.

## The locked decisions (from DELIVERY_PLAN §0)
| D1 | **Balanced** P0 demo (polish 5–6 scripted scenarios; judo/para stretch) |
| D2 | **Hybrid responsive** — desktop portal + mobile views from day one |
| D3 | **Admin P0-partial** — a01/a02/a04/a05 now; a03/a06 in P1 |
| D4 | Re-skin to **Como Lake 2027** (keep demo characters Daniel Harper, Marco Rossi) |
| D5 | Still a **mock/POC frontend** — no real backend/PSP/OTP/scanner/scoring; interfaces ready for P2+ |

## Golden rules (non-negotiable)
1. **Rules are configuration**, versioned + effective-dated + audited. Age reference date default **31 Dec 2027**. No silent reclassification.
2. **One participant record** → both portals. Data behind **repository interfaces**; screens never import fixtures / call storage / call APIs directly.
3. **EN + IT + accessibility (WCAG 2.2 AA)** are first-class (release blockers), not retrofits.
4. **Show, don't tell** — every rule effect (recalc, warning, impact analysis, reconciliation, incident/SLA) is visible on screen and **deterministic** from the demo seed.
5. **Restricted data** (medical / para / ID) is separated and access-controlled from day one.
6. **Verify mockups against the RFP** — mockups are AI-generated guides; the RFP wins on substance.
7. **Update [PROGRESS_COMO2027.md](./PROGRESS_COMO2027.md)** every session; log plan/stack changes as `REV-###` **before** doing them.
8. **Build backend-adaptable.** POC is mock, but every repository method must map cleanly to a future REST endpoint (GET/POST/PUT/DELETE) on a NestJS or FastAPI backend — the `repositories` provider is the swap seam. See [DELIVERY_PLAN §6.6](./DELIVERY_PLAN_COMO2027.md).
9. **Connected-product-first (REV-025).** Build **thin real end-to-end journeys carrying shared state**, not isolated demo screens. Everything is a slice of the full product, deepened over phases — nothing throwaway.
10. **Keep the domain layer pure (REV-025 / D7).** No React Native imports in `src/domain/*`, `src/features/rules/engine.ts`, or DTO types — that layer becomes the **shared package** for the backend + the separate plain-React admin app. See [DELIVERY_PLAN §7](./DELIVERY_PLAN_COMO2027.md).

## ▶ How to start a work session (step-by-step)

Point anyone (human or AI) at **this file** and they can start from here:

1. **Read in order:** this file → [`BUSINESS_OVERVIEW_COMO2027.md`](./BUSINESS_OVERVIEW_COMO2027.md) (understanding) → [`DELIVERY_PLAN_COMO2027.md`](./DELIVERY_PLAN_COMO2027.md) (what to build) → [`PROGRESS_COMO2027.md`](./PROGRESS_COMO2027.md) (what's done + **Next action**). Grep [`RFP_COMO2027.md`](./RFP_COMO2027.md) for the exact requirement ID you're touching.
2. **Pick the task** from `PROGRESS_COMO2027.md` → **Next action** (or the next unchecked workstream item).
3. **State the smallest plan**, then build it under the **Golden rules** above: repository pattern (screen → hook → repo interface → mock repo → **mock data hub JSON**), **keep the domain layer pure**, connected-product-first, EN+IT + a11y on the demo path, deterministic from the seed.
4. **Data:** add/extend **API-shaped JSON** in the mock data hub (see next section + DELIVERY_PLAN §6.7); **never import JSON in a screen**.
5. **Verify:** `tsc` clean · Expo Web smoke on **port 8081** · the connected flow still walks end-to-end. Notify if a Metro restart / native rebuild is needed.
6. **Close the session:** update `PROGRESS_COMO2027.md` (checkboxes + session log). If you changed plan / stack / architecture / data strategy, add a `REV-###` in [`REVISIONS.md`](./REVISIONS.md) **first**.

## Data approach (now → later) — REV-026

- **Now:** we **don't build the backend** — a separate developer owns it; we integrate later. The flow runs on a **mock data hub** = **API-shaped JSON** (paginated envelopes `{ items, total, cursor? }`, **UUID** IDs, ISO-8601/UTC dates, **EUR minor units**), content grounded in the **RFP + reasonable research**, consumed **only via repositories**.
- **Later:** the real backend serves the **same shapes**; repos flip `Mock* → Api*` at `src/data/providers/repositories.ts` → dynamic **GET/PUT**, no UI change.
- **Future admin** frontend = a **separate plain-React repo named `wms_admin`** (REV-025 §7 / D7). Keep the domain layer pure so it (and the backend) reuse it unchanged.

## Document status map
| Doc | Status |
|---|---|
| `RFP_COMO2027.md`, `BUSINESS_OVERVIEW_COMO2027.md`, `DELIVERY_PLAN_COMO2027.md`, `PROGRESS_COMO2027.md`, `START_HERE.md` | ✅ **Canonical (Como 2027)** |
| `ARCHITECTURE.md`, `DATA_MODEL.md`, `DESIGN_SYSTEM.md` | ✅ **Still valid — extend** (each opens with a status note). Plus `REVISIONS.md` (changelog), `../../AGENTS.md` (engineering rules), `../../README.md` (run/build guide). |
| `MOCK_DATA.md` | 🔄 **Transitional** — documents the *current, pre-reskin* fixtures only (not target scope). WS-A updates/retires it. Banner at top. |
| ~~`BUSINESS_CONTEXT` · `PRODUCT` · `POC_SCOPE` · `SCREEN_FLOW` · `CLIENT_DEMO_GUIDE` · `IMPLEMENTATION_PLAN` · old `PROGRESS.md`~~ | ❌ **Deleted (REV-024)** — fully superseded by the Como 2027 docs; recover from git history if ever needed. |
| repo-root `docs/*` | 🗄️ **Emptied to a signpost** — only `docs/README.md` remains (redirects here). Use `context_docs/docs/*`. |

## Source materials (inputs, in `context_docs/`)
- `RFP WMS Como2027 Software Final.pdf` — the RFP (legal source of truth).
- `V1_Turnkey Registration & Games Management Software __ Proposal Response by Stupa_V1_31.08.2026.md` — our submitted proposal (product = OARS, €88k base, named team, phases).
- `new_wmc_admin&athlete_screenshots/` — new Como 2027 mockups (participant + admin; desktop + mobile). **AI-generated — verify against the RFP.**
- `event-details/` — the WMS event catalogue used for demo data.
- `Backend - Registration Phase Requirements & Core Architecture Foundation.md` — **WIP** high-level backend/architecture baseline by the BE developer. **Secondary reference** (not a doc to always follow): the **RFP wins** on substance. Use it to keep the codebase **API-first / backend-adaptable** and to anticipate the backend's persona portals, entrant-lineage, idempotency and data-isolation needs. Future backend is likely **NestJS or Python FastAPI** (REST/JSON).
- Old inputs (`IMGA Software RFP Ver 1.1 Final.pdf`, `BORNAN…PROPOSAL…V2.pdf`, `old_*` screenshot folders) — historical only.

---
*If you only remember one thing: build the **Masters rules engine** as configuration and make its effects **visible** — it is the pass/fail gate and the highest-weighted differentiator. Last updated 2026-09-01.*
