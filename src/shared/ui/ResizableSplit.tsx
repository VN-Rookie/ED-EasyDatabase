import { useRef, type ReactNode, type PointerEvent } from "react";

interface ResizableSplitProps {
  left: ReactNode;
  right: ReactNode;
  leftWidth: number;
  onLeftWidthChange: (width: number) => void;
  min?: number;
  max?: number;
}

const DEFAULT_WIDTH = 280;

export function ResizableSplit({ left, right, leftWidth, onLeftWidthChange, min = 200, max = 520 }: ResizableSplitProps) {
  const dragging = useRef(false);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = true;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    onLeftWidthChange(Math.min(max, Math.max(min, e.clientX)));
  };

  const stop = () => { dragging.current = false; };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div style={{ width: leftWidth }} className="flex-shrink-0 flex flex-col border-r border-border bg-surface overflow-hidden">
        {left}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onDoubleClick={() => onLeftWidthChange(DEFAULT_WIDTH)}
        className="w-1 cursor-col-resize bg-border/0 hover:bg-accent/50 active:bg-accent transition-colors duration-[var(--dur-fast)]"
      />
      <div className="flex-1 flex flex-col overflow-hidden bg-bg">{right}</div>
    </div>
  );
}
