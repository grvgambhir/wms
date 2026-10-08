<!-- STATE-COMO2027 -->
> 🔄 **TRANSITIONAL — describes the CURRENT (pre-Como-reskin) fixtures in the code, not the target.**
> **State/era:** old app data universe (WMG Kansai 2027 / tennis-only). It still matches what `src/data/mock/fixtures/*` holds *today*, so it's a useful map while re-skinning — that's why it's kept.
> **How much to trust:** as a picture of *current code* → accurate. As *target scope* → **do not follow it.** WS-A replaces the Kansai/tennis data with **Como Lake 2027 + swimming/basketball/rowing/tennis**. Demo characters **Daniel Harper + Marco Rossi are retained**.
> **Target demo data** lives in [`DELIVERY_PLAN_COMO2027.md`](./DELIVERY_PLAN_COMO2027.md) §6.3 (deterministic seed). Once WS-A lands, update or retire this file. (REV-024)

# MOCK_DATA.md

## Purpose
Provide one consistent demo universe so every screen tells the same story.

All values below are POC/demo data unless the source documents explicitly confirm them.

## Canonical athlete
```json
{
  "id": "athlete_daniel_harper",
  "firstName": "Daniel",
  "lastName": "Harper",
  "dateOfBirth": "1984-05-14",
  "nationalityCountryCode": "GB",
  "gender": "male",
  "email": "daniel.harper@email.com",
  "phone": "+44 7700 900123",
    "passportNumber": "123456789",
    "profileImageKey": "danielHarper",
    "emergencyContact": {
    "name": "Sarah Harper",
    "relationship": "Wife",
    "phone": "+44 7700 900124"
  }
}
```

Login aliases also accept `daniel.harper@example.com`. Signup with a **new** email creates a local athlete (not Harper).

## Canonical partner
```json
{
  "id": "athlete_marco_rossi",
  "firstName": "Marco",
  "lastName": "Rossi",
  "dateOfBirth": "1985-02-11",
  "nationalityCountryCode": "IT",
  "email": "marco.rossi@example.com"
}
```

Partner requests start as `pending`. In the POC, only Marco auto-accepts after a short delay so the doubles demo can finish. Other candidates stay pending (no simulated reply). "I have a partner" confirms a listed athlete immediately without a request wait.

## Canonical event (featured — listed first on Events)

**Kansas Senior Games 2026** — Topeka, KS. Primary POC demo event.

| Field | Value |
|-------|--------|
| ID | `event_ksg_2026` |
| Organizer | Kansas Senior Games |
| Dates | 11 Sep – 3 Oct 2026 |
| Location | Topeka, KS (zip 66604) |
| Contact phone | 785-480-9061 |
| Contact email | ksg@sunflowergames.com |
| Website | https://sunflowergames.com/kansas-senior-games/ |
| Out-of-state participants | Yes |
| Website note | Reference the state website for the most up-to-date sport offerings |

**Individual sports (fixture list):** Badminton, Basketball Shooting Skills, Bowling, Disc Golf, Golf, Horseshoes, Pickleball, Power Walk, Road Race (1 mile, 5K & 10K), Shooting (Trap & Skeet and Sporting Clays), Shuffleboard, Swimming, Table Tennis, Tennis, Track & Field.

**Team sports:** Volleyball.

## Secondary demo event

Open Masters Games 2027 — Como, Italy (`event_omg_como_2027`). Keeps the multi-event list realistic; not the primary demo path.

Do not assume exact fees, participant counts, or venue counts are official unless updated from confirmed source material.

## Canonical sport
```json
{
  "id": "sport_tennis",
  "name": "Tennis"
}
```

## Canonical discipline/category
```json
{
  "id": "discipline_tennis_mens_doubles",
  "name": "Men's Doubles",
  "participantType": "doubles"
}
```

```json
{
  "id": "category_tennis_md_40_44",
  "name": "Men's Doubles 40–44",
  "ageGroup": "40–44",
  "entryType": "competitive",
  "partnerRequired": true,
  "quotaStatus": "available"
}
```

## Suggested additional event fixtures
Use 2–4 believable demo events so the Events screen is not empty.
Clearly treat names/dates as mock where not source-confirmed.

## Suggested additional sport fixtures
- Swimming
- Athletics
- Cycling
- Badminton
- Basketball
- Rowing

These help demonstrate filtering and multi-sport structure.

## Partner Finder fixtures
Create 6–10 athletes with:
- stable ID
- name
- country
- age
- compatible sport/category
- optional handedness/experience label
- profile asset key

Do not use fake rating systems unless the UI explicitly needs them.

## Documents
Canonical document types:
- passport / ID proof
- date of birth proof
- medical declaration
- liability waiver

POC documents for Harper are **pre-seeded** in `src/data/mock/fixtures/documents.json` (verified filenames). Login still uses email + `password123` / OTP `123456`; identity fields and files come from fixtures, not from typing them again.

POC verification may be pre-populated or replaced through the document picker (storage overlay).

## Payment
Recommended demo:
- currency: EUR
- configurable mock entry fee
- optional service fee
- A14 does not collect a promo code (fee config may still list codes for later)
- deterministic fake payment ID, e.g. `PAY-DEMO-000123`

Avoid embedding the amount in many files.
Keep fee configuration in one mock event/registration config source.

## Registration
Recommended ID:
`REG-DEMO-000124`

Canonical progression:
```text
draft
-> submitted
-> under_review
-> approved
-> accreditation_pending
-> accreditation_issued
```

Support alternate demo states:
- action_required
- waitlisted
- rejected

## Accreditation
Recommended:
- stable mock accreditation ID
- QR encodes mock ID, not private/sensitive data
- access level: Athlete
- event validity dates derive from event fixture

## GamesHub
Suggested sections:
- next match
- today's schedule
- digital pass shortcut
- results
- venues
- medals
- favourites
- announcements
- lightweight weather/info card

## Canonical match
Daniel Harper / Marco Rossi versus a mock opponent pair.

Recommended ID:
`match_tennis_demo_001`

The results provider should progress through a small deterministic sequence.

Example:
```text
scheduled
-> live
-> score update 1
-> score update 2
-> completed
```

The exact tennis score does not need to represent a full scoring engine; it only needs to demonstrate live result publication.
