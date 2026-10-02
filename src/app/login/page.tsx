import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) redirect("/");

  return (
    <div className="page-frame login-page">
      <section className="login-intro" aria-labelledby="login-heading">
        <p className="folio">Private preview / authenticated access</p>
        <p className="eyebrow">Cross-cabin intelligence</p>
        <h1 id="login-heading">
          Your radar.
          <br />
          <em>Eyes only.</em>
        </h1>
        <p className="login-deck">
          Sign in to review monitored routes, cabin relationships, and the
          evidence behind every signal.
        </p>
      </section>
      <aside className="login-panel" aria-label="Sign in">
        <div className="login-panel-heading">
          <span>Access ledger</span>
          <strong>01 / 01</strong>
        </div>
        <div className="login-panel-copy">
          <p className="eyebrow">Identity check</p>
          <h2>Continue to Fare Radar</h2>
          <p>Use the Supabase account you just confirmed.</p>
        </div>
        <LoginForm
          errorMessage={
            query.error === "service"
              ? "The sign-in service is unavailable. Please try again."
              : query.error
                ? "That email and password combination was not recognized."
                : undefined
          }
        />
        <p className="login-footnote">
          Credentials are exchanged directly with your Supabase project and
          stored in secure session cookies.
        </p>
      </aside>
    </div>
  );
}
