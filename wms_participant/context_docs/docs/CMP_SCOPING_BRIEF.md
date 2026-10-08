# CMP — competition, schedule and results: scoping brief

**Written:** 14 September 2026
**Status:** For product-owner decision
**Covers:** RFP §4.5, CMP-01 to CMP-08 — seven **Must** and one **Should**
**Current state:** nothing built. Zero tables. This is the largest untouched area of the RFP.

---

## 0. The one question that decides the size of this

**CMP-02:** *"Native scheduling/results **or** monitored integrations; **identify system of
record for each data object**."*

The RFP does not require us to build a competition system. It requires us to be explicit about
who owns each object and to prove the data is trustworthy wherever it comes from. That is the
entire difference between a large build and a moderate one, and **nobody has asked WMS/OC which
it is.**

Masters sport almost never runs on a generic platform. Swimming federations use Meet Manager
or Splash; rowing, judo, tennis and athletics each have entrenched federation systems that
referees and officials already know. A Games-time results system nobody has used before is a
risk on the one day it cannot be rehearsed again.

So the likely answer is **integration for most sports and native for a few** — but likely is
not a decision, and the shape of everything below depends on it.

---

## 1. What we already have, and it is more than it looks

Registration has quietly built most of the *entry* side of CMP-01:

| Already in place | What it gives CMP |
|---|---|
| `core.registration_entry` + `entry_status_event` | the authoritative entry list, with its lifecycle |
| `core.rule_version` pinned per entry | the category an entrant competes in, fixed at entry time |
| `core.category_combination` | CMP-03's combination table — **built, unused** |
| `core.team_roster`, `roster_version`, `roster_substitution` | CMP-04's roster and substitution machinery |
| `core.accreditation` + `accreditation_gate` | the revalidation half of CMP-04 |
| `restricted.classification_fact`, `core.para_class_projection` | para class for start lists, without the medical evidence |

**CMP-01 is largely a query and an export over data we hold**, not a new subsystem. That is the
cheapest win in this whole area and it should be done regardless of the CMP-02 answer.

What does not exist at all: schedules, sessions, heats, start-list ordering, results, medal and
ranking tables, publication state, embargo, and feed monitoring.

---

## 2. Three shapes, honestly compared

### A. Integrate — we are the entry system of record, they own results

We export start lists per sport in the format each federation system expects; results come back
and we publish them. `core.registration_entry` stays authoritative for who is entered; the
competition system is authoritative for what happened.

- **Smallest build.** Import/export adapters, a results store, publication and embargo.
- **CMP-07 becomes the main engineering work** — monitoring feeds, flagging stale or failed
  imports, replay and manual fallback. That requirement exists precisely because this shape
  fails quietly: a feed that stopped at 11:04 looks identical to a sport with no results yet.
- **Risk it carries:** one adapter per sport, each with its own format and its own quirks, and
  none of them can be written until someone tells us which systems the sports use.

### B. Native — we schedule and record results ourselves

- **Largest build by a wide margin**, and the least forgiving: sessions, heats, lane/court
  assignment, progression rules, ties, disqualifications, appeals — per sport.
- Sport-specific progression logic is exactly the per-sport branching the RFP rejects
  elsewhere, and it is much harder to make configurable than eligibility banding was.
- Only worth it if the OC genuinely has no existing systems, which for six named sports is
  unlikely.

### C. Hybrid — native for the simple sports, integrate for the rest

The realistic answer, and the one to plan for. It costs the CMP-07 monitoring *and* a minimal
native path, but it avoids betting the Games on either extreme.

**Recommendation: plan for C, build the CMP-02-independent parts first.** Confidence:
**moderate** — it follows from how Masters sport actually runs, and it does not account for
arrangements the OC may already have.

---

## 3. What can start before the answer arrives

Roughly half of CMP does not depend on who owns results. Doing this first means the decision,
whenever it lands, changes the adapters and not the foundation.

1. **CMP-01 — the authoritative entry dataset and its export.** Start lists by sport, category,
   grade, class, team and venue, from data we already hold. Must reuse the participant-safe
   export rule: the class goes out, the medical evidence behind it does not (PRV-04).
2. **CMP-03 — category combination.** The table exists. The requirement has a sharp edge worth
   stating: when two categories are combined to make a viable field, **the original award
   category must survive**. An athlete entered in 40–44 who races a combined 40–49 field is
   still awarded in 40–44, and the published explanation must say why the combination happened.
   Overwriting the entry's category would destroy exactly what this requirement protects.
3. **CMP-04 — roster locks and Games-time substitution.** The roster machinery exists;
   what is missing is the *lock* and the revalidation on substitution — category **and**
   accreditation, both already modelled.
4. **CMP-06 — publication state and embargo.** Every competition object needs draft /
   approved / published / embargoed, and nothing unpublished may leak through any read path.
   This is a property of the schema, not a filter in a controller, and it is much cheaper to
   build in from the first table than to retrofit across a dozen.

**Deliberately last:** CMP-05's medal and ranking tables, and CMP-08 entirely. Both are
downstream of results existing.

---

## 4. The part that is not a feature

**CMP-07 is an operations requirement wearing an engineering costume.** "Monitor data feeds,
flag stale or failed imports, provide replay/reconciliation/manual fallback" means someone
must be watching during the Games and must have something to do when a feed stops.

That connects to two things already open: there is no observability in the backend at all, and
the paper-track owner (D6) has never been named. A monitored integration with nobody monitoring
it is the same as an unmonitored one, and scenario 8 of the scripted demo (§9.3) asks us to
*show* the incident-and-workaround path live.

---

## 5. Questions for WMS/OC — these gate the estimate

1. **For each of the ten sports: which competition system will be used?** Name and version.
   This is the single question that sizes the work. Ask it first and ask it per sport — one
   answer for "the OC" will be wrong for at least three of them.
2. **Who is system of record for results — us or the federation system?** And is the answer the
   same for every sport?
3. **Are officials already trained on a system they expect to use at Como?** Retraining
   officials during a Games is not a fallback.
4. **What must be published, to whom, and when?** Live during sessions, or after approval?
   That decides whether CMP-06's embargo is a workflow or a timestamp.
5. **Who approves and corrects a published result, and what is the correction process?**
   CMP-05 asks for version history on corrections — a published result that changes without a
   record is the dispute nobody can settle afterwards.
6. **Is there an existing timing/scoring supplier contract?** Timing hardware usually arrives
   with its own data format and its own integration expectations.

Questions 1 and 6 have the longest lead time. Ask them this week — the answers change the
architecture, not just the estimate.

---

## 6. What this brief does not claim

No estimate in days. Until question 1 is answered, an estimate would be a number with nothing
behind it, and this project already has one deadline that slipped from optimism rather than
from work.

What can be said: **CMP-01, CMP-03, CMP-04 and CMP-06 are buildable now** and are worth
starting, because they are true under every answer. CMP-02, CMP-05 and CMP-07 are blocked on
the OC, and CMP-08 is blocked on CMP-05.
