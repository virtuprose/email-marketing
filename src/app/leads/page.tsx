import { LeadStatus, Prisma } from "@prisma/client";
import { Download, Search } from "lucide-react";
import Link from "next/link";
import { LeadProfilePanel } from "@/components/lead-profile-panel";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { leadStatusLabels, whatsappLeadStatusLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

type LeadsPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    selected?: string;
  }>;
};

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;
  const where: Prisma.LeadWhereInput = {};

  if (params.status && params.status in LeadStatus) {
    where.status = params.status as LeadStatus;
  }

  if (params.q) {
    where.OR = [
      { email: { contains: params.q, mode: "insensitive" } },
      { company: { contains: params.q, mode: "insensitive" } },
      { firstName: { contains: params.q, mode: "insensitive" } },
      { lastName: { contains: params.q, mode: "insensitive" } },
      { source: { contains: params.q, mode: "insensitive" } }
    ];
  }

  const [leads, selectedLead] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: { tags: true },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    params.selected
      ? prisma.lead.findUnique({
          where: { id: params.selected },
          include: {
            tags: true,
            events: { orderBy: { createdAt: "desc" }, take: 10 }
          }
        })
      : null
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Lead Management"
        title="Lead database"
        description="Imported leads stay visible with their source, country, legal basis, status, tags, and activity before they can enter campaigns."
        actions={
          <Link className="button" href="/leads/import">
            <Download size={16} aria-hidden="true" /> Import CSV
          </Link>
        }
      />

      <form className="toolbar" action="/leads">
        <label className="field" style={{ minWidth: 260 }}>
          <span>Search leads</span>
          <input
            className="input"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Email, company, source"
          />
        </label>
        <label className="field" style={{ minWidth: 220 }}>
          <span>Status</span>
          <select className="select" name="status" defaultValue={params.status ?? ""}>
            <option value="">All statuses</option>
            {Object.values(LeadStatus).map((status) => (
              <option key={status} value={status}>
                {leadStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="submit">
          <Search size={16} aria-hidden="true" /> Apply filters
        </button>
      </form>

      <div className="split-layout">
        <section className="table-wrap" aria-label="Leads table">
          <table>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Company</th>
                <th>Status</th>
                <th>Source</th>
                <th>WhatsApp</th>
                <th>Legal basis</th>
                <th>Tags</th>
                <th>Imported</th>
              </tr>
            </thead>
            <tbody>
              {leads.length ? (
                leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link href={`/leads?selected=${lead.id}`} style={{ fontWeight: 760 }}>
                        {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email}
                      </Link>
                      <br />
                      <span className="muted">{lead.email}</span>
                    </td>
                    <td>{lead.company || <span className="muted">Missing</span>}</td>
                    <td>
                      <StatusBadge label={leadStatusLabels[lead.status]} status={lead.status} />
                    </td>
                    <td>{lead.source || <span className="muted">Missing</span>}</td>
                    <td>
                      {lead.phoneE164 ? (
                        <>
                          {lead.phoneE164}
                          <br />
                          <StatusBadge
                            label={whatsappLeadStatusLabels[lead.whatsappStatus]}
                            status={lead.whatsappStatus}
                          />
                        </>
                      ) : (
                        <span className="muted">No phone</span>
                      )}
                    </td>
                    <td>{lead.legalBasis || <span className="muted">Missing</span>}</td>
                    <td>
                      <div className="tag-list">
                        {lead.tags.length ? (
                          lead.tags.map((tag) => (
                            <span className="tag" key={tag.id}>
                              {tag.name}
                            </span>
                          ))
                        ) : (
                          <span className="muted">None</span>
                        )}
                      </div>
                    </td>
                    <td>{formatDate(lead.createdAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">No leads match the current filters.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <LeadProfilePanel lead={selectedLead} />
      </div>
    </>
  );
}
