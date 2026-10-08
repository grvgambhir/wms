import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  RegistrationDetail,
  RegistrationFilterOptions,
  RegistrationFilters,
  RegistrationPage,
} from "../domain/adminRegistrations";
import type { AdminRegistrationsRepository } from "../repositories/AdminRegistrationsRepository";
import { RegistrationDetailPage } from "./RegistrationDetailPage";
import { RegistrationsPage } from "./RegistrationsPage";

const ENTRY_A = "30000000-0000-4000-8000-000000000001";
const ENTRY_B = "30000000-0000-4000-8000-000000000002";

function item(id: string, name: string, status = "pending_payment") {
  return {
    id,
    athlete: {
      givenName: name,
      familyName: "Harper",
      email: `${name.toLowerCase()}@example.com`,
      nationality: "GB",
    },
    sport: { id: "10000000-0000-4000-8000-000000000001", name: "Rowing" },
    product: {
      id: "20000000-0000-4000-8000-000000000001",
      name: "Single scull",
    },
    grade: "competitive",
    originalCategoryName: "Senior",
    currentCategoryName: "Senior",
    status,
    evidenceStatus: "approved",
    payment: {
      state: "unpaid" as const,
      dueMinor: 12000,
      settledMinor: 0,
      currency: "EUR",
    },
    team: null,
    createdAt: "2027-05-01T10:00:00.000Z",
    updatedAt: "2027-05-01T10:00:00.000Z",
  };
}

function detail(id: string, status: string): RegistrationDetail {
  const row = item(id, "Daniel", status);
  return {
    ...row,
    athlete: { ...row.athlete, dateOfBirth: "1988-07-18" },
    ruleVersion: {
      id: "50000000-0000-4000-8000-000000000001",
      version: 1,
      status: "published",
    },
    category: {
      original: "Senior",
      current: "Senior",
      reason: null,
      derived: {
        ruleVersionId: "50000000-0000-4000-8000-000000000001",
        referenceDate: "2027-12-31",
        categoryName: "Senior",
      },
      auditTrail: [],
    },
    statusHistory: [],
    allowedActions:
      status === "cancelled"
        ? [{ action: "reinstate", toStatus: "draft" }]
        : [{ action: "cancel", toStatus: "cancelled" }],
    money: { orders: [], payments: [], refunds: [] },
    evidence: {
      ordinary: [],
      restrictedCount: 1,
      hasRestrictedEvidence: true,
      restrictedStatus: "present",
    },
    team: null,
  };
}

function options(): RegistrationFilterOptions {
  return {
    sports: [{ id: "10000000-0000-4000-8000-000000000001", name: "Rowing" }],
    products: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        sportId: "10000000-0000-4000-8000-000000000001",
        name: "Single scull",
      },
    ],
    categories: ["Senior"],
  };
}

function LocationText() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

afterEach(cleanup);

describe("RegistrationsPage", () => {
  it("renders rows and status count chips; filters update the URL and refetch", async () => {
    const list = vi.fn(
      async (_input: RegistrationFilters): Promise<RegistrationPage> => ({
        items: [item(ENTRY_A, "Daniel")],
      }),
    );
    const repository: AdminRegistrationsRepository = {
      list,
      counts: async () => ({ pending_payment: 1, confirmed: 2 }),
      filterOptions: async () => options(),
      get: async () => detail(ENTRY_A, "pending_payment"),
      transition: async () => undefined,
      exportCsv: async () => "",
    };
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/registrations"]}>
        <RegistrationsPage repository={repository} />
        <LocationText />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Daniel Harper")).toBeVisible();
    expect(screen.getByRole("button", { name: "Confirmed · 2" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirmed · 2" }));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "status=confirmed",
      ),
    );
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: ["confirmed"] }),
      ),
    );
  });

  it("appends a cursor page and clicking a row routes to the detail URL", async () => {
    const list = vi.fn(
      async (input: RegistrationFilters): Promise<RegistrationPage> =>
        input.cursor
          ? { items: [item(ENTRY_B, "Asha")] }
          : { items: [item(ENTRY_A, "Daniel")], cursor: ENTRY_A },
    );
    const repository: AdminRegistrationsRepository = {
      list,
      counts: async () => ({ pending_payment: 2 }),
      filterOptions: async () => options(),
      get: async () => detail(ENTRY_A, "pending_payment"),
      transition: async () => undefined,
      exportCsv: async () => "",
    };
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/registrations"]}>
        <RegistrationsPage repository={repository} />
        <LocationText />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Daniel Harper")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Asha Harper")).toBeVisible();
    await user.click(screen.getByText("Asha Harper"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/registrations/${ENTRY_B}`,
    );
  });
});

describe("RegistrationDetailPage", () => {
  it("sends a new idempotency key for every lifecycle click and refetches afterwards", async () => {
    let status = "draft";
    const get = vi.fn(async () => detail(ENTRY_A, status));
    const transition = vi.fn(
      async (input: {
        entryId: string;
        action: string;
        idempotencyKey: string;
        reason?: string;
      }) => {
        status = input.action === "reinstate" ? "draft" : "cancelled";
      },
    );
    const repository: AdminRegistrationsRepository = {
      list: async () => ({ items: [] }),
      counts: async () => ({}),
      filterOptions: async () => options(),
      get,
      transition,
      exportCsv: async () => "",
    };
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/registrations/${ENTRY_A}`]}>
        <Routes>
          <Route
            path="/registrations/:entryId"
            element={<RegistrationDetailPage repository={repository} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    const confirmWith = async (action: string, reason?: string) => {
      await user.click(await screen.findByRole("button", { name: action }));
      const dialog = await screen.findByRole("dialog");
      if (reason) await user.type(within(dialog).getByRole("textbox"), reason);
      await user.click(
        within(dialog).getByRole("button", { name: /^Confirm/ }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
    };
    await confirmWith("Cancel entry", "Athlete asked to withdraw");
    await confirmWith("Reinstate");
    await confirmWith("Cancel entry", "Duplicate registration");
    await waitFor(() => expect(transition).toHaveBeenCalledTimes(3));
    const keys = transition.mock.calls.map(([input]) => input.idempotencyKey);
    expect(new Set(keys)).toHaveLength(3);
    expect(transition.mock.calls.map(([input]) => input.reason)).toEqual([
      "Athlete asked to withdraw",
      undefined,
      "Duplicate registration",
    ]);
    expect(get.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("does not cancel on a single click and needs a reason first", async () => {
    const transition = vi.fn(async () => undefined);
    const repository: AdminRegistrationsRepository = {
      list: async () => ({ items: [] }),
      counts: async () => ({}),
      filterOptions: async () => options(),
      get: async () => detail(ENTRY_A, "draft"),
      transition,
      exportCsv: async () => "",
    };
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/registrations/${ENTRY_A}`]}>
        <Routes>
          <Route
            path="/registrations/:entryId"
            element={<RegistrationDetailPage repository={repository} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "Cancel entry" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /^Confirm/ })).toBeDisabled();
    await user.click(
      within(dialog).getByRole("button", { name: "Keep entry as is" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(transition).not.toHaveBeenCalled();
  });
});
