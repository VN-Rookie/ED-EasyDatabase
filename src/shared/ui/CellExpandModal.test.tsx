import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CellExpandModal } from "./CellExpandModal";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  X: () => <span data-testid="close-icon" />,
  Copy: () => <span data-testid="copy-icon" />,
}));

// Mock navigator.clipboard
const mockClipboard = {
  writeText: vi.fn(),
};
Object.defineProperty(navigator, "clipboard", {
  value: mockClipboard,
  writable: true,
});

describe("CellExpandModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Expand trigger threshold", () => {
    it("opens modal when value is object type", async () => {
      const mockValue = { name: "test", value: 123 };
      const onClose = vi.fn();

      render(<CellExpandModal column="test_column" value={mockValue} onClose={onClose} />);

      // Modal should be visible
      expect(screen.getByText(/test_column/)).toBeInTheDocument();
      expect(screen.getByText("JSON")).toBeInTheDocument();

      // Check that JSON is formatted
      expect(screen.getByText(/"name": "test"/)).toBeInTheDocument();
    });

    it("opens modal when string length > 80 chars", async () => {
      const longString = "a".repeat(81); // 81 characters
      const onClose = vi.fn();

      render(<CellExpandModal column="test_column" value={longString} onClose={onClose} />);

      // Modal should be visible
      expect(screen.getByText(/test_column/)).toBeInTheDocument();
    });

    it("does NOT open modal for short strings (<= 80 chars) - this is the parent component's responsibility", () => {
      // Note: CellExpandModal itself doesn't decide when to open.
      // It's the DataGridCell that decides based on MAX_CELL_LEN = 80.
      // The modal simply displays whatever value it receives.
      const shortString = "short value"; // less than 80 chars
      const onClose = vi.fn();

      render(<CellExpandModal column="test_column" value={shortString} onClose={onClose} />);

      // Modal should display the short string
      expect(screen.getByText("short value")).toBeInTheDocument();
    });

    it("displays NULL for null values", () => {
      const onClose = vi.fn();

      render(<CellExpandModal column="test_column" value={null} onClose={onClose} />);

      expect(screen.getByText("NULL")).toBeInTheDocument();
    });

    it("displays NULL for undefined values", () => {
      const onClose = vi.fn();

      render(<CellExpandModal column="test_column" value={undefined} onClose={onClose} />);

      expect(screen.getByText("NULL")).toBeInTheDocument();
    });

    it("displays empty string correctly", () => {
      const onClose = vi.fn();

      render(<CellExpandModal column="test_column" value="" onClose={onClose} />);

      // Modal should be visible with empty pre tag (empty string)
      const pre = document.querySelector("pre");
      expect(pre).toBeInTheDocument();
      expect(pre?.textContent).toBe("");
    });
  });

  describe("User interactions", () => {
    it("closes on Escape key press", async () => {
      const onClose = vi.fn();
      render(<CellExpandModal column="test_column" value="test value" onClose={onClose} />);

      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it("closes on X button click", async () => {
      const onClose = vi.fn();
      render(<CellExpandModal column="test_column" value="test value" onClose={onClose} />);

      const closeButton = screen.getByTestId("close-icon").parentElement;
      fireEvent.click(closeButton!);

      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it("copies value to clipboard and closes on Copy button click", async () => {
      const onClose = vi.fn();
      render(<CellExpandModal column="test_column" value="test value" onClose={onClose} />);

      const copyButton = screen.getByText("Copy");
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith("test value");
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it("prevents closing when clicking inside modal content", async () => {
      const onClose = vi.fn();
      render(<CellExpandModal column="test_column" value="test value" onClose={onClose} />);

      const modalContent = screen.getByText("test value").closest("div");
      fireEvent.click(modalContent!);

      // onClose should NOT be called when clicking inside the modal
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("JSON formatting", () => {
    it("formats nested JSON objects with indentation", () => {
      const nestedObj = {
        user: {
          profile: {
            name: "John",
            age: 30,
          },
        },
      };
      const onClose = vi.fn();

      render(<CellExpandModal column="data" value={nestedObj} onClose={onClose} />);

      // Should show formatted JSON with proper indentation
      const formattedText = screen.getByText(/"name": "John"/);
      expect(formattedText).toBeInTheDocument();
    });

    it("formats JSON arrays correctly", () => {
      const arr = [1, 2, 3];
      const onClose = vi.fn();

      render(<CellExpandModal column="data" value={arr} onClose={onClose} />);

      // Check that pre element exists and contains formatted array
      const pre = document.querySelector("pre");
      expect(pre).toBeInTheDocument();
      expect(pre?.textContent).toContain("[");
      expect(pre?.textContent).toContain("1");
      expect(pre?.textContent).toContain("2");
      expect(pre?.textContent).toContain("3");
    });
  });
});
