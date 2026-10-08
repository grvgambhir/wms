import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RosterChangeReviewItem } from "../domain/rosterChangeReview";
import type { RosterChangeRepository } from "../repositories/RosterChangeRepository";
import { RosterChangeReviewPage } from "./RosterChangeReviewPage";

afterEach(() => cleanup());

const item = (over: Partial<RosterChangeReviewItem> = {}): RosterChangeReviewItem => ({
  id: "sub-1",
  entryId: "entry-1",
  teamName: "Como Lakers Masters",
  sportName: "Basketball",
  productName: "Men's Team",
  captainName: "Daniel Harper",
  fromCategoryName: "Men's Team 35–39",
  toCategoryName: "Men's Team 30–34",
  proposedAt: "2026-09-17T10:00:00.000Z",
  accreditationUnmet: [],
  ...over,
});

function repositoryWith(
  items: RosterChangeReviewItem[],
  overrides: Partial<RosterChangeRepository> = {},
): RosterChangeRepository {
  return {
    queue: vi.fn(async () => items),
    approve: vi.fn(async () => undefined),
    ...overrides,
  };
}

const renderPage = (repository: RosterChangeRepository) =>
  render(
    <MemoryRouter initialEntries={["/roster-changes"]}>
      <RosterChangeReviewPage repository={repository} />
    </MemoryRouter>,
  );

describe("RosterChangeReviewPage", () => {
  it("lists a proposed change with its category swing", async () => {
    renderPage(repositoryWith([item()]));

    expect(await screen.findByText("Como Lakers Masters")).toBeVisible();
    expect(screen.getByText("Basketball · Men's Team")).toBeVisible();
    expect(
      screen.getByText("Men's Team 35–39 → Men's Team 30–34"),
    ).toBeVisible();
  });

  it("approves and refetches the queue", async () => {
    let approved = false;
    const queue = vi.fn(async () => (approved ? [] : [item()]));
    const approve: RosterChangeRepository["approve"] = vi.fn(async () => {
      approved = true;
    });
    const repository = repositoryWith([], { queue, approve });
    const user = userEvent.setup();
    renderPage(repository);

    await user.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => expect(approve).toHaveBeenCalledWith("sub-1"));
    await waitFor(() =>
      expect(
        screen.getByText("Nothing is waiting for approval."),
      ).toBeVisible(),
    );
  });

  it("explains a refusal instead of leaving the row as it was", async () => {
    const approve: RosterChangeRepository["approve"] = vi.fn(async () => {
      throw new TypeError("network");
    });
    const repository = repositoryWith([item()], { approve });
    const user = userEvent.setup();
    renderPage(repository);

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /did not reach the server/,
    );
  });
});
