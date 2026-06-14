import { WebsiteAuditCandidateStatus, WebsiteAuditRunStatus } from "@prisma/client";
import { ArrowLeft, CheckCircle2, FileText, Plus, Send } from "lucide-react";
import Link from "next/link";
import {
  approveAllWebsiteAuditCandidates,
  createCampaignFromWebsiteAuditRun,
  updateWebsiteAuditCandidate
} from "@/app/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { websiteAuditCandidateStatusLabels, websiteAuditRunStatusLabels } from "@/lib/status";

export const dynamic = "force-dynamic";

type WebsiteAuditRunDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function WebsiteAuditRunDetailPage({ params }: WebsiteAuditRunDetailPageProps) {
  const { id } = await params;
  const run = await prisma.websiteAuditRun.findUnique({
    where: { id },
    include: {
      selectedOffer: true,
      campaign: true,
      candidates: {
        include: { lead: true },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!run) {
    return (
      <EmptyState
        title="Website audit not found"
        description="This website audit no longer exists."
        action={
          <Link className="button" href="/campaigns/website-audits">
            Back to website audits
          </Link>
        }
      />
    );
  }

  const approved = run.candidates.filter((candidate) => candidate.status === WebsiteAuditCandidateStatus.APPROVED);
  const needsReviewStatuses: WebsiteAuditCandidateStatus[] = [
    WebsiteAuditCandidateStatus.NEEDS_REVIEW,
    WebsiteAuditCandidateStatus.FAILED
  ];
  const needsReview = run.candidates.filter((candidate) =>
    needsReviewStatuses.includes(candidate.status)
  );
  const checkingStatuses: WebsiteAuditCandidateStatus[] = [
    WebsiteAuditCandidateStatus.PENDING,
    WebsiteAuditCandidateStatus.CHECKING
  ];
  const checking = run.candidates.filter((candidate) =>
    checkingStatuses.includes(candidate.status)
  );
  const converted = run.status === WebsiteAuditRunStatus.CONVERTED;
  const canCreateCampaign = approved.length > 0 && !converted;

  return (
    <>
      <PageHeader
        eyebrow="Website Audit Campaign"
        title={run.name}
        description="Review what AI found, approve useful leads, then create an email campaign for final review."
        actions={
          <>
            <Link className="secondary-button" href="/campaigns/website-audits">
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </Link>
            <Link className="secondary-button" href="/campaigns/website-audits/new">
              <Plus size={16} aria-hidden="true" /> New audit
            </Link>
          </>
        }
      />

      <section className="grid grid-4" aria-label="Website audit status">
        <Metric label="Status" value={websiteAuditRunStatusLabels[run.status]} note={formatDate(run.createdAt)} />
        <Metric label="Websites" value={formatNumber(run.candidates.length)} note="Added to this audit" />
        <Metric label="Approved" value={formatNumber(approved.length)} note="Ready for campaign" />
        <Metric label="Needs review" value={formatNumber(needsReview.length)} note="Missing email or manual check" />
      </section>

      <div className="builder-layout" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Review opportunities</h2>
              <p className="muted">
                AI uses public website evidence. Edit any message before approving it.
              </p>
            </div>
            <StatusBadge label={websiteAuditRunStatusLabels[run.status]} status={run.status} />
          </div>
          <div className="panel-body stack">
            {checking.length ? (
              <div className="alert">
                {formatNumber(checking.length)} websites are still being checked. This page will update when the
                worker finishes.
              </div>
            ) : null}

            {run.candidates.length ? (
              run.candidates.map((candidate) => (
                <details
                  className="panel advanced-settings"
                  key={candidate.id}
                  open={([
                    WebsiteAuditCandidateStatus.NEEDS_REVIEW,
                    WebsiteAuditCandidateStatus.AUDITED,
                    WebsiteAuditCandidateStatus.APPROVED
                  ] as WebsiteAuditCandidateStatus[]).includes(candidate.status)}
                >
                  <summary className="panel-summary">
                    <div>
                      <h3>{candidate.companyName || candidate.normalizedDomain}</h3>
                      <p className="muted">{candidate.websiteUrl}</p>
                    </div>
                    <StatusBadge
                      label={websiteAuditCandidateStatusLabels[candidate.status]}
                      status={candidate.status}
                    />
                  </summary>

                  <form action={updateWebsiteAuditCandidate} className="panel-body stack">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <div className="form-grid">
                      <label className="field">
                        <span>Company</span>
                        <input
                          className="input"
                          name="companyName"
                          defaultValue={candidate.companyName ?? ""}
                          placeholder="Business name"
                        />
                      </label>
                      <label className="field">
                        <span>Business email</span>
                        <input
                          className="input"
                          name="email"
                          type="email"
                          defaultValue={candidate.email ?? ""}
                          placeholder="info@company.com"
                        />
                        {!candidate.email ? <small>Add an email before this lead can be contacted.</small> : null}
                      </label>
                    </div>

                    <div className="form-grid">
                      <label className="field">
                        <span>Suggested service</span>
                        <input
                          className="input"
                          name="recommendedServiceName"
                          defaultValue={candidate.recommendedServiceName ?? run.selectedOffer?.name ?? ""}
                        />
                      </label>
                      <label className="field">
                        <span>Mobile app possibility</span>
                        <input
                          className="input"
                          name="mobileAppScore"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={candidate.mobileAppScore}
                        />
                        <small>{mobileAppLabel(candidate.mobileAppScore)}</small>
                      </label>
                    </div>

                    <div className="form-grid">
                      <label className="field">
                        <span>Main pain points</span>
                        <textarea
                          className="textarea compact-textarea"
                          name="painPoints"
                          defaultValue={candidate.painPoints.join("\n")}
                          placeholder="One per line"
                        />
                      </label>
                      <label className="field">
                        <span>Missing features</span>
                        <textarea
                          className="textarea compact-textarea"
                          name="missingFeatures"
                          defaultValue={candidate.missingFeatures.join("\n")}
                          placeholder="One per line"
                        />
                      </label>
                    </div>

                    <label className="field">
                      <span>Mobile app signals</span>
                      <textarea
                        className="textarea compact-textarea"
                        name="mobileAppSignals"
                        defaultValue={candidate.mobileAppSignals.join("\n")}
                        placeholder="Booking, repeat customers, loyalty, delivery, customer account"
                      />
                    </label>

                    <label className="field">
                      <span>Email subject</span>
                      <input
                        className="input"
                        name="generatedSubject"
                        defaultValue={candidate.generatedSubject ?? ""}
                        placeholder="Quick idea for your website"
                      />
                    </label>
                    <label className="field">
                      <span>Email message</span>
                      <textarea
                        className="textarea"
                        name="generatedBody"
                        rows={8}
                        defaultValue={candidate.generatedBody ?? ""}
                        placeholder="Write the message AI should send before your signature and unsubscribe line."
                      />
                    </label>

                    {candidate.error ? <div className="alert alert-warning">{candidate.error}</div> : null}

                    <EvidenceList evidence={candidate.evidence} />

                    <div className="toolbar" style={{ justifyContent: "flex-start" }}>
                      <button className="secondary-button" type="submit" name="decision" value="SAVE">
                        Save changes
                      </button>
                      <button className="button" type="submit" name="decision" value="APPROVE">
                        <CheckCircle2 size={16} aria-hidden="true" /> Approve lead
                      </button>
                      <button className="danger-button" type="submit" name="decision" value="REJECT">
                        Reject
                      </button>
                    </div>
                  </form>
                </details>
              ))
            ) : (
              <EmptyState
                title="No websites added"
                description="Add websites to let AI find useful improvement ideas."
                action={
                  <Link className="button" href="/campaigns/website-audits/new">
                    Add websites
                  </Link>
                }
              />
            )}
          </div>
        </section>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2>Create email campaign</h2>
              <p className="muted">Only approved leads with valid emails can be added.</p>
            </div>
          </div>
          <div className="panel-body stack">
            <ProfileRow label="Service" value={run.selectedOffer?.name || "No service selected"} />
            <ProfileRow label="Lead source" value={run.source} />
            <ProfileRow label="Contact reason" value={run.legalBasis || "Not set"} />
            <ProfileRow label="Approved leads" value={formatNumber(approved.length)} />
            <ProfileRow label="Skipped until fixed" value={formatNumber(needsReview.length)} />

            <form action={approveAllWebsiteAuditCandidates}>
              <input type="hidden" name="runId" value={run.id} />
              <button className="secondary-button" type="submit">
                Approve all ready leads
              </button>
            </form>

            {run.campaign ? (
              <Link className="button" href={`/campaigns/${run.campaign.id}`}>
                <FileText size={16} aria-hidden="true" /> Open campaign
              </Link>
            ) : (
              <form action={createCampaignFromWebsiteAuditRun} className="stack">
                <input type="hidden" name="runId" value={run.id} />
                <label className="field">
                  <span>Campaign name</span>
                  <input
                    className="input"
                    name="campaignName"
                    minLength={3}
                    defaultValue={`${run.name} email campaign`}
                  />
                </label>
                <div className="alert">
                  Before sending, you will still review the campaign message, unsubscribe protection, sender
                  details, and sending account.
                </div>
                <button className="button" type="submit" disabled={!canCreateCampaign}>
                  <Send size={16} aria-hidden="true" /> Create email campaign
                </button>
              </form>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="panel metric compact-metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-note">{note}</p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: unknown }) {
  const items = extractEvidenceItems(evidence);
  if (!items.length) return null;
  return (
    <div>
      <h3>Evidence found</h3>
      <ul className="simple-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function extractEvidenceItems(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return [];
  const items = (evidence as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item))
    .filter(Boolean)
    .slice(0, 6);
}

function mobileAppLabel(score: number) {
  if (score >= 70) return "High - mobile app may be worth offering.";
  if (score >= 40) return "Medium - mention only if the evidence is clear.";
  return "Low - website, booking, or automation should come first.";
}
