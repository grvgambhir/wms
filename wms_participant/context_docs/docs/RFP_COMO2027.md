# RFP_COMO2027.md — Como Lake 2027 Software RFP (machine-readable copy)

> **What this is:** a faithful Markdown transcription of `context_docs/RFP WMS Como2027 Software Final.pdf`
> (World Masters Sport · Open Masters Games Como Lake 2027 · *Turnkey Registration and Games Management Software* · Version 1.3, issue date 27 Aug 2026).
>
> **Why it exists:** the PDF is the legal source of truth, but PDF text is not reliably readable by every AI agent/tool. This `.md` is the greppable working copy — every requirement ID (RUL/EVD/TEA/PLT/REG/PAY/ACC/CMP/OPS/NFR/PRV/ACS/DAT/SEC/CON) is preserved so agents can trace features to requirements.
>
> **Authority:** where this file and the PDF differ, **the PDF wins**. Where the RFP and the final WMS/OC-approved sport guides / rule register differ, **the approved rule register wins** (see §C3). Do not guess a rule — raise a controlled decision.
>
> This is our client's procurement document, kept here for internal engineering traceability only.

---

## 0. The one-paragraph summary (read this first)

World Masters Sport (WMS, the operating name of the **IMGA**) is buying **one turnkey, hosted software service** to run athlete **registration + games management** for the **Open Masters Games Como Lake 2027** (17–26 Sep 2027, across Como / Lecco / Varese, Lombardy, Italy). **~14,000 athletes** (design for 20,000), **40+ configurable sports** incl. para, **75+ venues**. **Athlete registration must go live in production on 17 September 2026.** The supplier (us = **Stupa**, product **OARS**) delivers software, hosting, support and Games-time coverage; the **Organising Committee (OC)** operates the event. Everything about Masters sport rules (age bands, youngest-member, crew average, relay aggregate, grades, handicap, para class, judo multi-dimension) must be **controlled configuration with effective dates + audit**, never hardcoded.

---

## Definitions (RFP p.2)

| Term | Meaning |
|---|---|
| **WMS / Authority** | World Masters Sport = International Masters Games Association. Issuer, contracting customer, provides the Solution to the OC. HQ: Avenue de Rhodanie 54, 1007 Lausanne, Switzerland. |
| **Organising Committee (OC)** | The authorised operational user. Responsible for event operations, staffing, sport/venue processes, participant admin, business decisions. |
| **Supplier** | The successful software + managed-service provider (us = Stupa) and approved subcontractors. |
| **Solution** | Hosted software, configured services, integrations, support, people, processes, deliverables. |
| **Core Service** | Athlete identity, registration, eligibility, payment, entry, team, accreditation, communication, data, operational admin. |
| **Operations-ready** | Formally accepted by WMS + OC as deployable/supportable in production: configured, integrated, tested, monitored, secured, documented, recoverable, governed, with trained OC users + runbooks + fallbacks. |
| **Protected Window** | Period with enhanced availability/support/change-control/incident targets (launch, entry deadlines, accreditation, Games). |
| **Must / Should / May** | Mandatory / materially preferred / optional. |

---

## 1. Event context, objectives and planning assumptions

**1.1 Context.** International multi-sport event for Masters athletes, 17–26 Sep 2027, Como/Lecco/Varese. Participants enter as **athletes and teams, not national delegations**. Wide range of ages/abilities/disciplines. WMS procures the hosted service and provides it to the OC. Sport programme + guides are **still evolving** — different age thresholds, calc methods, proficiency definitions and evidence by sport. ⇒ **All sport rules must be controlled configuration with effective dates, approvals and full audit — not one global age formula or a static form.**

**1.2 Procurement objectives.**
1. Open athlete registration on **17 Sep 2026** without compromising security, accessibility, payment integrity or support.
2. One coherent participant journey: account → sport entry → team → eligibility → documents → payment → accreditation → communications → results.
3. Real-time operational control for OC + each sport/venue team via role-based dashboards, workflows, exports.
4. Correctly model Masters specificities: age calcs, ability grades, team/crew rules, handicap, classification, licences, medical evidence.
5. Reliable through launch peaks, deadlines, accreditation and the 10-day Games, with rehearsed incident/continuity/fallback.
6. Protect participant data; deliver usable/portable data at exit.

**1.3 Planning assumptions & minimum design envelope (capacity to design & price against):**

