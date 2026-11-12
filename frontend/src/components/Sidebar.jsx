import React from "react";
import { Icon } from "./Icons.jsx";

export default function Sidebar({
  collapsed,
  mobileOpen,
  onCollapse,
  onClose,
  activeTab,
  onNavigate,
  onLogout,
  user,
  signingOut,
}) {
  return (
    <>
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside
        className={`sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-mark">
              <Icon name="logo" size={26} />
            </div>
            <span>
              SalesPort<span className="brand-dot">.</span>
            </span>
          </div>
          <button
            className="sidebar-mobile-close icon-button"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <Icon name="x" />
          </button>
        </div>
        <div className="workspace-card">
          <div className="workspace-avatar">
            a<span>•</span>
          </div>
          <div className="sidebar-copy">
            <strong>Acme Group</strong>
            <span>Business workspace</span>
          </div>
          <span className="workspace-indicator" />
        </div>
        <div className="nav-section-label">WORKSPACE</div>
        <nav>
          {[
            { id: "dashboard", label: "Dashboard", icon: "grid" },
            { id: "reports", label: "Reports", icon: "file" },
          ].map((tab) => (
            <button
              key={tab.id}
              id={`nav-${tab.id}`}
              className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => onNavigate(tab.id)}
              title={tab.label}
            >
              <Icon name={tab.icon} size={21} />
              <span>{tab.label}</span>
              {activeTab === tab.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-profile">
          <div className="avatar owner-avatar">{user.initials || "AM"}</div>
          <div className="sidebar-copy">
            <strong>{user.name}</strong>
            <span>Workspace owner</span>
          </div>
          <button
            className="icon-button logout-button"
            title="Sign out"
            aria-label="Sign out"
            disabled={signingOut}
            onClick={onLogout}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
        <button
          className="sidebar-collapse"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onCollapse}
        >
          <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={14} />
        </button>
      </aside>
    </>
  );
}
