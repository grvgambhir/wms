import type { DocumentRequirement, EligibilityDocument } from '../models/document';

export interface DocumentsRepository {
  listRequirements(eventId: string): Promise<DocumentRequirement[]>;
  listDocuments(athleteId: string, draftId?: string): Promise<EligibilityDocument[]>;
  saveDocument(document: EligibilityDocument): Promise<EligibilityDocument>;
}
