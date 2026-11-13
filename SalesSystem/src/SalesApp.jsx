import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { SALES_PAGES } from './salesNavigation.js';
import Layout from './components/Layout.jsx';
import SalesOverview from './components/SalesOverview.jsx';
import { Icon } from './components/Icons.jsx';
import CustomerPage from './pages/Customer.jsx';
import ProductPage from './pages/Product.jsx';
import SalesOrderPage from './pages/SalesOrder.jsx';
import InvoicePage from './pages/Invoice.jsx';
import DeliveryReceiptPage from './pages/DeliveryReceipt.jsx';
import ShippingInvoicePage from './pages/ShippingInvoice.jsx';
import SalesUserLoginPage from './pages/SalesUserLogin.jsx';
import UserForm from './pages/SalesUserLogin/Form.jsx';

const EMPTY_DATA = { customers: [], products: [], 'sales-orders': [], 'sales-invoices': [], 'delivery-receipts': [], 'shipping-invoices': [], users: [] };

export default function SalesApp({ user, onUser, onLogout }) {
  const [page, setPage] = useState('customers');
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const sequence = useRef(0);
  const canManageUsers = user.role === 'admin' || user.role === 'saleshead';
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const [customers, products, orders, invoices, deliveries, shipments, users] = await Promise.all([
        api('/api/sales/customers'),
        api('/api/sales/products'),
        api('/api/sales/sales-orders'),
        api('/api/sales/sales-invoices'),
        api('/api/sales/delivery-receipts'),
        api('/api/sales/shipping-invoices'),
        canManageUsers ? api('/api/sales/users') : Promise.resolve({ records: [] }),
      ]);
      if (sequence.current === request) {
        setData({ customers: customers.records || [], products: products.records || [], 'sales-orders': orders.records || [], 'sales-invoices': invoices.records || [], 'delivery-receipts': deliveries.records || [], 'shipping-invoices': shipments.records || [], users: users.records || [] });
        setLoaded(true);
      }
    } catch (error) { if (sequence.current === request) setError(error.message); }
    finally { if (sequence.current === request) setLoading(false); }
  }, [canManageUsers, user.role]);
  useEffect(() => { reload(); return () => { sequence.current++; }; }, [reload]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (!canManageUsers && page === 'users') setPage('customers'); }, [canManageUsers, page]);
  function saved(result, message = 'Changes saved to the database.') {
    if (result.user) onUser(result.user);
    else if (result.record?.system === user.system && result.record?.id === user.id) onUser(result.record);
    setProfileOpen(false); setNotice(message); reload();
  }
  async function logout() {
    setLogoutBusy(true); setError('');
    try { await onLogout(); } catch (error) { setError(error.message); setLogoutBusy(false); }
  }
  const props = { data, user, loading, loaded, onReload: reload, onSaved: saved, onError: setError, overview: <SalesOverview data={data} loaded={loaded} /> };
  return <>
    <Layout user={user} page={page} pages={SALES_PAGES} data={data} loaded={loaded} onPage={setPage} onProfile={() => setProfileOpen(true)} onLogout={logout} logoutBusy={logoutBusy}>
      {error && <div className="notice error" role="alert"><span>{error}{loaded && ' Displayed records may be out of date.'}</span><button className="text-button" disabled={loading} onClick={reload}>Try again</button></div>}
      {notice && <div className="toast" role="status"><Icon name="check" size={18} />{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="x" size={16} /></button></div>}
      {page === 'customers' && <CustomerPage {...props} />}
      {page === 'products' && <ProductPage {...props} />}
      {page === 'sales-orders' && <SalesOrderPage {...props} />}
      {page === 'sales-invoices' && <InvoicePage {...props} />}
      {page === 'delivery-receipts' && <DeliveryReceiptPage {...props} />}
      {page === 'shipping-invoices' && <ShippingInvoicePage {...props} />}
      {page === 'users' && canManageUsers && <SalesUserLoginPage {...props} />}
    </Layout>
    {profileOpen && <UserForm profile actorRole={user.role} record={user} onClose={() => setProfileOpen(false)} onSaved={saved} />}
  </>;
}
