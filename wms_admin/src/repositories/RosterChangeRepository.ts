import type { RosterChangeReviewItem } from "../domain/rosterChangeReview";

export interface RosterChangeRepository {
  /** GET /v1/roster-substitutions/review-queue, oldest proposal first. */
  queue(): Promise<RosterChangeReviewItem[]>;
  /** POST /v1/roster-substitutions/:id/approve. */
  approve(id: string): Promise<void>;
}
