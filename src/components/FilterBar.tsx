import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, X, Filter, ChevronDown, Sparkles, Loader2, AlertCircle } from "lucide-react";
import type { FilterCondition } from "../stores/viewStore";

interface ColumnMeta { name: string; data_type?: string; }

interface Props {
  columns: string[];
  columnMeta?: ColumnMeta[];
  filters: FilterCondition[];
  onChange: (filters: FilterCondition[]) => void;
  onApply: () => void;
  // MongoDB mode
  isMongo?: boolean;
  mongoFilter?: string;
  onMongoFilterChange?: (f: string) => void;
  mongoProject?: string;
  onMongoProjectChange?: (p: string) => void;
  mongoSort?: string;
  onMongoSortChange?: (s: string) => void;
  mongoSkip?: number;
  onMongoSkipChange?: (s: number) => void;
  mongoLimit?: number;
  onMongoLimitChange?: (l: number) => void;
  hasActiveFilter?: boolean;
}

const SYNTAX_EXAMPLES = [
  '{ "status": "active" }',
  '{ "age": { "$gt": 18 } }',
  '{ "name": /pattern/i }',
];

const MONGO_OPERATORS = [
  { name: "$eq", desc: "Matches values that are equal" },
  { name: "$ne", desc: "Matches values that are not equal" },
  { name: "$gt", desc: "Matches values greater than specified" },
  { name: "$gte", desc: "Matches values greater/equal than specified" },
  { name: "$lt", desc: "Matches values less than specified" },
  { name: "$lte", desc: "Matches values less/equal than specified" },
  { name: "$in", desc: "Matches any values in array" },
  { name: "$nin", desc: "Matches none of values in array" },
  { name: "$exists", desc: "Matches documents with the field" },
  { name: "$regex", desc: "Matches values matching regex pattern" },
  { name: "$elemMatch", desc: "Matches documents where array elements match query" },
  { name: "$and", desc: "Logical AND" },
  { name: "$or", desc: "Logical OR" },
];

interface MongoSuggestion {
  name: string;
  type: "field" | "operator" | "value";
  detail?: string;
}

const OPERATORS = ["=", "!=", ">", ">=", "<", "<=", "LIKE", "ILIKE", "IS NULL", "IS NOT NULL"];
const NO_VALUE_OPS = new Set(["IS NULL", "IS NOT NULL"]);

function newFilter(column: string): FilterCondition {
  return { id: crypto.randomUUID(), column, operator: "=", value: "" };
}

interface AiFilterResult { column: string; operator: string; value: string; }

function isValidJson(s: string): boolean {
  if (!s.trim()) return true;
  try { JSON.parse(s); return true; } catch { return false; }
}

// ── Filter chip (UI-12) ───────────────────────────────────────────────────────

