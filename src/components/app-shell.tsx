"use client";

import {
  BarChart3,
  Bot,
  ChevronLeft,
  CircleHelp,
  Flame,
  Home,
  Inbox,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Palette,
  Plus,
  Send,
  Settings,
  Sparkles,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";

const navGroups = [
  {
    label: "Studio",
    items: [
      { href: "/", label: "Today", icon: Home, exact: true },
      { href: "/campaigns", label: "Campaign Studio", icon: Send },
      { href: "/email-design-templates", label: "Email Designs", icon: Palette },
      { href: "/leads", label: "Leads", icon: UsersRound },
      { href: "/pipeline", label: "Hot Leads", icon: Flame }
    ]
  },
  {
    label: "Conversations",
    items: [
      { href: "/inbox", label: "Replies", icon: Inbox },
      { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { href: "/ai-assistant", label: "AI Assistant", icon: Bot }
    ]
  },
  {
    label: "Control",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/faq", label: "Help", icon: CircleHelp },
      { href: "/settings", label: "Settings", icon: Settings }
    ]
  }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  function toggleCollapsed() {
    setCollapsed((current) => !current);
  }

  if (pathname.startsWith("/unsubscribe")) {
    return <main className="public-main">{children}</main>;
  }

  return (
    <div className={clsx("app-shell studio-shell", collapsed && "studio-shell-collapsed")}>
      <aside className="sidebar studio-sidebar" aria-label="Primary navigation">
        <div className="brand studio-brand">
          <div className="brand-mark studio-brand-mark">V</div>
          <div className="studio-brand-copy">
            <p className="brand-title">Virtuprose</p>
            <p className="brand-subtitle">Sales Studio</p>
          </div>
        </div>

        <button
          className="sidebar-collapse"
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          <span>Collapse</span>
        </button>

        <nav className="nav studio-nav">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx("nav-link", isActive && "nav-link-active")}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                    {isActive ? (
                      <ChevronLeft className="nav-active-caret" size={14} aria-hidden="true" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-note studio-sidebar-note">
          <strong>AI safe mode</strong>
          <p>Compliance checks, opt-outs, queue limits, and owner handoff stay active.</p>
        </div>
      </aside>

      <div className="studio-workspace">
        <header className="studio-topbar">
          <div className="command-search" role="status" aria-label="Workspace status">
            <Sparkles size={16} aria-hidden="true" />
            <span>Campaign studio ready. Start with leads, campaigns, or replies.</span>
            <kbd>Live</kbd>
          </div>
          <div className="studio-topbar-actions">
            <span className="studio-health-pill">
              <Sparkles size={14} aria-hidden="true" /> AI ready
            </span>
            <Link className="secondary-button studio-quick-action" href="/leads/import">
              <UsersRound size={16} aria-hidden="true" /> Add leads
            </Link>
            <Link className="button studio-quick-action" href="/campaigns/new">
              <Plus size={16} aria-hidden="true" /> New campaign
            </Link>
          </div>
        </header>

        <main className="main studio-main">{children}</main>
      </div>
    </div>
  );
}
