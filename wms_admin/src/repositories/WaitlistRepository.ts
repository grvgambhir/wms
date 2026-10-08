import type { WaitlistReviewItem } from "../domain/waitlistReview";

export interface WaitlistRepository {
  /** GET /v1/waitlists/review-queue, waiting positions first then offered. */
  queue(): Promise<WaitlistReviewItem[]>;
  /** POST /v1/waitlists/:id/release-offer — reserves the place and starts the offer timer. */
  release(id: string): Promise<void>;
  /** POST /v1/waitlists/:id/expire-offer — releases the reservation back to the pool. */
  expire(id: string): Promise<void>;
}
