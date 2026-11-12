import React, { useCallback, useEffect, useRef, useState } from "react";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import { Icon } from "./components/Icons.jsx";

export default function App() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("salesport-theme") === "dark"
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("salesport-theme", theme);
    } catch {}
  }, [theme]);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [initialError, setInitialError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session")
      .then(async (response) => {
        if (response.status === 401) return { user: null };
        if (!response.ok) throw new Error("Server unavailable");
        return response.json();
      })
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch((error) => {
        if (active && error.status !== 401)
          setInitialError(
            "The server is unavailable. Please try signing in again.",
          );
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const login = async (credentials) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    }).catch(() => {
      throw new Error("Cannot reach the server. Please try again.");
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.user) {
      throw new Error(
        result.message || "Cannot sign in right now. Please try again.",
      );
    }
    setInitialError("");
    setUser(result.user);
  };
  const logout = async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Unable to sign out. Please try again.");
    setUser(null);
  };
  const expire = useCallback(() => setUser(null), []);
  if (checking)
    return (
      <div className="boot-screen" role="status">
        <div className="boot-mark">
          <Icon name="logo" size={34} />
        </div>
        <strong>
          SalesPort<span>.</span>
        </strong>
        <div className="boot-progress" />
        <span className="sr-only">Opening your workspace</span>
      </div>
    );
  return (
    <PageTransition view={user ? "dashboard" : "login"}>
      {user ? (
        <Dashboard
          user={user}
          onLogout={logout}
          onSessionExpired={expire}
          PageTransition={PageTransition}
          theme={theme}
          onToggleTheme={() =>
            setTheme((value) => (value === "dark" ? "light" : "dark"))
          }
        />
      ) : (
        <>
          <Login onLogin={login} />
          {initialError && (
            <div className="connection-message" role="alert">
              {initialError}
            </div>
          )}
        </>
      )}
    </PageTransition>
  );
}

function PageTransition({ view, children }) {
  const [visible, setVisible] = useState({ view, children });
  const [leaving, setLeaving] = useState(false);
  const latestChildren = useRef(children);
  const displayedChildren = useRef(children);
  const container = useRef(null);
  latestChildren.current = children;
  if (view === visible.view) displayedChildren.current = children;
  useEffect(() => {
    if (view === visible.view) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setLeaving(true);
    const timer = setTimeout(
      () => {
        setVisible({ view, children: latestChildren.current });
        setLeaving(false);
        container.current
          ?.closest(".dashboard-content")
          ?.scrollTo({ top: 0, behavior: "instant" });
        window.scrollTo({ top: 0, behavior: "instant" });
      },
      reduceMotion ? 0 : 180,
    );
    return () => clearTimeout(timer);
  }, [view, visible.view]);
  return (
    <div
      ref={container}
      key={visible.view}
      className={`page-transition ${leaving ? "page-leaving" : "page-entering"}`}
      inert={leaving || undefined}
    >
      {view === visible.view ? children : displayedChildren.current}
    </div>
  );
}
