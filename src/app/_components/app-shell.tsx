"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", label: "Deal Feed" },
  { href: "/watches", label: "Watches" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <Link className="wordmark" href="/" aria-label="Flight Deals home">
          <span className="wordmark-mark" aria-hidden="true">
            FD
          </span>
          <span>Flight Deals</span>
        </Link>
        <nav className="nav-list">
          {navigation.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                className="nav-link"
                data-active={active || undefined}
                href={item.href}
                key={item.href}
                aria-current={active ? "page" : undefined}
              >
                <span className="nav-rule" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="sidebar-note">
          Private preview
          <span>Milestone 0 foundation</span>
        </p>
      </aside>
      <main className="main-content" id="main-content">
        {children}
      </main>
    </div>
  );
}
