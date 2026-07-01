import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemePref = "light" | "dark" | "system";

interface ThemeState {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({ pref: "system", setPref: (pref) => set({ pref }) }),
    { name: "tool-sql:theme" },
  ),
);
