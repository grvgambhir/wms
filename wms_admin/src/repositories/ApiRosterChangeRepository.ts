import { backendRequest } from "../auth/backendRequest";
import { newIdempotencyKey } from "../api/idempotencyKey";
import type { RosterChangeReviewItem } from "../domain/rosterChangeReview";
import type { RosterChangeRepository } from "./RosterChangeRepository";

type Page<T> = { items: T[] };

export class ApiRosterChangeRepository implements RosterChangeRepository {
  async queue(): Promise<RosterChangeReviewItem[]> {
    const page = await backendRequest<Page<RosterChangeReviewItem>>(
      "/v1/roster-substitutions/review-queue",
    );
    return page.items;
  }

  async approve(id: string): Promise<void> {
    await backendRequest<unknown>(
      `/v1/roster-substitutions/${encodeURIComponent(id)}/approve`,
      {
        method: "POST",
        headers: { "Idempotency-Key": newIdempotencyKey() },
        body: JSON.stringify({}),
      },
    );
  }
}
