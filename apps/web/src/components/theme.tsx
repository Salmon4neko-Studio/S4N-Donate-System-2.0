import { useState } from "react";
import { buttonClass } from "@/components/fields";

const STORAGE_KEY = "s4n-dashboard-theme";

function storedDark(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark";
  } catch {
    return false;
  }
}

export function useDashboardTheme(): { dark: boolean; toggle: () => void } {
  const [dark, setDark] = useState(storedDark);

  function toggle() {
    setDark((current) => {
      const next = !current;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      } catch {
        // The choice still applies for this view.
      }
      return next;
    });
  }

  return { dark, toggle };
}

export function ThemeButton({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={buttonClass({ variant: "ghost", size: "small", icon: "start" })}
      aria-pressed={dark}
      onClick={onToggle}
    >
      <span className={dark ? "ts-icon is-sun-icon" : "ts-icon is-moon-icon"} aria-hidden="true" />
      {dark ? "淺色介面" : "深色介面"}
    </button>
  );
}
