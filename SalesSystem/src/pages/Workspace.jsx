import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, money, unitMoney, dateLabel } from '../api.js';
import { Icon } from '../components/Icons.jsx';
import { Avatar, Badge, Empty, roleLabel } from '../components/UI.jsx';
import { MasterForm, UserForm, OrderForm, DocumentForm, ShippingInvoiceForm, PaymentForm, DeleteDialog, DocumentView } from '../components/SalesForms.jsx';
import PurchasingWorkspace, { PURCHASING_TABS } from '../../../PurchasingSystem/src/PurchasingWorkspace.jsx';
import WarehouseWorkspace, { WAREHOUSE_TABS } from '../../../WarehouseSystem/src/WarehouseWorkspace.jsx';
import ConfigurationWorkspace, { CONFIGURATION_TABS } from '../../../ConfigurationSystem/src/ConfigurationWorkspace.jsx';

const TABS = [
  { id: 'customers', title: 'Customer', label: 'Customers', icon: 'users', description: 'Build better relationships. Keep every customer detail organized.', add: 'New customer' },
  { id: 'products', title: 'Product', label: 'Products', icon: 'box', description: 'Your product catalog, pricing, and stock in one place.', add: 'New product' },
  { id: 'sales-orders', title: 'Sales Order', label: 'Sales orders', icon: 'bag', description: 'Turn customer requests into clear, trackable sales orders.', add: 'New sales order' },
  { id: 'sales-invoices', title: 'Invoice', label: 'Invoices', icon: 'file', description: 'Invoice confirmed orders and keep track of payments.', add: 'New invoice' },
  { id: 'delivery-receipts', title: 'Delivery Receipt', label: 'Delivery receipts', icon: 'arrowUpRight', description: 'Record deliveries and keep your inventory up to date.', add: 'New delivery receipt' },
  { id: 'shipping-invoices', title: 'Shipping Invoice', label: 'Shipping invoices', icon: 'shipping', description: 'Link an invoice to its shipment and keep shipping details together.', add: 'New shipping invoice' },
  { id: 'users', title: 'SalesUserLogin', label: 'User accounts', icon: 'shield', description: 'Manage your team, their profiles, and access to the workspace.', add: 'New user' },
];
const EMPTY_DATA = Object.fromEntries(TABS.map(tab => [tab.id, []]));
const count = value => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(Number(value) || 0);
const EXTERNAL_SYSTEMS = [
  { id: 'purchasing', title: 'Purchasing', icon: 'bag', tabs: PURCHASING_TABS, Component: PurchasingWorkspace },
  { id: 'warehouse', title: 'Warehouse', icon: 'box', tabs: WAREHOUSE_TABS, Component: WarehouseWorkspace },
  { id: 'configuration', title: 'Configuration', icon: 'settings', tabs: CONFIGURATION_TABS, Component: ConfigurationWorkspace },
];

