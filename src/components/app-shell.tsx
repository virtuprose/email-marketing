"use client";

import {
  BarChart3,
  Bot,
  CircleHelp,
  Inbox,
  Library,
  ListFilter,
  Send,
  Settings,
  ShieldAlert,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import clsx from "clsx";

const navItems = [
  { href: "/", label: "Command Center", icon: BarChart3, exact: true },
  { href: "/leads", label: "Leads", icon: UsersRound, exact: true },
  { href: "/leads/import", label: "Import", icon: ListFilter },
  { href: "/offers", label: "Offers", icon: Library },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/suppression", label: "Suppression", icon: ShieldAlert },
  { href: "/inbox", label: "AI Inbox", icon: Inbox },
  { href: "/pipeline", label: "Pipeline", icon: Bot },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/faq", label: "FAQ", icon: CircleHelp },
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
            <p className="brand-title">Virtuprose Agent</p>
            <p className="brand-subtitle">AI inbox and pipeline</p>
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
          <strong>Safety first</strong>
          <p>Suppression, source, and legal-basis checks are built before campaign sending.</p>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
