export function LoginForm({ errorMessage }: { errorMessage?: string }) {
  return (
    <form className="login-form" action="/auth/login" method="post">
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
        {errorMessage ?? "\u00a0"}
      </p>
      <button className="login-submit" type="submit">
        <span>Enter the radar</span>
        <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
