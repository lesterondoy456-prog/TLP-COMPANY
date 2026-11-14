import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Avatar, roleLabel } from './UI.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function Layout({ user, page, pages, data, loaded, onPage, onProfile, onLogout, logoutBusy, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('tti-sales-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('tti-sales-sidebar-collapsed', String(sidebarCollapsed)); }
    catch { /* Keep the toggle usable when browser storage is unavailable. */ }
  }, [sidebarCollapsed]);
  const transition = useRef(null);
  const isAdmin = user.role === 'admin';
  const canManageUsers = isAdmin || user.role === 'saleshead';
  const current = pages.find(item => item.id === page);

  useEffect(() => { setMenuOpen(false); }, [page]);
  useLayoutEffect(() => {
    const view = transition.current;
    if (!view || typeof view.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches || view.querySelector('dialog[open]')) return;
    const animation = view.animate([
      { opacity: 0.35, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    return () => animation.cancel();
  }, [page]);

  return <div className={'app-shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside id="sales-sidebar" className={'sidebar ' + (menuOpen ? 'open' : '')}>
      <div className="brand"><div className="brand-mark">T</div><div><strong>TTI Laguna Philippines Inc.</strong><span>SalesSystem</span></div></div>
      <button className="icon-button sidebar-mobile-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="sales-sidebar" onClick={() => setSidebarCollapsed(current => !current)}><Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={18} /></button>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Sales system">
        {pages.filter(item => item.id !== 'users').map(item => <button key={item.id} aria-label={item.title} title={item.title} className={'nav-item ' + (page === item.id ? 'active' : '')} aria-current={page === item.id ? 'page' : undefined} onClick={() => { onPage(item.id); setMenuOpen(false); }}>
          <Icon name={item.icon} size={19} /><span>{item.title}</span>
          {loaded && <span className="nav-count" aria-hidden="true">{data[item.id].length.toLocaleString('en-PH')}</span>}
        </button>)}
      </nav>
      {canManageUsers && <><p className="nav-label administration">{isAdmin ? 'ADMINISTRATION' : 'TEAM'}</p><button aria-label="SalesUserLogin" title="SalesUserLogin" className={'nav-item ' + (page === 'users' ? 'active' : '')} aria-current={page === 'users' ? 'page' : undefined} onClick={() => { onPage('users'); setMenuOpen(false); }}><Icon name="shield" size={19} /><span>SalesUserLogin</span></button></>}
      <div className="sidebar-bottom"><button className="account-button" aria-label={'Open profile: ' + (user.name || user.username)} title={'Open profile: ' + (user.name || user.username)} onClick={() => { onProfile(); setMenuOpen(false); }}><Avatar user={user} /><span><strong>{user.name || user.username}</strong><small>{roleLabel(user.role)}</small></span><Icon name="chevronRight" size={16} /></button></div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><button className="icon-button sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="sales-sidebar" onClick={() => setSidebarCollapsed(current => !current)}><Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={18} /></button><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="sales-sidebar" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><span>Sales</span><Icon name="chevronRight" size={13} /><strong>{current?.title || 'Customer'}</strong></div>
        <div className="topbar-right"><span className="today-label">{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}</span><ThemeToggle /><button className="signout-button" onClick={onLogout} disabled={logoutBusy}><Icon name="logout" size={17} /><span>{logoutBusy ? 'Signing out…' : 'Sign out'}</span></button></div>
      </header>
      <main className="workspace-content">
        <div className="page-transition" ref={transition} data-page={page}>{children}</div>

      </main>
    </div>
  </div>;
}
