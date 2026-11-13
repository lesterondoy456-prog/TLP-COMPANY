import React from 'react';
import { Icon } from './Icons.jsx';

export default function SalesOverview({ data, loaded }) {
  const count = value => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(Number(value) || 0);
  const stats = [
    { label: 'Active customers', value: count(data.customers.filter(row => row.isActive).length), icon: 'users', detail: count(data.customers.length) + ' total customers', tone: 'teal' },
    { label: 'Sales orders', value: count(data['sales-orders'].length), icon: 'bag', detail: count(data['sales-orders'].filter(row => row.status === 'confirmed').length) + ' confirmed orders', tone: 'blue' },
    { label: 'Open invoices', value: count(data['sales-invoices'].filter(row => row.status !== 'paid').length), icon: 'wallet', detail: 'Balances shown in each invoice currency', tone: 'amber' },
    { label: 'Active products', value: count(data.products.filter(row => row.isActive).length), icon: 'box', detail: count(data.products.filter(row => row.isActive && Number(row.stock) === 0).length) + ' out of stock', tone: 'violet' },
  ];
  return <section className="stats-grid" aria-label="Sales overview">{stats.map(stat => <div className="stat-card" key={stat.label}><div><span>{stat.label}</span><div className={'stat-icon ' + stat.tone}><Icon name={stat.icon} size={19} /></div></div><strong>{loaded ? stat.value : '—'}</strong><small>{loaded ? stat.detail : 'Loading your records'}</small></div>)}</section>;
}
