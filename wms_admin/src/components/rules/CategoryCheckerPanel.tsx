import { useEffect, useState } from 'react';
import { Calculator, Plus, Trash2 } from 'lucide-react';

import {
  apiCategoryCheckRepository,
  type CategoryCheckProduct,
  type CategoryCheckRepository,
  type CategoryCheckResult,
} from '../../repositories/ApiCategoryCheckRepository';

type MemberRow = { key: number; dateOfBirth: string; role: string };

const TEAM_TYPES = new Set(['team', 'crew', 'relay', 'doubles']);

/**
 * "Which category does this date of birth get?" without registering anyone.
 *
 * A registration entry locks the date of birth that produced it, so checking bands through the
 * participant app meant a database reset per date. This asks the backend to run the ACTIVE rule
 * for the product through the same derivation registration uses, and creates nothing.
 */
export function CategoryCheckerPanel({
  repository = apiCategoryCheckRepository,
}: {
  readonly repository?: CategoryCheckRepository;
}) {
  const [products, setProducts] = useState<CategoryCheckProduct[]>([]);
  const [productId, setProductId] = useState('');
  const [members, setMembers] = useState<MemberRow[]>([{ key: 1, dateOfBirth: '', role: '' }]);
  const [result, setResult] = useState<CategoryCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let live = true;
    repository
      .products()
      .then((items) => {
        if (!live) return;
        setProducts(items);
        setProductId((current) => current || items[0]?.id || '');
      })
      .catch((caught: unknown) => {
        if (live) setError(caught instanceof Error ? caught.message : 'Could not load products.');
      });
    return () => {
      live = false;
    };
  }, [repository]);

  const product = products.find((item) => item.id === productId);
  const isTeam = product ? TEAM_TYPES.has(product.participantType) : false;
  const ready = Boolean(productId) && members.every((member) => /^\d{4}-\d{2}-\d{2}$/.test(member.dateOfBirth));

  const update = (key: number, patch: Partial<MemberRow>) =>
    setMembers((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const onProduct = (id: string) => {
    setProductId(id);
    setResult(null);
    const next = products.find((item) => item.id === id);
    if (!next || !TEAM_TYPES.has(next.participantType)) setMembers((rows) => rows.slice(0, 1));
  };

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      setResult(
        await repository.check(
          productId,
          members.map((member) => ({
            dateOfBirth: member.dateOfBirth,
            ...(member.role.trim() ? { role: member.role.trim() } : {}),
          })),
        ),
      );
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : 'Could not check the category.');
    } finally {
      setChecking(false);
    }
  };

  const outcome = result?.derivation;
  const age = outcome?.dimensions.find((dimension) => dimension.attribute === 'age');

  return (
    <section aria-labelledby="category-checker-title" className="mt-[18px] rounded-xl border border-border bg-surface p-4 shadow-panel">
      <div className="flex items-center gap-2">
        <Calculator aria-hidden size={18} className="text-primary" />
        <h2 id="category-checker-title" className="text-[15px] font-extrabold text-text">Category checker</h2>
      </div>
      <p className="mt-1 text-xs text-text-muted">
        Enter a date of birth to see the category the active rule gives. Nothing is registered or saved.
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <label className="text-xs font-bold text-text-muted">
          Sport entry
          <select
            value={productId}
            onChange={(event) => onProduct(event.target.value)}
            className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text"
          >
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sport} · {item.name}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          {members.map((member, index) => (
            <div key={member.key} className="flex items-end gap-2">
              <label className="flex-1 text-xs font-bold text-text-muted">
                {isTeam ? `Member ${index + 1} date of birth` : 'Date of birth'}
                <input
                  type="date"
                  value={member.dateOfBirth}
                  onChange={(event) => update(member.key, { dateOfBirth: event.target.value })}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-border px-3 text-sm text-text"
                />
              </label>
              {isTeam ? (
                <label className="w-36 text-xs font-bold text-text-muted">
                  Role
                  <input
                    value={member.role}
                    placeholder="e.g. coxswain"
                    onChange={(event) => update(member.key, { role: event.target.value })}
                    className="mt-1 block min-h-11 w-full rounded-lg border border-border px-3 text-sm text-text"
                  />
                </label>
              ) : null}
              {isTeam && members.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove member ${index + 1}`}
                  onClick={() => setMembers((rows) => rows.filter((row) => row.key !== member.key))}
                  className="grid min-h-11 w-11 place-items-center rounded-lg border border-border text-text-muted hover:bg-surface-muted"
                >
                  <Trash2 aria-hidden size={16} />
                </button>
              ) : null}
            </div>
          ))}
          {isTeam && members.length < 20 ? (
            <button
              type="button"
              onClick={() =>
                setMembers((rows) => [...rows, { key: Math.max(...rows.map((row) => row.key)) + 1, dateOfBirth: '', role: '' }])
              }
              className="inline-flex items-center gap-1 text-[13px] font-bold text-primary"
            >
              <Plus aria-hidden size={14} />
              Add member
            </button>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        disabled={!ready || checking}
        onClick={() => void check()}
        className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
      >
        {checking ? 'Checking…' : 'Check category'}
      </button>

      {error ? (
        <div role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {result && outcome ? (
        <div role="status" className="mt-3 rounded-lg border border-border bg-surface-muted px-3 py-3 text-sm">
          {outcome.categoryName ? (
            <p className="text-base font-extrabold text-text">{outcome.categoryName}</p>
          ) : (
            <p className="text-base font-extrabold text-red-900">No category — outside every band</p>
          )}
          <p className="mt-1 text-xs text-text-muted">
            {isTeam ? 'Banding age (after the rule aggregates the members)' : 'Age'}: {age ? String(age.value) : '—'} on{' '}
            {result.referenceDate} · {result.sport} rule {result.version}
          </p>
          {outcome.blockedBy.length > 0 ? (
            <p className="mt-1 text-xs text-red-900">
              Would be refused: {outcome.blockedBy.map((item) => item.messageKey).join(', ')}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