| Dimension | Baseline |
|---|---|
| Paid athletes | 14,000 expected; support **≥20,000 without re-platforming**. |
| User + related records | ≥50,000 (athlete, team contact, companion, workforce, stakeholder). |
| Sport programme | ≥40 configurable sports/discipline groups incl. para + late changes. |
| Venues & competition units | ≥75 venues; ≥150 independently schedulable events/competition units. |
| Registration launch load | **≥2,000 concurrent authenticated sessions**, demonstrated **5× normal burst**, **no overselling of quotas**. |
| Languages | **English + Italian** in production; add languages without code changes. |
| Currencies/payments | **EUR** settlement, international cards, configurable additional methods. |
| Data retention | Operational access through 31 Dec 2027 + agreed export/deletion/statutory retention. |

> **Programme variability:** sports, categories, venues, prices, quotas, rules must be add/changeable via **controlled configuration without outage or a software release**.

---

## 2. Scope of the turnkey software service

**2.1 Operating model.** Supplier = prime contractor for the software service. "Turnkey" = end-to-end software delivery + service outcomes (config, hosting, licences, integrations, migration, testing, docs, training, monitoring, support, incident mgmt, vendor coordination, exit). **It does NOT transfer running the Games from OC to Supplier.**

- **WMS**: issues/governs procurement; contracts & manages Supplier; provides Solution to OC; approves material scope/service/data-governance/contract decisions.
- **OC**: operates registration + event workflows; supplies operational staff + subject-matter owners; approves sport rules, fees, participant decisions; runs venues, accreditation desks, helpdesk, manual fallbacks.
- **Supplier**: delivers/configures/hosts/supports software; trains OC users; monitors; resolves incidents; maintains runbooks; provides Games-time software-service coverage.

**2.2 Services in scope (10):** (1) public + assisted registration; account/identity/consent; individual/pair/team/crew/relay entries. (2) configurable Masters eligibility + classification; evidence collection/verification/exception/appeal. (3) fees/orders/secure payment/invoicing/refunds/chargebacks/promo/group-corporate/reconciliation. (4) quotas/waitlists/release waves/inventory/demand dashboards at sport/discipline/event/category/venue. (5) team formation/invitations/roster/partner finder/captain-manager tools/substitutions/locks. (6) accreditation + credential lifecycle (photo, role/entitlement, print/export, issue/reissue, audit). (7) competition data exchange/schedules/start lists/results/medal-ranking outputs/publication (native or integrations). (8) targeted multilingual email/SMS/in-app comms/templates/alerts/delivery reporting. (9) admin/reporting/dashboards/exports/APIs-webhooks/support tooling/audit logs. (10) implementation/cutover/readiness/support/closure/secure exit.

**2.3 Interfaces & channels.** (1) **Responsive participant web** optimised for mobile/tablet/desktop; native app may be proposed but **is not a substitute for an accessible browser journey**. (2) **Role-based administrator portal** for OC/sport/finance/accreditation/helpdesk/venue/reporting. (3) documented APIs/webhooks/secure file exchange for website, PSP, CRM, access-control/credential printing, competition systems, accommodation/tourism, analytics. (4) supported assisted-registration for helpdesk + authorised proxies with consent + audit.

**2.4 Scope boundaries (excluded unless expressly proposed):** event-management + operational staffing (helpdesk agents, sport ops, venue mgmt, accreditation-desk operators, officials, comms approval, finance decisions); venue internet circuits; field-of-play timing/scoring hardware; generic website CMS; physical credential printers/consumables; accommodation inventory. Supplier still specifies software dependencies, validates interfaces, enables monitored fallback for every integration the Core Service depends on.

---

## 3. Masters sport operating model & rule requirements

### 3.1 Required rules-engine characteristics
| ID | Requirement |
|---|---|
| **RUL-01** | Rules configurable by sport, discipline, event, gender/category, team type, competition grade, venue, phase, **effective date**. |
| **RUL-02** | Age calculated against a **configurable reference date** (many Como guides = **31 December 2027**), not registration or Games-opening date. |
| **RUL-03** | A rule change **triggers impact analysis**: affected registrations, teams, fees, quotas, documents, schedules, communications. **No silent reclassification.** |
| **RUL-04** | Preserve original registration category, current validated category, reason for change, approving user, timestamp. |
| **RUL-05** | Rule versions + sport-guide versions publishable, exportable, auditable. Notify participants where a material rule change affects their entry. |
| **RUL-06** | Authorised admins create exceptions with reason codes + **dual approval** for high-impact changes. |

