import React, { useEffect, useState } from 'react';
import Login from './pages/Login/Login.jsx';
import Layout from './components/Layout.jsx';
import HelpDesk from './pages/HelpDesk/HelpDesk.jsx';
import ITTUserLogin from './pages/ITTUserLogin/ITTUserLogin.jsx';
import Profile from './pages/Profile/Profile.jsx';
import { api } from './api.js';
import { APP } from './appSettings.js';

const tabs = [{ id: 'tickets', title: 'IT Ticket Monitoring', icon: 'file' }];
const pages = { tickets: props => <HelpDesk {...props} manager /> };

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('/api/itticket/auth/session').then(result => { if (active) setUser(result.user); })
      .catch(failure => { if (active && failure.status !== 401) setError(failure.message); })
      .finally(() => { if (active) setChecking(false); });
    const expire = () => { setUser(null); setError('Your session has ended. Please sign in again.'); };
    window.addEventListener('session-expired', expire);
    return () => { active = false; window.removeEventListener('session-expired', expire); };
  }, []);
  async function login(credentials) { const result = await api('/api/itticket/auth/login', { method: 'POST', body: credentials }); setUser(result.user); setError(''); }
  async function logout() { await api('/api/itticket/auth/logout', { method: 'POST' }); setUser(null); setError(''); }
  if (checking) return <div className="boot-screen" role="status"><div className="brand-mark">T</div><strong>TTI Laguna Philippines Inc.</strong><span>Opening ITTicketSystem…</span></div>;
  return user ? <Layout user={user} onUser={setUser} onLogout={logout} app={APP} tabs={tabs} pages={pages} AccountPage={ITTUserLogin} ProfilePage={Profile} /> : <Login onLogin={login} initialError={error} />;
}
