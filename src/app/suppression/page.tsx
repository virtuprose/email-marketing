import { SuppressionReason } from "@prisma/client";
import { ShieldAlert } from "lucide-react";
import { createSuppressionEntry } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { suppressionReasonLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function SuppressionPage() {
  const entries = await prisma.suppressionEntry.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <>
      <PageHeader
        eyebrow="Suppression"
        title="Do-not-contact list"
        description="Suppression is checked before future sends. Add unsubscribes, complaints, hard bounces, manual blocks, risky domains, and competitors here."
      />

      <div className="grid grid-2">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Add suppression</h2>
              <p className="muted">
                Suppressed leads are immediately marked blocked if they already exist in the database.
              </p>
            </div>
          </div>
          <div className="panel-body">
            <form action={createSuppressionEntry} className="stack">
              <label className="field">
                <span>Email</span>
                <input
                  className="input"
                  type="email"
                  name="email"
                  required
                  placeholder="person@example.com"
                />
              </label>
              <label className="field">
                <span>Reason</span>
                <select className="select" name="reason" defaultValue={SuppressionReason.MANUAL_BLOCK}>
                  {Object.values(SuppressionReason).map((reason) => (
                    <option key={reason} value={reason}>
                      {suppressionReasonLabels[reason]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Source</span>
                <input className="input" name="source" placeholder="manual, import, unsubscribe, provider" />
              </label>
              <label className="field">
                <span>Notes</span>
                <textarea
                  className="textarea"
                  name="notes"
                  placeholder="Why this contact should never be emailed"
                />
              </label>
              <button className="danger-button" type="submit">
                <ShieldAlert size={16} aria-hidden="true" /> Add to suppression
              </button>
            </form>
          </div>
        </section>

        <section className="table-wrap" aria-label="Suppression entries">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Reason</th>
                <th>Source</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {entries.length ? (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.email}</td>
                    <td>
                      <StatusBadge label={suppressionReasonLabels[entry.reason]} status={entry.reason} />
                    </td>
                    <td>{entry.source || <span className="muted">Manual</span>}</td>
                    <td>{formatDate(entry.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">No suppression entries yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