### 3.2 Masters classification patterns to support
| Pattern | Como example | Required behaviour |
|---|---|---|
| Individual age bands | Swimming 5-yr bands 25+→100+; cycling 5-yr with open upper | Derive category from DOB + reference date; open-ended + irregular bands. |
| **Youngest-member rule** | Basketball & floorball use youngest player; tennis uses youngest doubles player | Recalc in real time on roster change; block/warn invalid moves; preserve prior decision. |
| **Crew average age** | Rowing = average crew age **excluding coxswain** | Inclusion/exclusion roles, decimal/rounding policy, substitute impact, category validation. |
| **Relay aggregate age** | Swimming relay = **sum of 4 members' ages** | Aggregate age, band rules, revalidate substitutions. |
| Proficiency grade | Badminton/basketball/volleyball competitive vs recreational; tennis grade-by-event | Self-declaration + evidence; sport review, re-grade, grade-specific fees/quotas, appeal. |
| Multiple dimensions | Judo = age + weight + sex/category + federation status + **min 1st Kyu** | Multi-attribute eligibility, verification status, weigh-in changes, competition mapping. |
| Handicap | Golf gross + handicap Stableford; player handicap | Issuing authority, index/value, validity, verification, event-specific use. |
| Para classification | Swimming S1–S13 + documentary evidence | Class, class status, evidence, review/expiry, assistance/access needs, results-class mapping w/ **restricted access**. |
| Category combination | Low-entry categories combined but **medals stay tied to original categories** | Combined heats/fields without losing original award category, ranking, published explanation. |
| Eligibility exclusions | Licence, recent elite/national-team, suspension exclusions | Declarations/evidence, screen rules, route exceptions, retain decision basis. |

### 3.3 Eligibility evidence & participant safety
| ID | Requirement |
|---|---|
| **EVD-01** | Configurable evidence: DOB ID, federation licence/membership, competition history, belt/grade, handicap, para class, medical fitness cert, waiver, insurance, accreditation photo. |
| **EVD-02** | Each doc type: required/optional logic, sport applicability, issuing country, issue/expiry, version, secure upload, **malware scanning**, reviewer status, rejection reason, resubmission. |
| **EVD-03** | Medical + disability/classification info: **privacy-by-design, least-privilege, restricted exports, recorded lawful basis, separate retention/deletion**. |
| **EVD-04** | OC defines acceptable formats + translations, can waive with approval, reports outstanding/expired evidence without exposing unnecessary content. |

### 3.4 Team, pair & partner journeys
| ID | Requirement |
|---|---|
| **TEA-01** | Captain-created teams, invite codes/links, individual join requests, managed assignment, **partner finder**, OC-assisted matching. |
| **TEA-02** | Team deposits, payer sponsorship, split payments, unpaid roster members, deadlines, min/max roster, reserve roles, manager/coach roles, roster locks. |
| **TEA-03** | Apply age, grade, gender/category, nationality/residency, licence, event-duplication rules at member + team level. |
| **TEA-04** | Controlled substitutions after deadlines, with fee/refund/category/accreditation impacts recalculated **before** approval. |

---

## 4. Functional requirements

> Every requirement with an ID must be answered in Appendix A as: **Comply-standard / Comply-configuration / Comply-third party / Partial / Roadmap / Not available**. Any qualification needs delivery date, dependency, cost, operational impact.

### 4.1 Platform, identity & participant experience (PLT)
| ID | Pri | Requirement |
|---|---|---|
| PLT-01 | Must | Production-proven, hosted, responsive service on current major browsers + mobile devices. |
| PLT-02 | Must | **English + Italian** journeys, content, validation, emails, receipts at launch; translation mgmt + more languages without code changes. |
| PLT-03 | Must | Single participant account with verified email/SMS, passwordless or password auth, recovery, duplicate handling. |
| PLT-04 | Must | **MFA for privileged users**; configurable MFA/risk for participants; RBAC + least privilege. |
| PLT-05 | Must | Clear save-and-resume, review, correction, confirmation; preserve selections during payment retries / session interruption. |
| PLT-06 | Must | Assisted/proxy registration with recorded authority/consent + audit distinguishing participant vs operator actions. |
| PLT-07 | Must | Participant self-service: profile, entries, teams, evidence, payments, invoices/receipts, comms, accreditation status, downloadable confirmations. |
| PLT-08 | Should | Household/companion-linked profiles without commingling consent/credentials/sensitive evidence. |

