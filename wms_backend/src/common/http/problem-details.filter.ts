/**
 * RFC 9457 problem+json error responses (BACKEND_DB_PLAN.md §5).
 *
 * The status mapping is carried over VERBATIM from wms_api/src/http/errorHandler.ts,
 * because both portals already depend on it: `*_NOT_FOUND` → 404 by suffix, domain-rule
 * violations → 422, conflict/duplicate → 409, everything else → 400. Changing it here
 * would silently break error handling in wms_participant and wms_admin.
 *
 * What is new is the layer below: Postgres raises its own errors, and a constraint
 * violation must not surface as a 500. A quota CHECK failing is not a server fault — it
 * is the system working, and the participant needs "this sport is full", not "something
 * went wrong". Mapping those is what makes the constraint-first design usable from a UI.
 */

import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';

// RepositoryError lives in ../errors and implements NormalizedApiError from @wms/domain,
// so the error shape is the SAME object both portals already consume. Redefining it here
// would create a second class that fails `instanceof` against the one repositories throw.
import { RepositoryError } from '../errors/repositoryError';
import { currentRequestContext, log } from '../logging/logger';
import { IdempotencyError } from '../idempotency/idempotency.service';
import { InvalidCursorError } from '../pagination/keyset';

export { RepositoryError };

/** PostgreSQL SQLSTATE codes we translate rather than swallow. */
const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  EXCLUSION_VIOLATION: '23P01',
  NOT_NULL_VIOLATION: '23502',
  INSUFFICIENT_PRIVILEGE: '42501',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',
  LOCK_NOT_AVAILABLE: '55P03',
  QUERY_CANCELED: '57014',
} as const;

/**
 * Named constraints carry meaning to the participant. Anything not listed falls back to a
 * generic 409/422 — never to a 500, and never leaking the raw constraint name.
 */
const CONSTRAINT_MEANING: Record<string, { status: number; code: string; message: string }> = {
  quota_not_exceeded: {
    status: 409,
    code: 'QUOTA_FULL',
    message: 'This category is full. Join the waitlist to be offered a place if one is released.',
  },
  admin_ending_status_has_reason: {
    status: 422,
    code: 'REASON_REQUIRED',
    message: 'Cancelling, disqualifying or substituting an entry needs a reason for the record.',
  },
  entry_status_transition_allowed: {
    status: 422,
    code: 'ILLEGAL_STATUS_TRANSITION',
    message: 'That registration status transition is not permitted.',
  },
  uq_entry_live: {
    status: 409,
    code: 'DUPLICATE_ENTRY',
    message: 'You already have an entry for this event.',
  },
  refund_needs_two_people: {
    status: 422,
    code: 'DUAL_CONTROL_REQUIRED',
    message: 'A refund must be approved by someone other than the person who requested it.',
  },
  active_needs_impact_analysis: {
    status: 422,
    code: 'IMPACT_ANALYSIS_REQUIRED',
    message: 'A rule version cannot be published until its impact analysis has been run.',
  },
  proxy_needs_consent: {
    status: 422,
    code: 'CONSENT_REQUIRED',
    message: 'Recorded participant consent is required before registering on their behalf.',
  },
  exception_one_signature_per_person: {
    status: 409,
    code: 'DUPLICATE_SIGNATURE',
    message: 'You have already signed this exception. Dual approval needs a second, different reviewer.',
  },
  exception_signature_case_id_signer_id_key: {
    status: 409,
    code: 'DUPLICATE_SIGNATURE',
    message: 'You have already signed this exception. Dual approval needs a second, different reviewer.',
  },
  exception_reject_has_message_key: {
    status: 422,
    code: 'REJECTION_REASON_REQUIRED',
    message: 'exception.reject.reason_required',
  },
  completed_has_a_response: {
    status: 500,
    code: 'IDEMPOTENCY_STATE_INVALID',
    message: 'Idempotency record is inconsistent.',
  },
  person_dob_change_needs_review: {
    status: 422,
    code: 'DOB_CHANGE_NEEDS_REVIEW',
    message: 'profile.date_of_birth.needs_review',
  },
  person_profile_status_forward: {
    status: 422,
    code: 'PROFILE_STATUS_LOCKED',
    message: 'profile.status.cannot_revert',
  },
  person_role_last_oc_admin: {
    status: 422,
    code: 'LAST_OC_ADMIN',
    message: 'admin.role.last_oc_admin',
  },
  person_role_participant_self_grant: {
    status: 422,
    code: 'ROLE_NOT_GRANTABLE',
    message: 'admin.role.participant_self_service',
  },
  person_role_oc_needs_admin_granter: {
    status: 422,
    code: 'GRANTER_MUST_BE_OC_ADMIN',
    message: 'admin.role.granter_must_be_oc_admin',
  },
  participant_needs_current_event: {
    status: 422,
    code: 'EVENT_UNAVAILABLE',
    message: 'profile.event.unavailable',
  },
  pre_registration_one_claim_per_person: {
    status: 409,
    code: 'ONE_CLAIM_PER_PERSON',
    message: 'pre_registration.one_claim',
  },
  // CMP-03 / CMP-04. The services translate these themselves; these entries are for any
  // other path that reaches the same constraint.
  source_category_combined_once: {
    status: 409,
    code: 'COMBINATION_CONFLICT',
    message: 'competition.combination.source_already_combined',
  },
  games_time_substitution_is_revalidated: {
    status: 422,
    code: 'REVALIDATION_REQUIRED',
    message: 'roster.substitution.revalidation_required',
  },
  games_time_accreditation_is_clean: {
    status: 422,
    code: 'ACCREDITATION_NOT_VALID',
    message: 'roster.substitution.accreditation_unmet',
  },
  games_time_award_category_survives: {
    status: 422,
    code: 'CATEGORY_WOULD_CHANGE',
    message: 'roster.substitution.category_would_change',
  },
  claim_is_consistent: {
    status: 422,
    code: 'CLAIM_INCONSISTENT',
    message: 'pre_registration.claim_inconsistent',
  },
};

