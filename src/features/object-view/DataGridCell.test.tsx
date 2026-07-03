import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DataGridCell } from "./DataGridCell";
import { useDataGridStore } from "./dataGridStore";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Maximize2: ({ size }: { size: number }) => <span data-testid="maximize-icon" style={{ fontSize: size }} />,
}));

// Mock the store
const mockStartEditing = vi.fn();
const mockStopEditing = vi.fn();
const mockGetCellValue = vi.fn();
const mockIsDirty = vi.fn();
const mockUpdateDirtyValue = vi.fn();

const createMockStore = (overrides?: Record<string, unknown>) => ({
  editingCell: null,
  startEditing: mockStartEditing,
  stopEditing: mockStopEditing,
  getCellValue: mockGetCellValue,
  isDirty: mockIsDirty,
  updateDirtyValue: mockUpdateDirtyValue,
  ...overrides,
});

vi.mock("./dataGridStore", () => ({
  useDataGridStore: vi.fn(() => createMockStore()),
}));

describe("DataGridCell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockGetCellValue.mockImplementation((_rowIndex: number, _column: string, value: unknown) => value);
    mockIsDirty.mockReturnValue(false);
    (useDataGridStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(createMockStore());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderCell = (props: Partial<{
    column: string;
    rowIndex: number;
    value: unknown;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    foreignKeyOptions: { value: string; label: string }[];
    dataType: string;
    onSave: (edit: { rowIndex: number; column: string; originalValue: unknown; newValue: unknown }) => void;
  }> = {}) => {
    return render(
      <DataGridCell
        column={props.column ?? "test_column"}
        rowIndex={props.rowIndex ?? 0}
        value={props.value ?? "test value"}
        isPrimaryKey={props.isPrimaryKey ?? false}
        isForeignKey={props.isForeignKey ?? false}
        foreignKeyOptions={props.foreignKeyOptions ?? []}
        dataType={props.dataType ?? "text"}
        onSave={props.onSave}
      />
    );
  };

  describe("Textarea vs Input switching behavior", () => {
    it("shows Input for short values (≤50 chars, no newlines)", async () => {
      const shortValue = "short"; // less than 50 chars, no newlines
      mockGetCellValue.mockReturnValue(shortValue);

      renderCell({ value: shortValue });

      // Double-click to start editing
      const cell = screen.getByText(shortValue);
      fireEvent.doubleClick(cell);

      await waitFor(() => {
        // Should have called startEditing
        expect(mockStartEditing).toHaveBeenCalled();
      });
    });

    it("shows Textarea for values > 50 chars", async () => {
      const longValue = "a".repeat(51); // 51 characters, more than 50
      mockGetCellValue.mockReturnValue(longValue);
      (useDataGridStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockStore({ editingCell: { rowIndex: 0, column: "test_column" } })
      );

      renderCell({ value: longValue });

      // Check that the component renders in edit mode (since we set editingCell)
      await waitFor(() => {
        // Should render textarea for long values
        const textarea = document.querySelector("textarea");
        expect(textarea).toBeInTheDocument();
      });
    });

    it("shows Textarea for values containing newlines", async () => {
      const valueWithNewline = "line1\nline2"; // contains newline
      mockGetCellValue.mockReturnValue(valueWithNewline);
      (useDataGridStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockStore({ editingCell: { rowIndex: 0, column: "test_column" } })
      );

      renderCell({ value: valueWithNewline });

      await waitFor(() => {
        const textarea = document.querySelector("textarea");
        expect(textarea).toBeInTheDocument();
      });
    });

    it("shows Input for values at exactly 50 chars (boundary)", async () => {
      const boundaryValue = "a".repeat(50); // exactly 50 chars
      mockGetCellValue.mockReturnValue(boundaryValue);
      (useDataGridStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockStore({ editingCell: { rowIndex: 0, column: "test_column" } })
      );

      renderCell({ value: boundaryValue });

      await waitFor(() => {
        // Should render input, not textarea, for exactly 50 chars
        const textarea = document.querySelector("textarea");
        expect(textarea).not.toBeInTheDocument();
        const input = document.querySelector("input");
        expect(input).toBeInTheDocument();
      });
    });

    it("switches to Textarea when typing makes value exceed 50 chars", async () => {
      const initialValue = "a".repeat(30); // starts with short value
      mockGetCellValue.mockReturnValue(initialValue);
      (useDataGridStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockStore({ editingCell: { rowIndex: 0, column: "test_column" } })
      );

      renderCell({ value: initialValue });

      // Initially should show input
      await waitFor(() => {
        const input = document.querySelector("input");
        expect(input).toBeInTheDocument();
      });

      // Type more characters to exceed 50
      const input = document.querySelector("input")!;
      fireEvent.change(input, { target: { value: "a".repeat(51) } });

      // After change, should switch to textarea
      await waitFor(() => {
        const textarea = document.querySelector("textarea");
        expect(textarea).toBeInTheDocument();
      });
    });

    it("dynamically calculates rows based on content length", async () => {
      const longValue = "a".repeat(200); // 200 chars
      mockGetCellValue.mockReturnValue(longValue);
      (useDataGridStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockStore({ editingCell: { rowIndex: 0, column: "test_column" } })
      );

      renderCell({ value: longValue });

      await waitFor(() => {
        const textarea = document.querySelector("textarea");
        expect(textarea).toBeInTheDocument();
        // Math.min(Math.ceil(200 / 40) + 1, 10) = Math.min(6, 10) = 6
        expect(textarea).toHaveAttribute("rows", "6");
      });
    });

    it("caps rows at maximum of 10", async () => {
      const veryLongValue = "a".repeat(500); // 500 chars
      mockGetCellValue.mockReturnValue(veryLongValue);
      (useDataGridStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockStore({ editingCell: { rowIndex: 0, column: "test_column" } })
      );

      renderCell({ value: veryLongValue });

      await waitFor(() => {
        const textarea = document.querySelector("textarea");
        expect(textarea).toBeInTheDocument();
        // Math.min(Math.ceil(500 / 40) + 1, 10) = Math.min(13.5, 10) = 10
        expect(textarea).toHaveAttribute("rows", "10");
      });
    });
  });

  describe("Expand modal trigger behavior", () => {
    it("shows expand button for strings > 80 chars", () => {
      const longString = "a".repeat(81);
      mockGetCellValue.mockReturnValue(longString);

      renderCell({ value: longString });

      // Should show the expand button
      const expandButton = screen.getByTestId("maximize-icon");
      expect(expandButton).toBeInTheDocument();
    });

    it("does NOT show expand button for strings ≤ 80 chars", () => {
      const shortString = "a".repeat(80);
      mockGetCellValue.mockReturnValue(shortString);

      renderCell({ value: shortString });

      // Should NOT show the expand button
      const expandButton = screen.queryByTestId("maximize-icon");
      expect(expandButton).not.toBeInTheDocument();
    });

    it("shows expand button for object values with long JSON string (>80 chars)", () => {
      // Create a large object that produces a string > 80 chars when stringified
      const objectValue = {
        key1: "value1",
        key2: "value2",
        key3: "value3",
        key4: "value4",
        key5: "value5",
        key6: "value6",
        key7: "value7",
        key8: "value8",
        key9: "value9",
        key10: "value10",
      };
      mockGetCellValue.mockReturnValue(objectValue);

      renderCell({ value: objectValue });

      // Should show the expand button for long objects
      const expandButton = screen.getByTestId("maximize-icon");
      expect(expandButton).toBeInTheDocument();
    });

    it("shows expand button for array values with long JSON string (>80 chars)", () => {
      // Create a large array that produces a string > 80 chars when stringified
      const arrayValue = Array.from({ length: 30 }, (_, i) => ({ id: i, value: `item-${i}` }));
      mockGetCellValue.mockReturnValue(arrayValue);

      renderCell({ value: arrayValue });

      // Should show the expand button for long arrays
      const expandButton = screen.getByTestId("maximize-icon");
      expect(expandButton).toBeInTheDocument();
    });

    it("displays truncated content for long strings in view mode", () => {
      const longString = "a".repeat(100);
      mockGetCellValue.mockReturnValue(longString);

      renderCell({ value: longString });

      // Should show truncated content (first 80 chars + ellipsis)
      // The display should contain "...", but not the full string
      expect(screen.getByText(/…/)).toBeInTheDocument();
    });
  });

  describe("Editing behavior", () => {
    it("does not start editing for primary key cells", () => {
      const value = "primary_key_value";

      renderCell({ value, isPrimaryKey: true });

      // Double-click on the cell
      const cell = screen.getByText(value);
      fireEvent.doubleClick(cell);

      // startEditing should NOT be called for primary keys
      expect(mockStartEditing).not.toHaveBeenCalled();
    });

    it("starts editing on double-click for non-primary key cells", () => {
      const value = "editable_value";

      renderCell({ value, isPrimaryKey: false });

      const cell = screen.getByText(value);
      fireEvent.doubleClick(cell);

      expect(mockStartEditing).toHaveBeenCalledWith(0, "test_column");
    });

    it("saves on Enter key press", async () => {
      const onSave = vi.fn();
      const value = "test";
      mockGetCellValue.mockReturnValue(value);
      (useDataGridStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockStore({ editingCell: { rowIndex: 0, column: "test_column" } })
      );

      renderCell({ value, onSave });

      // Find input and type something
      const input = document.querySelector("input")!;
      fireEvent.change(input, { target: { value: "new_value" } });

      // Press Enter to save
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(mockUpdateDirtyValue).toHaveBeenCalled();
        expect(onSave).toHaveBeenCalled();
        expect(mockStopEditing).toHaveBeenCalled();
      });
    });

    it("cancels on Escape key press", async () => {
      const value = "test";
      mockGetCellValue.mockReturnValue(value);
      (useDataGridStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        createMockStore({ editingCell: { rowIndex: 0, column: "test_column" } })
      );

      renderCell({ value });

      const input = document.querySelector("input")!;

      // Press Escape to cancel
      fireEvent.keyDown(input, { key: "Escape" });

      await waitFor(() => {
        expect(mockStopEditing).toHaveBeenCalled();
      });
    });

    it("displays NULL for null values in view mode", () => {
      mockGetCellValue.mockReturnValue(null);

      renderCell({ value: null });

      expect(screen.getByText("NULL")).toBeInTheDocument();
    });

    it("displays NULL for undefined values in view mode", () => {
      mockGetCellValue.mockReturnValue(undefined);

      renderCell({ value: undefined });

      expect(screen.getByText("NULL")).toBeInTheDocument();
    });
  });
});
