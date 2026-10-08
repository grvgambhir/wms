import type { DocumentRequirement, EligibilityDocument } from '@/domain/models/document';
import type { DocumentsRepository } from '@/domain/repositories/documents.repository';
import { fixtures } from '@/data/mock/fixtures';
import { getJson, setJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';

function mergeDocuments(athleteId: string, stored: EligibilityDocument[]): EligibilityDocument[] {
  const ownedStored = stored.filter((document) => document.athleteId === athleteId);
  const storedIds = new Set(ownedStored.map((document) => document.id));
  const storedTypes = new Set(ownedStored.map((document) => document.type));
  const fromFixture = fixtures.documents.filter(
    (document) =>
      document.athleteId === athleteId && !storedIds.has(document.id) && !storedTypes.has(document.type),
  );
  return [...ownedStored, ...fromFixture];
}

export class MockDocumentsRepository implements DocumentsRepository {
  async listRequirements(eventId: string): Promise<DocumentRequirement[]> {
    return fixtures.documentRequirements.filter((req) => req.eventId === eventId);
  }

  async listDocuments(athleteId: string, _draftId?: string): Promise<EligibilityDocument[]> {
    if (!athleteId) return [];
    const stored = (await getJson<EligibilityDocument[]>(storageKeys.documents)) ?? [];
    return mergeDocuments(athleteId, stored);
  }

  async saveDocument(document: EligibilityDocument): Promise<EligibilityDocument> {
    const existing = (await getJson<EligibilityDocument[]>(storageKeys.documents)) ?? [];
    const next = existing.filter((item) => item.id !== document.id);
    const saved: EligibilityDocument = {
      ...document,
      status: document.status ?? 'uploaded',
      uploadedAt: document.uploadedAt ?? new Date().toISOString(),
    };
    next.push(saved);
    await setJson(storageKeys.documents, next);
    return saved;
  }
}
