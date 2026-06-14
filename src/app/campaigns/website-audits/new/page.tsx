import { ArrowLeft, Globe2, Plus } from "lucide-react";
import Link from "next/link";
import { createWebsiteAuditOffer, createWebsiteAuditRun } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import {
  DEFAULT_WEBSITE_AUDIT_LEGAL_BASIS,
  DEFAULT_WEBSITE_AUDIT_SOURCE,
  WEBSITE_AUDIT_MAX_PAGES,
  WEBSITE_AUDIT_MAX_URLS
} from "@/lib/website-audit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type NewWebsiteAuditRunPageProps = {
  searchParams: Promise<{ offerId?: string }>;
};

export default async function NewWebsiteAuditRunPage({ searchParams }: NewWebsiteAuditRunPageProps) {
  const params = await searchParams;
  const offers = await prisma.offer.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const defaultOfferId = offers.some((offer) => offer.id === params.offerId) ? params.offerId : offers[0]?.id;

  return (
    <>
      <PageHeader
        eyebrow="Campaigns"
        title="Create Website Audit Campaign"
        description="Paste business websites. AI checks public pages, finds useful improvement ideas, and prepares emails for your approval."
        actions={
          <Link className="secondary-button" href="/campaigns/website-audits">
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </Link>
        }
      />

      <div className="builder-layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Add websites</h2>
              <p className="muted">Use one website per line. Optional columns: website, company, email, country, source.</p>
            </div>
          </div>
          <div className="panel-body">
            {offers.length ? (
              <form action={createWebsiteAuditRun} className="stack">
                <label className="field">
                  <span>Audit name</span>
                  <input className="input" name="name" required minLength={3} placeholder="Dubai clinics website audit" />
                </label>

                <label className="field">
                  <span>Service to offer</span>
                  <select className="select" name="selectedOfferId" required defaultValue={defaultOfferId}>
                    {offers.map((offer) => (
                      <option key={offer.id} value={offer.id}>
                        {offer.name}
                      </option>
                    ))}
                  </select>
                  <small>AI will judge whether each website fits this service. You can create a new service on this page.</small>
                </label>

                <label className="field">
                  <span>Websites</span>
                  <textarea
                    className="textarea"
                    name="websitesText"
                    rows={12}
                    placeholder={[
                      "https://exampleclinic.com, Example Clinic, info@exampleclinic.com, UAE",
                      "https://examplesalon.com",
                      "example-restaurant.com, Example Restaurant"
                    ].join("\n")}
                  />
                  <small>Maximum {WEBSITE_AUDIT_MAX_URLS} websites. We check public pages only.</small>
                </label>

                <label className="field">
                  <span>Or upload CSV</span>
                  <input className="input" name="websitesFile" type="file" accept=".csv,text/csv,text/plain" />
                  <small>Columns can be: website, company, email, country, source.</small>
                </label>

                <div className="form-grid">
                  <label className="field">
                    <span>Default country</span>
                    <input className="input" name="country" required placeholder="UAE, Kuwait, United States" />
                  </label>
                  <label className="field">
                    <span>Pages per website</span>
                    <input
                      className="input"
                      name="maxPagesPerSite"
                      type="number"
                      min={1}
                      max={WEBSITE_AUDIT_MAX_PAGES}
                      defaultValue={3}
                    />
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Lead source</span>
                    <input className="input" name="source" defaultValue={DEFAULT_WEBSITE_AUDIT_SOURCE} />
                  </label>
                  <label className="field">
                    <span>Why can we contact them?</span>
                    <input className="input" name="legalBasis" defaultValue={DEFAULT_WEBSITE_AUDIT_LEGAL_BASIS} />
                  </label>
                </div>

                <div className="alert">
                  AI will prepare leads only. You will approve the leads and review the email before anything sends.
                </div>

                <button className="button" type="submit">
                  <Globe2 size={16} aria-hidden="true" /> Start website check
                </button>
              </form>
            ) : (
              <div className="empty-state">Create at least one service before starting a website audit.</div>
            )}
          </div>
        </section>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2>Create new service</h2>
              <p className="muted">Use this when you want to offer something new in the email campaign.</p>
            </div>
          </div>
          <div className="panel-body">
            <form action={createWebsiteAuditOffer} className="stack">
              <input type="hidden" name="returnTo" value="/campaigns/website-audits/new" />
              <label className="field">
                <span>Service name</span>
                <input className="input" name="name" required minLength={3} placeholder="Mobile App Development" />
              </label>
              <label className="field">
                <span>Who is this for?</span>
                <textarea
                  className="textarea compact-textarea"
                  name="targetAudience"
                  required
                  placeholder="Businesses with repeat customers, booking, delivery, ecommerce, loyalty, or customer account workflows."
                />
              </label>
              <label className="field">
                <span>What do we offer?</span>
                <textarea
                  className="textarea compact-textarea"
                  name="valueProposition"
                  required
                  placeholder="Virtuprose designs and builds practical mobile apps that make customer actions easier and reduce manual follow-up."
                />
              </label>
              <label className="field">
                <span>Problems we solve</span>
                <textarea
                  className="textarea compact-textarea"
                  name="painPoints"
                  placeholder="One per line: manual bookings, weak mobile experience, no customer app"
                />
              </label>
              <label className="field">
                <span>Proof/examples</span>
                <textarea
                  className="textarea compact-textarea"
                  name="proofPoints"
                  placeholder="One per line. Only add things AI is allowed to mention."
                />
              </label>
              <label className="field">
                <span>What is included?</span>
                <textarea
                  className="textarea compact-textarea"
                  name="servicesIncluded"
                  placeholder="One per line: planning, design, app development, deployment"
                />
              </label>
              <label className="field">
                <span>Things AI must not promise</span>
                <textarea
                  className="textarea compact-textarea"
                  name="disallowedClaims"
                  placeholder="Guaranteed sales, guaranteed downloads, fixed timeline without scope"
                />
              </label>
              <button className="secondary-button" type="submit">
                <Plus size={16} aria-hidden="true" /> Save service
              </button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
