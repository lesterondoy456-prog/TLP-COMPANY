import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icons.jsx";
import Sidebar from "../components/Sidebar.jsx";
import Reports from "./Reports.jsx";
import RevenueChart from "../components/RevenueChart.jsx";
import "../styles/dashboard.css";

const money = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
const compact = (value) =>
  new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value || 0);
const rowDate = (value) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(value));

export default function Dashboard({
  user,
  onLogout,
  onSessionExpired,
  PageTransition,
  theme,
  onToggleTheme,
}) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [period, setPeriod] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setData(null);
    setError("");
    let timer;
    const animationDelay = new Promise((resolve) => {
      timer = setTimeout(resolve, 350);
    });
    const loadData = fetch(
      `/api/dashboard?period=${encodeURIComponent(period)}`,
      {
        signal: controller.signal,
      },
    ).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(result.metrics)) {
        const error = new Error(
          result.message || "Unable to load your dashboard. Please try again.",
        );
        error.status = response.status;
        throw error;
      }
      return result;
    });
    Promise.all([loadData, animationDelay])
      .then(([result]) => {
        if (active) setData(result);
      })
      .catch((cause) => {
        if (!active || cause.name === "AbortError") return;
        if (cause.status === 401) onSessionExpired();
        else setError(cause.message || "Unable to load your dashboard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [period, revision, onSessionExpired]);
  const refresh = () => setRevision((value) => value + 1);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All orders");
  const [page, setPage] = useState(1);
  const [popover, setPopover] = useState("");
  const notificationStorageKey = `salesport-notifications:${user.email}`;
  const [readNotificationIds, setReadNotificationIds] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(notificationStorageKey) || "[]",
      );
      return Array.isArray(saved)
        ? saved.filter((id) => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        notificationStorageKey,
        JSON.stringify(readNotificationIds),
      );
    } catch {}
  }, [readNotificationIds, notificationStorageKey]);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const searchInput = useRef(null);
  const popoverRef = useRef(null);
  const notificationButton = useRef(null);
  const notifications = data?.notifications || [];
  const isUnread = (notification) =>
    !notification.read && !readNotificationIds.includes(notification.id);
  const unreadCount = notifications.filter(isUnread).length;
  const closeNotifications = () => {
    setPopover("");
    notificationButton.current?.focus();
  };
  const openNotification = (notification) => {
    setReadNotificationIds((ids) => [...new Set([...ids, notification.id])]);
    setPopover("");
    const order = data?.orders.find((item) => item.id === notification.orderId);
    if (order) setDialog({ type: "order", order });
    else if (notification.kind === "target") {
      setActiveTab("reports");
      setFilter("All orders");
    } else setActiveTab("dashboard");
    notificationButton.current?.focus();
  };
  useEffect(() => {
    const close = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target))
        setPopover("");
    };
    const key = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === "Escape") {
        if (document.getElementById("notifications-panel"))
          notificationButton.current?.focus();
        setPopover("");
        setMobileOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setPage(1);
  }, [search, filter]);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);
  const orders = useMemo(
    () =>
      (data?.orders || []).filter(
        (order) =>
          (filter === "All orders" || order.status === filter) &&
          `${order.id} ${order.customer} ${order.company} ${order.product}`
            .toLowerCase()
            .includes(search.toLowerCase().trim()),
      ),
    [data, search, filter],
  );
  const pages = Math.max(1, Math.ceil(orders.length / 5));
  const safePage = Math.min(page, pages);
  const visibleOrders = orders.slice((safePage - 1) * 5, safePage * 5);
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onLogout();
    } catch {
      setToast("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  };
  const exportReport = () => {
    if (!data) return;
    const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
    const rows = [
      ["SalesPort report", period],
      [],
      ["Metric", "Value"],
      ...data.metrics.map((metric) => [metric.label, metric.value]),
      [],
      ["Order", "Customer", "Product", "Amount (PHP)", "Status"],
      ...orders.map((order) => [
        order.id,
        order.customer,
        order.product,
        order.amount,
        order.status,
      ]),
    ];
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(quote).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SalesPort-report-${period}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Your report is ready. Download started.");
  };
  const targetPercent = Math.min(
    100,
    ((data?.target.current || 0) / (data?.target.goal || 1)) * 100,
  );
  return (
    <div className={`app-shell ${collapsed ? "sidebar-compact" : ""}`}>
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapse={() => setCollapsed((value) => !value)}
        onClose={() => setMobileOpen(false)}
        user={user}
        activeTab={activeTab}
        onNavigate={(tab) => {
          setActiveTab(tab);
          setMobileOpen(false);
          setPopover("");
          setFilter("All orders");
        }}
        onLogout={signOut}
        signingOut={signingOut}
      />
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Icon name="menu" />
            </button>
            <Icon name="grid" size={17} />
            <span>Workspace</span>
            <Icon name="chevronRight" size={13} />
            <strong>{activeTab === "reports" ? "Reports" : "Dashboard"}</strong>
          </div>
          <div className="topbar-actions">
            <label className="global-search">
              <Icon name="search" size={17} />
              <input
                ref={searchInput}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search orders..."
                aria-label="Search orders"
              />
              <kbd>⌘ K</kbd>
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </label>
            <div className="account-actions" ref={popoverRef}>
              <button
                className="icon-button theme-toggle"
                onClick={onToggleTheme}
                aria-label={
                  theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
                }
                title={theme === "dark" ? "Light mode" : "Dark mode"}
                aria-pressed={theme === "dark"}
              >
                <Icon name={theme === "dark" ? "sun" : "moon"} />
              </button>
              <button
                ref={notificationButton}
                className={`icon-button notification-button ${popover === "notifications" ? "selected" : ""}`}
                aria-label="Notifications"
                aria-controls="notifications-panel"
                aria-expanded={popover === "notifications"}
                onClick={() =>
                  setPopover((value) =>
                    value === "notifications" ? "" : "notifications",
                  )
                }
              >
                <Icon name="bell" />
                {unreadCount > 0 && <span className="notification-dot" />}
              </button>
              <div className="topbar-divider" />
              <button
                className="profile-trigger"
                onClick={() =>
                  setPopover((value) => (value === "profile" ? "" : "profile"))
                }
                aria-expanded={popover === "profile"}
                aria-label="Open account menu"
              >
                <div className="avatar owner-avatar">
                  {user.initials || "AM"}
                </div>
                <Icon name="chevronDown" size={14} />
              </button>
              {popover === "notifications" && (
                <div
                  className="topbar-popover notifications-popover"
                  id="notifications-panel"
                  role="region"
                  aria-labelledby="notification-title"
                >
                  <header className="notification-header">
                    <div className="notification-heading">
                      <h2 id="notification-title">Notifications</h2>
                      {unreadCount > 0 && (
                        <span className="notification-count">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <button
                      className="icon-button notification-close"
                      onClick={closeNotifications}
                      aria-label="Close notifications"
                    >
                      <Icon name="x" size={18} />
                    </button>
                  </header>
                  <div className="notification-toolbar">
                    <span className="notification-summary" role="status">
                      {loading
                        ? "Loading…"
                        : unreadCount
                          ? `${unreadCount} unread`
                          : "All read"}
                    </span>
                    <button
                      className="notification-mark-all"
                      disabled={!unreadCount}
                      onClick={() =>
                        setReadNotificationIds((ids) => [
                          ...new Set([
                            ...ids,
                            ...notifications.map((item) => item.id),
                          ]),
                        ])
                      }
                    >
                      <Icon name="check" size={14} /> Mark all read
                    </button>
                  </div>
                  <div className="notification-list">
                    {notifications.map((notification) => (
                      <button
                        type="button"
                        className={`notification-entry ${isUnread(notification) ? "unread" : ""}`}
                        key={notification.id}
                        onClick={() => openNotification(notification)}
                      >
                        <span
                          className={`notification-entry-icon notification-kind-${notification.kind || "workspace"}`}
                        >
                          <Icon
                            name={
                              notification.kind === "order"
                                ? "bag"
                                : notification.kind === "target"
                                  ? "chart"
                                  : "box"
                            }
                            size={18}
                          />
                        </span>
                        <span className="notification-copy">
                          <strong>{notification.title}</strong>
                          <span className="notification-detail">
                            {notification.detail}
                          </span>
                          <small>{notification.time}</small>
                        </span>
                        {isUnread(notification) && (
                          <span
                            className="notification-unread-dot"
                            aria-label="Unread"
                          />
                        )}
                      </button>
                    ))}
                    {!notifications.length && (
                      <div className="notification-empty">
                        <Icon name="bell" size={24} />
                        <p>
                          {loading
                            ? "Loading notifications…"
                            : error
                              ? "Couldn't load notifications."
                              : "No notifications"}
                        </p>
                        {error && <button onClick={refresh}>Retry</button>}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {popover === "profile" && (
                <div className="topbar-popover profile-popover">
                  <strong>{user.name}</strong>
                  <p>{user.email}</p>
                  <span className="owner-label">Workspace owner</span>
                  <button
                    className="profile-signout"
                    disabled={signingOut}
                    onClick={signOut}
                  >
                    <Icon name="logout" size={17} />
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="dashboard-content" id={activeTab}>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button onClick={refresh}>
                Try again <Icon name="refresh" size={14} />
              </button>
            </div>
          )}
          <PageTransition view={activeTab}>
            {activeTab === "reports" ? (
              <Reports
                data={data ? { ...data, orders } : null}
                loading={loading}
                period={period}
                onPeriodChange={setPeriod}
                onExport={exportReport}
              />
            ) : (
              <>
                <div className="page-heading stagger-in">
                  <div className="page-title-row">
                    <h1>Dashboard</h1>
                    <button className="icon-button" aria-label="Refresh dashboard" title="Refresh" onClick={refresh} disabled={loading}>
                      <Icon name="refresh" size={17} className={loading ? "spin" : ""}/>
                    </button>
                  </div>
                  <div className="page-heading-actions">
                    <label className="period-select">
                      <Icon name="calendar" size={17} />
                      <select
                        aria-label="Report period"
                        value={period}
                        onChange={(event) => setPeriod(event.target.value)}
                      >
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                        <option value="90d">Last 90 days</option>
                      </select>
                      <Icon name="chevronDown" size={14} />
                    </label>
                    <button
                      className="export-button"
                      onClick={exportReport}
                      disabled={!data || loading || Boolean(error)}
                    >
                      <Icon name="download" size={16} />
                      <span>Export report</span>
                    </button>
                  </div>
                </div>
                <section className="metrics-grid" aria-label="Business metrics">
                  {Array.from({ length: 4 }, (_, index) => (
                    <MetricCard
                      key={index}
                      metric={data?.metrics[index]}
                      index={index}
                      loading={loading}
                    />
                  ))}
                </section>
                <div className="analytics-grid">
                  <section
                    className="glass-card revenue-panel stagger-in"
                    style={{ "--stagger": "140ms" }}
                  >
                    <div className="panel-heading">
                      <div>
                        <h2>Revenue overview</h2>
                      </div>
                      <span className="panel-tag">
                        <span /> Revenue
                      </span>
                    </div>
                    <div className="revenue-summary">
                      {loading ? (
                        <div className="skeleton revenue-total-skeleton" />
                      ) : (
                        <>
                          <strong>{money(data?.revenue.total)}</strong>
                          <span className="growth">
                            <Icon name="arrowUpRight" size={14} />
                            {data?.revenue.change}%
                          </span>
                          <span className="revenue-summary-note">
                            vs. previous period
                          </span>
                        </>
                      )}
                    </div>
                    <RevenueChart revenue={data?.revenue} loading={loading} />
                  </section>
                  <section
                    className="glass-card breakdown-panel stagger-in"
                    style={{ "--stagger": "210ms" }}
                  >
                    <div className="panel-heading">
                      <div>
                        <h2>Sales breakdown</h2>
                      </div>
                      <Icon name="chart" size={18} />
                    </div>
                    {loading ? (
                      <>
                        <div className="skeleton donut-skeleton" />
                        <div className="skeleton legend-skeleton" />
                        <div className="skeleton legend-skeleton" />
                      </>
                    ) : (
                      <>
                        <div className="donut-wrap">
                          <svg
                            viewBox="0 0 220 220"
                            className="donut-chart"
                            role="img"
                            aria-label="Sales: Electronics45%, Office supplies30%, Accessories25%"
                          >
                            <circle
                              cx="110"
                              cy="110"
                              r="78"
                              fill="none"
                              stroke="#eef4fc"
                              strokeWidth="27"
                            />
                            {data?.breakdown.map((part, index, array) => (
                              <circle
                                key={part.label}
                                cx="110"
                                cy="110"
                                r="78"
                                fill="none"
                                stroke={part.color}
                                strokeWidth="27"
                                strokeDasharray={`${part.value * 4.901 - 5} ${490.1 - part.value * 4.901 + 5}`}
                                strokeDashoffset={
                                  -array
                                    .slice(0, index)
                                    .reduce(
                                      (sum, item) => sum + item.value,
                                      0,
                                    ) * 4.901
                                }
                                transform="rotate(-90 110 110)"
                                className="donut-segment"
                              />
                            ))}
                          </svg>
                          <div className="donut-label">
                            <span>Total sales</span>
                            <strong>₱{compact(data?.revenue.total)}</strong>
                          </div>
                        </div>
                        <div className="breakdown-legend">
                          {data?.breakdown.map((part) => (
                            <div key={part.label}>
                              <span className="legend-label">
                                <i style={{ background: part.color }} />
                                {part.label}
                              </span>
                              <strong>
                                {part.value}
                                <span>%</span>
                              </strong>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                </div>
                <div className="details-grid">
                  <section
                    className="glass-card orders-panel stagger-in"
                    style={{ "--stagger": "270ms" }}
                  >
                    <div className="panel-heading orders-heading">
                      <div>
                        <h2>
                          Recent orders{" "}
                          <span className="count-badge">
                            {data?.orders.length || "—"}
                          </span>
                        </h2>
                      </div>
                      <label className="orders-filter">
                        <Icon name="filter" size={15} />
                        <select
                          value={filter}
                          onChange={(event) => setFilter(event.target.value)}
                          aria-label="Filter orders"
                        >
                          <option>All orders</option>
                          <option>Completed</option>
                          <option>Processing</option>
                          <option>Pending</option>
                        </select>
                        <Icon name="chevronDown" size={13} />
                      </label>
                    </div>
                    <div className="orders-table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Order ID</th>
                            <th>Customer</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th aria-label="Details" />
                          </tr>
                        </thead>
                        <tbody>
                          {loading
                            ? Array.from({ length: 5 }, (_, index) => (
                                <tr key={index} className="skeleton-row">
                                  <td>
                                    <div className="skeleton" />
                                  </td>
                                  <td>
                                    <div className="skeleton" />
                                  </td>
                                  <td>
                                    <div className="skeleton" />
                                  </td>
                                  <td>
                                    <div className="skeleton" />
                                  </td>
                                  <td />
                                </tr>
                              ))
                            : visibleOrders.map((order) => (
                                <tr key={order.id}>
                                  <td>
                                    <button
                                      className="order-id"
                                      onClick={() =>
                                        setDialog({ type: "order", order })
                                      }
                                    >
                                      #{order.id}
                                    </button>
                                    <span className="order-date">
                                      {rowDate(order.date)}, 2026
                                    </span>
                                  </td>
                                  <td>
                                    <div className="table-customer">
                                      <div
                                        className="avatar customer-avatar"
                                        style={{
                                          background: order.avatarColor,
                                        }}
                                      >
                                        {order.initials}
                                      </div>
                                      <div>
                                        <strong>{order.customer}</strong>
                                        <span>{order.company}</span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="table-amount">
                                    {money(order.amount)}
                                  </td>
                                  <td>
                                    <span
                                      className={`status-badge status-${order.status.toLowerCase()}`}
                                    >
                                      <span />
                                      {order.status}
                                    </span>
                                  </td>
                                  <td>
                                    <button
                                      className="order-detail-button"
                                      aria-label={`View order ${order.id}`}
                                      onClick={() =>
                                        setDialog({ type: "order", order })
                                      }
                                    >
                                      <Icon name="arrowUpRight" size={17} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                        </tbody>
                      </table>
                    </div>
                    {!loading && orders.length === 0 && (
                      <div className="empty-state">
                        <Icon name="search" size={26} />
                        <h3>No orders found</h3>
                        <p>Try a different name, order ID, or filter.</p>
                        <button
                          onClick={() => {
                            setSearch("");
                            setFilter("All orders");
                          }}
                        >
                          Clear filters
                        </button>
                      </div>
                    )}
                    <div className="table-pagination">
                      <span>
                        {loading
                          ? "Loading orders…"
                          : orders.length
                            ? `Showing ${(safePage - 1) * 5 + 1}–${Math.min(safePage * 5, orders.length)} of ${orders.length} orders`
                            : "0 orders"}
                      </span>
                      <div>
                        <button
                          aria-label="Previous orders page"
                          disabled={safePage === 1 || loading}
                          onClick={() => setPage((value) => value - 1)}
                        >
                          <Icon name="chevronLeft" size={15} />
                        </button>
                        {Array.from({ length: pages }, (_, index) => (
                          <button
                            key={index}
                            aria-label={`Orders page ${index + 1}`}
                            aria-current={
                              safePage === index + 1 ? "page" : undefined
                            }
                            className={
                              safePage === index + 1 ? "page-current" : ""
                            }
                            disabled={loading}
                            onClick={() => setPage(index + 1)}
                          >
                            {index + 1}
                          </button>
                        ))}
                        <button
                          aria-label="Next orders page"
                          disabled={safePage === pages || loading}
                          onClick={() => setPage((value) => value + 1)}
                        >
                          <Icon name="chevronRight" size={15} />
                        </button>
                      </div>
                    </div>
                  </section>
                  <div className="right-stack">
                    <section
                      className="target-card stagger-in"
                      style={{ "--stagger": "330ms" }}
                    >
                      <div className="target-header">
                        <span className="target-icon">
                          <Icon name="chart" size={20} />
                        </span>
                        <span>Revenue target</span>
                        <span className="target-period">
                          {period === "7d"
                            ? "Weekly"
                            : period === "90d"
                              ? "Quarterly"
                              : "Monthly"}
                        </span>
                      </div>
                      <div className="target-values">
                        {loading ? (
                          <div className="skeleton target-skeleton" />
                        ) : (
                          <>
                            <strong>
                              {targetPercent.toFixed(1)}
                              <span>%</span>
                            </strong>
                            <span>
                              of goal <Icon name="sparkles" size={14} />
                            </span>
                          </>
                        )}
                      </div>
                      <div className="target-progress">
                        <div
                          style={{
                            width: loading ? "0%" : `${targetPercent}%`,
                          }}
                        />
                      </div>
                      <div className="target-caption">
                        <span>{money(data?.target.current)}</span>
                        <span>Goal {money(data?.target.goal)}</span>
                      </div>
                    </section>
                    <section
                      className="glass-card activity-panel stagger-in"
                      style={{ "--stagger": "390ms" }}
                    >
                      <div className="panel-heading">
                        <h2>Activity feed</h2>
                      </div>
                      <div className="activity-list">
                        {loading
                          ? Array.from({ length: 3 }, (_, i) => (
                              <div key={i} className="activity-skeleton">
                                <div className="skeleton" />
                                <div className="skeleton" />
                              </div>
                            ))
                          : data?.activity.map((item, index) => (
                              <div className="activity-item" key={item.id}>
                                <div
                                  className={`activity-icon activity-${index}`}
                                >
                                  <Icon
                                    name={
                                      item.kind === "order"
                                        ? "bag"
                                        : item.kind === "inventory"
                                          ? "box"
                                          : "users"
                                    }
                                    size={15}
                                  />
                                </div>
                                <div>
                                  <strong>{item.title}</strong>
                                  <p>{item.detail}</p>
                                  <small>{item.time}</small>
                                </div>
                              </div>
                            ))}
                      </div>
                    </section>
                  </div>
                </div>
              </>
            )}
          </PageTransition>
        </main>
      </div>
      {toast && (
        <div className="toast-message" role="status">
          <span>
            <Icon name="check" size={17} />
          </span>
          {toast}
        </div>
      )}
      {dialog && (
        <Dialog
          title={`Order #${dialog.order.id}`}
          onClose={() => setDialog(null)}
        >
          <div className="order-dialog-content">
            <div className="dialog-customer">
              <div
                className="avatar"
                style={{ background: dialog.order.avatarColor }}
              >
                {dialog.order.initials}
              </div>
              <div>
                <strong>{dialog.order.customer}</strong>
                <p>{dialog.order.company}</p>
              </div>
              <span
                className={`status-badge status-${dialog.order.status.toLowerCase()}`}
              >
                <span />
                {dialog.order.status}
              </span>
            </div>
            <div className="dialog-line-item">
              <div>
                <span>PRODUCT</span>
                <strong>{dialog.order.product}</strong>
              </div>
              <strong>{money(dialog.order.amount)}</strong>
            </div>
            <div className="dialog-total">
              <span>Order total</span>
              <strong>{money(dialog.order.amount)}</strong>
            </div>

            <button className="primary-button" onClick={() => setDialog(null)}>
              Close
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function useAnimatedNumber(value, enabled) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    let frame;
    const start = performance.now();
    const animate = (now) => {
      const progress = Math.min((now - start) / 950, 1);
      setDisplay(value * (1 - (1 - progress) ** 4));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value, enabled]);
  return Math.round(display);
}

const icons = {
  revenue: "wallet",
  orders: "bag",
  customers: "users",
  inventory: "box",
};
function MetricCard({ metric, loading, index }) {
  const number = useAnimatedNumber(metric?.value || 0, !loading);
  const points = metric?.sparkline || [25, 35, 29, 42, 38, 50, 43, 65];
  const path = points
    .map((point, i) => `${(i * 96) / (points.length - 1)},${44 - point * 0.43}`)
    .join(" ");
  return (
    <article
      className={`metric-card glass-card stagger-in ${index === 0 ? "metric-featured" : ""}`}
      style={{ "--stagger": `${index * 65}ms` }}
      aria-busy={loading}
    >
      <div className="metric-heading">
        <span>
          {metric?.label ||
            [
              "Total revenue",
              "Total orders",
              "Active customers",
              "Products in stock",
            ][index]}
        </span>
        <div className="metric-icon">
          <Icon
            name={icons[metric?.id] || ["wallet", "bag", "users", "box"][index]}
            size={19}
          />
        </div>
      </div>
      {loading ? (
        <>
          <div className="skeleton metric-skeleton" />
          <div className="skeleton metric-sub-skeleton" />
        </>
      ) : (
        <>
          <div className="metric-number">
            {metric?.format === "currency" && (
              <span className="currency-symbol">₱</span>
            )}
            {number.toLocaleString("en-US")}
          </div>
          <div className="metric-bottom">
            <div>
              <span className="growth">
                <Icon name="arrowUpRight" size={13} />
                {metric?.change || 0}%
              </span>
              <span className="metric-comparison"> vs. previous period</span>
            </div>
            <svg
              className="metric-sparkline"
              viewBox="0 0 100 48"
              aria-hidden="true"
            >
              <polyline
                points={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </>
      )}
    </article>
  );
}

function Dialog({ title, children, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="detail-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <Icon name="x" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
