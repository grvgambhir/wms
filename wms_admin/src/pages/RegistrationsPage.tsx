import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Download, Search, SlidersHorizontal } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { AdminPortalShell } from "../components/layout/AdminPortalShell";
import {
  REGISTRATION_PAGE_SIZE,
  explainRegistrationError,
  formatMoney,
  paymentStateLabel,
  productOptionLabel,
  registrationName,
  statusLabel,
  type PaymentState,
  type RegistrationFilterOptions,
  type RegistrationFilters,
  type RegistrationListItem,
} from "../domain/adminRegistrations";
import { adminRegistrationsRepository } from "../repositories/provider";
import type { AdminRegistrationsRepository } from "../repositories/AdminRegistrationsRepository";
import { useToast } from "../components/ui/ToastProvider";

const STATUS_OPTIONS = [
  "draft",
  "pending_evidence",
  "pending_team",
  "pending_payment",
  "waitlisted",
  "confirmed",
  "cancelled",
  "withdrawn",
  "substituted",
  "disqualified",
] as const;

function filtersFrom(params: URLSearchParams): RegistrationFilters {
  const value = (key: string) => params.get(key)?.trim() || undefined;
  const payment = value("paymentState");
  return {
    eventId: value("eventId"),
    sportId: value("sportId"),
    productId: value("productId"),
    category: value("category"),
    status: params.getAll("status").filter(Boolean),
    grade: value("grade"),
    paymentState:
      payment === "unpaid" || payment === "paid" || payment === "refunded"
        ? payment
        : undefined,
    evidenceState: value("evidenceState"),
    teamId: value("teamId"),
    search: value("search"),
  };
}

function withSearch(
  params: URLSearchParams,
  patch: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(patch)) {
    next.delete(key);
    if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
    else if (value) next.set(key, value);
  }
  return next;
}

