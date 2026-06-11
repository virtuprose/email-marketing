"use client";

import type { ReactElement, ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";

export function ActionSheet({
  trigger,
  title,
  description,
  children
}: {
  trigger: ReactElement;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger render={trigger} />
      <SheetContent className="premium-sheet">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="sheet-body">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
