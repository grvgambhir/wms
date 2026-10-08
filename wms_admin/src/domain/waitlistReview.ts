import { ApiError } from "../api/httpClient";

/**
 * The OC's waitlist work queue (REG-09).
 *
 * `release-offer` and `expire-offer` were always correctly OC-gated — releasing a real quota
 * reservation, or expiring one, is a staff action, not something a participant's own browser
 * tab should be able to do (a participant token calling either 404s/403s, by design). But
 * nothing ever queried `core.waitlist_entry` from the admin side, so there was no screen for an
 * OC to actually do it from. This is that screen.
 */
export type WaitlistReviewItem = {
  id: string;
  entryId: string;
  athleteName: string;
  sportName: string;
  productName: string;
  status: "waiting" | "offered";
  position: number | null;
  offerExpiresAt: string | null;
  joinedAt: string | null;
};

export function entryLabel(item: WaitlistReviewItem): string {
  return `${item.sportName} · ${item.productName}`;
}

export function explainWaitlistError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "NOT_WAITLISTED")
      return "This entry has moved on — refresh the queue.";
    if (error.code === "OFFER_NOT_ACTIVE" || error.code === "OFFER_EXPIRED")
      return "That offer is no longer active. The queue has been refreshed.";
    if (error.code === "QUOTA_NOT_FOUND")
      return "No quota is configured for this entry.";
    return "The action was refused.";
  }
  if (error instanceof TypeError) return "The request did not reach the server. Try again.";
  return "The action could not be completed.";
}
