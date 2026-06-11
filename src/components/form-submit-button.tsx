"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function FormSubmitButton({
  children,
  pendingLabel = "Working...",
  variant = "default",
  disabled
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost" | "link";
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={disabled || pending}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
}
