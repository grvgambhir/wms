// Public barrel for @wms/domain — the shared World Masters Sport contract
// (models, repository interfaces, rules engine, registration lifecycle).
// Extracted 2026-09-04 from wms_participant per PHASE_B_DOMAIN_AUDIT.md.
// Consumed by wms_participant, wms_admin and wms_api (REV-031/032/035).

export * from './domain/models';
export * from './domain/repositories';
export * from './features/rules/engine';
export * from './features/registration/statusLifecycle';
