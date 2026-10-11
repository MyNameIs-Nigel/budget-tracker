import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import type { Transaction } from "@/lib/store";

export default function CategoryPicker({
  rows,
  categories,
  busy,
  onClose,
  onAssign,
}: {
  rows: Transaction[];
  categories: { id: string; name: string }[];
  busy: boolean;
  onClose: () => void;
  onAssign: (categoryId: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const categorySelect = useRef<HTMLSelectElement>(null);
  const sameCategory = rows.every(
    (row) => row.categoryId === rows[0].categoryId,
  );
  const [category, setCategory] = useState(
    sameCategory && categories.some((entry) => entry.id === rows[0].categoryId)
      ? rows[0].categoryId
      : "",
  );
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    categorySelect.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
      else document.getElementById("transaction-search")?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="transaction-dialog"
      aria-labelledby="category-picker-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            await onAssign(category);
            onClose();
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Could not assign this category.",
            );
          }
        }}
      >
        <div className="section-title">
          <h2 id="category-picker-title">Assign spending category</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close category picker"
            disabled={busy}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <p className="small">
          {rows.length === 1
            ? rows[0].description
            : `${rows.length} expenses selected`}
        </p>
        <p className="small muted">
          {sameCategory
            ? `Current category: ${rows[0].categoryName}`
            : "Multiple current categories"}
          . Each expense has one category. A new choice replaces the current
          category.
        </p>
        <label className="stack-field">
          <span>Spending category</span>
          <select
            ref={categorySelect}
            required
            value={category}
            disabled={busy}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="" disabled>
              Choose a category
            </option>
            {categories.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        {category && (
          <p className="small muted">
            {rows.filter((row) => row.categoryId === category).length} already
            in this category.
          </p>
        )}
        {error && (
          <p className="error-text small" role="alert">
            {error}
          </p>
        )}
        <div className="button-row dialog-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !category}>
            {busy && <LoaderCircle className="spin" size={16} />}Assign category
          </button>
        </div>
      </form>
    </dialog>
  );
}
