import { useState, useEffect, useCallback } from "react";
import { Select } from "../../shared/ui/Select";

interface FkDropdownProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  error?: string | null;
  disabled?: boolean;
}

const MAX_CELL_LEN = 80;

/**
 * A specialized dropdown component for foreign key selection.
 * - Supports null values with a placeholder option
 * - Handles keyboard navigation (Enter to confirm, Escape to cancel)
 * - Shows truncated labels for long display values
 */
export function FkDropdown({
  value,
  options,
  onChange,
  onKeyDown,
  onBlur,
  autoFocus = false,
  error = null,
  disabled = false,
}: FkDropdownProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      onChange(newValue);
    },
    [onChange]
  );

  return (
    <div className="w-full">
      <Select
        value={localValue}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        autoFocus={autoFocus}
        disabled={disabled}
        className={error ? "border-danger focus:border-danger" : ""}
      >
        <option value="">-- null --</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label.length > MAX_CELL_LEN
              ? `${opt.label.slice(0, MAX_CELL_LEN)}...`
              : opt.label}
          </option>
        ))}
      </Select>
      {error && <span className="text-[10px] text-danger mt-0.5 block">{error}</span>}
    </div>
  );
}
