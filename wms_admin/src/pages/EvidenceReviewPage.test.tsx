import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EvidenceReviewItem } from "../domain/evidenceReview";
import type { EvidenceReviewRepository } from "../repositories/EvidenceReviewRepository";
import { EvidenceReviewPage } from "./EvidenceReviewPage";

afterEach(() => cleanup());

const item = (over: Partial<EvidenceReviewItem> = {}): EvidenceReviewItem => ({
  id: "ev-1",
  classification: "restricted",
  registrationEntryId: "entry-1",
  athleteId: "person-1",
  athleteName: "Daniel Harper",
  sportName: "Swimming",
  productName: "100m Freestyle",
  label: "Medical certificate",
  type: "medical_certificate",
  required: true,
  status: "uploaded",
  fileName: "medical.pdf",
  uploadedAt: "2026-09-16T10:00:00.000Z",
  ...over,
});

function repositoryWith(
  items: EvidenceReviewItem[],
  overrides: Partial<EvidenceReviewRepository> = {},
): EvidenceReviewRepository {
  return {
    queue: vi.fn(async () => items),
    startReview: vi.fn(async () => undefined),
    approve: vi.fn(async () => undefined),
    reject: vi.fn(async () => undefined),
    waive: vi.fn(async () => undefined),
    ...overrides,
  };
}

const renderPage = (repository: EvidenceReviewRepository) =>
  render(
    <MemoryRouter initialEntries={["/evidence-review"]}>
      <EvidenceReviewPage repository={repository} />
    </MemoryRouter>,
  );

describe("EvidenceReviewPage", () => {
  it("lists what is waiting and marks restricted records", async () => {
    renderPage(
      repositoryWith([
        item(),
        item({
          id: "ev-2",
          classification: "ordinary",
          label: "Identity document",
        }),
      ]),
    );

    expect(
      await screen.findByText("Medical certificate · medical.pdf"),
    ).toBeVisible();
    expect(screen.getByText("Identity document · medical.pdf")).toBeVisible();
    // The reviewer must be able to see, at a glance, which record is the restricted one.
    expect(screen.getAllByText("RESTRICTED")).toHaveLength(1);
    expect(screen.getByText(/access-logged/)).toBeVisible();
  });

  it("starts a review, then approves, and refetches the queue each time", async () => {
    let status: EvidenceReviewItem["status"] = "uploaded";
    const queue = vi.fn(async () => [item({ status })]);
    const startReview: EvidenceReviewRepository["startReview"] = vi.fn(async () => {
      status = "under_review";
    });
    const approve: EvidenceReviewRepository["approve"] = vi.fn(async () => {
      status = "approved";
    });
    const repository = repositoryWith([], { queue, startReview, approve });
    const user = userEvent.setup();
    renderPage(repository);

    await user.click(
      await screen.findByRole("button", { name: "Start review" }),
    );
    await user.click(await screen.findByRole("button", { name: "Approve" }));

    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    expect(queue.mock.calls.length).toBeGreaterThanOrEqual(3);
    // One key per click, never derived from the document id.
    const keys = [
      vi.mocked(startReview).mock.calls[0]![0].idempotencyKey,
      vi.mocked(approve).mock.calls[0]![0].idempotencyKey,
    ];
    expect(new Set(keys)).toHaveLength(2);
  });

  it("will not reject without a coded reason", async () => {
    const reject: EvidenceReviewRepository["reject"] = vi.fn(async () => undefined);
    const repository = repositoryWith([item({ status: "under_review" })], {
      reject,
    });
    const user = userEvent.setup();
    renderPage(repository);

    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(
      within(dialog).getByRole("combobox"),
      "evidence.rejected.expired",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm rejection" }),
    );

    await waitFor(() => expect(reject).toHaveBeenCalledTimes(1));
    expect(vi.mocked(reject).mock.calls[0]![0].reason).toBe(
      "evidence.rejected.expired",
    );
  });

  it("explains a refusal instead of leaving the row as it was", async () => {
    const approve: EvidenceReviewRepository["approve"] = vi.fn(async () => {
      throw new TypeError("network");
    });
    const repository = repositoryWith([item({ status: "under_review" })], {
      approve,
    });
    const user = userEvent.setup();
    renderPage(repository);

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /did not reach the server/,
    );
  });
});
