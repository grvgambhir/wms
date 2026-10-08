-- Up Migration
-- ACC-03: which checks a badge needs live in accreditation_gate.requires. The function
-- below evaluates those keys; it does not decide which keys apply. Changing the array
-- changes issue outcome with no code change. Unknown keys fail closed.

CREATE FUNCTION core.accreditation_unmet_gates(p_accreditation_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT array_agg(req ORDER BY req)
       FROM core.accreditation a
       JOIN core.accreditation_gate g
         ON g.event_id = a.event_id AND g.role = a.role
       CROSS JOIN LATERAL unnest(g.requires) AS req
      WHERE a.id = p_accreditation_id
        AND CASE req
          WHEN 'photo' THEN a.photo_status IS DISTINCT FROM 'approved'
          WHEN 'eligibility' THEN a.eligibility_status IS DISTINCT FROM 'approved'
          WHEN 'payment' THEN a.registration_entry_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM core.entry_balance b
               WHERE b.entry_id = a.registration_entry_id
                 AND COALESCE(b.settled_minor, 0) < COALESCE(b.due_minor, 0)
            )
          WHEN 'evidence' THEN EXISTS (
            SELECT 1 FROM core.evidence_outstanding o
             WHERE o.person_id = a.person_id
               AND o.event_id = a.event_id
               AND o.outstanding_reason IS DISTINCT FROM 'current'
          )
          WHEN 'training' THEN NOT EXISTS (
            SELECT 1 FROM core.entrant_attribute ea
             WHERE ea.person_id = a.person_id
               AND ea.event_id = a.event_id
               AND ea.attribute = 'training'
               AND ea.status IN ('verified', 'approved')
               AND ea.superseded_by IS NULL
          )
          ELSE true
        END),
    CASE
      WHEN EXISTS (
        SELECT 1
          FROM core.accreditation a2
          JOIN core.accreditation_gate g2
            ON g2.event_id = a2.event_id AND g2.role = a2.role
         WHERE a2.id = p_accreditation_id
      ) THEN '{}'::text[]
      ELSE NULL
    END
  );
$$;

GRANT EXECUTE ON FUNCTION core.accreditation_unmet_gates(uuid) TO app_rw;

-- Down Migration

DROP FUNCTION IF EXISTS core.accreditation_unmet_gates(uuid);
