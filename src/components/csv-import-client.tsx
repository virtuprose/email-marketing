"use client";

import { AlertCircle, ArrowRight, FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useMemo, useState } from "react";
import { FIELD_DEFINITIONS, guessMapping, type ImportMapping } from "@/lib/imports";

type PreviewRow = Record<string, string>;

export function CsvImportClient() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [mapping, setMapping] = useState<Partial<ImportMapping>>({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requiredMissing = useMemo(() => !mapping.email, [mapping.email]);

  function handleFile(nextFile: File | null) {
    setError("");
    setFile(nextFile);
    setHeaders([]);
    setRows([]);
    setMapping({});

    if (!nextFile) return;

    Papa.parse<PreviewRow>(nextFile, {
      header: true,
      skipEmptyLines: true,
      preview: 8,
      complete: (result) => {
        const parsedHeaders = result.meta.fields ?? [];
        setHeaders(parsedHeaders);
        setRows(result.data);
        setMapping(guessMapping(parsedHeaders));
      },
      error: (parseError) => {
        setError(parseError.message);
      }
    });
  }

  async function submitImport() {
    if (!file || requiredMissing) return;
    setIsSubmitting(true);
    setError("");

    const formData = new FormData();
    formData.set("file", file);
    formData.set("mapping", JSON.stringify(mapping));

    const response = await fetch("/api/imports", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Import failed. Check the CSV and mapping.");
      setIsSubmitting(false);
      return;
    }

    const payload = (await response.json()) as { id: string };
    router.push(`/leads/import/${payload.id}`);
  }

  return (
    <div className="grid grid-2">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Upload CSV</h2>
            <p className="muted">
              Use a list with email, source, country, legal basis, and WhatsApp opt-in when sending WhatsApp.
            </p>
          </div>
        </div>
        <div className="panel-body stack">
          <label className="field">
            <span>CSV file</span>
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
          </label>

          {file ? (
            <div className="success-alert alert">
              <FileUp size={16} aria-hidden="true" /> {file.name} ready for mapping.
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
            <h2>Map fields</h2>
            <p className="muted">
              Email is required. WhatsApp sends also need phone, opt-in, and consent source.
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
                      onChange={(event) =>
                        setMapping((current) => ({
                          ...current,
                          [field.key]: event.target.value || undefined
                        }))
                      }
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
                <div className="danger-alert alert">Map an email column before importing.</div>
              ) : null}

              <button
                className="button"
                type="button"
                onClick={submitImport}
                disabled={requiredMissing || isSubmitting}
              >
                {isSubmitting ? "Importing..." : "Import leads"}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </>
          ) : (
            <div className="empty-state">Upload a CSV to preview columns and map fields.</div>
          )}
        </div>
      </section>

      {rows.length ? (
        <section className="panel" style={{ gridColumn: "1 / -1" }}>
          <div className="panel-header">
            <div>
              <h2>Preview</h2>
              <p className="muted">
                First rows only. The full file is parsed safely on the server after import.
              </p>
            </div>
          </div>
          <div className="panel-body">
            <div className="table-wrap">
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
      ) : null}
    </div>
  );
}
