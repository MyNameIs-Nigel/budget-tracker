"use client";
import { useId, useState } from "react";
import { Sun, Monitor, Moon } from "lucide-react";
const choices = ["light", "system", "dark"] as const;
export default function ThemeSelector() {
  const name = useId();
  const [theme, setTheme] = useState(() =>
    typeof document === "undefined"
      ? "system"
      : (document.documentElement.dataset.theme ?? "system"),
  );
  const icons = [Sun, Monitor, Moon];
  return (
    <fieldset className="theme-selector">
      <legend>Appearance</legend>
      <div className="theme-track">
        <span
          className="theme-indicator"
          style={{
            transform: `translateX(${
              Math.max(
                0,
                choices.findIndex((c) => c === theme),
              ) * 100
            }%)`,
          }}
        />
        {choices.map((choice, i) => {
          const Icon = icons[i];
          return (
            <label key={choice}>
              <input
                type="radio"
                name={name}
                value={choice}
                checked={theme === choice}
                onChange={() => {
                  document.documentElement.dataset.theme = choice;
                  setTheme(choice);
                  try {
                    localStorage.setItem("budget-theme", choice);
                  } catch {}
                }}
              />
              <Icon size={16} />
              <span>{choice[0].toUpperCase() + choice.slice(1)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
