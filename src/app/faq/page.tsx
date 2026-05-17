import { ArrowRight, BookOpenCheck, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

type FaqItem = {
  question: string;
  answer: ReactNode;
  defaultOpen?: boolean;
};

type FaqSection = {
  title: string;
  description: string;
  items: FaqItem[];
};

const faqSections: FaqSection[] = [
  {
    title: "Start Here",
    description: "The shortest explanation of what this platform does and how to operate it safely.",
    items: [
      {
        question: "What is this platform?",
        defaultOpen: true,
        answer: (
          <>
            <p>
              This is your <strong>internal Virtuprose AI email sales agent</strong>. You bring leads, choose
              the offer, approve the campaign, and let the system handle safe sending, reply triage, AI
              drafts, scoring, and hot-lead handoff.
            </p>
            <p>
              The platform is built for <strong>one owner</strong>, not for public SaaS billing or team
              management. Its main goal is simple:{" "}
              <em>turn cold or warm replies into qualified opportunities you can close personally</em>.
            </p>
          </>
        )
      },
      {
        question: "What is the daily workflow?",
        defaultOpen: true,
        answer: (
          <ol className="faq-list">
            <li>
              Import leads from CSV with <strong>email, company, source, country, and legal basis</strong>.
            </li>
            <li>Select the Virtuprose offer you want to sell.</li>
            <li>Generate an AI campaign, review the copy, and fix safety blockers.</li>
            <li>Approve the campaign and schedule it through the throttled sending queue.</li>
            <li>Keep the worker running so queued email jobs can process.</li>
            <li>Paste replies into the AI inbox, or connect the inbound webhook later.</li>
            <li>Review AI classification and draft replies.</li>
            <li>Handle hot leads in the pipeline yourself.</li>
          </ol>
        )
      },
      {
        question: "What should I check first when I open the app?",
        answer: (
          <ul className="faq-list">
            <li>
              <strong>Command Center:</strong> check hot handoffs, owner-review replies, and open deals.
            </li>
            <li>
              <strong>Settings:</strong> confirm dry-run, sender identity, reply-to, and kill switch state.
            </li>
            <li>
              <strong>AI Inbox:</strong> review new replies before sending any AI draft.
            </li>
            <li>
              <strong>Reports:</strong> watch replies, skipped sends, failures, and suppressed contacts.
            </li>
          </ul>
        )
      }
    ]
  },
  {
    title: "Lead Import And Data Quality",
    description: "Good results depend on clean leads and clear source data.",
    items: [
      {
        question: "What columns should my CSV include?",
        answer: (
          <>
            <p>Minimum useful columns:</p>
            <ul className="faq-list">
              <li>
                <strong>email</strong> - required.
              </li>
              <li>
                <strong>first name</strong> and <strong>last name</strong> - helpful for personalization.
              </li>
              <li>
                <strong>company</strong> and <strong>website</strong> - important for fit scoring.
              </li>
              <li>
                <strong>country</strong> - important for compliance and risk decisions.
              </li>
              <li>
                <strong>source</strong> and <strong>legal basis</strong> - required for responsible outreach.
              </li>
              <li>
                <strong>tags</strong> or segment notes - useful for offer targeting.
              </li>
            </ul>
          </>
        )
      },
      {
        question: "Why does the app care about source and legal basis?",
        answer: (
          <p>
            Because global outreach is not only a sending problem. You need to know where a lead came from,
            why you believe contacting them is acceptable, and which region they belong to. Missing data does
            not always mean the lead is unusable, but it should be treated as <strong>higher risk</strong>.
          </p>
        )
      },
      {
        question: "What happens to duplicate, invalid, or suppressed leads?",
        answer: (
          <p>
            The import flow flags invalid emails, detects duplicates, and checks the suppression list.
            Suppressed contacts should not become sendable campaign recipients. This protects your domain and
            avoids contacting people who already opted out or should not be contacted.
          </p>
        )
      }
    ]
  },
  {
    title: "Campaigns And Sending",
    description: "How campaigns move from AI draft to safe queue-based sending.",
    items: [
      {
        question: "Can the AI send a campaign without my approval?",
        answer: (
          <p>
            No. Campaign copy must pass the safety checklist and be approved before scheduling. This is
            intentional. AI can draft, but you control when outreach starts.
          </p>
        )
      },
      {
        question: "What is dry-run mode?",
        defaultOpen: true,
        answer: (
          <p>
            <strong>Dry-run mode</strong> lets the platform create queue jobs, message records, reply drafts,
            and reports without sending external email. Keep dry-run enabled until SMTP, domain
            authentication, and test-inbox delivery are verified.
          </p>
        )
      },
      {
        question: "What happens when I schedule a campaign?",
        answer: (
          <p>
            Scheduling creates message records and queue jobs. The worker sends one job at a time and
            re-checks suppression, lead status, campaign status, account status, and sending limits
            immediately before each email.
          </p>
        )
      },
      {
        question: "Why are sending limits so conservative?",
        answer: (
          <p>
            Sudden volume is risky. Conservative daily, per-minute, and per-domain caps help protect sender
            reputation. For large volume such as <strong>100k/month</strong>, increase slowly only after
            bounce, complaint, unsubscribe, reply quality, and inbox placement are healthy.
          </p>
        )
      },
      {
        question: "What is the global kill switch?",
        answer: (
          <p>
            The kill switch pauses active sending jobs. Use it immediately if you see unusual bounces,
            complaints, provider errors, wrong audience, missing unsubscribe, or any campaign mistake.
          </p>
        )
      }
    ]
  },
  {
    title: "AI Inbox And Replies",
    description: "How replies become AI-classified tasks, drafts, and hot handoffs.",
    items: [
      {
        question: "How do replies enter the platform?",
        answer: (
          <ul className="faq-list">
            <li>
              <strong>Manual mode:</strong> paste the reply into the AI Inbox.
            </li>
            <li>
              <strong>Webhook mode:</strong> connect an inbound email parser to{" "}
              <code>/api/inbound/replies</code>
              with the <code>x-inbound-secret</code> header.
            </li>
          </ul>
        )
      },
      {
        question: "What does the AI do with each reply?",
        defaultOpen: true,
        answer: (
          <p>
            The AI classifies intent, sentiment, confidence, summary, suggested next action, and lead score.
            It can identify <strong>meeting requests</strong>, <strong>pricing questions</strong>,
            <strong>portfolio requests</strong>, objections, not-interested replies, unsubscribe requests,
            complaints, and unclear replies.
          </p>
        )
      },
      {
        question: "Does a reply stop future follow-ups?",
        answer: (
          <p>
            Yes. When a lead replies, queued follow-ups for that lead are skipped so the conversation moves
            into the AI Inbox instead of continuing an automated sequence.
          </p>
        )
      },
      {
        question: "When should I personally take over?",
        answer: (
          <ul className="faq-list">
            <li>Meeting request.</li>
            <li>Pricing, quote, or proposal request.</li>
            <li>Strong buying signal.</li>
            <li>Complaint or legal concern.</li>
            <li>High-value but unclear reply.</li>
            <li>Anything where AI would need to promise availability, pricing, guarantees, or scope.</li>
          </ul>
        )
      },
      {
        question: "Can AI send replies automatically?",
        answer: (
          <p>
            The system can generate and send an AI draft from the inbox, but you should treat this as a
            <strong>review-first workflow</strong>. Keep auto-reply behavior conservative. Do not send AI
            replies to unsubscribes, complaints, suppressed leads, or do-not-contact leads.
          </p>
        )
      }
    ]
  },
  {
    title: "Pipeline And Closing",
    description: "How the app decides what deserves your attention.",
    items: [
      {
        question: "What is a hot lead?",
        answer: (
          <p>
            A hot lead is a reply with strong buying intent, such as asking for a meeting, price, proposal, or
            clear next step. These appear in the pipeline so you can handle them personally.
          </p>
        )
      },
      {
        question: "What do the scores mean?",
        answer: (
          <ul className="faq-list">
            <li>
              <strong>Fit score:</strong> how complete and relevant the lead profile looks.
            </li>
            <li>
              <strong>Engagement score:</strong> how strongly the lead interacted.
            </li>
            <li>
              <strong>Intent score:</strong> how close the reply is to a real opportunity.
            </li>
          </ul>
        )
      },
      {
        question: "How should I use the pipeline?",
        answer: (
          <p>
            Start with <strong>Hot</strong> and <strong>Owner handling</strong>. Move deals as you work them:
            engaged, proposal sent, follow up later, won, or lost. The pipeline is intentionally lightweight
            so it helps you close without becoming a full CRM.
          </p>
        )
      }
    ]
  },
  {
    title: "Safety And Compliance Rules",
    description: "Rules that protect sender reputation and reduce legal risk.",
    items: [
      {
        question: "What are the non-negotiable safety rules?",
        defaultOpen: true,
        answer: (
          <ul className="faq-list">
            <li>
              Never email a lead marked <strong>unsubscribed</strong>, <strong>suppressed</strong>, or
              <strong> do not contact</strong>.
            </li>
            <li>Every campaign email must include an unsubscribe link.</li>
            <li>Use truthful sender identity and non-deceptive subject lines.</li>
            <li>Do not invent proof, case studies, prices, guarantees, or urgency.</li>
            <li>Pause sending if bounce, complaint, unsubscribe, or provider errors spike.</li>
            <li>Respect country/region differences. When in doubt, treat the lead as higher risk.</li>
          </ul>
        )
      },
      {
        question: "What should AI never do?",
        answer: (
          <ul className="faq-list">
            <li>Never pretend it has a personal relationship with the lead.</li>
            <li>Never claim guaranteed revenue, guaranteed timelines, or fake results.</li>
            <li>Never continue after an unsubscribe or complaint.</li>
            <li>Never quote prices unless you added approved pricing rules.</li>
            <li>Never promise a meeting time or WhatsApp follow-up on your behalf.</li>
          </ul>
        )
      },
      {
        question: "What must be verified before real sending?",
        answer: (
          <ul className="faq-list">
            <li>SMTP credentials work.</li>
            <li>SPF, DKIM, and DMARC are configured for the sending domain.</li>
            <li>Reply-to inbox receives real replies.</li>
            <li>Unsubscribe links work.</li>
            <li>Test emails reach inboxes, not only provider logs.</li>
            <li>Sending caps are conservative for the first campaigns.</li>
          </ul>
        )
      }
    ]
  },
  {
    title: "Troubleshooting",
    description: "Simple checks when something does not look right.",
    items: [
      {
        question: "A campaign is not sending. What should I check?",
        answer: (
          <ul className="faq-list">
            <li>
              Is the worker running with <code>npm run worker</code>?
            </li>
            <li>Is the campaign approved and scheduled?</li>
            <li>Is the global kill switch off?</li>
            <li>Is the sending account active?</li>
            <li>Are leads suppressed, unsubscribed, bounced, or do-not-contact?</li>
            <li>Have the daily, per-minute, or per-domain caps been reached?</li>
          </ul>
        )
      },
      {
        question: "AI is not using OpenAI. Is that broken?",
        answer: (
          <p>
            Not necessarily. If <code>OPENAI_API_KEY</code> is missing, the app uses local fallback logic for
            campaign generation and reply classification. This keeps the system usable offline, but real AI
            quality requires a configured OpenAI key.
          </p>
        )
      },
      {
        question: "Why did a follow-up get skipped?",
        answer: (
          <p>
            A follow-up can be skipped because the lead replied, unsubscribed, was suppressed, hit a safety
            status, or the campaign/job state changed. Skipped sends are usually a safety feature, not a bug.
          </p>
        )
      },
      {
        question: "What is the safest way to begin real outreach?",
        answer: (
          <p>
            Start with a small, high-quality list. Keep copy specific and low pressure. Send slowly. Watch
            replies, bounces, unsubscribes, and complaint-risk signals. Increase volume only when the numbers
            stay healthy.
          </p>
        )
      }
    ]
  }
];

export default function FaqPage() {
  return (
    <>
      <PageHeader
        eyebrow="Help Center"
        title="FAQ and operating guide"
        description="A simple owner guide for using the Virtuprose AI email sales agent without hurting deliverability, compliance, or lead quality."
        actions={
          <>
            <Link className="secondary-button" href="/settings">
              Check settings <ShieldCheck size={16} aria-hidden="true" />
            </Link>
            <Link className="button" href="/leads/import">
              Import leads <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </>
        }
      />

      <section className="faq-hero panel">
        <div>
          <p className="eyebrow">Read this first</p>
          <h2>The safe operating loop</h2>
          <p>
            <strong>Import leads</strong>, <strong>choose offer</strong>, <strong>approve campaign</strong>,{" "}
            <strong>send slowly</strong>, <strong>review replies</strong>, then{" "}
            <strong>close hot leads</strong>. Keep dry-run on until real SMTP, domain records, and inbox
            receipt are verified.
          </p>
        </div>
        <div className="faq-hero-icon" aria-hidden="true">
          <BookOpenCheck size={34} />
        </div>
      </section>

      <div className="faq-layout">
        <aside className="faq-side panel" aria-label="Guide summary">
          <div className="panel-body stack">
            <div>
              <h2>Quick Rules</h2>
              <p className="muted">Use these as the operating baseline.</p>
            </div>
            <Rule label="Dry-run first" detail="Never start real volume before test delivery is proven." />
            <Rule label="Review AI" detail="AI drafts help you move faster, but owner review stays safest." />
            <Rule
              label="Stop after reply"
              detail="A real reply moves the lead into the inbox conversation."
            />
            <Rule label="Respect opt-outs" detail="Unsubscribe, complaint, and suppression always win." />
            <Rule
              label="Close hot leads"
              detail="Pricing, proposal, or meeting intent should be handled by you."
            />
          </div>
        </aside>

        <main className="stack" aria-label="Frequently asked questions">
          {faqSections.map((section) => (
            <section className="panel faq-section" key={section.title}>
              <div className="panel-header">
                <div>
                  <h2>{section.title}</h2>
                  <p className="muted">{section.description}</p>
                </div>
                <Sparkles size={18} aria-hidden="true" />
              </div>
              <div className="panel-body stack">
                {section.items.map((item) => (
                  <details className="faq-item" key={item.question} open={item.defaultOpen}>
                    <summary>{item.question}</summary>
                    <div className="faq-answer">{item.answer}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </main>
      </div>
    </>
  );
}

function Rule({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="faq-rule">
      <strong>{label}</strong>
      <span>{detail}</span>
    </div>
  );
}
