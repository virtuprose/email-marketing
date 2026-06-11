"use client";

import { Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { EmailPreviewFrame } from "@/components/email-preview-frame";

export function EmailTemplatePreviewDialog({
  title,
  description,
  html,
  triggerLabel = "Preview"
}: {
  title: string;
  description: string;
  html: string;
  triggerLabel?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button className="secondary-button" type="button">
            <Eye size={16} aria-hidden="true" /> {triggerLabel}
          </button>
        }
      />
      <DialogContent className="email-template-preview-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="email-preview-grid email-preview-grid-modal">
          <EmailPreviewFrame title={`${title} desktop preview`} html={html} mode="desktop" />
          <EmailPreviewFrame title={`${title} mobile preview`} html={html} mode="mobile" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
