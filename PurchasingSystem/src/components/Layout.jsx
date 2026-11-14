import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ThemeToggle from './ThemeToggle.jsx';
import { Avatar, ErrorNotice, roleLabel } from './UI.jsx';
import { Icon } from './Icons.jsx';

export default function Layout({ user, onLogout, app, tabs, page: tab, onNavigate, onProfile, notice, onNotice, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('tti-purchasing-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('tti-purchasing-sidebar-collapsed', String(sidebarCollapsed)); }
    catch { /* Keep the toggle usable when browser storage is unavailable. */ }
  }, [sidebarCollapsed]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState('');
  const administrator = user.role === 'admin' && user.system === app.system;
  const contentRef = useRef(null);
  const previousTab = useRef(tab);

  useEffect(() => {
    const changed = previousTab.current !== tab;
    previousTab.current = tab;
    if (!changed || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.querySelector('dialog[open]')) return;
    const animation = contentRef.current?.animate?.(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 220, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
    return () => animation?.cancel();
  }, [tab]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => onNotice(''), 5500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (tab === 'users' && !administrator) onNavigate(tabs[0].id);
  }, [tab, administrator, tabs]);

  const date = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(now);
  const time = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(now);
  const compactTime = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const navigationRef = useRef(null);
  const activeIndicator = useRef(null);
  useLayoutEffect(() => {
    const links = navigationRef.current;
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
  }, [tab, sidebarCollapsed, administrator]);

  function navigate(id) {
    onNavigate(id);
    setMenuOpen(false);
  }

  async function logout() {
    setLogoutBusy(true);
    setError('');
    try {
      await onLogout();
    } catch (error) {
      setError(error.message);
      setLogoutBusy(false);
    }
  }


  return <div className={'app-shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside id="purchasing-sidebar" className={'sidebar ' + (menuOpen ? 'open' : '')}>
      <div className="sidebar-header">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div><strong>TTI Laguna Philippines Inc.</strong><span>{app.appName}</span></div>
        </div>
      </div>
      <button className="sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="purchasing-sidebar" onClick={() => setSidebarCollapsed(current => !current)}>
        <Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={14} />
      </button>
      <div className="sidebar-navigation" ref={navigationRef}>
        <div className="sidebar-active-indicator" ref={activeIndicator} aria-hidden="true" />
        <p className="nav-label">{app.label.toUpperCase()}</p>
        <nav aria-label={app.navLabel}>
          {tabs.map(item => <button key={item.id} aria-label={item.title} title={item.title} className={'nav-item ' + (tab === item.id ? 'active' : '')} aria-current={tab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
            <Icon name={item.icon} size={18} /><span>{item.title}</span>
          </button>)}
          {administrator && <>
            <p className="nav-label administration">ACCOUNTS</p>
            <button aria-label={app.userTable} title={app.userTable} className={'nav-item ' + (tab === 'users' ? 'active' : '')} aria-current={tab === 'users' ? 'page' : undefined} onClick={() => navigate('users')}>
              <Icon name="shield" size={18} /><span>{app.userTable}</span>
            </button>
          </>}
        </nav>
      </div>
      <div className="sidebar-preferences">
        <time className="sidebar-clock" dateTime={now.toISOString()} aria-label={'Philippine time: ' + date + ', ' + time} title={date + ' ? ' + time + ' PHT'}>
          <span className="sidebar-time">{time}</span>
          <span className="sidebar-time-compact">{compactTime}</span>
          <span className="sidebar-date">{date}</span>
        </time>
        <ThemeToggle />
      </div>
      <div className="sidebar-bottom">
        <button className="account-button" aria-label={'Open profile: ' + (user.name || user.username)} title={'Open profile: ' + (user.name || user.username)} onClick={() => { onProfile(); setMenuOpen(false); }}>
          <Avatar user={user} /><span><strong>{user.name || user.username}</strong><small>{roleLabel(user.role)}</small></span>
        </button>
        <button className="sidebar-signout" aria-label={logoutBusy ? 'Signing out' : 'Sign out'} title="Sign out" onClick={logout} disabled={logoutBusy}>
          <Icon name="logout" size={18} />
        </button>
      </div>
    </aside>
    <div className="main-shell">
      <button className="icon-button mobile-menu mobile-navigation-trigger" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="purchasing-sidebar" onClick={() => setMenuOpen(true)}>
        <Icon name="menu" />
      </button>
      <main className="workspace-content">
        <ErrorNotice message={error} />
        {notice && <div className="toast" role="status"><Icon name="check" size={18} />{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => onNotice('')}><Icon name="x" size={16} /></button></div>}
        <div className="page-transition" ref={contentRef}>{children}</div>

      </main>
    </div>
  </div>;
}
