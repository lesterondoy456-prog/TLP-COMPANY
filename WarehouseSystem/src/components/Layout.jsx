import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar, ErrorNotice, roleLabel } from './UI.jsx';
import { Icon } from './Icons.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function Layout({ user, onUser, onLogout, app, tabs, pages, AccountPage, ProfilePage }) {
  const [tab, setTab] = useState(tabs[0].id);
  const content = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const administrator = user.role === 'admin' && user.system === app.system;
  const navigation = administrator ? [...tabs, { id: 'users', title: app.userTable, icon: 'shield' }] : tabs;
  const current = navigation.find(item => item.id === tab) || tabs[0];
  const Page = pages[current.id] || pages[tabs[0].id];

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (tab === 'users' && !administrator) setTab(tabs[0].id);
  }, [tab, administrator, tabs]);

  useLayoutEffect(() => {
    if (typeof content.current?.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.querySelector('dialog[open]')) return;
    const animation = content.current?.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
    return () => animation?.cancel();
  }, [tab]);

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

  return <div className="app-shell">
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside id="warehouse-sidebar" className={'sidebar ' + (menuOpen ? 'open' : '')}>
      <div className="brand"><div className="brand-mark">T</div><div><strong>TTI Laguna Philippines Inc.</strong><span>{app.appName}</span></div></div>
      <p className="nav-label">{app.label.toUpperCase()}</p>
      <nav aria-label={app.navLabel}>
        {tabs.map(item => <button key={item.id} className={'nav-item ' + (tab === item.id ? 'active' : '')} aria-current={tab === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><Icon name={item.icon} size={18} /><span>{item.title}</span></button>)}
        {administrator && <><p className="nav-label administration">ACCOUNTS</p><button className={'nav-item ' + (tab === 'users' ? 'active' : '')} aria-current={tab === 'users' ? 'page' : undefined} onClick={() => navigate('users')}><Icon name="shield" size={18} /><span>{app.userTable}</span></button></>}
      </nav>
      <div className="sidebar-bottom">
        <button className="account-button" onClick={() => { setProfileOpen(true); setMenuOpen(false); }}><Avatar user={user} /><span><strong>{user.name || user.username}</strong><small>{roleLabel(user.role)}</small></span><Icon name="chevronRight" size={16} /></button>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-controls="warehouse-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><span>{app.appName}</span><Icon name="chevronRight" size={13} /><strong>{current.title}</strong></div>
        <div className="topbar-right"><ThemeToggle /><span className="today-label">{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}</span><button className="signout-button" disabled={logoutBusy} onClick={logout}><Icon name="logout" size={17} /><span>{logoutBusy ? 'Signing out…' : 'Sign out'}</span></button></div>
      </header>
      <main className="workspace-content">
        <ErrorNotice message={error} />
        {notice && <div className="toast" role="status"><Icon name="check" size={18} />{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="x" size={16} /></button></div>}
        <div ref={content} className="page-transition">{tab === 'users' && administrator ? <AccountPage user={user} onUser={onUser} onNotice={setNotice} /> : <Page key={tab} user={user} onNotice={setNotice} />}</div>
      </main>
    </div>
    {profileOpen && <ProfilePage user={user} onClose={() => setProfileOpen(false)} onSaved={saveProfile} />}
  </div>;
}
