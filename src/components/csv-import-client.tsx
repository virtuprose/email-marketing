"use client";

import { AlertCircle, ArrowRight, ClipboardPaste, Download, FileUp, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { FIELD_DEFINITIONS, guessMapping, type ImportMapping } from "@/lib/imports";

type PreviewRow = Record<string, string>;
type ImportMode = "csv" | "paste";
type PreviewStatus = "IMPORTED" | "FLAGGED" | "DUPLICATE" | "INVALID" | "SUPPRESSED";

type ImportPreviewResponse = {
  headers: string[];
  totalRows: number;
  counters: {
    importedRows: number;
    invalidRows: number;
    duplicateRows: number;
    suppressedRows: number;
    flaggedRows: number;
  };
  rows: Array<{
    rowNumber: number;
    email: string;
    phoneE164: string | null;
    status: PreviewStatus;
    issues: string[];
    values: Record<string, string>;
  }>;
  mapping: Partial<ImportMapping>;
};

const importStatusLabels: Record<PreviewStatus, string> = {
  IMPORTED: "Accepted",
  FLAGGED: "Accepted with flags",
  DUPLICATE: "Duplicate",
  INVALID: "Invalid",
  SUPPRESSED: "Suppressed"
};

const recommendedColumns = [
  {
    column: "email",
    required: "Required",
    format: "name@company.com",
    example: "carlos@example.com"
  },
  {
    column: "first_name",
    required: "Recommended",
    format: "Text",
    example: "Carlos"
  },
  {
    column: "last_name",
    required: "Optional",
    format: "Text",
    example: "Alvarez"
  },
  {
    column: "company",
    required: "Recommended",
    format: "Text",
    example: "Example Co"
  },
  {
    column: "website",
    required: "Optional",
    format: "Website URL",
    example: "https://example.com"
  },
  {
    column: "role",
    required: "Optional",
    format: "Job title",
    example: "Founder"
  },
  {
    column: "country",
    required: "Recommended",
    format: "Country name",
    example: "Kuwait"
  },
  {
    column: "source",
    required: "Recommended",
    format: "Where you got the lead",
    example: "LinkedIn"
  },
  {
    column: "permission_reason",
    required: "Recommended",
    format: "Why contact is allowed",
    example: "Business outreach"
  },
  {
    column: "phone",
    required: "For WhatsApp",
    format: "Full number with country code",
    example: "+96569984942"
  },
  {
    column: "whatsapp_opt_in",
    required: "For WhatsApp",
    format: "yes, true, 1, or allowed",
    example: "yes"
  },
  {
    column: "whatsapp_permission_source",
    required: "For WhatsApp",
    format: "Where permission came from",
    example: "Client gave number"
  },
  {
    column: "tags",
    required: "Optional",
    format: "Separate with comma or semicolon",
    example: "ai-agent, kuwait"
  }
];

const sampleCsv = `email,first_name,last_name,company,website,role,country,source,permission_reason,phone,whatsapp_opt_in,whatsapp_permission_source,tags
carlos@example.com,Carlos,Alvarez,Example Co,https://example.com,Founder,Kuwait,LinkedIn,Business outreach,+96569984942,yes,Client gave number,"ai-agent, kuwait"`;

const samplePaste = `email\tfirst_name\tcompany\tcountry\tsource\tpermission_reason\tphone
carlos@example.com\tCarlos\tExample Co\tKuwait\tLinkedIn\tBusiness outreach\t+96569984942`;

export function CsvImportClient() {
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode>("csv");
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [mapping, setMapping] = useState<Partial<ImportMapping>>({});
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requiredMissing = useMemo(() => !mapping.email, [mapping.email]);
  const activeFile = mode === "paste" ? pastedFile : file;

  function switchMode(nextMode: ImportMode) {
    setMode(nextMode);
    setError("");
    setPreview(null);
  }

  function handleFile(nextFile: File | null) {
    setError("");
    setFile(nextFile);
    setPastedFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setPreview(null);

    if (!nextFile) return;

    Papa.parse<PreviewRow>(nextFile, {
      header: true,
      skipEmptyLines: true,
      preview: 12,
      transformHeader: (header) => header.trim(),
      complete: (result) => {
        const parsedHeaders = (result.meta.fields ?? []).filter(Boolean);
        setHeaders(parsedHeaders);
        setRows(result.data);
        setMapping(guessMapping(parsedHeaders));
      },
      error: (parseError) => {
        setError(parseError.message);
      }
    });
  }

  function handlePasteText(value: string) {
    setPasteText(value);
    setPastedFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setPreview(null);
    setError("");
  }

  async function checkRows() {
    setIsChecking(true);
    setError("");

    const source = await currentImportSource();
    if (!source) {
      setIsChecking(false);
      return;
    }

    const nextMapping = Object.keys(mapping).length ? mapping : guessMapping(source.headers);
    setMapping(nextMapping);

    if (!nextMapping.email) {
      setError("Map an email column before checking.");
      setIsChecking(false);
      return;
    }

    const response = await fetch("/api/imports/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: source.text, mapping: nextMapping })
    });

    const payload = (await response.json().catch(() => null)) as
      | (ImportPreviewResponse & { error?: string })
      | null;

    if (!response.ok || !payload) {
      setError(payload?.error ?? "Could not check these rows. Confirm the first row has column titles.");
      setIsChecking(false);
      return;
    }

    setPreview(payload);
    setHeaders(payload.headers);
    setRows(
      payload.rows.map((row) =>
        payload.headers.reduce<PreviewRow>((next, header) => {
          next[header] = String(row.values[header] ?? "");
          return next;
        }, {})
      )
    );
    setIsChecking(false);
  }

  async function submitImport() {
    if (requiredMissing) return;
    setIsSubmitting(true);
    setError("");

    const source = await currentImportSource();
    if (!source?.file) {
      setIsSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.set("file", source.file);
    formData.set("mapping", JSON.stringify(mapping));

    const response = await fetch("/api/imports", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Import failed. Check the rows and mapping.");
      setIsSubmitting(false);
      return;
    }

    const payload = (await response.json()) as { id: string };
    router.push(`/leads/import/${payload.id}`);
  }

  async function currentImportSource() {
    if (mode === "csv") {
      if (!file) {
        setError("Choose a CSV file first.");
        return null;
      }
      const text = await file.text();
      return { file, text, headers };
    }

    const parsed = parsePastedSpreadsheet(pasteText);
    if (!parsed.ok) {
      setError(parsed.error);
      return null;
    }

    const nextFile = new File([parsed.csvText], "pasted-leads.csv", { type: "text/csv" });
    setPastedFile(nextFile);
    setHeaders(parsed.headers);
    setRows(parsed.rows.slice(0, 12));
    if (!Object.keys(mapping).length) setMapping(guessMapping(parsed.headers));
    return { file: nextFile, text: parsed.csvText, headers: parsed.headers };
  }

  function updateMapping(key: keyof ImportMapping, value: string) {
    setMapping((current) => ({
      ...current,
      [key]: value || undefined
    }));
    setPreview(null);
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Lead import format</h2>
            <p className="muted">
              Upload a CSV or paste rows copied from Excel. Keep the first row as column titles.
            </p>
          </div>
          <a
            className="secondary-button"
            href="/examples/virtuprose-leads-example.csv"
            download="virtuprose-leads-example.csv"
          >
            <Download size={16} aria-hidden="true" /> Download example CSV
          </a>
        </div>
        <div className="panel-body stack">
          <div className="csv-guide-grid">
            <div className="alert success-alert">
              <strong>Minimum needed</strong>
              <br />
              Add at least <strong>email</strong>. For better AI scoring, also add company, country, source,
              and why you can contact the lead.
            </div>
            <div className="alert">
              <strong>For WhatsApp campaigns</strong>
              <br />
              Add <strong>phone</strong>, <strong>whatsapp_opt_in</strong>, and{" "}
              <strong>whatsapp_permission_source</strong>. People without WhatsApp permission are skipped.
            </div>
          </div>

          <div className="table-wrap csv-guide-table" aria-label="Recommended CSV columns">
            <table>
              <thead>
                <tr>
                  <th>Column title</th>
                  <th>Needed for</th>
                  <th>Format</th>
                  <th>Example</th>
                </tr>
              </thead>
              <tbody>
                {recommendedColumns.map((column) => (
                  <tr key={column.column}>
                    <td>
                      <code>{column.column}</code>
                    </td>
                    <td>{column.required}</td>
                    <td>{column.format}</td>
                    <td>{column.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="advanced-inline">
            <summary>Show examples</summary>
            <div className="grid grid-2" style={{ marginTop: 10 }}>
              <pre className="email-preview">{sampleCsv}</pre>
              <pre className="email-preview">{samplePaste}</pre>
            </div>
          </details>
        </div>
      </section>

      <section className="section-tabs" aria-label="Lead import method">
        <button
          className={mode === "csv" ? "section-tab section-tab-active" : "section-tab"}
          type="button"
          onClick={() => switchMode("csv")}
        >
          Upload CSV
        </button>
        <button
          className={mode === "paste" ? "section-tab section-tab-active" : "section-tab"}
          type="button"
          onClick={() => switchMode("paste")}
        >
          Paste from Excel
        </button>
      </section>

      <div className="grid grid-2">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>{mode === "paste" ? "Paste rows" : "Upload CSV"}</h2>
              <p className="muted">
                {mode === "paste"
                  ? "Copy rows from Excel or Google Sheets, including the header row, then check them."
                  : "Use a list with email, country, source, legal basis, and WhatsApp permission when needed."}
              </p>
            </div>
          </div>
          <div className="panel-body stack">
            {mode === "paste" ? (
              <label className="field">
                <span>Excel rows</span>
                <textarea
                  className="textarea spreadsheet-paste"
                  value={pasteText}
                  onChange={(event) => handlePasteText(event.target.value)}
                  placeholder={samplePaste}
                />
                <small>First row must be column titles. Tabs from Excel are supported automatically.</small>
              </label>
            ) : (
              <label className="field">
                <span>CSV file</span>
                <input
                  className="input"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                />
              </label>
            )}

            {activeFile ? (
              <div className="success-alert alert">
                <FileUp size={16} aria-hidden="true" /> {activeFile.name} ready for mapping.
              </div>
            ) : null}

            {error ? (
              <div className="danger-alert alert" role="alert">
                <AlertCircle size={16} aria-hidden="true" /> {error}
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Map and check</h2>
              <p className="muted">
                Email is required. Check rows before importing to see what will be skipped.
              </p>
            </div>
          </div>
          <div className="panel-body stack">
            {headers.length ? (
              <>
                <div className="form-grid">
                  {FIELD_DEFINITIONS.map((field) => (
                    <label className="field" key={field.key}>
                      <span>
                        {field.label}
                        {field.required ? " *" : ""}
                      </span>
                      <select
                        className="select"
                        value={mapping[field.key] ?? ""}
                        onChange={(event) => updateMapping(field.key, event.target.value)}
                      >
                        <option value="">Do not import</option>
                        {headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                {requiredMissing ? (
                  <div className="danger-alert alert">Map an email column before checking or importing.</div>
                ) : null}

                <div className="button-row">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={checkRows}
                    disabled={requiredMissing || isChecking}
                  >
                    <RefreshCw size={16} aria-hidden="true" />
                    {isChecking ? "Checking..." : "Check rows"}
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={submitImport}
                    disabled={requiredMissing || isSubmitting || !activeFile}
                  >
                    {isSubmitting ? "Importing..." : "Import accepted rows"}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                {mode === "paste" ? (
                  <>
                    <ClipboardPaste size={18} aria-hidden="true" /> Paste rows with headers to start.
                  </>
                ) : (
                  "Upload a CSV to preview columns and map fields."
                )}
              </div>
            )}
          </div>
        </section>

        {preview ? <ValidationPreview preview={preview} /> : <LocalPreview headers={headers} rows={rows} />}
      </div>
    </div>
  );
}

function ValidationPreview({ preview }: { preview: ImportPreviewResponse }) {
  const blocked =
    preview.counters.invalidRows + preview.counters.duplicateRows + preview.counters.suppressedRows;

  return (
    <section className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-header">
        <div>
          <h2>Checked rows</h2>
          <p className="muted">
            Valid and flagged rows will be imported. Invalid, duplicate, and suppressed rows will be skipped.
          </p>
        </div>
      </div>
      <div className="panel-body stack">
        <div className="import-summary-grid">
          <SummaryTile label="Total" value={preview.totalRows} />
          <SummaryTile label="Accepted" value={preview.counters.importedRows} />
          <SummaryTile label="Flagged" value={preview.counters.flaggedRows} />
          <SummaryTile label="Blocked" value={blocked} />
        </div>

        <div className="table-wrap spreadsheet-preview" aria-label="Checked lead rows">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Status</th>
                <th>Issues</th>
                {preview.headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.rowNumber}>
                  <td>{row.rowNumber}</td>
                  <td>
                    <StatusBadge label={importStatusLabels[row.status]} status={row.status} />
                  </td>
                  <td>
                    {row.issues.length ? (
                      <div className="tag-list">
                        {row.issues.map((issue) => (
                          <span className="tag" key={issue}>
                            {issue}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="muted">No issues</span>
                    )}
                  </td>
                  {preview.headers.map((header) => (
                    <td key={header}>{row.values[header] || <span className="muted">Empty</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {preview.rows.length < preview.totalRows ? (
          <p className="muted">Showing first {preview.rows.length} checked rows.</p>
        ) : null}
      </div>
    </section>
  );
}

function LocalPreview({ headers, rows }: { headers: string[]; rows: PreviewRow[] }) {
  if (!rows.length) return null;

  return (
    <section className="panel" style={{ gridColumn: "1 / -1" }}>
      <div className="panel-header">
        <div>
          <h2>Preview</h2>
          <p className="muted">First rows only. Click Check rows to validate duplicates and permissions.</p>
        </div>
      </div>
      <div className="panel-body">
        <div className="table-wrap spreadsheet-preview">
          <table>
            <thead>
              <tr>
                {headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((header) => (
                    <td key={header}>{row[header] || <span className="muted">Empty</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="choice-card">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}

function parsePastedSpreadsheet(
  text: string
): { ok: true; headers: string[]; rows: PreviewRow[]; csvText: string } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Paste rows from Excel first." };

  const result = Papa.parse<PreviewRow>(trimmed, {
    header: true,
    skipEmptyLines: true,
    delimiter: firstLine(trimmed).includes("\t") ? "\t" : "",
    transformHeader: (header) => header.trim()
  });

  if (result.errors.length) {
    return { ok: false, error: result.errors[0]?.message ?? "Could not read the pasted rows." };
  }

  const headers = (result.meta.fields ?? []).filter(Boolean);
  const rows = result.data.filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));

  if (!headers.length || !rows.length) {
    return { ok: false, error: "Keep the first pasted row as column titles and add at least one lead row." };
  }

  return {
    ok: true,
    headers,
    rows,
    csvText: Papa.unparse(rows, { columns: headers })
  };
}

function firstLine(text: string) {
  return text.split(/\r?\n/, 1)[0] ?? "";
}
