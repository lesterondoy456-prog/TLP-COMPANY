import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ThemeToggle from './ThemeToggle.jsx';
import { Avatar, ErrorNotice, roleLabel } from './UI.jsx';
import { Icon } from './Icons.jsx';

export default function Layout({ user, onUser, onLogout, app, tabs, pages, AccountPage, ProfilePage }) {
  const [tab, setTab] = useState(tabs[0].id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const menuButton = useRef(null);
  const closeControl = useRef(null);
  function closeMenu() { setMenuOpen(false); }
  useEffect(() => {
    const breakpoint = window.matchMedia('(max-width: 900px)');
    const change = () => { setMobile(breakpoint.matches); closeMenu(); };
    breakpoint.addEventListener('change', change);
    return () => breakpoint.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!mobile || !menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeControl.current?.focus();
    closeControl.current?.closest('.sidebar')?.querySelector('.nav-item.active')?.scrollIntoView({ block: 'nearest' });
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); closeMenu(); } };
    window.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', escape);
      if (window.matchMedia('(max-width: 900px)').matches && !document.querySelector('dialog[open]')) menuButton.current?.focus();
    };
  }, [mobile, menuOpen]);
  const [now, setNow] = useState(() => new Date());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('tti-configuration-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('tti-configuration-sidebar-collapsed', String(sidebarCollapsed)); }
    catch { /* Keep the toggle usable when browser storage is unavailable. */ }
  }, [sidebarCollapsed]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const administrator = user.role === 'admin' && user.system === app.system;
  const navigation = administrator ? [...tabs, { id: 'users', title: app.userTable, icon: 'shield' }] : tabs;
  const current = navigation.find(item => item.id === tab) || tabs[0];
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
  const Page = pages[current.id] || pages[tabs[0].id];

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (tab === 'users' && !administrator) setTab(tabs[0].id);
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
  }, [tab, sidebarCollapsed, administrator, mobile]);

  function navigate(id) {
    setTab(id);
    closeMenu();
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

  function saveProfile(updated) {
    onUser(updated);
    setProfileOpen(false);
    setNotice('Profile saved.');
  }

  return <div className={'app-shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => closeMenu()} />}
    <aside inert={mobile && !menuOpen ? true : undefined} aria-hidden={mobile && !menuOpen ? true : undefined} id="configuration-sidebar" className={'sidebar ' + (menuOpen ? 'open' : '')}>
      <div className="sidebar-header">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div><strong>TTI Laguna Philippines Inc.</strong><span>{app.appName}</span></div>
        </div>
      </div>
      <button className="sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="configuration-sidebar" onClick={() => setSidebarCollapsed(current => !current)}>
        <Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={14} />
      </button>
      <button ref={closeControl} className="sidebar-close" aria-label="Close sidebar" title="Close sidebar" onClick={closeMenu}><Icon name="x" size={20} /></button>
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
        <time className="sidebar-clock" dateTime={now.toISOString()} aria-label={'Philippine time: ' + date + ', ' + time} title={date + ' · ' + time + ' PHT'}>
          <span className="sidebar-time">{time}</span>
          <span className="sidebar-time-compact">{compactTime}</span>
          <span className="sidebar-date">{date}</span>
        </time>
        <ThemeToggle />
      </div>
      <div className="sidebar-bottom">
        <button className="account-button" aria-label={'Open profile: ' + (user.name || user.username)} title={'Open profile: ' + (user.name || user.username)} onClick={() => { setProfileOpen(true); closeMenu(); }}>
          <Avatar user={user} /><span><strong>{user.name || user.username}</strong><small>{roleLabel(user.role)}</small></span>
        </button>
        <button className="sidebar-signout" aria-label={logoutBusy ? 'Signing out' : 'Sign out'} title="Sign out" onClick={logout} disabled={logoutBusy}>
          <Icon name="logout" size={18} />
        </button>
      </div>
    </aside>
    <div className="main-shell" inert={mobile && menuOpen ? true : undefined}>
      <button ref={menuButton} className="icon-button mobile-menu mobile-navigation-trigger" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="configuration-sidebar" onClick={() => setMenuOpen(true)}>
        <Icon name="menu" />
      </button>
      <main className="workspace-content">
        <ErrorNotice message={error} />
        {notice && <div className="toast" role="status"><Icon name="check" size={18} />{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="x" size={16} /></button></div>}
        <div className="page-transition" ref={contentRef}>{tab === 'users' && administrator ? <AccountPage user={user} onUser={onUser} onNotice={setNotice} /> : <Page key={tab} user={user} onNotice={setNotice} />}</div>

      </main>
    </div>
    {profileOpen && <ProfilePage user={user} onClose={() => setProfileOpen(false)} onSaved={saveProfile} />}
  </div>;
}
