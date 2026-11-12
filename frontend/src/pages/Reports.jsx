import React from "react";
import { Icon } from "../components/Icons.jsx";
import RevenueChart from "../components/RevenueChart.jsx";

const currency = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "Asia/Manila",
});

export default function Reports({
  data,
  loading,
  period,
  onPeriodChange,
  onExport,
}) {
  const revenue =
    data?.metrics.find((metric) => metric.id === "revenue")?.value || 0;
  const orderCount =
    data?.metrics.find((metric) => metric.id === "orders")?.value || 0;
  const orders = data?.orders || [];
  const subtotal = orders.reduce((sum, order) => sum + order.amount, 0);
  const periodName = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
  }[period];
  const metrics = [
    {
      label: "Period revenue",
      value: currency.format(revenue),
      icon: "wallet",
      note: periodName,
    },
    {
      label: "Total orders",
      value: orderCount.toLocaleString("en-PH"),
      icon: "bag",
    },
    {
      label: "Average order value",
      value: currency.format(orderCount ? revenue / orderCount : 0),
      icon: "chart",
    },
  ];

  return (
    <div className="reports-page">
      <div className="page-heading">
        <div>
          <h1>Reports</h1>
        </div>
        <div className="page-heading-actions">
          <label className="period-select">
            <Icon name="calendar" size={17} />
            <select
              aria-label="Report period"
              value={period}
              onChange={(event) => onPeriodChange(event.target.value)}
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
            <Icon name="chevronDown" size={14} />
          </label>
          <button
            className="export-button"
            onClick={onExport}
            disabled={loading || !data}
          >
            <Icon name="download" size={16} /> Download CSV
          </button>
        </div>
      </div>

      <section className="reports-metrics" aria-label="Report summary">
        {metrics.map((metric) => (
          <article
            className="glass-card report-summary-card"
            key={metric.label}
            aria-busy={loading}
          >
            <div className="report-summary-label">
              <span>{metric.label}</span>
              <Icon name={metric.icon} size={19} />
            </div>
            {loading ? (
              <div className="skeleton metric-skeleton" />
            ) : (
              <strong className="report-summary-value">
                {data ? metric.value : "—"}
              </strong>
            )}
            {metric.note && <span className="report-summary-note">{metric.note}</span>}
          </article>
        ))}
      </section>

      <section className="glass-card report-trend-panel">
        <div className="panel-heading">
          <div>
            <h2>Revenue trend</h2>
            <p>{periodName}</p>
          </div>
        </div>
        <RevenueChart revenue={data?.revenue} loading={loading} />
      </section>

      <section className="glass-card report-orders-panel">
        <div className="panel-heading">
          <div>
            <h2>Recent orders</h2>
            <p>
              {loading
                ? "Loading…"
                : `${orders.length} orders`}
            </p>
          </div>
          <Icon name="file" size={19} />
        </div>
        <div className="orders-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }, (_, index) => (
                    <tr className="skeleton-row" key={index}>
                      {Array.from({ length: 5 }, (_, column) => (
                        <td key={column}>
                          <div className="skeleton" />
                        </td>
                      ))}
                    </tr>
                  ))
                : orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong className="order-id">#{order.id}</strong>
                      </td>
                      <td>{dateFormat.format(new Date(order.date))}</td>
                      <td>
                        <div className="table-customer">
                          <div
                            className="avatar customer-avatar"
                            style={{ background: order.avatarColor }}
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
                        {currency.format(order.amount)}
                      </td>
                      <td>
                        <span
                          className={`status-badge status-${order.status.toLowerCase()}`}
                        >
                          <span />
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!loading && orders.length === 0 && (
          <div className="empty-state">
            <p>No orders found.</p>
          </div>
        )}
        <div className="report-table-footer">
          <div>
            <strong>Listed orders total</strong>
          </div>
          <strong>{loading || !data ? "—" : currency.format(subtotal)}</strong>
        </div>
      </section>
    </div>
  );
}
