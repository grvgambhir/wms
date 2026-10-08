import { backendRequest } from "../auth/backendRequest";
import { newIdempotencyKey } from "../api/idempotencyKey";
import type { WaitlistReviewItem } from "../domain/waitlistReview";
import type { WaitlistRepository } from "./WaitlistRepository";

type Page<T> = { items: T[] };

export class ApiWaitlistRepository implements WaitlistRepository {
  async queue(): Promise<WaitlistReviewItem[]> {
    const page = await backendRequest<Page<WaitlistReviewItem>>(
      "/v1/waitlists/review-queue",
    );
    return page.items;
  }

  async release(id: string): Promise<void> {
    await this.post(id, "release-offer");
  }

  async expire(id: string): Promise<void> {
    await this.post(id, "expire-offer");
  }

  private async post(id: string, action: string): Promise<void> {
    await backendRequest<unknown>(
      `/v1/waitlists/${encodeURIComponent(id)}/${action}`,
      {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({}),
      },
    );
  }
}
