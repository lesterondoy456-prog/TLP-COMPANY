import useRealtime from './hooks/useRealtime.js';
import React, { useEffect, useState } from 'react';
import Login from './pages/Login/Login.jsx';
import Layout from './components/Layout.jsx';
import { api } from './api.js';
import { APP } from './appSettings.js';

import ATC from './pages/ATC/ATC.jsx';
import AuditTrail from './pages/AuditTrail/AuditTrail.jsx';
import Bank from './pages/Bank/Bank.jsx';
import Country from './pages/Country/Country.jsx';
import Currency from './pages/Currency/Currency.jsx';
import CustomerCategory from './pages/CustomerCategory/CustomerCategory.jsx';
import PaymentTerm from './pages/PaymentTerm/PaymentTerm.jsx';
import ProductCategory from './pages/ProductCategory/ProductCategory.jsx';
import SuppliesCategory from './pages/SuppliesCategory/SuppliesCategory.jsx';
import UnitOfProduct from './pages/UnitOfProduct/UnitOfProduct.jsx';
import VAT from './pages/VAT/VAT.jsx';
import Warehouse from './pages/Warehouse/Warehouse.jsx';
import WarehouseLocation from './pages/WarehouseLocation/WarehouseLocation.jsx';
import ConfigurationUserLogin from './pages/ConfigurationUserLogin/ConfigurationUserLogin.jsx';
import Profile from './pages/Profile/Profile.jsx';

const tabs = [
  { id: 'config-atc', title: 'ATC', icon: 'grid' },
  { id: 'config-audit-trail', title: 'Audit Trail', icon: 'file' },
  { id: 'config-banks', title: 'Bank', icon: 'grid' },
  { id: 'config-countries', title: 'Country', icon: 'grid' },
  { id: 'config-currencies', title: 'Currency', icon: 'grid' },
  { id: 'config-customer-categories', title: 'Customer Category', icon: 'grid' },
  { id: 'config-payment-terms', title: 'Payment Term', icon: 'grid' },
  { id: 'config-product-categories', title: 'Product Category', icon: 'grid' },
  { id: 'config-supplies-categories', title: 'Supplies Category', icon: 'grid' },
  { id: 'config-units', title: 'Unit of Product', icon: 'grid' },
  { id: 'config-vat-codes', title: 'VAT', icon: 'grid' },
  { id: 'config-warehouses', title: 'Warehouse', icon: 'grid' },
  { id: 'config-locations', title: 'Warehouse Location', icon: 'grid' },
];
const pages = { 'config-atc': ATC, 'config-audit-trail': AuditTrail, 'config-banks': Bank, 'config-countries': Country, 'config-currencies': Currency, 'config-customer-categories': CustomerCategory, 'config-payment-terms': PaymentTerm, 'config-product-categories': ProductCategory, 'config-supplies-categories': SuppliesCategory, 'config-units': UnitOfProduct, 'config-vat-codes': VAT, 'config-warehouses': Warehouse, 'config-locations': WarehouseLocation };

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useRealtime({ user, onUser: setUser });

  useEffect(() => {
    let active = true;
    api('/api/configuration/auth/session')
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
    const result = await api('/api/configuration/auth/login', { method: 'POST', body: credentials });
    setUser(result.user);
    setError('');
  }

  async function logout() {
    await api('/api/configuration/auth/logout', { method: 'POST' });
    setUser(null);
    setError('');
  }

  if (checking) return <div className="boot-screen" role="status"><div className="brand-mark">T</div><strong>TTI Laguna Philippines Inc.</strong><span>Opening {APP.appName}…</span></div>;
  return user
    ? <Layout user={user} onUser={setUser} onLogout={logout} app={APP} tabs={tabs} pages={pages} AccountPage={ConfigurationUserLogin} ProfilePage={Profile} />
    : <Login onLogin={login} initialError={error} />;
}
