/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function LoginForm({ errorMessage }: { errorMessage?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState(errorMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email");
    const password = formData.get("password");

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      setMessage("Enter both your email address and password.");
      setIsSubmitting(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage("That email and password combination was not recognized.");
        setIsSubmitting(false);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setMessage("The sign-in service is unavailable. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-field">
        <label htmlFor="email">Email address</label>
        <input
          autoComplete="username"
          id="email"
          name="email"
          placeholder="you@example.com"
          required
          type="email"
        />
      </div>
      <div className="login-field">
        <label htmlFor="password">Password</label>
        <input
          autoComplete="current-password"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      <p className="login-error" aria-live="polite">
        {message ?? "\u00a0"}
      </p>
      <button className="login-submit" disabled={isSubmitting} type="submit">
        <span>{isSubmitting ? "Signing in…" : "Enter the radar"}</span>
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
