import React, { useEffect, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Avatar, roleLabel } from './UI.jsx';

export default function Layout({ user, page, pages, data, loaded, onPage, onProfile, onLogout, logoutBusy, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(true);
  const isAdmin = user.role === 'admin';
  const canManageUsers = isAdmin || user.role === 'saleshead';
  const current = pages.find(item => item.id === page);
  useEffect(() => { setMenuOpen(false); }, [page]);
  return <div className="app-shell">
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={'sidebar ' + (menuOpen ? 'open' : '')}>
      <div className="brand"><div className="brand-mark">T</div><div><strong>TLP COMPANY</strong><span>SalesSystem</span></div></div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Sales system"><button className="sales-group" aria-expanded={salesOpen} aria-controls="sales-module-navigation" onClick={() => setSalesOpen(open => !open)}><Icon name="bag" size={18} /><span>Sales</span><Icon name="chevronDown" size={15} className={salesOpen ? '' : 'collapsed'} /></button><div id="sales-module-navigation" className="sales-navigation" hidden={!salesOpen}>{pages.filter(item => item.id !== 'users').map(item => <button key={item.id} className={'nav-item ' + (page === item.id ? 'active' : '')} aria-current={page === item.id ? 'page' : undefined} onClick={() => onPage(item.id)}><Icon name={item.icon} size={17} /><span>{item.title}</span>{loaded && <span className="nav-count" aria-hidden="true">{data[item.id].length.toLocaleString('en-PH')}</span>}</button>)}</div></nav>
      {canManageUsers && <><p className="nav-label administration">{isAdmin ? 'ADMINISTRATION' : 'TEAM'}</p><button className={'nav-item ' + (page === 'users' ? 'active' : '')} aria-current={page === 'users' ? 'page' : undefined} onClick={() => onPage('users')}><Icon name="shield" size={19} /><span>SalesUserLogin</span></button></>}
      <div className="sidebar-bottom"><button className="account-button" onClick={() => { onProfile(); setMenuOpen(false); }}><Avatar user={user} /><span><strong>{user.name || user.username}</strong><small>{roleLabel(user.role)}</small></span><Icon name="chevronRight" size={16} /></button></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><span>Sales</span><Icon name="chevronRight" size={13} /><strong>{current?.title || 'Customer'}</strong></div><div className="topbar-right"><span className="today-label">{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}</span><button className="signout-button" onClick={onLogout} disabled={logoutBusy}><Icon name="logout" size={17} /><span>{logoutBusy ? 'Signing out…' : 'Sign out'}</span></button></div></header><main className="workspace-content">{children}<footer className="workspace-footer"><span>TLP Company · SalesSystem</span><span>{page === 'products' ? 'Product catalog and pricing' : 'Amounts use the document currency'}</span></footer></main></div>
  </div>;
}