function statusForCode(code: string): number {
  // Any "...NOT_FOUND" is a 404 by convention, so a new resource needs no edit here.
  if (code.endsWith('NOT_FOUND')) return 404;
  switch (code) {
    case 'IDEMPOTENCY_KEY_REQUIRED':
    case 'PARTNER_REQUIRED':
    case 'ROSTER_REQUIRED':
    case 'FEE_NOT_CONFIGURED':
    case 'VALIDATION_ERROR':
      return 400;
    case 'INVALID_CURSOR':
      return 400;
    case 'ILLEGAL_STATUS_TRANSITION':
    case 'ACTOR_NOT_PERMITTED':
    case 'CATEGORY_NOT_ELIGIBLE':
    case 'ENTRY_NOT_BLOCKED':
    case 'EVIDENCE_NOT_REQUIRED':
    case 'QUOTA_AVAILABLE':
    case 'NOT_WAITLISTED':
    case 'OFFER_NOT_ACTIVE':
    case 'OFFER_EXPIRED':
    case 'NOT_ELIGIBLE_TO_ISSUE':
    case 'NOT_ISSUED':
    case 'INVALID_TRANSITION':
    case 'CONSENT_REQUIRED':
    case 'NOT_PENDING':
    case 'DOB_CHANGE_NEEDS_REVIEW':
    case 'LAST_OC_ADMIN':
    case 'ROLE_NOT_GRANTABLE':
    case 'GRANTER_MUST_BE_OC_ADMIN':
    case 'PROFILE_STATUS_LOCKED':
    case 'EVENT_UNAVAILABLE':
    case 'CLAIM_INCONSISTENT':
    case 'PURGE_BLOCKED':
    case 'INVALID_EVIDENCE_TRANSITION':
    case 'REJECTION_REASON_REQUIRED':
    case 'ACCREDITATION_GATE_UNMET':
    case 'RULE_VERSION_FROZEN':
    case 'RULE_VERSION_NOT_DRAFT':
    case 'IMPACT_ANALYSIS_REQUIRED':
    case 'PROFILE_INCOMPLETE':
    case 'START_LIST_NOT_DRAFT':
    case 'START_LIST_NOT_APPROVED':
    case 'CORRECTION_NEEDS_REASON':
    case 'REASON_REQUIRED':
    case 'ROSTER_LOCKED':
    case 'REVALIDATION_REQUIRED':
    case 'ACCREDITATION_NOT_VALID':
    case 'CATEGORY_WOULD_CHANGE':
      return 422;
    case 'USER_ALREADY_EXISTS':
    case 'TEAM_ALREADY_EXISTS':
    case 'INVITE_ALREADY_ACCEPTED':
    case 'ONE_CLAIM_PER_PERSON':
    case 'PRE_REGISTRATION_ALREADY_CLAIMED':
    case 'QUOTA_FULL':
      return 409;
    case 'IDEMPOTENCY_IN_PROGRESS':
    case 'IDEMPOTENCY_KEY_REUSED':
      return 409;
    case 'COGNITO_ADMIN_UNAVAILABLE':
      return 503;
    case 'COGNITO_USER_ORPHANED':
      return 500;
    case 'MFA_REQUIRED':
    case 'MFA_SELF_RESET':
      return 403;
    case 'MFA_NOT_ENROLLED':
      return 422;
    default:
      if (code.includes('DUPLICATE') || code.includes('CONFLICT')) return 409;
      return 400;
  }
}

interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  instance?: string;
  /** Quote this in a support conversation: every log line for the request carries it. */
  requestId?: string;
  errors?: Record<string, string>;
  retryAfter?: number;
  message_key?: string;
}

function asMessageKey(text: string): string | undefined {
  return text.includes(' ') ? undefined : text;
}

