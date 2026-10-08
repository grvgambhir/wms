/**
 * Object-storage boundary. Columns already name an S3 key; there is no bucket yet.
 * The stub returns a key only — file bytes never enter Postgres.
 */

export const EVIDENCE_STORAGE = Symbol('EvidenceStorage');

export type EvidenceStorageScope = 'ordinary' | 'restricted';

export type StoreEvidenceObject = {
  scope: EvidenceStorageScope;
  evidenceId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type StoredEvidenceObject = {
  s3Key: string;
  s3ObjectVersion: string | null;
};

export interface EvidenceStorage {
  put(input: StoreEvidenceObject): Promise<StoredEvidenceObject>;
}

/** Local stand-in until a real bucket/KMS adapter exists (same seam as the PSP stub). */
export class LocalStubEvidenceStorage implements EvidenceStorage {
  async put(input: StoreEvidenceObject): Promise<StoredEvidenceObject> {
    const bucket = input.scope === 'restricted' ? 's3://wms-restricted' : 's3://wms-ordinary';
    return {
      s3Key: `${bucket}/${input.evidenceId}/${input.fileName}`,
      s3ObjectVersion: null,
    };
  }
}
