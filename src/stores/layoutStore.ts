import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  explorerWidth: number;
  setExplorerWidth: (w: number) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({ explorerWidth: 280, setExplorerWidth: (explorerWidth) => set({ explorerWidth }) }),
    { name: "tool-sql:layout" },
  ),
);
