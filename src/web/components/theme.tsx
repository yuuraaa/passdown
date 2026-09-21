import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");

    if (
      saved === "light" ||
      saved === "dark" ||
      saved === "system"
    ) {
      return saved;
    }

    return "system";
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolved =
        theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : theme;

      document.documentElement.dataset.theme = resolved;
    };

    applyTheme();

    localStorage.setItem("theme", theme);

    if (theme === "system") {
      media.addEventListener("change", applyTheme);
    }

    return () => {
      media.removeEventListener("change", applyTheme);
    };
  }, [theme]);

  return {
    theme,
    setTheme,
  };
}
export function ThemeSelector() {
  const { theme, setTheme } = useTheme()

  return (
    <div>
      <select
        value={theme}
        onChange={(e) =>
          setTheme(e.target.value as "light" | "dark" | "system")
        }
        className="w-full rounded-ui border border-line bg-surface px-2 py-1.5 text-sm text-ink"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </div>
  )
}
