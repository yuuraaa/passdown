import { useEffect, useState } from "react";
import { LuSun, LuMoon, LuMonitor } from "react-icons/lu";

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
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-label="ライトモード"
        title="ライトモード"
        className={`rounded-ui p-2 ${
          theme === "light"
            ? "bg-surface border border-line"
            : "hover:bg-surface"
        }`}
      >
        <LuSun size={20} />
      </button>

      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-label="ダークモード"
        title="ダークモード"
        className={`rounded-ui p-2 ${
          theme === "dark"
            ? "bg-surface border border-line"
            : "hover:bg-surface"
        }`}
      >
        <LuMoon size={20} />
      </button>

      <button
        type="button"
        onClick={() => setTheme("system")}
        aria-label="システム設定"
        title="システム設定"
        className={`rounded-ui p-2 ${
          theme === "system"
            ? "bg-surface border border-line"
            : "hover:bg-surface"
        }`}
      >
        <LuMonitor size={20} />
      </button>
    </div>
  );
}
