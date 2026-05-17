import Link from "next/link";
import { notFound } from "next/navigation";
import { updateOffer } from "@/app/actions";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type EditOfferPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditOfferPage({ params }: EditOfferPageProps) {
  const { id } = await params;
  const offer = await prisma.offer.findUnique({ where: { id } });

  if (!offer) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Offer Library"
        title={`Edit ${offer.name}`}
        description="Update the approved audience, proof points, claims, CTA, and AI voice rules before this offer is used in future campaigns."
        actions={
          <Link className="secondary-button" href="/offers">
            Back to offers
          </Link>
        }
      />

      <section className="panel">
        <div className="panel-body">
          <form action={updateOffer} className="stack">
            <input type="hidden" name="id" value={offer.id} />
            <div className="form-grid">
              <label className="field">
                <span>Offer name</span>
                <input className="input" name="name" required minLength={3} defaultValue={offer.name} />
              </label>
              <label className="field">
                <span>CTA style</span>
                <input className="input" name="ctaStyle" required defaultValue={offer.ctaStyle} />
              </label>
            </div>

            <label className="field">
              <span>Target audience</span>
              <textarea
                className="textarea"
                name="targetAudience"
                required
                defaultValue={offer.targetAudience}
              />
            </label>

            <label className="field">
              <span>Value proposition</span>
              <textarea
                className="textarea"
                name="valueProposition"
                required
                defaultValue={offer.valueProposition}
              />
            </label>

            <div className="form-grid">
              <label className="field">
                <span>Pain points</span>
                <textarea className="textarea" name="painPoints" defaultValue={offer.painPoints.join("\n")} />
              </label>
              <label className="field">
                <span>Approved proof points</span>
                <textarea
                  className="textarea"
                  name="proofPoints"
                  defaultValue={offer.proofPoints.join("\n")}
                />
              </label>
              <label className="field">
                <span>Services included</span>
                <textarea
                  className="textarea"
                  name="servicesIncluded"
                  defaultValue={offer.servicesIncluded.join("\n")}
                />
              </label>
              <label className="field">
                <span>Disallowed claims</span>
                <textarea
                  className="textarea"
                  name="disallowedClaims"
                  defaultValue={offer.disallowedClaims.join("\n")}
                />
              </label>
            </div>

            <label className="field">
              <span>AI voice rules</span>
              <textarea className="textarea" name="aiVoiceRules" required defaultValue={offer.aiVoiceRules} />
            </label>

            <div className="toolbar" style={{ marginBottom: 0 }}>
              <button className="button" type="submit">
                Save offer
              </button>
              <Link className="secondary-button" href="/offers">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
