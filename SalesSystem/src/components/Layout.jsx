import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Avatar, roleLabel } from './UI.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function Layout({ user, page, pages, data, loaded, onPage, onProfile, onLogout, logoutBusy, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('tti-sales-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('tti-sales-sidebar-collapsed', String(sidebarCollapsed)); }
    catch { /* Keep the toggle usable when browser storage is unavailable. */ }
  }, [sidebarCollapsed]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const transition = useRef(null);
  const navigation = useRef(null);
  const activeIndicator = useRef(null);
  const isAdmin = user.role === 'admin';
  const canManageUsers = isAdmin || user.role === 'saleshead';
  const date = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(now);
  const time = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now);
  const compactTime = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);

  useEffect(() => { setMenuOpen(false); }, [page]);
  useLayoutEffect(() => {
    const links = navigation.current;
    const active = links?.querySelector('.nav-item.active');
    const indicator = activeIndicator.current;
    if (!active || !indicator) return;
    const position = () => {
      indicator.style.transform = 'translateY(' + active.offsetTop + 'px)';
      indicator.style.height = active.offsetHeight + 'px';
      indicator.style.opacity = '1';
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(links);
    observer.observe(active);
    return () => observer.disconnect();
  }, [page, sidebarCollapsed, canManageUsers]);
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
      <div className="sidebar-header"><div className="brand"><div className="brand-mark">T</div><div><strong>TTI Laguna Philippines Inc.</strong><span>SalesSystem</span></div></div></div>
      <button className="sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="sales-sidebar" onClick={() => setSidebarCollapsed(current => !current)}><Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={14} /></button>
      <div className="sidebar-navigation" ref={navigation}>
      <div className="sidebar-active-indicator" ref={activeIndicator} aria-hidden="true" />
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Sales system">
        {pages.filter(item => item.id !== 'users').map(item => <button key={item.id} aria-label={item.title} title={item.title} className={'nav-item ' + (page === item.id ? 'active' : '')} aria-current={page === item.id ? 'page' : undefined} onClick={() => { onPage(item.id); setMenuOpen(false); }}>
          <Icon name={item.icon} size={19} /><span>{item.title}</span>
          {loaded && <span className="nav-count" aria-hidden="true">{data[item.countKey || item.id].length.toLocaleString('en-PH')}</span>}
        </button>)}
      </nav>
      {canManageUsers && <><p className="nav-label administration">{isAdmin ? 'ADMINISTRATION' : 'TEAM'}</p><button aria-label="SalesUserLogin" title="SalesUserLogin" className={'nav-item ' + (page === 'users' ? 'active' : '')} aria-current={page === 'users' ? 'page' : undefined} onClick={() => { onPage('users'); setMenuOpen(false); }}><Icon name="shield" size={19} /><span>SalesUserLogin</span></button></>}
      </div>
      <div className="sidebar-preferences"><time className="sidebar-clock" dateTime={now.toISOString()} aria-label={'Philippine time: ' + date + ', ' + time} title={date + ' · ' + time + ' PHT'}><span className="sidebar-time">{time}</span><span className="sidebar-time-compact">{compactTime}</span><span className="sidebar-date">{date}</span></time><ThemeToggle /></div>
      <div className="sidebar-bottom"><button className="account-button" aria-label={'Open profile: ' + (user.name || user.username)} title={'Open profile: ' + (user.name || user.username)} onClick={() => { onProfile(); setMenuOpen(false); }}><Avatar user={user} /><span><strong>{user.name || user.username}</strong><small>{roleLabel(user.role)}</small></span></button><button className="sidebar-signout" aria-label={logoutBusy ? 'Signing out' : 'Sign out'} title="Sign out" onClick={onLogout} disabled={logoutBusy}><Icon name="logout" size={18} /></button></div>
    </aside>
    <div className="main-shell">
      <button className="icon-button mobile-menu mobile-navigation-trigger" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="sales-sidebar" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button>
      <main className="workspace-content">
        <div className="page-transition" ref={transition} data-page={page}>{children}</div>

      </main>
    </div>
  </div>;
}
