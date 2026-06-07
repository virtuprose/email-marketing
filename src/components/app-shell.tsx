"use client";

import { CircleHelp, Flame, Home, Inbox, MessageCircle, Send, Settings, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import clsx from "clsx";

const navItems = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/leads", label: "Add Leads", icon: UsersRound },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/inbox", label: "Replies", icon: Inbox },
  { href: "/pipeline", label: "Hot Leads", icon: Flame },
  { href: "/faq", label: "Help", icon: CircleHelp },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname.startsWith("/unsubscribe")) {
    return <main className="public-main">{children}</main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark">V</div>
          <div>
            <p className="brand-title">Virtuprose Sales Assistant</p>
            <p className="brand-subtitle">AI follows up. You close.</p>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx("nav-link", isActive && "nav-link-active")}
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-note">
          <strong>Safe by default</strong>
          <p>
            The assistant skips people who opted out, checks missing contact details, and asks before live
            sends.
          </p>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