function pgError(err: unknown): { code?: string; constraint?: string } | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as { code?: string; constraint?: string };
  return typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) ? e : null;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const problem = { ...this.toProblem(err, req), requestId: currentRequestContext()?.requestId };

    // 5xx is our fault and must be investigable; 4xx is the system working as designed
    // and would only be noise at error level. The access-log line already records method,
    // route, status and duration, so this line carries what only the failure knows.
    if (problem.status >= 500) {
      log.error('request failed', {
        code: problem.code,
        status: problem.status,
        stack: (err as Error)?.stack,
      });
    } else {
      log.debug('request refused', { code: problem.code, status: problem.status });
    }

    if (problem.retryAfter) res.setHeader('Retry-After', String(problem.retryAfter));
    res.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(err: unknown, req: Request): Problem {
    const instance = req.url;

    if (err instanceof RepositoryError) {
      const status = err.httpStatus ?? statusForCode(err.code);
      const messageKey = asMessageKey(err.message);
      return {
        type: `https://api.como2027.wms/problems/${err.code.toLowerCase()}`,
        title: titleFor(status),
        status,
        detail: err.message,
        code: err.code,
        instance,
        ...(err.fields ? { errors: err.fields } : {}),
        ...(messageKey ? { message_key: messageKey } : {}),
      };
    }

    if (err instanceof IdempotencyError) {
      const status = statusForCode(err.code);
      return {
        type: `https://api.como2027.wms/problems/${err.code.toLowerCase()}`,
        title: titleFor(status),
        status,
        detail: err.message,
        code: err.code,
        instance,
        ...(err.retryAfterSeconds ? { retryAfter: err.retryAfterSeconds } : {}),
      };
    }

    if (err instanceof InvalidCursorError) {
      return {
        type: 'https://api.como2027.wms/problems/invalid_cursor',
        title: titleFor(400),
        status: 400,
        detail: err.message,
        code: err.code,
        instance,
      };
    }

    const pg = pgError(err);
    if (pg) return { ...this.fromPostgres(pg), instance };

    if (err instanceof HttpException) {
      const status = err.getStatus();
      return {
        type: `https://api.como2027.wms/problems/http-${status}`,
        title: titleFor(status),
        status,
        detail: err.message,
        code: 'HTTP_ERROR',
        instance,
      };
    }

    // Nothing recognised: the detail is deliberately generic. An unexpected error's
    // message can carry SQL fragments or internal identifiers.
    return {
      type: 'https://api.como2027.wms/problems/internal',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred.',
      code: 'INTERNAL_ERROR',
      instance,
    };
  }

  private fromPostgres(pg: { code?: string; constraint?: string }): Omit<Problem, 'instance'> {
    const named = pg.constraint ? CONSTRAINT_MEANING[pg.constraint] : undefined;
    if (named) {
      const messageKey = asMessageKey(named.message);
      return {
        type: `https://api.como2027.wms/problems/${named.code.toLowerCase()}`,
        title: titleFor(named.status),
        status: named.status,
        detail: named.message,
        code: named.code,
        ...(messageKey ? { message_key: messageKey } : {}),
      };
    }

    switch (pg.code) {
      case PG.UNIQUE_VIOLATION:
        return problem(409, 'CONFLICT', 'That record already exists.');
      case PG.EXCLUSION_VIOLATION:
        return problem(409, 'CONFLICT', 'That change overlaps an existing record.');
      case PG.CHECK_VIOLATION:
      case PG.NOT_NULL_VIOLATION:
        return problem(422, 'RULE_VIOLATION', 'The request violates a rule for this resource.');
      case PG.FOREIGN_KEY_VIOLATION:
        return problem(
          422,
          'REFERENCE_INVALID',
          'The request references something that does not exist.',
        );
      case PG.INSUFFICIENT_PRIVILEGE:
        // The app role touching `restricted` is a bug in US, not a client error — and the
        // client must never learn that the schema exists.
        return problem(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
      case PG.SERIALIZATION_FAILURE:
      case PG.DEADLOCK_DETECTED:
      case PG.LOCK_NOT_AVAILABLE:
        return {
          ...problem(503, 'CONTENTION', 'The system is busy. Retry shortly.'),
          retryAfter: 1,
        };
      case PG.QUERY_CANCELED:
        return problem(504, 'TIMEOUT', 'The request took too long. Retry shortly.');
      default:
        return problem(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
    }
  }
}

function problem(status: number, code: string, detail: string): Omit<Problem, 'instance'> {
  const messageKey = asMessageKey(detail);
  return {
    type: `https://api.como2027.wms/problems/${code.toLowerCase()}`,
    title: titleFor(status),
    status,
    detail,
    code,
    ...(messageKey ? { message_key: messageKey } : {}),
  };
}

function titleFor(status: number): string {
  const titles: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Content',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return titles[status] ?? 'Error';
}
