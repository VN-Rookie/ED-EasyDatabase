import { useState, useEffect } from "react";
import { X, Upload, Check, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "../../shared/ui/Button";
import { Select } from "../../shared/ui/Select";
import { open as nativeOpen } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { importCsvData, importJsonData, describeTable } from "./objectApi";
import { useToast } from "../../components/Toast";
import type { ColumnInfo } from "../../shared/types";

interface Props {
  connId: string;
  table: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportModal({ connId, table, onClose, onSuccess }: Props) {
  const [importSource, setImportSource] = useState<"file" | "direct">("file");
  const [directContent, setDirectContent] = useState("");

  const [filePath, setFilePath] = useState("");
  const [fileType, setFileType] = useState<"csv" | "json">("csv");
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [dbColumns, setDbColumns] = useState<ColumnInfo[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({}); // DB Column -> File Header
  
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  // Load DB columns on mount
  useEffect(() => {
    setLoadingSchema(true);
    describeTable(connId, table)
      .then((cols) => {
        setDbColumns(cols);
        // Initialize empty mappings
        const initMap: Record<string, string> = {};
        cols.forEach((c) => {
          initMap[c.name] = "";
        });
        setMappings(initMap);
      })
      .catch((e) => setError(`Failed to load table structure: ${e}`))
      .finally(() => setLoadingSchema(false));
  }, [connId, table]);

  // Handle select file
  const handleSelectFile = async () => {
    try {
      const selected = await nativeOpen({
        multiple: false,
        filters: [
          { name: "Data Files", extensions: ["csv", "json"] },
          { name: "CSV Files", extensions: ["csv"] },
          { name: "JSON Files", extensions: ["json"] },
        ],
      });

      if (selected && typeof selected === "string") {
        setFilePath(selected);
        const ext = selected.split(".").pop()?.toLowerCase();
        const type = ext === "json" ? "json" : "csv";
        setFileType(type);
        setError("");

        // Fetch headers/keys from file to configure mapping
        if (type === "csv") {
          const headers = await invoke<string[]>("get_csv_headers", { filePath: selected });
          setFileHeaders(headers);
          autoMap(headers);
        } else {
          const keys = await invoke<string[]>("get_json_keys", { filePath: selected });
          setFileHeaders(keys);
          autoMap(keys);
        }
      }
    } catch (e) {
      setError(`Failed to read file headers: ${e}`);
    }
  };

  const handleParseDirectContent = async (content: string, type: "csv" | "json") => {
    if (!content.trim()) {
      setFileHeaders([]);
      return;
    }
    try {
      setError("");
      let headers: string[] = [];
      if (type === "csv") {
        headers = await invoke<string[]>("get_csv_headers_from_string", { content });
      } else {
        headers = await invoke<string[]>("get_json_keys_from_string", { content });
      }
      setFileHeaders(headers);
      autoMap(headers);
    } catch (e) {
      setError(`Failed to parse data headers: ${e}`);
    }
  };

  // Auto-map matching names (case-insensitive)
  const autoMap = (headers: string[]) => {
    setMappings((prev) => {
      const next = { ...prev };
      dbColumns.forEach((col) => {
        const match = headers.find((h) => h.toLowerCase() === col.name.toLowerCase());
        if (match) {
          next[col.name] = match;
        }
      });
      return next;
    });
  };

  const handleMapChange = (dbCol: string, fileCol: string) => {
    setMappings((prev) => ({ ...prev, [dbCol]: fileCol }));
  };

  const handleImport = async () => {
    if (importSource === "file" && !filePath) return;
    if (importSource === "direct" && !directContent.trim()) return;

    setImporting(true);
    setError("");

    // Filter out columns with no mapping configured
    const activeMappings: Record<string, string> = {};
    Object.keys(mappings).forEach((k) => {
      if (mappings[k]) {
        activeMappings[k] = mappings[k];
      }
    });

    if (Object.keys(activeMappings).length === 0) {
      setError("Please map at least one column to import data");
      setImporting(false);
      return;
    }

    try {
      if (importSource === "file") {
        if (fileType === "csv") {
          await importCsvData(connId, table, filePath, activeMappings);
        } else {
          await importJsonData(connId, table, filePath, activeMappings);
        }
      } else {
        if (fileType === "csv") {
          await invoke("import_raw_csv_data", { connId, table, content: directContent, mapping: activeMappings });
        } else {
          await invoke("import_raw_json_data", { connId, table, content: directContent, mapping: activeMappings });
        }
      }

      toast("Data imported successfully!", "success");
      onSuccess();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  };

  const labelCls = "block text-xs font-medium text-muted mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] anim-fade">
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-lg anim-pop w-[480px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-fg">Import Data to "{table}"</span>
          <button onClick={onClose} className="text-muted hover:text-fg transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-danger/10 border border-danger/20 rounded-[var(--radius-md)] flex gap-2 text-xs text-danger">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Source Toggle */}
          <div className="flex border-b border-border mb-3 shrink-0">
            <button
              onClick={() => {
                setImportSource("file");
                setError("");
                setFileHeaders([]);
                setFilePath("");
              }}
              className={`flex-1 pb-2 text-center text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                importSource === "file" ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              Import File
            </button>
            <button
              onClick={() => {
                setImportSource("direct");
                setError("");
                setFileHeaders([]);
                handleParseDirectContent(directContent, fileType);
              }}
              className={`flex-1 pb-2 text-center text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                importSource === "direct" ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              Paste Direct Data
            </button>
          </div>

          {/* Step 1: Input source */}
          {importSource === "file" ? (
            <div className="space-y-1.5">
              <label className={labelCls}>Source File</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={filePath}
                  placeholder="Click Select File to browse..."
                  className="flex-1 bg-elevated border border-border rounded-[var(--radius-md)] px-3 py-1.5 text-xs text-fg placeholder:text-faint outline-none"
                />
                <Button variant="subtle" size="sm" onClick={handleSelectFile} disabled={importing}>
                  <Upload size={12} className="mr-1" />
                  Select File
                </Button>
              </div>
              {filePath && (
                <span className="text-[10px] text-muted">
                  Detected: <b className="uppercase">{fileType}</b> format
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <label className={labelCls}>Format</label>
                  <Select
                    value={fileType}
                    onChange={(e) => {
                      const newType = e.target.value as "csv" | "json";
                      setFileType(newType);
                      handleParseDirectContent(directContent, newType);
                    }}
                    className="h-8 text-xs w-28"
                  >
                    <option value="csv">CSV</option>
                    <option value="json">JSON</option>
                  </Select>
                </div>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => handleParseDirectContent(directContent, fileType)}
                  disabled={!directContent.trim() || importing}
                  className="mt-4"
                >
                  Parse Headers
                </Button>
              </div>

              <div className="space-y-1">
                <label className={labelCls}>Data Content</label>
                <textarea
                  value={directContent}
                  onChange={(e) => setDirectContent(e.target.value)}
                  onBlur={() => handleParseDirectContent(directContent, fileType)}
                  placeholder={
                    fileType === "csv"
                      ? "id,name,email\n1,John,john@example.com\n2,Jane,jane@example.com"
                      : '[\n  { "id": 1, "name": "John", "email": "john@example.com" }\n]'
                  }
                  className="w-full h-32 bg-elevated border border-border rounded-[var(--radius-md)] p-2.5 text-xs text-fg font-mono placeholder:text-faint outline-none resize-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {/* Step 2: Columns Mapping */}
          {((importSource === "file" && filePath) || (importSource === "direct" && fileHeaders.length > 0)) && (
            <div className="space-y-2">
              <label className={labelCls}>Configure Column Mapping</label>
              {loadingSchema ? (
                <div className="flex items-center gap-1.5 py-4 text-xs text-muted">
                  <Loader2 size={12} className="animate-spin" /> Loading schema...
                </div>
              ) : (
                <div className="border border-border rounded-[var(--radius-md)] bg-elevated max-h-[220px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-surface text-muted sticky top-0">
                        <th className="p-2 font-medium">Database Column</th>
                        <th className="p-2 font-medium">Source File Column/Key</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dbColumns.map((col) => (
                        <tr key={col.name} className="border-b border-border/40 hover:bg-hover last:border-b-0">
                          <td className="p-2 font-mono text-[11px] text-fg">
                            {col.name}
                            {col.is_pk && <span className="ml-1 text-[9px] text-accent font-sans bg-accent/10 px-1 py-0.2 rounded">PK</span>}
                          </td>
                          <td className="p-1">
                            <Select
                              value={mappings[col.name] || ""}
                              onChange={(e) => handleMapChange(col.name, e.target.value)}
                              className="w-full h-7 text-[11px]"
                            >
                              <option value="">-- Skip Column --</option>
                              {fileHeaders.map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleImport}
            disabled={importing || (importSource === "file" ? !filePath : (!directContent.trim() || fileHeaders.length === 0))}
          >
            {importing ? (
              <>
                <Loader2 size={12} className="animate-spin mr-1" />
                Importing...
              </>
            ) : (
              <>
                <Check size={12} className="mr-1" />
                Start Import
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
