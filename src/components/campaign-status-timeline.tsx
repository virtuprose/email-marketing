import { CampaignStatus } from "@prisma/client";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { campaignStatusLabels } from "@/lib/status";

const steps: CampaignStatus[] = [
  CampaignStatus.DRAFT,
  CampaignStatus.REVIEW_READY,
  CampaignStatus.APPROVED,
  CampaignStatus.SCHEDULED,
  CampaignStatus.SENDING,
  CampaignStatus.COMPLETED
];

export function CampaignStatusTimeline({ status }: { status: CampaignStatus }) {
  const currentIndex = steps.includes(status)
    ? steps.indexOf(status)
    : status === CampaignStatus.REVIEW_BLOCKED
      ? 1
      : 0;

  return (
    <ol className="campaign-status-timeline" aria-label="Campaign progress">
      {steps.map((step, index) => {
        const complete = index < currentIndex || status === CampaignStatus.COMPLETED;
        const active =
          index === currentIndex ||
          (status === CampaignStatus.REVIEW_BLOCKED && step === CampaignStatus.REVIEW_READY);
        const Icon =
          status === CampaignStatus.SENDING && step === CampaignStatus.SENDING
            ? Loader2
            : complete
              ? CheckCircle2
              : Circle;

        return (
          <li
            className={
              active
                ? "timeline-step timeline-step-active"
                : complete
                  ? "timeline-step timeline-step-done"
                  : "timeline-step"
            }
            key={step}
          >
            <Icon size={16} aria-hidden="true" className={Icon === Loader2 ? "animate-spin" : undefined} />
            <span>{step === CampaignStatus.REVIEW_READY ? "Review" : campaignStatusLabels[step]}</span>
          </li>
        );
      })}
    </ol>
  );
}
