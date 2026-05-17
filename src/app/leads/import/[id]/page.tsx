import Link from "next/link";
import { notFound } from "next/navigation";
import { rollbackImportBatch } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { importStatusLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

type ImportResultProps = {
  params: Promise<{ id: string }>;
};

export default async function ImportResultPage({ params }: ImportResultProps) {
  const { id } = await params;
  const batch = await prisma.importBatch.findUnique({
    where: { id },
    include: { rows: { orderBy: { rowNumber: "asc" }, take: 200 } }
  });

  if (!batch) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Import Result"
        title={batch.filename}
        description={
          batch.rolledBackAt
            ? `Rolled back ${formatDate(batch.rolledBackAt)}. Leads from this import are no longer sendable.`
            : `Imported ${formatDate(batch.createdAt)}. Review invalid, duplicate, suppressed, and flagged rows before using this list later.`
        }
        actions={
          <>
            <Link className="button" href="/leads">
              View leads
            </Link>
            {!batch.rolledBackAt && batch.importedRows > 0 ? (
              <form action={rollbackImportBatch}>
                <input type="hidden" name="id" value={batch.id} />
                <button className="danger-button" type="submit">
                  Roll back import
                </button>
              </form>
            ) : null}
          </>
        }
      />

      {batch.rolledBackAt ? (
        <div className="danger-alert alert" style={{ marginBottom: 16 }}>
          This import was rolled back. {batch.rolledBackRows} lead records were removed from the active lead
          database.
        </div>
      ) : null}

      <section className="grid grid-4" aria-label="Import summary">
        <SummaryCard label="Total rows" value={batch.totalRows} />
        <SummaryCard label="Imported" value={batch.importedRows} />
        <SummaryCard label="Flagged" value={batch.flaggedRows} />
        <SummaryCard label="Blocked" value={batch.invalidRows + batch.duplicateRows + batch.suppressedRows} />
        <SummaryCard label="Rolled back" value={batch.rolledBackRows} />
      </section>

      <section className="table-wrap" style={{ marginTop: 16 }} aria-label="Import rows">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Email</th>
              <th>Status</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody>
            {batch.rows.map((row) => (
              <tr key={row.id}>
                <td>{row.rowNumber}</td>
                <td>{row.email || <span className="muted">Missing</span>}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{formatNumber(value)}</p>
    </div>
  );
}
