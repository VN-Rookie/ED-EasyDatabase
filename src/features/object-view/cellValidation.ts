/**
 * Validation helpers for cell values in the data grid.
 * Validates user input based on SQL column data types.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Data types that allow NULL/empty values
 */
const NULLABLE_TYPES = new Set([
  "text",
  "varchar",
  "char",
  "bpchar",
  "nvarchar",
  "uuid",
  "json",
  "jsonb",
  "xml",
  "bytea",
  "blob",
  "clob",
  "tinytext",
  "mediumtext",
  "longtext",
  "tinyblob",
  "mediumblob",
  "longblob",
  "geometry",
  "geography",
]);

/**
 * Numeric data types that require special validation
 */
const NUMERIC_TYPES = new Set([
  "int",
  "integer",
  "bigint",
  "smallint",
  "tinyint",
  "smallmoney",
  "money",
  "numeric",
  "decimal",
  "dec",
  "float",
  "real",
  "double",
  "precision",
  "serial",
  "bigserial",
  "smallserial",
]);

/**
 * Date/time data types
 */
const DATETIME_TYPES = new Set([
  "date",
  "time",
  "timestamp",
  "timestamptz",
  "timetz",
  "datetime",
  "datetime2",
  "smalldatetime",
  "datetimeoffset",
]);

/**
 * Boolean data type
 */
const BOOLEAN_TYPES = new Set(["bool", "boolean", "bit"]);

/**
 * Checks if a data type allows NULL/empty values
 */
function allowsNull(dataType: string): boolean {
  const normalized = dataType.toLowerCase().split("(")[0].trim();
  return NULLABLE_TYPES.has(normalized);
}

/**
 * Checks if a data type is numeric
 */
function isNumericType(dataType: string): boolean {
  const normalized = dataType.toLowerCase().split("(")[0].trim();
  return NUMERIC_TYPES.has(normalized);
}

/**
 * Checks if a data type is a date/time type
 */
function isDateTimeType(dataType: string): boolean {
  const normalized = dataType.toLowerCase().split("(")[0].trim();
  return DATETIME_TYPES.has(normalized);
}

/**
 * Checks if a data type is boolean
 */
function isBooleanType(dataType: string): boolean {
  const normalized = dataType.toLowerCase().split("(")[0].trim();
  return BOOLEAN_TYPES.has(normalized);
}

/**
 * Validates a numeric value
 */
function validateNumeric(value: string): ValidationResult {
  if (value === "") {
    return { valid: false, error: "Empty value not allowed for numeric columns" };
  }

  const num = Number(value);
  if (Number.isNaN(num)) {
    return { valid: false, error: "Invalid number format" };
  }

  if (!Number.isFinite(num)) {
    return { valid: false, error: "Number is out of range" };
  }

  return { valid: true };
}

/**
 * Validates a date/time value
 */
function validateDateTime(value: string): ValidationResult {
  if (value === "") {
    return { valid: false, error: "Empty value not allowed for date/time columns" };
  }

  // Try parsing as ISO date
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { valid: false, error: "Invalid date/time format" };
  }

  return { valid: true };
}

/**
 * Validates a boolean value
 */
function validateBoolean(value: string): ValidationResult {
  if (value === "") {
    return { valid: false, error: "Empty value not allowed for boolean columns" };
  }

  const normalized = value.toLowerCase();
  const validBooleans = ["true", "false", "1", "0", "yes", "no", "t", "f", "y", "n"];

  if (!validBooleans.includes(normalized)) {
    return { valid: false, error: "Invalid boolean value. Use: true, false, 1, 0, yes, no" };
  }

  return { valid: true };
}

/**
 * Main validation function for cell values.
 * Returns validation result with error message if invalid.
 *
 * @param value - The value to validate
 * @param dataType - The SQL data type of the column
 * @returns ValidationResult with valid=true if OK, or valid=false with error message
 */
export function validateCellValue(value: string, dataType: string): ValidationResult {
  // Empty string is allowed for nullable types
  if (value === "") {
    if (allowsNull(dataType)) {
      return { valid: true };
    }
    return { valid: false, error: "Empty value not allowed for this column type" };
  }

  // Validate based on data type
  if (isNumericType(dataType)) {
    return validateNumeric(value);
  }

  if (isDateTimeType(dataType)) {
    return validateDateTime(value);
  }

  if (isBooleanType(dataType)) {
    return validateBoolean(value);
  }

  // For text/varchar and other types, any value is acceptable
  return { valid: true };
}

/**
 * Gets a placeholder hint for the input based on data type
 */
export function getInputPlaceholder(dataType: string): string {
  if (isNumericType(dataType)) {
    return "0";
  }

  if (isBooleanType(dataType)) {
    return "true/false";
  }

  if (isDateTimeType(dataType)) {
    return "YYYY-MM-DD HH:mm:ss";
  }

  return "Enter value...";
}
