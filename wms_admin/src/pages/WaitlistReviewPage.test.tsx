import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WaitlistReviewItem } from "../domain/waitlistReview";
import type { WaitlistRepository } from "../repositories/WaitlistRepository";
import { WaitlistReviewPage } from "./WaitlistReviewPage";

afterEach(() => cleanup());

const item = (over: Partial<WaitlistReviewItem> = {}): WaitlistReviewItem => ({
  id: "wl-1",
  entryId: "entry-1",
  athleteName: "Luca Bianchi",
  sportName: "Basketball",
  productName: "Men's Team",
  status: "waiting",
  position: 2,
  offerExpiresAt: null,
  joinedAt: "2026-09-17T07:46:08.000Z",
  ...over,
});

function repositoryWith(
  items: WaitlistReviewItem[],
  overrides: Partial<WaitlistRepository> = {},
): WaitlistRepository {
  return {
    queue: vi.fn(async () => items),
    release: vi.fn(async () => undefined),
    expire: vi.fn(async () => undefined),
    ...overrides,
  };
}

const renderPage = (repository: WaitlistRepository) =>
  render(
    <MemoryRouter initialEntries={["/waitlist"]}>
      <WaitlistReviewPage repository={repository} />
    </MemoryRouter>,
  );

describe("WaitlistReviewPage", () => {
  it("lists a waiting entry with its position and a release action", async () => {
    renderPage(repositoryWith([item()]));

    expect(await screen.findByText("Luca Bianchi")).toBeVisible();
    expect(screen.getByText("Basketball · Men's Team")).toBeVisible();
    expect(screen.getByText("#2")).toBeVisible();
    expect(screen.getByRole("button", { name: "Release a place" })).toBeVisible();
  });

  it("shows the expire action for an offered entry", async () => {
    renderPage(
      repositoryWith([
        item({ status: "offered", offerExpiresAt: new Date(Date.now() + 20_000).toISOString() }),
      ]),
    );

    expect(
      await screen.findByRole("button", { name: "Expire unclaimed offer" }),
    ).toBeVisible();
  });

  it("releases and refetches the queue", async () => {
    let released = false;
    const queue = vi.fn(async () => (released ? [] : [item()]));
    const release: WaitlistRepository["release"] = vi.fn(async () => {
      released = true;
    });
    const repository = repositoryWith([], { queue, release });
    const user = userEvent.setup();
    renderPage(repository);

    await user.click(await screen.findByRole("button", { name: "Release a place" }));

    await waitFor(() => expect(release).toHaveBeenCalledWith("wl-1"));
    await waitFor(() => expect(screen.getByText("Nobody is waiting.")).toBeVisible());
  });

  it("explains a refusal instead of leaving the row as it was", async () => {
    const release: WaitlistRepository["release"] = vi.fn(async () => {
      throw new TypeError("network");
    });
    const repository = repositoryWith([item()], { release });
    const user = userEvent.setup();
    renderPage(repository);

    await user.click(await screen.findByRole("button", { name: "Release a place" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /did not reach the server/,
    );
  });
});
