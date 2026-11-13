import useRealtime from './hooks/useRealtime.js';
﻿import React, { useEffect, useState } from 'react';
import Login from './pages/Login/Login.jsx';
import Layout from './components/Layout.jsx';
import PRMonitoring from './pages/PRMonitoring/PRMonitoring.jsx';
import POMonitoring from './pages/POMonitoring/POMonitoring.jsx';
import Supplier from './pages/Supplier/Supplier.jsx';
import Supplies from './pages/Supplies/Supplies.jsx';
import ReceivingReceipt from './pages/ReceivingReceipt/ReceivingReceipt.jsx';
import PurchasingUserLogin from './pages/PurchasingUserLogin/PurchasingUserLogin.jsx';
import Profile from './pages/Profile/Profile.jsx';
import './purchasing.css';
import { api } from './api.js';
import { APP } from './appSettings.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('purchase-requests');
  const [notice, setNotice] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useRealtime({ user, onUser: setUser });

  useEffect(() => {
    let active = true;
    api('/api/purchasing/auth/session')
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
    const result = await api('/api/purchasing/auth/login', { method: 'POST', body: credentials });
    setUser(result.user);
    setPage('purchase-requests');
    setProfileOpen(false);
    setNotice('');
    setError('');
  }

  async function logout() {
    await api('/api/purchasing/auth/logout', { method: 'POST' });
    setUser(null);
    setPage('purchase-requests');
    setProfileOpen(false);
    setNotice('');
    setError('');
  }

  if (checking) return <div className="boot-screen" role="status"><div className="brand-mark">T</div><strong>TTI Laguna Philippines Inc.</strong><span>Opening {APP.appName}…</span></div>;
  return user
    ? <Layout user={user} onLogout={logout} app={APP} tabs={[{ id: 'purchase-requests', title: 'PR Monitoring', icon: 'file' }, { id: 'purchase-orders', title: 'PO Monitoring', icon: 'bag' }, { id: 'suppliers', title: 'Supplier', icon: 'users' }, { id: 'supplies', title: 'Supplies', icon: 'box' }, { id: 'receivings', title: 'Receiving Receipt', icon: 'shipping' }]} page={page} onNavigate={setPage} onProfile={() => setProfileOpen(true)} notice={notice} onNotice={setNotice}>
        {page === 'purchase-requests' && <PRMonitoring user={user} onNotice={setNotice} />}
        {page === 'purchase-orders' && <POMonitoring user={user} onNotice={setNotice} />}
        {page === 'suppliers' && <Supplier user={user} onNotice={setNotice} />}
        {page === 'supplies' && <Supplies user={user} onNotice={setNotice} />}
        {page === 'receivings' && <ReceivingReceipt user={user} onNotice={setNotice} />}
        {page === 'users' && user.role === 'admin' && <PurchasingUserLogin user={user} onUser={setUser} onNotice={setNotice} />}
        {profileOpen && <Profile user={user} onClose={() => setProfileOpen(false)} onSaved={updated => { setUser(updated); setProfileOpen(false); setNotice('Profile saved.'); }} />}
      </Layout>
    : <Login onLogin={login} initialError={error} />;
}
