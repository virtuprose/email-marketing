import { Power } from "lucide-react";
import Link from "next/link";
import { createOffer, toggleOfferActive } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const offers = await prisma.offer.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] });

  return (
    <>
      <PageHeader
        eyebrow="Offer Library"
        title="Virtuprose services"
        description="Every future campaign must start from an approved offer so AI uses the right audience, proof points, claims, CTA, and voice rules."
      />

      <div className="grid grid-2">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Create offer</h2>
              <p className="muted">
                Line-based fields become approved lists for AI and campaign safety checks.
              </p>
            </div>
          </div>
          <div className="panel-body">
            <form action={createOffer} className="stack">
              <div className="form-grid">
                <label className="field">
                  <span>Offer name</span>
                  <input className="input" name="name" required minLength={3} />
                </label>
                <label className="field">
                  <span>CTA style</span>
                  <input className="input" name="ctaStyle" required placeholder="Offer website review" />
                </label>
              </div>

              <label className="field">
                <span>Target audience</span>
                <textarea className="textarea" name="targetAudience" required />
              </label>

              <label className="field">
                <span>Value proposition</span>
                <textarea className="textarea" name="valueProposition" required />
              </label>

              <div className="form-grid">
                <label className="field">
                  <span>Pain points</span>
                  <textarea className="textarea" name="painPoints" placeholder="One per line" />
                </label>
                <label className="field">
                  <span>Approved proof points</span>
                  <textarea className="textarea" name="proofPoints" placeholder="One per line" />
                </label>
                <label className="field">
                  <span>Services included</span>
                  <textarea className="textarea" name="servicesIncluded" placeholder="One per line" />
                </label>
                <label className="field">
                  <span>Disallowed claims</span>
                  <textarea className="textarea" name="disallowedClaims" placeholder="One per line" />
                </label>
              </div>

              <label className="field">
                <span>AI voice rules</span>
                <textarea className="textarea" name="aiVoiceRules" required />
              </label>

              <button className="button" type="submit">
                Create offer
              </button>
            </form>
          </div>
        </section>

        <section className="grid">
          {offers.map((offer) => (
            <article className="panel" key={offer.id}>
              <div className="panel-header">
                <div>
                  <h2>{offer.name}</h2>
                  <p className="muted">Created {formatDate(offer.createdAt)}</p>
                </div>
                <StatusBadge
                  label={offer.active ? "Active" : "Inactive"}
                  status={offer.active ? "VALIDATED" : "DO_NOT_CONTACT"}
                />
              </div>
              <div className="panel-body stack">
                <p>{offer.valueProposition}</p>

                <div>
                  <h3>Approved proof points</h3>
                  <div className="tag-list" style={{ marginTop: 8 }}>
                    {offer.proofPoints.length ? (
                      offer.proofPoints.map((item) => (
                        <span className="tag" key={item}>
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="muted">No proof points yet</span>
                    )}
                  </div>
                </div>

                <div>
                  <h3>Disallowed claims</h3>
                  <div className="tag-list" style={{ marginTop: 8 }}>
                    {offer.disallowedClaims.length ? (
                      offer.disallowedClaims.map((item) => (
                        <span className="tag" key={item}>
                          {item}
                        </span>
                      ))
                    ) : (
                      <span className="muted">No disallowed claims listed</span>
                    )}
                  </div>
                </div>

                <form action={toggleOfferActive}>
                  <input type="hidden" name="id" value={offer.id} />
                  <input type="hidden" name="active" value={String(offer.active)} />
                  <div className="toolbar" style={{ marginBottom: 0 }}>
                    <Link className="secondary-button" href={`/offers/${offer.id}/edit`}>
                      Edit offer
                    </Link>
                    <button className="secondary-button" type="submit">
                      <Power size={16} aria-hidden="true" />
                      {offer.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </form>
              </div>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