### 4.2 Registration, entries, teams & eligibility (REG)
| ID | Pri | Requirement |
|---|---|---|
| REG-01 | Must | Configure registration products/workflows by sport, discipline, event, age band, grade, team type, venue, phase, participant type. |
| REG-02 | Must | Calculate age + category from DOB using sport-specific reference dates, band definitions, open-ended categories. |
| REG-03 | Must | Youngest-member, average-age, aggregate-age + other formula-based team/crew/relay categories with **immediate revalidation** after roster changes. |
| REG-04 | Must | Proficiency/grade self-selection, evidence, automated screening, sport-admin review, re-grading, appeal, full audit. |
| REG-05 | Must | Sport-specific dimensions: weight, belt/grade, handicap, para classification, licence/membership, sex/gender category, event-specific eligibility/exclusions. |
| REG-06 | Must | Individual, pair, doubles, team, crew, relay entries incl. captains, managers, reserves, substitutes, non-playing roles. |
| REG-07 | Must | Team invitations, join requests, partner finder, OC matching, team codes, controlled roster publication/privacy. |
| REG-08 | Must | Enforce sport min/max roster, event-entry limits, incompatible-event rules, deadlines; warn on provisional schedule conflicts. |
| REG-09 | Must | Quotas, reserved allocations, release waves, local/international quota dimensions, **waitlists, automatic offers, expiry timers, oversell prevention**. |
| REG-10 | Must | Document/evidence collection with file validation, malware scanning, review queues, expiry, rejection/re-upload, reason codes. |
| REG-11 | Must | Configurable status lifecycle: draft, pending evidence, pending team, pending payment, waitlisted, confirmed, cancelled, substituted, withdrawn, disqualified. |
| REG-12 | Must | Participant- + admin-initiated changes with fee/category/quota/document impacts **shown before commitment** + logged after approval. |
| REG-13 | Must | Import current **pre-registration** expressions of interest, deduplicate safely, issue invitation/claim-account journeys **without treating pre-reg as a paid entry**. (~**15,000 records**.) |
| REG-14 | Should | Configurable add-ons: ceremonies, transport, tourism, accommodation referrals, merchandise, insurance referral, companion products. |
| REG-15 | Must | Real-time + exportable registration counts, funnels, abandoned carts, evidence backlog, waitlists, capacity, team completeness, exception queues. |