export function RegistrationsPage({
  repository = adminRegistrationsRepository,
}: {
  readonly repository?: AdminRegistrationsRepository;
} = {}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filterKey = params.toString();
  const filters = useMemo(() => filtersFrom(params), [filterKey]);
  const [searchInput, setSearchInput] = useState(filters.search ?? "");
  const [items, setItems] = useState<RegistrationListItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [options, setOptions] = useState<RegistrationFilterOptions>({
    sports: [],
    products: [],
    categories: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const { showToast } = useToast();

  useEffect(() => {
    setSearchInput(filters.search ?? "");
  }, [filters.search]);

  const patchFilters = useCallback(
    (patch: Record<string, string | string[] | undefined>) => {
      setParams((current) => withSearch(current, patch));
    },
    [setParams],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next !== (filters.search ?? ""))
        patchFilters({ search: next || undefined });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters.search, patchFilters, searchInput]);

  useEffect(() => {
    let active = true;
    void repository.filterOptions(filters.eventId).then(
      (next) => {
        if (active) setOptions(next);
      },
      () => {
        // The queue remains usable when only option discovery failed; its own fetch reports
        // a visible error if the backend itself is unavailable.
      },
    );
    return () => {
      active = false;
    };
  }, [filters.eventId, repository]);

  useEffect(() => {
    const request = generation.current + 1;
    generation.current = request;
    setIsLoading(true);
    setError(null);
    void Promise.all([
      repository.list({ ...filters, limit: REGISTRATION_PAGE_SIZE }),
      repository.counts(filters),
    ])
      .then(
        ([page, nextCounts]) => {
          if (generation.current !== request) return;
          setItems(page.items);
          setCursor(page.cursor);
          setCounts(nextCounts);
        },
        (caught: unknown) => {
          if (generation.current !== request) return;
          setItems([]);
          setCursor(undefined);
          setCounts({});
          setError(explainRegistrationError(caught));
        },
      )
      .finally(() => {
        if (generation.current === request) setIsLoading(false);
      });
  }, [filterKey, filters, repository]);

  const loadMore = async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const page = await repository.list({
        ...filters,
        cursor,
        limit: REGISTRATION_PAGE_SIZE,
      });
      setItems((current) => [...current, ...page.items]);
      setCursor(page.cursor);
    } catch (caught) {
      setError(explainRegistrationError(caught));
    } finally {
      setIsLoadingMore(false);
    }
  };

  const toggleStatus = (status: string) => {
    const current = filters.status ?? [];
    patchFilters({
      status: current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status],
    });
  };

  const exportCsv = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const csv = await repository.exportCsv(filters);
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "registrations.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      showToast({ variant: "success", title: "CSV exported" });
    } catch (caught) {
      const message = explainRegistrationError(caught);
      setError(message);
      showToast({
        variant: "error",
        title: "Export failed",
        description: message,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const products = filters.sportId
    ? options.products.filter((product) => product.sportId === filters.sportId)
    : options.products;

  return (
    <AdminPortalShell>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-[18px] flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <SlidersHorizontal
                aria-hidden
                size={22}
                className="text-primary"
              />
              <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text">
                Registrations
              </h1>
            </div>
            <p className="mt-1 text-sm text-text-muted">
              Find an entry, inspect its audit trail, and act using the
              registration lifecycle.
            </p>
          </div>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => void exportCsv()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-3.5 text-[13px] font-semibold text-text shadow-sm transition hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
          >
            <Download aria-hidden size={16} />
            {isExporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-border bg-surface p-3.5 shadow-panel">
          <div className="grid gap-2.5 lg:grid-cols-[minmax(240px,1.6fr)_repeat(5,minmax(0,1fr))]">
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
              <Search aria-hidden size={16} className="text-text-muted" />
              <input
                type="search"
                aria-label="Search registrations"
                placeholder="Name, email, or entry ID"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-text outline-none"
              />
            </label>
            <FilterSelect
              label="Sport"
              value={filters.sportId ?? ""}
              onChange={(value) =>
                patchFilters({
                  sportId: value || undefined,
                  productId: undefined,
                })
              }
            >
              <option value="">All sports</option>
              {options.sports.map((sport) => (
                <option key={sport.id} value={sport.id}>
                  {sport.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Product"
              value={filters.productId ?? ""}
              onChange={(value) =>
                patchFilters({ productId: value || undefined })
              }
            >
              <option value="">All products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {productOptionLabel(product, options.sports)}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Category"
              value={filters.category ?? ""}
              onChange={(value) =>
                patchFilters({ category: value || undefined })
              }
            >
              <option value="">All categories</option>
              {options.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Payment"
              value={filters.paymentState ?? ""}
              onChange={(value) =>
                patchFilters({ paymentState: value || undefined })
              }
            >
              <option value="">All payments</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
            </FilterSelect>
            <FilterSelect
              label="Evidence"
              value={filters.evidenceState ?? ""}
              onChange={(value) =>
                patchFilters({ evidenceState: value || undefined })
              }
            >
              <option value="">All evidence</option>
              <option value="not_required">Not required</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </FilterSelect>
          </div>
          <fieldset className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <legend className="mr-1 text-xs font-bold text-text-muted">
              Status
            </legend>
            {STATUS_OPTIONS.map((status) => (
              <label
                key={status}
                className="inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-text"
              >
                <input
                  type="checkbox"
                  checked={(filters.status ?? []).includes(status)}
                  onChange={() => toggleStatus(status)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                {statusLabel(status)}
              </label>
            ))}
          </fieldset>
        </div>

        <div
          className="mb-4 flex flex-wrap gap-2"
          aria-label="Registration status counts"
        >
          {Object.entries(counts)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([status, count]) => (
              <button
                key={status}
                type="button"
                onClick={() => patchFilters({ status: [status] })}
                className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition ${filters.status?.length === 1 && filters.status[0] === status ? "bg-primary text-white" : "bg-surface-muted text-text hover:bg-primary/[0.12]"}`}
              >
                {statusLabel(status)} · {count}
              </button>
            ))}
          {(filters.status?.length ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => patchFilters({ status: undefined })}
              className="px-2 text-xs font-bold text-primary hover:underline"
            >
              Clear status
            </button>
          ) : null}
        </div>

        {error ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-red-900"
          >
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div
            role="status"
            className="grid min-h-64 place-items-center rounded-xl border border-border bg-surface text-sm text-text-muted shadow-panel"
          >
            Loading registrations…
          </div>
        ) : items.length === 0 ? (
          <div className="grid min-h-40 place-items-center rounded-xl border border-border bg-surface text-sm text-text-muted shadow-panel">
            No registrations match these filters.
          </div>
        ) : (
          <section className="overflow-x-auto rounded-[14px] border border-border bg-surface shadow-panel">
            <table className="min-w-[1180px] w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
                <tr>
                  <th className="px-4 py-3">Athlete</th>
                  <th className="px-4 py-3">Sport / product</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Evidence</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <RegistrationRow
                    key={item.id}
                    item={item}
                    onOpen={() => navigate(`/registrations/${item.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </section>
        )}

        {cursor ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            className="mt-4 min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text shadow-sm transition hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </AdminPortalShell>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly children: ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 rounded-lg border border-border bg-surface px-2 text-[13px] font-semibold text-text"
    >
      {children}
    </select>
  );
}

function RegistrationRow({
  item,
  onOpen,
}: {
  readonly item: RegistrationListItem;
  readonly onOpen: () => void;
}) {
  return (
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      className="cursor-pointer transition hover:bg-primary/[0.04] focus:bg-primary/[0.08] focus:outline-none"
    >
      <th scope="row" className="px-4 py-3 font-bold text-text">
        <span className="block">{registrationName(item)}</span>
        <span className="mt-0.5 block text-xs font-normal text-text-muted">
          {item.athlete.email ?? "No email"} · {item.athlete.nationality ?? "—"}
        </span>
      </th>
      <td className="px-4 py-3">
        <span className="block font-semibold text-text">{item.sport.name}</span>
        <span className="text-xs text-text-muted">{item.product.name}</span>
      </td>
      <td className="px-4 py-3 text-text-muted">{item.grade}</td>
      <td className="px-4 py-3">
        <span className="block text-text">
          {item.currentCategoryName ?? "—"}
        </span>
        {item.originalCategoryName !== item.currentCategoryName ? (
          <span className="text-xs text-text-muted">
            was {item.originalCategoryName ?? "—"}
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <StatusBadge value={item.status} />
      </td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-extrabold text-text-muted">
          {statusLabel(item.evidenceStatus)}
        </span>
      </td>
      <td className="px-4 py-3">
        <PaymentBadge state={item.payment.state} />
        <span className="mt-1 block text-xs text-text-muted">
          {formatMoney(item.payment.settledMinor, item.payment.currency)} of{" "}
          {formatMoney(item.payment.dueMinor, item.payment.currency)}
        </span>
      </td>
      <td className="px-4 py-3 text-text-muted">{item.team?.name ?? "—"}</td>
      <td className="px-4 py-3 text-xs text-text-muted">
        {new Date(item.updatedAt).toLocaleDateString()}
      </td>
    </tr>
  );
}

export function StatusBadge({ value }: { readonly value: string }) {
  return (
    <span className="rounded-full bg-primary/[0.12] px-2.5 py-1 text-[11px] font-extrabold text-primary">
      {statusLabel(value)}
    </span>
  );
}

function PaymentBadge({ state }: { readonly state: PaymentState }) {
  const className =
    state === "paid"
      ? "bg-success/[0.12] text-success"
      : state === "refunded"
        ? "bg-warning/[0.12] text-amber-800"
        : "bg-danger/[0.08] text-danger";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${className}`}
    >
      {paymentStateLabel(state)}
    </span>
  );
}
