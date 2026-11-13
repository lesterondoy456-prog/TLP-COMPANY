import React, { useEffect, useState } from 'react';
import Login from './pages/Login/Login.jsx';
import SalesApp from './SalesApp.jsx';
import { api } from './api.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('/api/sales/auth/session').then(result => { if (active) setUser(result.user); })
      .catch(error => { if (active && error.status !== 401) setError(error.message); })
      .finally(() => { if (active) setChecking(false); });
    const expire = () => { setUser(null); setError('Your session has ended. Please sign in again.'); };
    window.addEventListener('session-expired', expire);
    return () => { active = false; window.removeEventListener('session-expired', expire); };
  }, []);
  if (checking) return <div className="boot-screen"><div className="brand-mark">T</div><strong>TLP COMPANY</strong><span>Opening SalesSystem…</span></div>;
  return user
    ? <SalesApp user={user} onUser={setUser} onLogout={async () => { await api('/api/sales/auth/logout', { method: 'POST' }); setUser(null); setError(''); }} />
    : <Login initialError={error} onLogin={async credentials => { const result = await api('/api/sales/auth/login', { method: 'POST', body: credentials }); setUser(result.user); setError(''); }} />;
}
