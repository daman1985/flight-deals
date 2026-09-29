/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

const navigation = [
  { href: "/", label: "Briefing" },
  { href: "/watches", label: "Watches" },
] as const;

export function AppShell({
  children,
  isAuthenticated,
}: {
  children: React.ReactNode;
  isAuthenticated: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut({ scope: "local" });

      if (error) {
        setIsSigningOut(false);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Fare Radar home">
          <span className="wordmark-mark" aria-hidden="true">FR</span>
          <span className="wordmark-copy">
            <strong>Fare Radar</strong>
            <small>Cross-cabin intelligence</small>
          </span>
        </Link>
        {isAuthenticated ? (
          <nav className="nav-list" aria-label="Primary navigation">
            {navigation.map((item, index) => {
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
                  <span className="nav-index" aria-hidden="true">
                    0{index + 1}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ) : (
          <p className="access-note">Private access</p>
        )}
        <div className="system-actions">
          <p className="system-note">
            <span className="system-dot" aria-hidden="true" />
            {isAuthenticated ? "Calibration mode" : "Secure session"}
          </p>
          {isAuthenticated ? (
            <button
              className="signout-button"
              disabled={isSigningOut}
              onClick={handleSignOut}
              type="button"
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          ) : null}
        </div>
      </header>
      <div className="radar-tape" aria-hidden="true">
        <span>RELATIVE VALUE</span>
        <span>CABIN SPREAD</span>
        <span>SEARCH HEALTH</span>
        <span>EVIDENCE FIRST</span>
      </div>
      <main className="main-content" id="main-content">
        {children}
      </main>
      <footer className="site-footer">
        <span>Private preview / foundation</span>
        <span>Fares are evidence. Relationships are signal.</span>
      </footer>
    </div>
  );
}
