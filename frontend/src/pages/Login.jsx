import React, { useEffect, useRef, useState } from "react";
import "../styles/login.css";

function LoginIcon({ name, size = 20, ...props }) {
  const paths = {
    logo: (
      <>
        <path d="M3 8h12l-3-3M21 16H9l3 3M3 14l4 4m14-8-4-4" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="4" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    eyeOff: (
      <>
        <path d="m3 3 18 18M10 5.2A12 12 0 0 1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3 3.8M6.3 6.3A21 21 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.7-1.4M10 10a3 3 0 0 0 4 4" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3Z" />
        <path d="m8.5 12 2.3 2.3 4.7-4.7" />
      </>
    ),
    spark: (
      <>
        <path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z" />
      </>
    ),
    check: (
      <>
        <path d="m5 12 4 4L19 6" />
      </>
    ),
    trend: (
      <>
        <path d="m3 17 6-6 4 4 8-10m-6 0h6v6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.spark}
    </svg>
  );
}

function WorkspacePreview() {
  return (
    <div className="login-visual" aria-hidden="true">
      <div className="login-orbit login-orbit-one" />
      <div className="login-orbit login-orbit-two" />
      <div className="login-preview-card">
        <div className="login-preview-top">
          <span className="login-preview-mark">
            <LoginIcon name="logo" size={18} />
          </span>
          <span>Overview</span>
          <span className="login-preview-dots">•••</span>
        </div>
        <div className="login-preview-metrics">
          <div>
            <span>Total revenue</span>
            <strong>
              ₱1,284,520<span>.00</span>
            </strong>
          </div>
          <span className="login-preview-growth">
            <LoginIcon name="trend" size={14} /> 18.6%
          </span>
        </div>
        <div className="login-preview-chart">
          <svg viewBox="0 0 440 190" preserveAspectRatio="none">
            <defs>
              <linearGradient id="login-chart-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#6797ff" stopOpacity=".35" />
                <stop offset="100%" stopColor="#6797ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 30H440M0 75H440M0 120H440M0 165H440"
              stroke="white"
              strokeOpacity=".075"
              strokeDasharray="3 5"
            />
            <path
              d="M0 148C20 147 24 130 45 133S75 160 96 123 122 118 144 100 167 131 189 97 216 98 238 71 263 92 286 56 310 79 334 42 360 65 384 29 420 42 440 15V190H0Z"
              fill="url(#login-chart-fill)"
            />
            <path
              className="login-chart-line"
              d="M0 148C20 147 24 130 45 133S75 160 96 123 122 118 144 100 167 131 189 97 216 98 238 71 263 92 286 56 310 79 334 42 360 65 384 29 420 42 440 15"
              fill="none"
              stroke="#8ab0ff"
              strokeWidth="3"
            />
            <circle cx="334" cy="42" r="8" fill="#7cafff" fillOpacity=".2" />
            <circle
              cx="334"
              cy="42"
              r="4"
              fill="#b8d2ff"
              stroke="#1b376c"
              strokeWidth="2"
            />
          </svg>
          <div className="login-chart-days">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>
        </div>
        <div className="login-preview-bottom">
          <span>
            <i /> Revenue
          </span>
          <span>
            This month <LoginIcon name="trend" size={13} />
          </span>
        </div>
      </div>
      <div className="login-float-card login-float-orders">
        <span className="login-float-icon">
          <LoginIcon name="check" size={17} />
        </span>
        <div>
          <span>Orders completed</span>
          <strong>
            3,486 <small>+12.4%</small>
          </strong>
        </div>
      </div>
    </div>
  );
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function signIn(mode) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    setBusy(mode);
    try {
      await onLogin({
        email:
          mode === "demo" ? "demo@salesport.app" : email.trim().toLowerCase(),
        password: mode === "demo" ? "Demo2026!" : password,
        remember: mode === "demo" ? true : remember,
      });
    } catch (cause) {
      if (mounted.current)
        setError(
          cause?.message || "We could not sign you in. Please try again.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    void signIn("credentials");
  }

  return (
    <main className="login-screen">
      <section className="login-story" aria-label="About SalesPort">
        <div className="login-story-glow login-story-glow-one" />
        <div className="login-story-glow login-story-glow-two" />
        <div className="login-story-grid" />
        <div className="login-brand" aria-label="SalesPort ERP">
          <span>
            <LoginIcon name="logo" size={27} />
          </span>
          SalesPort<span className="login-brand-erp">ERP</span>
        </div>
        <div className="login-story-copy">
          <h1>Your workspace.</h1>
        </div>
        <WorkspacePreview />
      </section>
      <section className="login-form-side" aria-label="Sign in to SalesPort">
        <div className="login-form-card">
          <span className="login-welcome-symbol">
            <LoginIcon name="logo" size={30} />
          </span>
          <div className="login-form-heading">
            <h2>Sign in</h2>
          </div>
          <form
            className="login-form"
            onSubmit={submit}
            aria-busy={Boolean(busy)}
          >
            <label className="login-field-label" htmlFor="login-email">
              Email address
            </label>
            <div
              className={`login-input-wrap ${error ? "login-input-invalid" : ""}`}
            >
              <LoginIcon name="mail" />
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
                placeholder="you@company.com"
                required
                disabled={Boolean(busy)}
                aria-describedby={error ? "login-error" : undefined}
              />
            </div>
            <label
              className="login-field-label login-password-label"
              htmlFor="login-password"
            >
              Password
            </label>
            <div
              className={`login-input-wrap ${error ? "login-input-invalid" : ""}`}
            >
              <LoginIcon name="lock" />
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError("");
                }}
                placeholder="Enter your password"
                required
                disabled={Boolean(busy)}
                aria-describedby={error ? "login-error" : undefined}
              />
              <button
                className="login-eye-button"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                disabled={Boolean(busy)}
              >
                <LoginIcon name={showPassword ? "eyeOff" : "eye"} size={19} />
              </button>
            </div>
            <label className="login-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                disabled={Boolean(busy)}
              />
              <span>Remember me</span>
            </label>
            {error && (
              <p className="login-error" id="login-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="login-submit"
              type="submit"
              disabled={Boolean(busy)}
            >
              {busy === "credentials" ? (
                <>
                  <span className="login-spinner" /> Signing in…
                </>
              ) : (
                <>
                  Sign in <LoginIcon name="arrow" size={19} />
                </>
              )}
            </button>
          </form>
          <div className="login-divider">
            <span />
            or
            <span />
          </div>
          <button
            className="login-demo-button"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => signIn("demo")}
          >
            {busy === "demo" ? (
              <>
                <span className="login-spinner" /> Opening demo…
              </>
            ) : (
              <>
                <LoginIcon name="spark" size={18} /> Try demo{" "}
                <LoginIcon name="arrow" size={17} />
              </>
            )}
          </button>
          <div className="login-demo-credentials">
            <span className="login-demo-caption">DEMO ACCOUNT</span>
            <div>
              <span>Email</span>
              <code>demo@salesport.app</code>
            </div>
            <div>
              <span>Password</span>
              <code>Demo2026!</code>
            </div>
          </div>
        </div>
        <footer className="login-form-footer">
          <span>© 2026 SalesPort</span>
        </footer>
      </section>
    </main>
  );
}
