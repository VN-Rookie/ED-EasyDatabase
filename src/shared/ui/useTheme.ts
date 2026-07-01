import { useEffect } from "react";
import { useThemeStore, type ThemePref } from "../../stores/themeStore";

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

/** Mount once at app root: keeps <html data-theme> in sync with the pref. */
export function useTheme(): void {
  const pref = useThemeStore((s) => s.pref);
  useEffect(() => {
    const apply = () => { document.documentElement.dataset.theme = resolve(pref); };
    apply();
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);
}
