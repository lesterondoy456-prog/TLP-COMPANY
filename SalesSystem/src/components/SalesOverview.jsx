import React from 'react';
import { Icon } from './Icons.jsx';

export default function SalesOverview({ data, loaded }) {
  const count = value => new Intl.NumberFormat('en-PH').format(value);
  const activeCustomers = data.customers.filter(record => record.isActive).length;
  const confirmedOrders = data['sales-orders'].filter(record => record.status === 'confirmed').length;
  const openInvoices = data['sales-invoices'].filter(record => record.status !== 'paid').length;
  const activeProducts = data.products.filter(record => record.isActive);
  const stats = [
    { label: 'Active customers', value: activeCustomers, icon: 'users', detail: count(data.customers.length) + ' total customers', tone: 'teal' },
    { label: 'Sales orders', value: data['sales-orders'].length, icon: 'bag', detail: count(confirmedOrders) + ' confirmed orders', tone: 'blue' },
    { label: 'Open invoices', value: openInvoices, icon: 'wallet', detail: 'Balances stay in each invoice currency', tone: 'amber' },
    { label: 'Active products', value: activeProducts.length, icon: 'box', detail: count(activeProducts.filter(record => Number(record.stock) === 0).length) + ' out of stock', tone: 'violet' },
  ];
  return <section className="stats-grid" aria-label="Sales overview" aria-busy={!loaded}>
    {!loaded && <span className="sr-only">Loading sales overview</span>}
    {stats.map(stat => <article className={'stat-card stat-' + stat.tone} key={stat.label}>
      <div><span>{stat.label}</span><div className={'stat-icon ' + stat.tone} aria-hidden="true"><Icon name={stat.icon} size={20} /></div></div>
      {loaded ? <strong>{count(stat.value)}</strong> : <span className="skeleton-bar" style={{ width: '52%', height: 28, margin: '6px 0 4px' }} aria-hidden="true" />}
      <small>{loaded ? stat.detail : <span className="skeleton-bar" style={{ width: '82%', height: 10, minHeight: 10, margin: 0 }} aria-hidden="true" />}</small>
    </article>)}
  </section>;
}
