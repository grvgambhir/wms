import type { OperationsSnapshot } from '../domain/operations';

export interface OperationsRepository {
  getSnapshot(): Promise<OperationsSnapshot>;
  simulateResultsFeedFailure(): Promise<OperationsSnapshot>;
  openS1Incident(): Promise<OperationsSnapshot>;
  applyDocumentedWorkaround(): Promise<OperationsSnapshot>;
  resolveIncident(): Promise<OperationsSnapshot>;
  setChangeFreeze(active: boolean): Promise<OperationsSnapshot>;
  resetDemo(): Promise<OperationsSnapshot>;
}
