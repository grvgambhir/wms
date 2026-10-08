export const storageKeys = {
  authSession: 'imga.auth.session',
  athleteProfile: 'imga.athlete.profile',
  localAthletes: 'imga.athletes.local',
  localCredentials: 'imga.auth.credentials.local',
  registrationDraft: (eventId: string) => `imga.registration.draft.${eventId}`,
  registrations: 'imga.registration.records',
  partnerRequests: 'imga.partner.requests',
  documents: 'imga.documents',
  payments: 'imga.payments',
  locale: 'imga.locale', // selected UI language (en | it) — RFP PLT-02
  ruleChangeNotice: 'imga.rules.change.notice', // last published rule change (A04 → P19 cross-portal)
  activeRegistrationEntry: 'imga.registration.activeEntry', // the entry the journey screens last opened; honoured only if it is in the signed-in person's own list
  registrationJourney: 'imga.registration.journey', // live journey state (entries/orders/payments/quotas/waitlists) — save & resume across reloads
} as const;
