// Re-export shim — the real pure engine lives in the shared @wms/domain package
// (extracted 2026-09-04, REV-025/027/028/031). Kept at this path so every existing
// '@/features/rules/engine' import across the app keeps working unchanged.
export {
  DEFAULT_REFERENCE_DATE,
  ageOn,
  findBand,
  deriveCategory,
  deriveMultiDimension,
  categoryImpact,
} from '@wms/domain';
