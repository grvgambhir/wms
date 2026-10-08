import { ApiError } from "../api/httpClient";

/**
 * The OC's work queue for proposed team-roster changes on already-confirmed entries (RUL-03/04).
 *
 * A confirmed team's roster cannot be edited directly — the backend refuses that transition on
 * purpose (a paid, confirmed entry does not silently reclassify). A captain proposes an addition
 * (A2, e.g. a younger basketball player) or a substitution (A3, e.g. a rower swapped for the
 * reserve); this screen is the only place either one takes effect. Approving recomputes the
 * category from the proposed roster version and moves the entry onto it — nothing is trusted
 * from proposal time.
 */
export type RosterChangeReviewItem = {
  id: string;
  entryId: string;
  teamName: string;
  sportName: string;
  productName: string;
  captainName?: string;
  fromCategoryName: string;
  toCategoryName: string;
  proposedAt: string;
  accreditationUnmet: string[];
};

export function entryLabel(item: RosterChangeReviewItem): string {
  return `${item.sportName} · ${item.productName}`;
}

export function explainRosterChangeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "TEAM_ROSTER_NOT_FOUND") return "That proposal no longer exists.";
    if (error.code === "ROSTER_LOCKED")
      return "This roster is locked for the Games — it needs games-time revalidation first.";
    if (error.code === "REVALIDATION_REQUIRED")
      return "This substitution needs games-time revalidation before it can be approved.";
    if (error.code === "ACCREDITATION_NOT_VALID")
      return "The incoming athlete's accreditation is not clean — resolve that before approving.";
    if (error.code === "CATEGORY_WOULD_CHANGE")
      return "Approving this now would change the award category after the Games-time lock.";
    return "The approval was refused.";
  }
  if (error instanceof TypeError) return "The request did not reach the server. Try again.";
  return "The approval could not be completed.";
}
