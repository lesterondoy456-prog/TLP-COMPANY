import React, { useEffect, useState } from 'react';
import Login from './pages/Login.jsx';
import Layout from './components/Layout.jsx';
import { api } from './api.js';
import { APP } from './appSettings.js';

import SuppliesStock from './pages/SuppliesStock.jsx';
import WarehouseUserLogin from './pages/WarehouseUserLogin.jsx';
import Profile from './pages/Profile.jsx';

const tabs = [
  { id: 'warehouse-stock', title: 'Supplies Stock', icon: 'box' },
];
const pages = { 'warehouse-stock': SuppliesStock };

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api('/api/warehouse/auth/session')
      .then(result => { if (active) setUser(result.user); })
      .catch(error => { if (active && error.status !== 401) setError(error.message); })
      .finally(() => { if (active) setChecking(false); });
    function expire() {
      setUser(null);
      setError('Your session has ended. Please sign in again.');
    }
    window.addEventListener('session-expired', expire);
    return () => { active = false; window.removeEventListener('session-expired', expire); };
  }, []);

  async function login(credentials) {
    const result = await api('/api/warehouse/auth/login', { method: 'POST', body: credentials });
    setUser(result.user);
    setError('');
  }

  async function logout() {
    await api('/api/warehouse/auth/logout', { method: 'POST' });
    setUser(null);
    setError('');
  }

  if (checking) return <div className="boot-screen" role="status"><div className="brand-mark">T</div><strong>TLP COMPANY</strong><span>Opening {APP.appName}…</span></div>;
  return user
    ? <Layout user={user} onUser={setUser} onLogout={logout} app={APP} tabs={tabs} pages={pages} AccountPage={WarehouseUserLogin} ProfilePage={Profile} />
    : <Login onLogin={login} initialError={error} />;
}
