// Re-export shim — the real pure state machine lives in the shared @wms/domain package
// (extracted 2026-09-04, REV-025/027/028/031). Kept at this path so every existing
// '@/features/registration/statusLifecycle' import across the app keeps working unchanged.
export type { TransitionActor, StatusKind, StatusTransition } from '@wms/domain';
export {
  STATUS_KIND,
  PROGRESS_SPINE,
  TRANSITIONS,
  isTerminal,
  transitionFor,
  canTransition,
  allowedTransitions,
  spineForEntry,
  spineIndex,
} from '@wms/domain';