export default function Workspace({ user, onUser, onLogout }) {
  const [tab, setTab] = useState('customers');
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const [busyRow, setBusyRow] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({ sales: true, purchasing: false, warehouse: false, configuration: false });
  const [logoutBusy, setLogoutBusy] = useState(false);
  const sequence = useRef(0);
  const detailSequence = useRef(0);
  const activeTab = useRef(tab);
  activeTab.current = tab;
  const isAdmin = user.role === 'admin';
  const canManageUsers = isAdmin || user.role === 'saleshead';
  const activeSystem = EXTERNAL_SYSTEMS.find(system => system.tabs.some(item => item.id === tab));
  const ExternalWorkspace = activeSystem?.Component;
  const current = [...TABS, ...EXTERNAL_SYSTEMS.flatMap(system => system.tabs)].find(item => item.id === tab) || TABS[0];
  const salesTabs = TABS.filter(item => item.id !== 'users');
  const navigation = [{ id: 'sales', title: 'Sales', icon: 'bag', tabs: salesTabs }, ...EXTERNAL_SYSTEMS];
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const tabs = TABS.filter(item => item.id !== 'users' || canManageUsers);
      const results = await Promise.all(tabs.map(async item => [item.id, (await api('/' + item.id)).records || []]));
      if (sequence.current === request) { setData({ ...EMPTY_DATA, ...Object.fromEntries(results) }); setLoaded(true); }
    } catch (error) { if (sequence.current === request) setError(error.message); }
    finally { if (sequence.current === request) setLoading(false); }
  }, [canManageUsers, user.role]);
  useEffect(() => { reload(); return () => { sequence.current++; }; }, [reload]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { detailSequence.current++; setBusyRow(null); setQuery(''); setPage(1); setMenuOpen(false); }, [tab]);
  useEffect(() => () => { detailSequence.current++; }, []);
  useEffect(() => { if (!canManageUsers && tab === 'users') { setTab('customers'); setDialog(null); } }, [canManageUsers, tab]);
  function saved(result) {
    if (dialog?.type === 'profile' && result.user) onUser(result.user);
    else if (dialog?.kind === 'users' && result.record?.id === user.id) onUser(result.record);
    setDialog(null); setNotice(dialog?.type === 'delete' ? 'Record deleted.' : 'Changes saved to the database.'); reload();
  }
  function externalNotice(message) {
    setNotice(message || 'Changes saved.');
    reload();
  }
  async function details(row, type = 'view') {
    const request = ++detailSequence.current;
    const requestedTab = tab;
    setBusyRow(row.id); setError('');
    try { const result = await api('/' + requestedTab + '/' + row.id); if (detailSequence.current === request && activeTab.current === requestedTab) setDialog({ type, kind: requestedTab, record: result.record }); }
    catch (error) { if (detailSequence.current === request && activeTab.current === requestedTab) setError(error.message); }
    finally { if (detailSequence.current === request) setBusyRow(null); }
  }
  async function logout() {
    setLogoutBusy(true); setError('');
    try { await onLogout(); } catch (error) { setError(error.message); setLogoutBusy(false); }
  }
  const rows = tab === 'users' && !isAdmin ? data.users.filter(record => record.role === 'sales') : data[tab] || [];
  const showRowActions = tab !== 'users' || isAdmin;
  const filtered = rows.filter(row => ['name', 'code', 'contactPerson', 'cpnumber', 'email', 'sku', 'description', 'number', 'customerName', 'orderNumber', 'invoiceNumber', 'carrier', 'trackingNumber', 'username', 'role', 'status', 'receivedBy'].some(key => String(row[key] || '').toLowerCase().includes(query.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * 10, safePage * 10);
  const stats = [
    { label: 'Active customers', value: count(data.customers.filter(row => row.isActive).length), icon: 'users', detail: count(data.customers.length) + ' total customers', tone: 'teal' },
    { label: 'Sales orders', value: count(data['sales-orders'].length), icon: 'bag', detail: count(data['sales-orders'].filter(row => row.status === 'confirmed').length) + ' confirmed orders', tone: 'blue' },
    { label: 'Open invoices', value: count(data['sales-invoices'].filter(row => row.status !== 'paid').length), icon: 'wallet', detail: 'Balances shown in each invoice currency', tone: 'amber' },
    { label: 'Active products', value: count(data.products.filter(row => row.isActive).length), icon: 'box', detail: count(data.products.filter(row => row.isActive && Number(row.stock) === 0).length) + ' out of stock', tone: 'violet' },
  ];
  const rowButtons = row => <div className="row-actions">
    {(['customers', 'products'].includes(tab) || (tab === 'users' && isAdmin)) ? <button className="text-button" disabled={busyRow === row.id} onClick={() => tab === 'products' ? details(row, 'edit') : setDialog({ type: 'edit', kind: tab, record: row })}>{busyRow === row.id ? 'Opening…' : 'Edit'}</button> : tab !== 'users' ? <button className="text-button" disabled={busyRow === row.id} onClick={() => details(row)}>{busyRow === row.id ? 'Opening…' : 'View'}</button> : null}
    {tab === 'sales-orders' && !(row.invoiced || row.delivered) && <button className="text-button" disabled={busyRow === row.id} onClick={() => details(row, 'edit')}>Edit</button>}
    {tab === 'sales-invoices' && <button className="text-button" onClick={() => setDialog({ type: 'payment', kind: tab, record: row })}>Payment</button>}
    {(['customers', 'products'].includes(tab) || (tab === 'sales-orders' && !(row.invoiced || row.delivered))) && <button className="text-button danger-text" onClick={() => setDialog({ type: 'delete', kind: tab, record: row })}>Delete</button>}
  </div>;
  return <div className="app-shell">
    {menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={'sidebar ' + (menuOpen ? 'open' : '')}>
      <div className="brand"><div className="brand-mark">T</div><div><strong>TLP COMPANY</strong><span>BUSINESS MANAGEMENT</span></div></div>
      <p className="nav-label">WORKSPACE</p>
      <nav aria-label="Company systems">{navigation.map(system => <section className="system-navigation-group" key={system.id}>
        <button className="sales-group" aria-expanded={Boolean(openGroups[system.id])} aria-controls={system.id + '-module-navigation'} onClick={() => setOpenGroups(current => ({ ...current, [system.id]: !current[system.id] }))}><Icon name={system.icon} size={18} /><span>{system.title}</span><Icon name="chevronDown" size={15} className={openGroups[system.id] ? '' : 'collapsed'} /></button>
        <div id={system.id + '-module-navigation'} className="sales-navigation" hidden={!openGroups[system.id]}>{system.tabs.map(item => <button key={item.id} className={'nav-item ' + (tab === item.id ? 'active' : '')} aria-current={tab === item.id ? 'page' : undefined} onClick={() => { setTab(item.id); setMenuOpen(false); }}><Icon name={item.icon} size={17} /><span>{item.title}</span>{system.id === 'sales' && loaded && <span className="nav-count" aria-hidden="true">{count(data[item.id].length)}</span>}</button>)}</div>
      </section>)}</nav>
      {canManageUsers && <><p className="nav-label administration">{isAdmin ? 'ADMINISTRATION' : 'TEAM'}</p><button className={'nav-item ' + (tab === 'users' ? 'active' : '')} aria-current={tab === 'users' ? 'page' : undefined} onClick={() => { setTab('users'); setMenuOpen(false); }}><Icon name="shield" size={19} /><span>SalesUserLogin</span></button></>}
      <div className="sidebar-bottom">
        <button className="account-button" onClick={() => { setDialog({ type: 'profile', record: user }); setMenuOpen(false); }}><Avatar user={user} /><span><strong>{user.name || user.username}</strong><small>{roleLabel(user.role)}</small></span><Icon name="chevronRight" size={16} /></button>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Icon name="menu" /></button><span>Workspace</span><Icon name="chevronRight" size={13} /><strong>{current.title}</strong></div><div className="topbar-right"><span className="today-label">{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}</span><button className="signout-button" onClick={logout} disabled={logoutBusy}><Icon name="logout" size={17} /><span>{logoutBusy ? 'Signing out…' : 'Sign out'}</span></button></div></header>
      <main className="workspace-content">
        {error && <div className="notice error" role="alert"><span>{error}{loaded && ' Displayed records may be out of date.'}</span><button className="text-button" disabled={loading} onClick={reload}>Try again</button></div>}
        {notice && <div className="toast" role="status"><Icon name="check" size={18} />{notice}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><Icon name="x" size={16} /></button></div>}
        {ExternalWorkspace ? <ExternalWorkspace key={tab} tab={tab} user={user} onNotice={externalNotice} /> : <>
        <div className="page-heading"><div><span className="eyebrow">SALES WORKSPACE</span><h1>{current.title}</h1><p>{current.description}</p></div><button className="button primary" disabled={loading} onClick={() => setDialog({ type: 'new', kind: tab })}><span className="plus">+</span>{current.add}</button></div>
        <section className="stats-grid" aria-label="Sales overview">{stats.map(stat => <div className="stat-card" key={stat.label}><div><span>{stat.label}</span><div className={'stat-icon ' + stat.tone}><Icon name={stat.icon} size={19} /></div></div><strong>{loaded ? stat.value : '—'}</strong><small>{loaded ? stat.detail : 'Loading your records'}</small></div>)}</section>
        <section className="records-card" aria-label={current.title}>
          <div className="records-toolbar"><div className="records-title"><h2>{current.label}</h2><span>{rows.length}</span></div><div className="records-tools"><label className="search-input"><Icon name="search" size={18} /><input type="search" aria-label={'Search ' + current.label.toLowerCase()} placeholder={'Search ' + current.label.toLowerCase() + '…'} value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label><button className={'icon-button refresh-button ' + (loading ? 'spinning' : '')} title="Refresh records" aria-label="Refresh records" onClick={reload} disabled={loading}><Icon name="refresh" size={18} /></button></div></div>
          {loading && !loaded ? <div className="loading-state" role="status"><span className="spinner" />Loading your {current.label.toLowerCase()}…</div> : !visible.length ? <Empty icon={current.icon} title={query ? 'No matching records' : 'Your ' + current.label.toLowerCase() + ' start here'} detail={query ? 'Try another name, code, or document number.' : 'Select “' + current.add + '” to add your first record.'} /> : <div className="table-scroll"><table className="records-table"><thead><tr>
            {tab === 'customers' && <><th>Customer</th><th>Contact person</th><th>Contact details</th><th>Status</th></>}
            {tab === 'products' && <><th>Product</th><th>Unit</th><th className="numeric">Selling price</th><th className="numeric">Stock on hand</th><th>Status</th></>}
            {tab === 'sales-orders' && <><th>Order</th><th>Customer</th><th>Date</th><th className="numeric">Total</th><th>Status</th><th>Documents</th></>}
            {tab === 'sales-invoices' && <><th>Invoice</th><th>Customer</th><th>Due date</th><th className="numeric">Total</th><th className="numeric">Balance</th><th>Status</th></>}
            {tab === 'delivery-receipts' && <><th>Receipt</th><th>Sales order</th><th>Customer</th><th>Delivery date</th><th>Received by</th></>}
            {tab === 'shipping-invoices' && <><th>Shipping invoice</th><th>Invoice</th><th>Customer</th><th>Shipping date</th><th>Carrier / tracking</th><th className="numeric">Total</th></>}
            {tab === 'users' && <><th>Team member</th><th>Username</th><th>Mobile number</th><th>Role</th><th>Status</th></>}
            {showRowActions && <th className="actions-heading">Actions</th>}
          </tr></thead><tbody>{visible.map(row => <tr key={row.id}>
            {tab === 'customers' && <><td><div className="entity-cell"><span className="entity-icon"><Icon name="users" size={18} /></span><div><strong>{row.name}</strong><small>{row.code}</small></div></div></td><td>{row.contactPerson || '—'}</td><td><span>{row.email || '—'}</span><small>{row.cpnumber || ''}</small></td><td><Badge value={row.isActive ? 'active' : 'inactive'}>{row.isActive ? 'Active' : 'Inactive'}</Badge></td></>}
            {tab === 'products' && <><td><div className="entity-cell"><span className="entity-icon product"><Icon name="box" size={18} /></span><div><strong>{row.name}</strong><small>{row.sku}</small></div></div></td><td>{row.unit}</td><td className="numeric">{unitMoney(row.price, row.currency)}</td><td className={'numeric ' + (Number(row.stock) === 0 ? 'danger-text' : '')}>{count(row.stock)}</td><td><Badge value={row.isActive ? 'active' : 'inactive'}>{row.isActive ? 'Active' : 'Inactive'}</Badge></td></>}
            {tab === 'sales-orders' && <><td><strong className="document-number">{row.number}</strong></td><td>{row.customerName}</td><td className="nowrap">{dateLabel(row.orderDate)}</td><td className="numeric">{money(row.total, row.currency)}</td><td><Badge>{row.status}</Badge></td><td><div className="document-flags">{row.invoiced && <span>Invoiced</span>}{row.delivered && <span>Delivered</span>}{!row.invoiced && !row.delivered && <span className="muted">—</span>}</div></td></>}
            {tab === 'sales-invoices' && <><td><strong className="document-number">{row.number}</strong><small>{row.orderNumber}</small></td><td>{row.customerName}</td><td className="nowrap">{dateLabel(row.dueDate)}</td><td className="numeric">{money(row.total, row.currency)}</td><td className="numeric">{money(Number(row.total) - Number(row.paidAmount), row.currency)}</td><td><Badge>{row.status}</Badge></td></>}
            {tab === 'delivery-receipts' && <><td><strong className="document-number">{row.number}</strong></td><td>{row.orderNumber}</td><td>{row.customerName}</td><td className="nowrap">{dateLabel(row.deliveryDate)}</td><td>{row.receivedBy || '—'}</td></>}
            {tab === 'shipping-invoices' && <><td><strong className="document-number">{row.number}</strong></td><td>{row.invoiceNumber}</td><td>{row.customerName}</td><td className="nowrap">{dateLabel(row.shippingDate)}</td><td><span>{row.carrier || '—'}</span>{row.trackingNumber && <small>{row.trackingNumber}</small>}</td><td className="numeric">{money(row.total, row.currency)}</td></>}
            {tab === 'users' && <><td><div className="entity-cell"><Avatar user={row} /><div><strong>{row.name}{row.id === user.id && <span className="you-label">you</span>}</strong><small>{row.email || '—'}</small></div></div></td><td>{row.username}</td><td>{row.cpnumber || '—'}</td><td><Badge value={row.role}>{roleLabel(row.role)}</Badge></td><td><Badge value={row.isActive ? 'active' : 'inactive'}>{row.isActive ? 'Active' : 'Inactive'}</Badge></td></>}
            {showRowActions && <td>{rowButtons(row)}</td>}
          </tr>)}</tbody></table></div>}
          <div className="table-footer"><span>{filtered.length ? ((safePage - 1) * 10 + 1) + '–' + Math.min(safePage * 10, filtered.length) : '0'} of {count(filtered.length)} records</span><div><button className="icon-button" aria-label="Previous page" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {safePage} of {pages}</span><button className="icon-button" aria-label="Next page" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}><Icon name="chevronRight" size={16} /></button></div></div>
        </section>
        <footer className="workspace-footer"><span>TLP Company · SalesSystem</span><span>{tab === 'products' ? 'Product catalog and pricing' : 'Amounts use the document currency'}</span></footer>
        </>}
        {ExternalWorkspace && <footer className="workspace-footer"><span>TLP Company · {activeSystem.title}System</span><span>Connected company workspace</span></footer>}
      </main>
    </div>
    {dialog?.type === 'profile' && <UserForm profile actorRole={user.role} record={user} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'delete' && <DeleteDialog {...dialog} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'payment' && <PaymentForm record={dialog.record} onClose={() => setDialog(null)} onSaved={saved} />}
    {dialog?.type === 'view' && <DocumentView {...dialog} onClose={() => setDialog(null)} />}
    {['new', 'edit'].includes(dialog?.type) && (['customers', 'products'].includes(dialog.kind) ? <MasterForm {...dialog} customers={data.customers} onClose={() => setDialog(null)} onSaved={saved} /> : dialog.kind === 'users' ? <UserForm actorRole={user.role} record={dialog.record} onClose={() => setDialog(null)} onSaved={saved} /> : dialog.kind === 'sales-orders' ? <OrderForm record={dialog.record} customers={data.customers} products={data.products} onClose={() => setDialog(null)} onSaved={saved} /> : dialog.kind === 'shipping-invoices' ? <ShippingInvoiceForm invoices={data['sales-invoices']} shippingInvoices={data['shipping-invoices']} onClose={() => setDialog(null)} onSaved={saved} /> : <DocumentForm kind={dialog.kind} orders={data['sales-orders']} customers={data.customers} onClose={() => setDialog(null)} onSaved={saved} />)}
  </div>;
}