### 4.3 Fees, payments & financial control (PAY)
| ID | Pri | Requirement |
|---|---|---|
| PAY-01 | Must | Configure base/sport/event fees, add-ons, taxes/VAT, early/late phases, participant types, waivers, promo codes, packages, price effective dates. |
| PAY-02 | Must | Accept **EUR** + international cards, PCI-DSS model with **SCA/3-D Secure**; disclose settlement currencies/countries. |
| PAY-03 | Must | Individual, captain/team, corporate/sponsor, OC-comped workflows incl. split/staged payments if proposed. |
| PAY-04 | Must | Prevent duplicate charges; **idempotent orders/callbacks**; auto-reconcile payment/registration/gateway status. |
| PAY-05 | Must | Full/partial refunds, cancellation policies, transfer/substitution adjustments, chargebacks, failed payments, manual exceptions with **dual control**. |
| PAY-06 | Must | Configurable sequential receipts/invoices/credit notes; export VAT/finance data. State Italian e-invoicing/**FatturaPA/SDI** support. |
| PAY-07 | Must | Daily settlement/fee/refund/tax/promo/unpaid/variance reports with immutable audit. |
| PAY-08 | Must | Keep cardholder data out of OC systems; tokenise references; define PCI responsibility boundaries. |
| PAY-09 | Should | Additional methods: bank transfer, wallets, SEPA, incl. pending-payment reservation expiry + reconciliation. |
| PAY-10 | Must | State payment operating model: merchant of record, PSP, acquirer, settlement flow/currencies, chargebacks, PCI split (Supplier/WMS/OC); identify the priced model + dependencies. |

### 4.4 Accreditation & credentials (ACC)
| ID | Pri | Requirement |
|---|---|---|
| ACC-01 | Must | One credential record linked to authoritative person record; configurable role, sport, venue, zone, transport, catering, date/time entitlements. |
| ACC-02 | Must | Secure photo upload, quality/crop controls, consent, rejection/re-upload, **duplicate-photo review**. |
| ACC-03 | Must | Gate credential approval on configurable registration/payment/evidence/training/role conditions. |
| ACC-04 | Must | Bulk + individual production exports/APIs, print status, collection, issue, reprint, revoke, replacement audit. |
| ACC-05 | Must | QR/barcode/NFC identifiers or integration with credential/access system without exposing unnecessary data. |
| ACC-06 | Must | Fast search + **offline/fallback lookup packs** for accreditation centres with controlled reconciliation on return. |
| ACC-07 | Should | Appointment/arrival/check-in, kit/welcome-bag issue, signature/waiver confirmation. |

### 4.5 Competition, schedule & results (CMP)
| ID | Pri | Requirement |
|---|---|---|
| CMP-01 | Must | Authoritative competition-entry dataset; export start-list/entry data by sport/category/grade/class/team/venue. |
| CMP-02 | Must | Native scheduling/results **or** monitored integrations; identify system of record for each data object. |
| CMP-03 | Must | Category combinations for competition while preserving original award categories, entrant lineage, published explanations. |
| CMP-04 | Must | Team/crew/relay roster locks + controlled Games-time substitutions with category + accreditation revalidation. |
| CMP-05 | Must | Publish responsive schedules, start lists, results, medal/ranking tables, downloadable reports with approval/correction/version history. |
| CMP-06 | Must | Prevent unpublished/draft or sensitive competition data exposure; approval + embargo controls. |
| CMP-07 | Must | Monitor data feeds, flag stale/failed imports, provide replay/reconciliation/manual fallback. |
| CMP-08 | Should | Participant favourites, personalised schedules, change notifications, calendar export. |

### 4.6 Communications, administration & reporting (OPS)
| ID | Pri | Requirement |
|---|---|---|
| OPS-01 | Must | Approved multilingual email/SMS/in-app templates with variables, preview, test send, scheduling, throttling, unsubscribe/transactional classification, delivery status. |
| OPS-02 | Must | Target comms by sport/event/category/grade/venue/team/status/evidence-gap/payment-state/language/role/incident-impact. |
| OPS-03 | Must | Role-based dashboards + work queues for registration, sport review, finance, accreditation, helpdesk, competition, executive users. |
| OPS-04 | Must | Configurable reports, filters, saved views, scheduled distribution, CSV/XLSX/PDF/API export with access controls + export audit. |
| OPS-05 | Must | Full audit log: authentication, data, configuration, rule, permission, document, financial, communication, operational actions. |
| OPS-06 | Must | Case/helpdesk capability or integration linking participant/registration/payment/evidence/communication context without uncontrolled copying. |
| OPS-07 | Should | Consented participant feedback/survey + post-event engagement export. |
| OPS-08 | Must | Export complete data dictionaries, configuration, records, documents, audit data in non-proprietary formats. |

---

## 5. Non-functional, data, privacy, security & accessibility

### 5.1 Architecture, integration & quality (NFR)
| ID | Pri | Requirement |
|---|---|---|
| NFR-01 | Must | Multi-tier, fault-tolerant hosted architecture; separate prod/non-prod; infra monitoring; controlled deployment. |
| NFR-02 | Must | Documented, versioned APIs/webhooks + secure batch exchange; sandbox creds, rate limits, schemas, retry/idempotency, monitoring. |
| NFR-03 | Must | Meet §1.3 capacity envelope; performance/load-test evidence with production-like data before launch + before Games. |
| NFR-04 | Must | **Configuration not bespoke code** for routine sport/fee/rule/quota/content/workflow changes; identify every custom component. |
| NFR-05 | Must | Release notes, automated test evidence, dependency/vuln mgmt, rollback, WMS-approved change control. |
| NFR-06 | Must | Observability across app/infra/API/queue/payment/comms with **synthetic participant-journey monitoring**. |
| NFR-07 | Must | Time zones + DST; canonical timestamps; display **Europe/Rome** clearly. |

### 5.2 Performance & usability targets
| Measure | Target |
|---|---|
| Participant page response | p95 ≤ **2.5s**, p99 ≤ 5s for key authenticated pages at peak. |
| Admin response | p95 ≤ 3s for normal search/view/save. |
| Transactional API | p95 ≤ 1.5s (non-third-party); webhook ack ≤ 2s. |
| Registration consistency | **No oversell, duplicate order, or orphaned paid registration** under concurrency/retry/timeout/callback-replay. |
| Search/lookup | Participant + accreditation lookup ≤ 2s p95 at Games load. |

### 5.3 Privacy & data protection (PRV)
| ID | Requirement |
|---|---|
| PRV-01 | GDPR + Italian law + documented controller instructions; **DPA before processing**. |
| PRV-02 | Privacy-by-design/default, data minimisation, purpose limitation, configurable notices/consents, lawful-basis records, accessible notices, retention schedules, data-subject-rights. |
| PRV-03 | Disclose all hosting/processing locations, subprocessors, transfer mechanisms; no new subprocessor/country without notice + approval. |
| PRV-04 | Separate/restrict medical, disability/classification, ID + sensitive evidence; encrypt in transit + at rest; log access/export; granular deletion/retention. |
| PRV-05 | Access, rectification, restriction, portability, deletion workflows with identity verification + completion evidence. |
| PRV-06 | On exit: agreed exports + certificates of deletion incl. from backups at normal expiry. |

### 5.4 Information & payment security (SEC)
| ID | Requirement |
|---|---|
| SEC-01 | ISMS aligned to **ISO/IEC 27001:2022** or equivalent assured controls; assurance + remediation under NDA. |
| SEC-02 | TLS 1.2+; strong encryption at rest; managed keys/secrets; secure password storage; privileged-access controls; prod access logging. |
| SEC-03 | WAF, DDoS protection, bot/rate controls, secure coding, SAST/DAST/dependency scanning, patching, annual + pre-Games independent pen testing. |
| SEC-04 | Remediate critical vulns before prod; critical internet-facing within 24h (or approved compensating control), high within 7 days. |
| SEC-05 | Centralised tamper-resistant security logs, time sync, detection/alerting, ≥12 months searchable retention. |
| SEC-06 | Incident response integrated with WMS+OC; **notify within 2 hours** of a suspected material personal-data/security incident; continuous updates. |
| SEC-07 | **PCI DSS v4.0.1**-compliant payment model + AoC/responsibility matrix. |
| SEC-08 | Background screening + security/privacy training for personnel with prod/sensitive-data access. |

### 5.5 Accessibility & inclusive design (ACS)
| ID | Requirement |
|---|---|
| ACS-01 | Participant web + mobile journeys, assisted-service admin workflows, docs, comms conform to **WCAG 2.2 Level AA** + EU accessibility. |
| ACS-02 | Automated + manual testing: keyboard-only, screen readers, zoom/reflow, focus order/visibility, error identification, accessible authentication, target size, colour contrast. |
| ACS-03 | Account for **older users** + changing vision/hearing/dexterity/memory/confidence: plain language, large targets, no time pressure without extension, clear progress, save/resume, human assistance. |
| ACS-04 | Current accessibility conformance report + issue log + accessibility contact. **Critical barriers in a core registration path are release blockers.** |
| ACS-05 | Capture accessibility/accommodation needs **separately from sport classification**, with consent + restricted access. |

### 5.6 Data ownership, residency, retention, portability (DAT)
| ID | Requirement |
|---|---|
| DAT-01 | All event data/records/config/audit/created content owned/controlled by WMS/OC; Supplier gets only rights needed to perform. |
| DAT-02 | Production data hosted + backed up in **EEA** unless WMS approves another location + transfer mechanism after DPIA. |
| DAT-03 | Provide data model + dictionary, record lineage, export specs, document archive mapping, reconciliation totals. |
| DAT-04 | No Supplier analytics/model-training/benchmarking/advertising/cross-customer use of identifiable event data without explicit written authorisation + lawful basis. |

---

## 6. Delivery approach, milestones & acceptance

**6.1 Delivery model.** Named team: executive sponsor, programme manager, solution lead, Masters sport/rules lead, data/integration lead, security/privacy lead, service delivery manager, Games-time software-service lead. First release = proven capabilities + smallest safe launch scope; later phases add competition + Games-time modules without destabilising registration. Integrated plan + single RAID log, decision log, configuration register, requirements traceability matrix, release plan.

### 6.2 Procurement & launch timetable ⭐ (these are the dates that drive our sprint)
| Milestone | Target date | Minimum outcome |
|---|---|---|
| RFP issued | 27 Aug 2026 | Tender opens. |
| Questions due | 31 Aug 2026 12:00 CEST | Consolidated bidder questions. |
| WMS answers | 1 Sep 2026 | Common written response. |
| **Proposals due** | **4 Sep 2026 12:00 CEST** | Complete response, price, SLA, implementation plan. *(Our V1 proposal submitted.)* |
| **Demos / due diligence** | **7–8 Sep 2026** | **Scripted scenarios, security + delivery validation.** ← our **P0** target. |
| Preferred bidder / award | 9 Sep 2026 | Subject to approvals + contract. |
| Contract & mobilisation | 9–10 Sep 2026 | Team, environments, data, plan, cadence mobilised. |
| **Launch UAT & readiness gate** | **15–16 Sep 2026** | Core registration accepted; cutover + rollback approved. ← our **P1** target. |
| **Registration production launch** | **17 Sep 2026** | Live, monitored, supported participant registration. |
| Stabilisation complete | 30 Sep 2026 | Priority launch issues closed; baseline accepted. |

### 6.3 Post-launch delivery phases
| Phase | Period | Deliverables / gate |
|---|---|---|
| **A. Core launch** | Award–17 Sep 2026 | Identity, sport selection, core rules, payment, confirmations, privacy/security, support, monitoring. |
| **B. Stabilise + complete registration** | Sep–Dec 2026 | Full team/partner, evidence, waitlist, finance, admin, reports, pre-registration migration, agreed integrations. |
| **C. Competition + accreditation readiness** | Jan–Jun 2027 | Final sport configs, accreditation, competition interfaces, results publication, data rehearsals, venue operating model. |
| **D. Operational readiness** | Jul–16 Sep 2027 | Dress rehearsals, capacity/security/DR tests, training, runbooks, support-coverage plan, change freeze, go-live acceptance. |
| **E. OC-led Games operations** | 17–26 Sep 2027 | OC runs event; Supplier 24/7 software-service command, incident/change control, daily reporting, integration monitoring. |
| **F. Closure & exit** | 27 Sep–31 Dec 2027 | Reconciliation, reports, archive/export, participant comms, lessons, deletion/retention, transition. |

**6.4 Launch acceptance:** all launch-scope Musts traced to UAT evidence, no open S1/S2, no unapproved critical/high security finding; EN+IT journeys complete incl. keyboard + screen-reader; age/category/team/price/quota/document/payment test packs pass on OC-approved configs + boundary dates; payment authorise/capture/fail/retry/refund/duplicate-callback reconcile; pre-reg migration/claim reconciles counts + duplicates with rollback; load test meets targets; backup restore + rollback demonstrated; documented WMS/OC go/no-go.

**6.5 Operations-ready gate before Games** (≥30 days before + before change freeze): final config/data reconciliation; end-to-end dress rehearsal; peak-load/failover/backup-restore/cyber-incident/loss-of-integration exercises; approved service map/monitoring/escalation/RACI/duty roster/command-centre/field-support for Como/Lecco/Varese; approved SOPs + manual fallbacks; training + competency evidence (EN+IT); approved change freeze + daily reporting format.

---

## 7. Operations-ready SLA (summary — full detail in the PDF §7 / Appendix B)

- **7.1** SLA is a minimum contractual schedule, not intent. Supplier = single escalation point; clocks don't stop while coordinating a third party.
- **7.2 Service windows:** 24×7 S1 during mobilisation/pre-launch; extended coverage for campaigns/deadlines; **Games mode 14–29 Sep 2027 = 24×7 all severities** with command + on-site coverage.
- **7.3 Availability:** Participant registration/account/payment **≥99.95%/month** (Protected/Games **≥99.99%**, no planned maintenance); admin/eligibility/team/finance ≥99.90% (≥99.95%); accreditation ≥99.90%/≥99.99%; schedule/results ≥99.90%/≥99.95%.
- **7.4 Incident severity/targets:** S1 ack 5 min (Protected/Games) / 15 min; restore 30 min / 60 min; updates every 15 min. S2 ack 15/30 min; restore 2h/4h. S3/S4 lower.
- **7.6 Continuity:** RPO ≤ **5 min** (registration/payment/roster/eligibility/accreditation); RTO ≤ **60 min** normal, ≤ 30 min Protected/Games; encrypted PITR + daily backups, immutable copy, ≥35-day retention; quarterly restore tests, full pre-Games restore/failover ≥60 days before Games.
- **7.7 Change control:** registration-launch freeze 72h before launch; Games freeze 30 days before Games mode (material) + 14 days (non-essential). Rule/fee/eligibility/payment/privacy/role/retention changes need named OC approval + before/after audit.
- **7.9 Service credits:** capped at 25%/month; availability shortfalls 5/10/20% of affected fee; missed S1 restore 2% per 30-min interval.

---

## 8. Commercial & contractual (CON) — summary
- **8.1 Pricing:** complete, fixed, transparent total for Como Lake 2027 only. Price the **14,000** case + committed unit rates/caps for **7,500** and **17,500**. One-time (mobilisation/config/migration/integration/testing/launch/training) + recurring (platform/hosting/storage/environments/licences/monitoring/support/security) + transaction/PSP/SMS/email/storage/identity/tax costs + accreditation/competition/optional modules + Games-time support/travel + change-control + exit.
- **8.2 Minimum contract positions:** CON-01 WMS/OC data ownership + no lien; CON-02 DPA + confidentiality + subprocessor flow-down + audit rights; CON-03 Supplier responsible for subcontractors/licences/IP + continuity; CON-04 cyber + PI/E&O + public liability insurance; CON-05 acceptance/warranty/change-control/SLA/credits/termination/step-in/transition; CON-06 no marketing use of WMS/OC/participant names without approval; CON-07 complete exit assistance + deletion certification; CON-08 Swiss law, Lausanne jurisdiction.

---

## 9. Evaluation, demonstrations & award

### 9.1 Mandatory pass/fail gates
1. Unqualified commitment to operations-ready registration launch **17 Sep 2026**.
2. Production-proven platform + delivery model; **no unbuilt critical-path feature concealed as standard**.
3. Ability to model the §3 Masters rule patterns + demonstrate representative scenarios.
4. Accept GDPR processor obligations, security due diligence, PCI payment model, accessibility remediation, operations-ready SLA.
5. Single prime responsibility, named team, transparent subcontractor/hosting model.
6. Complete pricing + portable data/config export + transition.

### 9.2 Weighted evaluation
| Criterion | Weight |
|---|---|
| Rapid readiness + evidence of safe 17 Sep 2026 launch | **20%** |
| Masters rules, registration, teams, eligibility, participant experience | **20%** |
| Operations, support, SLA, continuity, Games-time model | 15% |
| Privacy, security, payment security, accessibility | 15% |
| Architecture, integration, data, performance, scalability | 10% |
| Implementation approach, people, training, governance | 10% |
| Total cost, pricing transparency, contractual value | 10% |

### 9.3 Scripted demonstration ⭐⭐ (THE demo script — our P0 must show these live)
> Shortlisted bidders demonstrate **live, using an existing environment rather than slides**:

1. **Swimmer, individual** — registers for individual events; category calculated against **31 Dec 2027**; medical evidence + payment completed accessibly in **EN/IT**.
2. **Basketball captain, team** — builds a team; **adding a younger player recalculates team category, capacity, price** with a clear **warning + audit**.
3. **Rowing crew** — categorised by **average age excluding the coxswain**; a **substitution validated** without corrupting the original entry.
4. **Judo entry** — validates **age + weight + federation membership + min belt/grade**; an **exception reviewed with dual approval**.
5. **Tennis** — participant selects **different allowed grades by event**; a **doubles partner invitation + youngest-player category** rule applied.
6. **Para-swimming** — captures **sport-class evidence with restricted access**; produces correct **competition export without exposing medical data**.
7. **Quota/waitlist** — quota fills, participant joins **waitlist**, an **offer expires**, **payment retries safely**, financial/registration records **reconcile**.
8. **Operations** — team detects a **failed payment or results interface**, **opens an incident**, switches to the **documented workaround**, reports **SLA evidence**.

**9.4 Due diligence:** reference calls, architecture/security review, pen-test/accessibility reports, data-flow/subprocessor review, service-desk evidence, financials, insurance, roadmap, contract mark-up, proof-of-configuration.

---

## 10. Submission
- Deadline **4 Sep 2026 12:00 CEST**; email to Jens V. Holm, CEO WMS (jholm@worldmasterssport.com); one searchable PDF + editable compliance/pricing schedules + confidential assurance evidence.

## Appendices (see PDF for full tables)
- **A** Compliance schedule (per-ID: Response/Evidence/Launch availability/Dependency/Cost/Qualification) + pricing schedule + references.
- **B** SLA response schedule (Accepted/Enhanced/Exception per target).
- **C** Research basis: current public sport guides (golf, swimming, rowing, basketball, tennis, judo) + GDPR + WCAG 2.2 + EU Accessibility Act + PCI DSS v4.0.1.
  - **C3 Rule hierarchy:** final WMS/OC-approved sport guides + rule register prevail over RFP examples. Where website/guide/federation rules differ, **do not guess** — raise a controlled decision, record the approved interpretation, version the config.

---

*Transcribed 2026-09-01 from the V1.3 PDF. If the PDF is re-issued, re-transcribe and bump the note above.*
