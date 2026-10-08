import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { operationsRepository } from "../repositories/provider";
import { OperationsPage } from "./OperationsPage";

describe("OperationsPage incident exercise", () => {
  beforeEach(async () => {
    await operationsRepository.resetDemo();
  });

  afterEach(() => {
    cleanup();
  });

  it("moves from a healthy feed through S1 workaround and resolution", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/operations"]}>
        <OperationsPage />
      </MemoryRouter>,
    );

    // The mock half no longer invents figures; it says the counts are unavailable.
    expect(
      await screen.findByText(
        /Counts unavailable — the backend could not be reached/,
      ),
    ).toBeVisible();
    expect(
      screen.getByText("Feed healthy · last import 12s ago"),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Simulate feed failure" }),
    );
    expect(
      await screen.findByText(
        "Feed STALE · no import for 6m · downstream results not updating",
      ),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Open S1 Incident" }));
    expect(await screen.findByText("INC-001 · S1 · Open")).toBeVisible();
    expect(screen.getByText("1 Open")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Apply documented workaround" }),
    );
    expect(
      await screen.findByText("Safe workaround active — manual results entry"),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Feed restored — resolve incident" }),
    );
    expect(
      await screen.findByText("INC-001 resolved · service nominal"),
    ).toBeVisible();
    expect(screen.getByText("0 Open")).toBeVisible();
    expect(
      screen.getByText("Feed healthy · last import 12s ago"),
    ).toBeVisible();
  });

  it("shows the full navigation and toggles the mock change freeze", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/operations"]}>
        <OperationsPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("link", { name: "System & Load" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Finance & Reconcile" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Exceptions" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Accreditation Desk" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Assisted Registration" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Sport Rules Engine" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Communications" })).toBeVisible();
    for (const label of ["Registration Funnel"]) {
      expect(
        screen.getByRole("button", {
          name: `${label}, coming in a later port`,
        }),
      ).toBeDisabled();
    }

    const freezeButton = await screen.findByRole("button", {
      name: "Trigger Change Freeze",
    });
    await user.click(freezeButton);
    expect(
      await screen.findByText(
        "Protected change freeze is active. Click the control again to lift it.",
      ),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Change Freeze Active" }),
    );
    expect(
      await screen.findByRole("button", { name: "Trigger Change Freeze" }),
    ).toBeVisible();
  });
});
