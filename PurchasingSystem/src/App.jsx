import React, { useEffect, useState } from 'react';
import Login from './pages/Login.jsx';
import Workspace from './pages/Workspace.jsx';
import { api } from './api.js';
import { APP } from './appSettings.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api('/auth/session')
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
    const result = await api('/auth/login', { method: 'POST', body: credentials });
    setUser(result.user);
    setError('');
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setError('');
  }

  if (checking) return <div className="boot-screen" role="status"><div className="brand-mark">T</div><strong>TLP COMPANY</strong><span>Opening {APP.appName}…</span></div>;
  return user
    ? <Workspace user={user} onUser={setUser} onLogout={logout} />
    : <Login onLogin={login} initialError={error} />;
}