function FilterChip({ filter, columns, onUpdate, onRemove, onApply }: {
  filter: FilterCondition;
  columns: string[];
  onUpdate: (id: string, patch: Partial<FilterCondition>) => void;
  onRemove: (id: string) => void;
  onApply: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const label = NO_VALUE_OPS.has(filter.operator)
    ? `${filter.column} ${filter.operator}`
    : `${filter.column} ${filter.operator} ${filter.value || "…"}`;

  if (!expanded) {
    return (
      <span className="inline-flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[10px] rounded-full pl-2.5 pr-1 py-0.5 max-w-[180px]">
        <span className="truncate">{label}</span>
        <button onClick={() => setExpanded(true)} className="hover:bg-blue-500/20 rounded-full p-0.5 transition-colors">
          <ChevronDown size={9} />
        </button>
        <button onClick={() => onRemove(filter.id)} className="hover:bg-blue-500/20 rounded-full p-0.5 transition-colors">
          <X size={9} />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 bg-[#21262d] border border-[#30363d] rounded-xl px-2 py-1 flex-wrap">
      <select value={filter.column} onChange={e => onUpdate(filter.id, { column: e.target.value })}
        className="bg-transparent text-[10px] text-[#e6edf3] outline-none font-mono">
        {columns.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={filter.operator} onChange={e => onUpdate(filter.id, { operator: e.target.value })}
        className="bg-transparent text-[10px] text-[#7d8590] outline-none">
        {OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
      </select>
      {!NO_VALUE_OPS.has(filter.operator) && (
        <input value={filter.value} onChange={e => onUpdate(filter.id, { value: e.target.value })}
          onKeyDown={e => { if (e.key === "Enter") { setExpanded(false); onApply(); } }}
          placeholder="value"
          autoComplete="off"
          className="bg-transparent text-[10px] text-[#e6edf3] font-mono outline-none border-b border-white/[0.15] focus:border-blue-500/60 min-w-[60px] max-w-[100px]"
        />
      )}
      <button onClick={() => { setExpanded(false); onApply(); }}
        className="text-[9px] text-emerald-400 hover:text-emerald-300 font-medium px-1 transition-colors">✓</button>
      <button onClick={() => onRemove(filter.id)}
        className="text-[#7d8590] hover:text-rose-400 transition-colors"><X size={9} /></button>
    </span>
  );
}

// ── Main FilterBar ────────────────────────────────────────────────────────────

export function FilterBar({
  columns,
  columnMeta,
  filters,
  onChange,
  onApply,
  isMongo,
  mongoFilter = "",
  onMongoFilterChange,
  mongoProject = "",
  onMongoProjectChange,
  mongoSort = "",
  onMongoSortChange,
  mongoSkip = 0,
  onMongoSkipChange,
  mongoLimit = 0,
  onMongoLimitChange,
  hasActiveFilter: _hasActiveFilter
}: Props) {
  const [open, setOpen] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const mqlInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Build field list for suggestions from columnMeta if available, else columns
  const fieldSuggestions: ColumnMeta[] = columnMeta && columnMeta.length > 0
    ? columnMeta
    : columns.map(c => ({ name: c }));

  // Close suggestions on outside click
  useEffect(() => {
    if (!showSuggestions) return;
    function handleMouseDown(e: MouseEvent) {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        mqlInputRef.current && !mqlInputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showSuggestions]);

  const add    = () => { if (!columns.length) return; onChange([...filters, newFilter(columns[0])]); };
  const remove = (id: string) => onChange(filters.filter(f => f.id !== id));
  const update = (id: string, patch: Partial<FilterCondition>) =>
    onChange(filters.map(f => f.id === id ? { ...f, ...patch } : f));
  const clear  = () => {
    onChange([]);
    onMongoFilterChange?.("");
    onMongoProjectChange?.("");
    onMongoSortChange?.("");
    onMongoSkipChange?.(0);
    onMongoLimitChange?.(0);
    setAiPrompt("");
  };

  const handleSelectMongoSuggestion = (item: MongoSuggestion) => {
    const input = mqlInputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? 0;
    const val = mongoFilter;

    const lastWordMatch = val.slice(0, start).match(/[\$a-zA-Z0-9_]*$/);
    const activeToken = lastWordMatch ? lastWordMatch[0] : "";

    let tokenStart = start - activeToken.length;
    if (tokenStart > 0 && (val[tokenStart - 1] === '"' || val[tokenStart - 1] === "'")) {
      tokenStart -= 1;
    }

    let insertText = "";
    if (item.type === "field") {
      insertText = `"${item.name}": `;
    } else if (item.type === "operator") {
      insertText = `"${item.name}": `;
    } else {
      insertText = `${item.name}`;
    }

    const newVal = val.slice(0, tokenStart) + insertText + val.slice(start);
    onMongoFilterChange?.(newVal);

    setShowSuggestions(false);
    setTimeout(() => {
      input.focus();
      const newPos = tokenStart + insertText.length;
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleAi = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true); setAiError(null);
    try {
      if (isMongo) {
        const meta = columnMeta ?? columns.map(c => ({ name: c }));
        const raw = await invoke<string>("generate_filters", {
          prompt: aiPrompt.trim() + " — output MongoDB Query Language JSON object only",
          columnsJson: JSON.stringify(meta),
        });
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) { onMongoFilterChange?.(match[0]); setAiPrompt(""); }
        else setAiError("AI didn't return valid MongoDB filter syntax.");
      } else {
        const meta = columnMeta ?? columns.map(c => ({ name: c }));
        const raw = await invoke<string>("generate_filters", { prompt: aiPrompt.trim(), columnsJson: JSON.stringify(meta) });
        const parsed: AiFilterResult[] = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.length) { setAiError("No filters inferred."); return; }
        const valid = parsed.filter(f => columns.includes(f.column));
        if (!valid.length) { setAiError("AI returned unknown columns."); return; }
        onChange([...filters, ...valid.map(f => ({
          id: crypto.randomUUID(),
          column: f.column,
          operator: OPERATORS.includes(f.operator) ? f.operator : "=",
          value: f.value ?? "",
        }))]);
        setAiPrompt("");
      }
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiLoading(false);
    }
  };

  const handleBracketAutoClose = (
    e: React.KeyboardEvent<HTMLInputElement>,
    setter?: (s: string) => void
  ) => {
    const input = e.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const val = input.value;

    let closingChar = "";
    if (e.key === "{") closingChar = "}";
    else if (e.key === "[") closingChar = "]";
    else if (e.key === "(") closingChar = ")";
    else if (e.key === '"') closingChar = '"';
    else if (e.key === "'") closingChar = "'";

    if (closingChar) {
      e.preventDefault();
      const newVal = val.slice(0, start) + e.key + closingChar + val.slice(end);
      setter?.(newVal);
      setTimeout(() => {
        input.setSelectionRange(start + 1, start + 1);
      }, 0);
    }
  };

  const mongoJsonValid  = isValidJson(mongoFilter);
  const projectValid = isValidJson(mongoProject);
  const sortValid = isValidJson(mongoSort);
  const canApply = mongoJsonValid && projectValid && sortValid;

  const hasMongoFilter  = (mongoFilter.trim() !== "" && mongoFilter.trim() !== "{}") ||
                         (mongoProject.trim() !== "") ||
                         (mongoSort.trim() !== "") ||
                         (mongoSkip > 0) ||
                         (mongoLimit > 0);

  const hasFilters = isMongo ? hasMongoFilter : filters.length > 0;

  const formatJsonFields = () => {
    const formatField = (val: string, setter?: (s: string) => void) => {
      if (!val.trim()) return;
      try {
        const parsed = JSON.parse(val);
        setter?.(JSON.stringify(parsed, null, 2));
      } catch {}
    };
    formatField(mongoFilter, onMongoFilterChange);
    formatField(mongoProject, onMongoProjectChange);
    formatField(mongoSort, onMongoSortChange);
  };

  // Calculate smart suggestions
  const cursorPosition = mqlInputRef.current?.selectionStart ?? 0;
  const textBeforeCursor = mongoFilter.slice(0, cursorPosition);
  const trimmedBefore = textBeforeCursor.trimEnd();
  const lastChar = trimmedBefore.length > 0 ? trimmedBefore[trimmedBefore.length - 1] : "";
  
  let openBraces = 0;
  for (let i = 0; i < textBeforeCursor.length; i++) {
    if (textBeforeCursor[i] === "{") openBraces++;
    else if (textBeforeCursor[i] === "}") openBraces--;
  }

  const lastWordMatch = textBeforeCursor.match(/[\$a-zA-Z0-9_]*$/);
  const activeToken = lastWordMatch ? lastWordMatch[0].toLowerCase() : "";

  let filteredSuggestions: MongoSuggestion[] = [];
  if (lastChar === ":") {
    filteredSuggestions = [
      { name: "true", type: "value" as const, detail: "boolean true" },
      { name: "false", type: "value" as const, detail: "boolean false" },
      { name: "null", type: "value" as const, detail: "null value" },
    ].filter(item => item.name.includes(activeToken));
  } else {
    const fieldItems: MongoSuggestion[] = fieldSuggestions.map(f => ({
      name: f.name,
      type: "field" as const,
      detail: f.data_type
    }));

    const opItems: MongoSuggestion[] = MONGO_OPERATORS.map(op => ({
      name: op.name,
      type: "operator" as const,
      detail: op.desc
    }));

    if (openBraces > 1 || activeToken.startsWith("$")) {
      filteredSuggestions = [...opItems, ...fieldItems].filter(item => item.name.toLowerCase().includes(activeToken));
    } else {
      filteredSuggestions = fieldItems.filter(item => item.name.toLowerCase().includes(activeToken));
    }
  }

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [filteredSuggestions.length]);

  // ── MongoDB mode ──────────────────────────────────────────────────────────
  if (isMongo) {
    return (
      <div className="shrink-0 border-b border-border bg-surface/40">
        <div className="flex flex-col gap-2 p-3">
          {/* Top Row: Filter Input + Buttons */}
          <div className="flex items-center gap-2">
            <Filter size={12} className={hasMongoFilter ? "text-blue-400 shrink-0" : "text-muted/60 shrink-0"} />
  
            {/* MQL input */}
            <div className="relative flex-1 min-w-0">
              <input
                ref={mqlInputRef}
                value={mongoFilter}
                onChange={e => {
                  onMongoFilterChange?.(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => { setShowSuggestions(true); setInputFocused(true); }}
                onBlur={() => setInputFocused(false)}
                onKeyDown={e => {
                  if (showSuggestions && filteredSuggestions.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveSuggestionIndex(prev => (prev + 1) % filteredSuggestions.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveSuggestionIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      handleSelectMongoSuggestion(filteredSuggestions[activeSuggestionIndex]);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setShowSuggestions(false);
                      return;
                    }
                  } else {
                    if (e.key === "Enter" && canApply) {
                      onApply();
                      return;
                    }
                    if (e.key === "Escape") {
                      setShowSuggestions(false);
                      return;
                    }
                  }
                  handleBracketAutoClose(e, onMongoFilterChange);
                }}
                placeholder='Filter: { "field": "value", "age": { "$gt": 18 } }'
                spellCheck={false}
                autoComplete="off"
                className={`w-full bg-elevated border rounded-xl px-3 py-1.5 text-[11px] font-mono text-fg placeholder:text-muted/60 outline-none transition-all ${
                  mongoFilter && !mongoJsonValid
                    ? "border-rose-500/40 focus:border-rose-500"
                    : mongoFilter.trim() !== "" && mongoFilter.trim() !== "{}"
                      ? "border-blue-500/35 focus:border-blue-500/60"
                      : "border-border hover:border-muted focus:border-accent/50"
                }`}
              />
              {mongoFilter && !mongoJsonValid && (
                <AlertCircle size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rose-400 pointer-events-none" />
              )}
  
              {/* Smart suggestions dropdown */}
              {showSuggestions && filteredSuggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute left-0 top-full mt-1 w-full bg-elevated border border-border rounded-xl shadow-xl z-20 max-h-48 overflow-auto"
                >
                  {filteredSuggestions.map((item, index) => (
                    <button
                      key={item.name}
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault();
                        handleSelectMongoSuggestion(item);
                      }}
                      className={`w-full text-left px-3 py-1.5 cursor-pointer text-[11px] flex items-center gap-2 transition-all ${
                        index === activeSuggestionIndex
                          ? "bg-hover/80 border-l-2 border-blue-500 text-blue-400 font-medium pl-2.5"
                          : "hover:bg-hover/40 text-fg/90"
                      }`}
                    >
                      <span className={`font-mono ${item.type === "operator" ? "text-amber-400" : item.type === "value" ? "text-violet-400" : ""}`}>
                        {item.name}
                      </span>
                      {item.detail && (
                        <span className="text-muted text-[10px] ml-auto shrink-0">{item.detail}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
  
              {/* Syntax hints — shown below input when focused and empty */}
              {inputFocused && !mongoFilter && (
                <div className="absolute left-0 top-full mt-1 w-full z-20 flex flex-wrap gap-1 px-1">
                  {SYNTAX_EXAMPLES.map(ex => (
                    <button
                      key={ex}
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault();
                        onMongoFilterChange?.(ex);
                        setShowSuggestions(false);
                        mqlInputRef.current?.focus();
                      }}
                      className="text-[10px] font-mono text-muted hover:text-fg bg-elevated border border-border rounded px-1.5 py-0.5 transition-colors cursor-pointer"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Options Toggle */}
            <button
              onClick={() => setShowOptions(!showOptions)}
              className={`flex items-center gap-1 text-[10px] px-2 py-1.5 rounded-xl border transition-all cursor-pointer ${
                showOptions
                  ? "bg-hover text-fg border-border"
                  : "text-muted hover:bg-hover hover:text-fg border-transparent"
              }`}
            >
              <span>Options</span>
              <ChevronDown size={10} className={`transition-transform duration-200 ${showOptions ? "rotate-180" : ""}`} />
            </button>
  
            {/* AI prompt */}
            <div className="flex items-center gap-1 shrink-0">
              <Sparkles size={10} className="text-violet-500 shrink-0" />
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleAi(); }}
                placeholder="Ask AI…"
                autoComplete="off"
                className="bg-elevated border border-border hover:border-muted focus:border-violet-500/50 rounded-xl px-2 py-1 text-[10px] text-fg placeholder:text-muted/60 outline-none transition-all w-28"
              />
              <button onClick={handleAi} disabled={aiLoading || !aiPrompt.trim()}
                className="p-1 rounded-lg text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 disabled:opacity-40 transition-all">
                {aiLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              </button>
            </div>
  
            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {canApply && hasMongoFilter && (
                <button
                  onClick={formatJsonFields}
                  className="text-[10px] text-muted hover:text-fg px-2 py-1 rounded-lg hover:bg-hover transition-all"
                >
                  Beautify
                </button>
              )}
              {hasMongoFilter && (
                <>
                  <button onClick={() => canApply && onApply()} disabled={!canApply}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold px-2.5 py-1 rounded-lg hover:bg-emerald-500/10 disabled:opacity-40 transition-all shrink-0">
                    Find
                  </button>
                  <button onClick={clear}
                    className="text-[10px] text-muted hover:text-fg px-2 py-1 rounded-lg hover:bg-hover transition-all shrink-0">
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bottom Row (Advanced Options Panel) */}
          {showOptions && (
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border/40 mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
              {/* Project */}
              <div className="flex flex-col gap-1 col-span-1">
                <span className="text-[9px] font-semibold text-muted/80 uppercase tracking-wider">Project</span>
                <input
                  value={mongoProject}
                  onChange={e => onMongoProjectChange?.(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && canApply) onApply();
                    handleBracketAutoClose(e, onMongoProjectChange);
                  }}
                  placeholder='{ "field": 1, "_id": 0 }'
                  spellCheck={false}
                  autoComplete="off"
                  className={`bg-elevated border rounded-xl px-2.5 py-1 text-[11px] font-mono text-fg placeholder:text-muted/60 outline-none transition-all ${
                    mongoProject && !projectValid ? "border-rose-500/40 focus:border-rose-500" : "border-border focus:border-accent/40"
                  }`}
                />
              </div>

              {/* Sort */}
              <div className="flex flex-col gap-1 col-span-1">
                <span className="text-[9px] font-semibold text-muted/80 uppercase tracking-wider">Sort</span>
                <input
                  value={mongoSort}
                  onChange={e => onMongoSortChange?.(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && canApply) onApply();
                    handleBracketAutoClose(e, onMongoSortChange);
                  }}
                  placeholder='{ "age": -1 }'
                  spellCheck={false}
                  autoComplete="off"
                  className={`bg-elevated border rounded-xl px-2.5 py-1 text-[11px] font-mono text-fg placeholder:text-muted/60 outline-none transition-all ${
                    mongoSort && !sortValid ? "border-rose-500/40 focus:border-rose-500" : "border-border focus:border-accent/40"
                  }`}
                />
              </div>

              {/* Skip */}
              <div className="flex flex-col gap-1 col-span-1">
                <span className="text-[9px] font-semibold text-muted/80 uppercase tracking-wider">Skip</span>
                <input
                  type="number"
                  min={0}
                  value={mongoSkip || ""}
                  onChange={e => onMongoSkipChange?.(parseInt(e.target.value) || 0)}
                  onKeyDown={e => { if (e.key === "Enter" && canApply) onApply(); }}
                  placeholder="0"
                  autoComplete="off"
                  className="bg-elevated border border-border rounded-xl px-2.5 py-1 text-[11px] font-mono text-fg placeholder:text-muted/60 outline-none transition-all focus:border-accent/40"
                />
              </div>

              {/* Limit */}
              <div className="flex flex-col gap-1 col-span-1">
                <span className="text-[9px] font-semibold text-muted/80 uppercase tracking-wider">Limit</span>
                <input
                  type="number"
                  min={0}
                  value={mongoLimit || ""}
                  onChange={e => onMongoLimitChange?.(parseInt(e.target.value) || 0)}
                  onKeyDown={e => { if (e.key === "Enter" && canApply) onApply(); }}
                  placeholder="Defaults to page size"
                  autoComplete="off"
                  className="bg-elevated border border-border rounded-xl px-2.5 py-1 text-[11px] font-mono text-fg placeholder:text-muted/60 outline-none transition-all focus:border-accent/40"
                />
              </div>
            </div>
          )}
        </div>
        {aiError && (
          <div className="mx-3 mb-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between">
            <span className="text-[10px] text-rose-400">{aiError}</span>
            <button onClick={() => setAiError(null)} className="text-rose-600 hover:text-rose-400"><X size={10} /></button>
          </div>
        )}
      </div>
    );
  }
 
  // ── SQL mode (Postgres / MySQL) — chips style (UI-12) ─────────────────────
  return (
    <div className="shrink-0 border-b border-border bg-surface/40">
      <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap">
 
        {/* Filter toggle */}
        <button onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-1.5 text-[10px] rounded-xl px-2 py-1 transition-all shrink-0 ${
            filters.length > 0
              ? "text-blue-300 bg-blue-500/10 border border-blue-500/20"
              : "text-muted hover:text-fg hover:bg-hover border border-transparent"
          }`}>
          <Filter size={9} />
          {filters.length > 0 ? `${filters.length}` : "Filter"}
          <ChevronDown size={9} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
 
        {/* Active filter chips (UI-12) */}
        {filters.map(f => (
          <FilterChip key={f.id} filter={f} columns={columns}
            onUpdate={update} onRemove={id => { remove(id); if (filters.length <= 1) onApply(); }}
            onApply={onApply} />
        ))}
 
        {/* AI input */}
        <div className="flex items-center gap-1 flex-1 min-w-[160px]">
          <div className="relative flex-1 min-w-0">
            <Sparkles size={9} className="absolute left-2 top-1/2 -translate-y-1/2 text-violet-500 pointer-events-none" />
            <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAi(); }}
              placeholder={'Ask AI to filter… e.g. "email contains gmail"'}
              autoComplete="off"
              className="w-full bg-elevated border border-border/60 hover:border-muted focus:border-violet-500/50 rounded-xl pl-5.5 pr-2 py-1 text-[10px] text-fg placeholder:text-muted/60 outline-none transition-all"
            />
          </div>
          <button onClick={handleAi} disabled={aiLoading || !aiPrompt.trim() || !columns.length}
            className="shrink-0 flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 disabled:opacity-40 rounded-xl px-2 py-1 transition-all">
            {aiLoading ? <Loader2 size={9} className="animate-spin" /> : <Sparkles size={9} />}
            {aiLoading ? "…" : "Filter"}
          </button>
        </div>
 
        {/* Action buttons */}
        {hasFilters && (
          <>
            <button onClick={onApply}
              className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold px-2 py-1 rounded-xl hover:bg-emerald-500/10 transition-all shrink-0">
              Apply
            </button>
            <button onClick={clear}
              className="text-[10px] text-muted hover:text-fg px-1.5 py-1 rounded-xl hover:bg-hover transition-all shrink-0">
              Clear
            </button>
          </>
        )}
 
        <button onClick={add} disabled={!columns.length}
          className="shrink-0 flex items-center gap-1 text-[10px] text-muted hover:text-fg px-2 py-1 rounded-xl hover:bg-hover transition-all disabled:opacity-30 border border-transparent hover:border-border/60">
          <Plus size={9} /> Add
        </button>
      </div>
 
      {/* Expanded filter editor (when no chips clicked) */}
      {open && filters.length > 0 && false && (
        <div className="px-3 pb-3 space-y-1.5">
          <button onClick={onApply}
            className="text-[10px] font-semibold text-emerald-400 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 transition-all">
            Apply filters
          </button>
        </div>
      )}
 
      {aiError && (
        <div className="mx-3 mb-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between">
          <span className="text-[10px] text-rose-400">{aiError}</span>
          <button onClick={() => setAiError(null)} className="text-rose-600 hover:text-rose-400"><X size={10} /></button>
        </div>
      )}
    </div>
  );
}
