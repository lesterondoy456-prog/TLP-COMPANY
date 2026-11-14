import React, { useEffect, useRef, useState } from 'react';
import ThemeToggle from './ThemeToggle.jsx';
import { Avatar, ErrorNotice, roleLabel } from './UI.jsx';
import { Icon } from './Icons.jsx';

export default function Layout({ user, onUser, onLogout, app, tabs, pages, AccountPage, ProfilePage }) {
  const [tab, setTab] = useState(tabs[0].id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('tti-configuration-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('tti-configuration-sidebar-collapsed', String(sidebarCollapsed)); }
    catch { /* Keep the toggle usable when browser storage is unavailable. */ }
  }, [sidebarCollapsed]);
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

  function navigate(id) {
    setTab(id);
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

  function saveProfile(updated) {
    onUser(updated);
    setProfileOpen(false);
    setNotice('Profile saved.');
  }

  return <div className={'app-shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside id="configuration-sidebar" className={'sidebar ' + (menuOpen ? 'open' : '')}>
      <div className="brand"><div className="brand-mark">T</div><div><strong>TTI Laguna Philippines Inc.</strong><span>{app.appName}</span></div></div>
      <button className="icon-button sidebar-mobile-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="configuration-sidebar" onClick={() => setSidebarCollapsed(current => !current)}><Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={18} /></button>
      <p className="nav-label">{app.label.toUpperCase()}</p>
      <nav aria-label={app.navLabel}>
        {tabs.map(item => <button key={item.id} aria-label={item.title} title={item.title} className={'nav-item ' + (tab === item.id ? 'active' : '')} aria-current={tab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><Icon name={item.icon} size={18} /><span>{item.title}</span></button>)}
        {administrator && <><p className="nav-label administration">ACCOUNTS</p><button aria-label={app.userTable} title={app.userTable} className={'nav-item ' + (tab === 'users' ? 'active' : '')} aria-current={tab === 'users' ? 'page' : undefined} onClick={() => navigate('users')}><Icon name="shield" size={18} /><span>{app.userTable}</span></button></>}
      </nav>
      <div className="sidebar-bottom">
        <button className="account-button" aria-label={'Open profile: ' + (user.name || user.username)} title={'Open profile: ' + (user.name || user.username)} onClick={() => { setProfileOpen(true); setMenuOpen(false); }}><Avatar user={user} /><span><strong>{user.name || user.username}</strong><small>{roleLabel(user.role)}</small></span><Icon name="chevronRight" size={16} /></button>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><button className="icon-button sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} aria-controls="configuration-sidebar" onClick={() => setSidebarCollapsed(current => !current)}><Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} size={18} /></button><button className="icon-button mobile-menu" aria-label="Open navigation" aria-controls="configuration-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><span>{app.appName}</span><Icon name="chevronRight" size={13} /><strong>{current.title}</strong></div>
        <div className="topbar-right"><ThemeToggle /><span className="today-label">{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}</span><button className="signout-button" disabled={logoutBusy} onClick={logout}><Icon name="logout" size={17} /><span>{logoutBusy ? 'Signing out…' : 'Sign out'}</span></button></div>
      </header>
      <main className="workspace-content">
        <ErrorNotice message={error} />
        {notice && <div className="toast" role="status"><Icon name="check" size={18} />{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="x" size={16} /></button></div>}
        <div className="page-transition" ref={contentRef}>{tab === 'users' && administrator ? <AccountPage user={user} onUser={onUser} onNotice={setNotice} /> : <Page key={tab} user={user} onNotice={setNotice} />}</div>

      </main>
    </div>
    {profileOpen && <ProfilePage user={user} onClose={() => setProfileOpen(false)} onSaved={saveProfile} />}
  </div>;
}
