-- Up Migration

-- Cursor raised this against its own work, correctly: PRIMARY KEY (person_id, role_code)
-- allows "OC staff in one edition, participant in another" only because those are
-- different role codes. It does NOT allow the SAME role in two editions — oc_staff on
-- Como 2027 and on Kansai 2027 collide.
--
-- Multi-edition is a core principle of this schema (§3): person is global, participation
-- is per-edition. An authorization grant is participation. So event_id belongs in the key,
-- with NULL meaning a genuinely global grant.
ALTER TABLE core.person_role DROP CONSTRAINT person_role_pkey;
ALTER TABLE core.person_role ADD COLUMN id uuid NOT NULL DEFAULT uuidv7();
ALTER TABLE core.person_role ADD PRIMARY KEY (id);
-- NULLS NOT DISTINCT: without it two global grants of the same role would both be allowed.
ALTER TABLE core.person_role
  ADD CONSTRAINT person_role_unique_per_event
  UNIQUE NULLS NOT DISTINCT (person_id, role_code, event_id);

-- Down Migration

ALTER TABLE core.person_role DROP CONSTRAINT person_role_unique_per_event;
ALTER TABLE core.person_role DROP CONSTRAINT person_role_pkey;
ALTER TABLE core.person_role DROP COLUMN id;
ALTER TABLE core.person_role ADD PRIMARY KEY (person_id, role_code);
