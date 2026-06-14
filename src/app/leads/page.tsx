import { LeadStatus, Prisma } from "@prisma/client";
import { Download, Plus, Search, Trash2, Users } from "lucide-react";
import Link from "next/link";
import {
  addLeadsToGroup,
  createLeadGroup,
  deleteLead,
  deleteLeadGroup,
  removeLeadFromGroup
} from "@/app/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
    groupId?: string;
  }>;
};

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const params = await searchParams;
  const where: Prisma.LeadWhereInput = { deletedAt: null };

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
  if (params.groupId) {
    where.groups = { some: { groupId: params.groupId } };
  }

  const [leads, selectedLead, groups] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: { tags: true, groups: { include: { group: true }, orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    params.selected
      ? prisma.lead.findFirst({
          where: { id: params.selected, deletedAt: null },
          include: {
            tags: true,
            events: { orderBy: { createdAt: "desc" }, take: 10 }
          }
        })
      : null,
    prisma.leadGroup.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: { name: "asc" }
    })
  ]);
  const selectedGroup = groups.find((group) => group.id === params.groupId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Add Leads"
        title="Add and review leads"
        description="Upload contacts, check who is ready, and keep people who should not be contacted out of campaigns."
        actions={
          <Link className="button" href="/leads/import">
            <Download size={16} aria-hidden="true" /> Upload leads
          </Link>
        }
      />

      <div className="section-tabs" aria-label="Lead views">
        <Link className="section-tab section-tab-active" href="/leads">
          All Leads
        </Link>
        <Link className="section-tab" href="/leads/import">
          Upload Leads
        </Link>
      </div>

      <form className="toolbar" action="/leads">
        <label className="field" style={{ minWidth: 260 }}>
          <span>Find leads</span>
          <input
            className="input"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Name, email, company, source"
          />
        </label>
        <label className="field" style={{ minWidth: 220 }}>
          <span>Contact status</span>
          <select className="select" name="status" defaultValue={params.status ?? ""}>
            <option value="">All statuses</option>
            {Object.values(LeadStatus).map((status) => (
              <option key={status} value={status}>
                {leadStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        {params.groupId ? <input type="hidden" name="groupId" value={params.groupId} /> : null}
        <button className="secondary-button" type="submit">
          <Search size={16} aria-hidden="true" /> Search
        </button>
      </form>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Lead groups</h2>
              <p className="muted">Create named audiences for email or WhatsApp campaigns.</p>
            </div>
            <Users size={18} aria-hidden="true" />
          </div>
          <div className="panel-body stack">
            <form action={createLeadGroup} className="form-grid">
              <label className="field">
                <span>Group name</span>
                <input className="input" name="name" required placeholder="Kuwait ecommerce prospects" />
              </label>
              <label className="field">
                <span>Description</span>
                <input className="input" name="description" placeholder="Optional context" />
              </label>
              <button className="secondary-button" type="submit">
                <Plus size={16} aria-hidden="true" /> Create group
              </button>
            </form>
            <div className="tag-list">
              <Link className={`tag ${!selectedGroup ? "tag-active" : ""}`} href="/leads">
                All active leads
              </Link>
              {groups.map((group) => (
                <span className="tag group-tag" key={group.id}>
                  <Link href={`/leads?groupId=${group.id}`}>
                    {group.name} ({group._count.members})
                  </Link>
                  <ConfirmDialog
                    trigger={
                      <button className="inline-icon-button" type="button" aria-label={`Delete ${group.name}`}>
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    }
                    title="Delete this group?"
                    description="This deletes only the group. Leads stay in the system."
                  >
                    <form action={deleteLeadGroup}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <button className="danger-button" type="submit">
                        Delete group
                      </button>
                    </form>
                  </ConfirmDialog>
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Selected lead actions</h2>
              <p className="muted">Tick leads in the table, then add them to a named group.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <p className="muted">
              {selectedGroup
                ? `Viewing ${selectedGroup.name}. Row actions can remove leads from this group.`
                : "Use the checkboxes in the table to build or update campaign audiences."}
            </p>
          </div>
        </section>
      </section>

      <div className="split-layout">
        <section className="table-wrap" aria-label="Leads table">
          <form id="lead-selection-form" action={addLeadsToGroup} className="lead-selection-actions">
            <div className="toolbar embedded-toolbar">
              <label className="field" style={{ minWidth: 240 }}>
                <span>Add selected to group</span>
                <select className="select" name="groupId" defaultValue={selectedGroup?.id ?? ""}>
                  <option value="">Choose group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} ({group._count.members})
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary-button" type="submit">
                Add selected
              </button>
              <label className="field" style={{ minWidth: 240 }}>
                <span>Or create from selected</span>
                <input className="input" name="name" placeholder="New group name" />
              </label>
              <button className="secondary-button" type="submit" formAction={createLeadGroup}>
                Create from selected
              </button>
            </div>
          </form>
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Lead</th>
                <th>Company</th>
                <th>Contact status</th>
                <th>Where from?</th>
                <th>WhatsApp number</th>
                <th>Why can we contact them?</th>
                <th>Groups</th>
                <th>Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.length ? (
                leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <input form="lead-selection-form" name="leadId" type="checkbox" value={lead.id} />
                    </td>
                    <td>
                      <Link
                        href={`/leads?selected=${lead.id}${params.groupId ? `&groupId=${params.groupId}` : ""}`}
                        style={{ fontWeight: 760 }}
                      >
                        {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.email}
                      </Link>
                      <br />
                      <span className="muted">{lead.email}</span>
                    </td>
                    <td>{lead.company || <span className="muted">Needs info</span>}</td>
                    <td>
                      <StatusBadge label={leadStatusLabels[lead.status]} status={lead.status} />
                    </td>
                    <td>{lead.source || <span className="muted">Needs info</span>}</td>
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
                        <span className="muted">No WhatsApp number</span>
                      )}
                    </td>
                    <td>{lead.legalBasis || <span className="muted">Needs info</span>}</td>
                    <td>
                      <div className="tag-list">
                        {lead.groups.length ? (
                          lead.groups.map((membership) => (
                            <span className="tag" key={membership.id}>
                              {membership.group.name}
                            </span>
                          ))
                        ) : (
                          <span className="muted">None</span>
                        )}
                      </div>
                    </td>
                    <td>{formatDate(lead.createdAt)}</td>
                    <td>
                      <div className="table-actions">
                        {selectedGroup ? (
                          <form action={removeLeadFromGroup}>
                            <input type="hidden" name="groupId" value={selectedGroup.id} />
                            <input type="hidden" name="leadId" value={lead.id} />
                            <button className="secondary-button compact-button" type="submit">
                              Remove from group
                            </button>
                          </form>
                        ) : null}
                        <ConfirmDialog
                          trigger={
                            <button className="danger-button compact-button" type="button">
                              <Trash2 size={14} aria-hidden="true" /> Remove
                            </button>
                          }
                          title="Remove this lead?"
                          description="This hides the lead from Leads, campaigns, reports, and future outreach while keeping history."
                        >
                          <form action={deleteLead} className="stack">
                            <input type="hidden" name="leadId" value={lead.id} />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={`/leads${params.groupId ? `?groupId=${params.groupId}` : ""}`}
                            />
                            <label className="field">
                              <span>Reason</span>
                              <input className="input" name="reason" placeholder="Not a lead, duplicate, wrong contact" />
                            </label>
                            <button className="danger-button" type="submit">
                              Remove lead
                            </button>
                          </form>
                        </ConfirmDialog>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">
                      No leads found. Upload a CSV to add your first contacts.
                    </div>
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
