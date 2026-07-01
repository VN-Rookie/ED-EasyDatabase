import { useEffect } from "react";
import { create } from "zustand";

interface PaletteState {
  open: boolean;
  setOpen: (o: boolean) => void;
  toggle: () => void;
}

export const usePaletteStore = create<PaletteState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open }),
}));

export function usePaletteHotkey(): void {
  const toggle = usePaletteStore((s) => s.toggle);
  const setOpen = usePaletteStore((s) => s.setOpen);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); toggle(); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, setOpen]);
}
