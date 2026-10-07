"use client";
import { useId, useState } from "react";
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 1_000_000,
  suffix,
  help,
  prefix = "$",
  step = "0.01",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  help?: string;
  prefix?: string;
  step?: string;
}) {
  const id = useId(),
    [editing, setEditing] = useState<string | null>(null);
  return (
    <label className="field" htmlFor={id}>
      <span>
        {label}
        {help && (
          <small id={`${id}-help`} className="muted">
            {help}
          </small>
        )}
      </span>
      <span className="number-input">
        {prefix && <span>{prefix}</span>}
        <input
          id={id}
          aria-label={label}
          aria-describedby={help ? `${id}-help` : undefined}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={editing ?? value}
          onFocus={() => setEditing(String(value))}
          onBlur={() => setEditing(null)}
          onChange={(e) => {
            const raw = e.target.value;
            setEditing(raw);
            const n = Number(raw);
            if (raw !== "" && Number.isFinite(n))
              onChange(Math.min(max, Math.max(min, Math.round(n * 100) / 100)));
          }}
        />
        {suffix && <span>{suffix}</span>}
      </span>
    </label>
  );
}
export function TextField({
  label,
  value,
  onChange,
  type = "text",
  maxLength = 80,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label className="stack-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
