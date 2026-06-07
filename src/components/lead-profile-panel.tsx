import { LeadStatus, WhatsappLeadStatus } from "@prisma/client";
import { updateLeadStatus } from "@/app/actions";
import { formatDate } from "@/lib/format";
import { leadStatusLabels, whatsappLeadStatusLabels } from "@/lib/status";
import { StatusBadge } from "./status-badge";

type LeadWithRelations = {
  id: string;
  email: string;
  phoneE164: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  website: string | null;
  role: string | null;
  industry: string | null;
  country: string | null;
  source: string | null;
  legalBasis: string | null;
  consentNotes: string | null;
  whatsappOptIn: boolean;
  whatsappConsentSource: string | null;
  whatsappStatus: WhatsappLeadStatus;
  whatsappStoppedAt: Date | null;
  status: LeadStatus;
  createdAt: Date;
  tags: { id: string; name: string }[];
  events: { id: string; message: string; createdAt: Date }[];
};

export function LeadProfilePanel({ lead }: { lead: LeadWithRelations | null }) {
  if (!lead) {
    return (
      <aside className="panel">
        <div className="panel-body empty-state">
          Select a lead to review where they came from, contact permission, tags, and activity.
        </div>
      </aside>
    );
  }

  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "No name yet";

  return (
    <aside className="panel">
      <div className="panel-header">
        <div>
          <h2>{fullName}</h2>
          <p className="muted">{lead.email}</p>
        </div>
        <StatusBadge label={leadStatusLabels[lead.status]} status={lead.status} />
      </div>

      <div className="panel-body stack">
        <form action={updateLeadStatus} className="field">
          <input type="hidden" name="id" value={lead.id} />
          <label htmlFor="status">Contact status</label>
          <select id="status" name="status" className="select" defaultValue={lead.status}>
            {Object.values(LeadStatus).map((status) => (
              <option key={status} value={status}>
                {leadStatusLabels[status]}
              </option>
            ))}
          </select>
          <button className="secondary-button" type="submit">
            Save status
          </button>
        </form>

        <div className="profile-list" aria-label="Lead details">
          <ProfileRow label="Company" value={lead.company} />
          <ProfileRow label="Role" value={lead.role} />
          <ProfileRow label="Industry" value={lead.industry} />
          <ProfileRow label="Country" value={lead.country} />
          <ProfileRow label="Website" value={lead.website} />
          <ProfileRow label="Where from?" value={lead.source} />
          <ProfileRow label="Why can we contact them?" value={lead.legalBasis} />
          <ProfileRow label="WhatsApp number" value={lead.phoneE164} />
          <ProfileRow label="WhatsApp status" value={whatsappLeadStatusLabels[lead.whatsappStatus]} />
          <ProfileRow label="Allowed on WhatsApp" value={lead.whatsappOptIn ? "Yes" : "No"} />
          <ProfileRow label="WhatsApp permission source" value={lead.whatsappConsentSource} />
          <ProfileRow
            label="Asked to stop"
            value={lead.whatsappStoppedAt ? formatDate(lead.whatsappStoppedAt) : null}
          />
          <ProfileRow label="Added" value={formatDate(lead.createdAt)} />
        </div>

        {lead.consentNotes ? (
          <div className="alert">
            <strong>Contact permission notes</strong>
            <br />
            {lead.consentNotes}
          </div>
        ) : null}

        <div>
          <h3>Tags</h3>
          <div className="tag-list" style={{ marginTop: 8 }}>
            {lead.tags.length ? (
              lead.tags.map((tag) => (
                <span className="tag" key={tag.id}>
                  {tag.name}
                </span>
              ))
            ) : (
              <span className="muted">No tags</span>
            )}
          </div>
        </div>

        <div>
          <h3>Activity</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            {lead.events.length ? (
              lead.events.map((event) => (
                <div key={event.id} className="profile-row">
                  <span>{formatDate(event.createdAt)}</span>
                  <span>{event.message}</span>
                </div>
              ))
            ) : (
              <p className="muted">No activity yet.</p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function ProfileRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <span>{value || "Missing"}</span>
    </div>
  );
}
