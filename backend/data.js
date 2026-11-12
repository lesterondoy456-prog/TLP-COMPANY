export const PERIODS = ['7d', '30d', '90d'];

const REPORTS = {
  '7d': {
    revenue: 328450, orders: 842, customers: 426, inventory: 1248,
    revenueChange: 12.8,
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    weights: [32, 40, 35, 52, 48, 72, 63],
  },
  '30d': {
    revenue: 1284520, orders: 3486, customers: 1856, inventory: 1248,
    revenueChange: 18.6,
    labels: ['Oct 10', 'Oct 13', 'Oct 16', 'Oct 19', 'Oct 22', 'Oct 25', 'Oct 28', 'Oct 31', 'Nov 2', 'Nov 4', 'Nov 6', 'Nov 8'],
    weights: [28, 37, 34, 56, 47, 52, 42, 68, 61, 85, 72, 95],
  },
  '90d': {
    revenue: 3648270, orders: 10241, customers: 5248, inventory: 1248,
    revenueChange: 24.2,
    labels: ['Aug 16', 'Aug 23', 'Aug 30', 'Sep 6', 'Sep 13', 'Sep 20', 'Sep 27', 'Oct 4', 'Oct 11', 'Oct 18', 'Oct 25', 'Nov 8'],
    weights: [36, 42, 38, 52, 46, 61, 55, 70, 65, 83, 77, 96],
  },
};

const ORDERS = [
  { id: 'SP-1208', customer: 'Olivia Rhye', company: 'Layers Studio', initials: 'OR', avatarColor: '#e9e1fa', product: 'Wireless keyboard', date: '2026-11-08T09:24:00+08:00', amount: 4250, status: 'Completed' },
  { id: 'SP-1207', customer: 'Phoenix Baker', company: 'Sisyphus Ventures', initials: 'PB', avatarColor: '#dce9f9', product: 'Pro display monitor', date: '2026-11-08T09:12:00+08:00', amount: 18950, status: 'Processing' },
  { id: 'SP-1206', customer: 'Lana Steiner', company: 'Catalog Creative', initials: 'LS', avatarColor: '#f8e6dc', product: 'Workspace bundle', date: '2026-11-08T08:54:00+08:00', amount: 12480, status: 'Completed' },
  { id: 'SP-1205', customer: 'Demi Wilkinson', company: 'Circooles', initials: 'DW', avatarColor: '#e0eee9', product: 'Ergonomic desk chair', date: '2026-11-08T08:41:00+08:00', amount: 8750, status: 'Pending' },
  { id: 'SP-1204', customer: 'Drew Cano', company: 'Hourglass Agency', initials: 'DC', avatarColor: '#e2e5f8', product: 'USB-C docking station', date: '2026-11-08T08:20:00+08:00', amount: 5690, status: 'Completed' },
  { id: 'SP-1203', customer: 'Natali Craig', company: 'Command R', initials: 'NC', avatarColor: '#f5e6ee', product: 'Office essentials kit', date: '2026-11-07T16:48:00+08:00', amount: 2150, status: 'Processing' },
  { id: 'SP-1202', customer: 'Andi Lane', company: 'Ephemeral', initials: 'AL', avatarColor: '#dcecf4', product: 'Noise-cancelling headset', date: '2026-11-07T15:36:00+08:00', amount: 7490, status: 'Completed' },
  { id: 'SP-1201', customer: 'Kate Morrison', company: 'Quotient', initials: 'KM', avatarColor: '#f5ebd7', product: 'Laptop stand', date: '2026-11-07T14:18:00+08:00', amount: 1890, status: 'Pending' },
];

const ACTIVITY = [
  { id: 'activity-1', title: 'Order completed', detail: '#SP-1208', time: '2 min ago', kind: 'order' },
  { id: 'activity-2', title: 'Stock updated', detail: '24 products added', time: '18 min ago', kind: 'inventory' },
  { id: 'activity-3', title: 'Customer added', detail: 'Layers Studio', time: '42 min ago', kind: 'customer' },
];

const NOTIFICATIONS = [
  { id: 'notification-1', title: 'Order completed', detail: '#SP-1208 · ₱4,250', time: '2 min ago', read: false, kind: 'order', orderId: 'SP-1208' },
  { id: 'notification-2', title: 'Monthly target', detail: '85.6% reached', time: '18 min ago', read: false, kind: 'target' },
  { id: 'notification-3', title: 'Stock updated', detail: '24 products added', time: '1 hour ago', read: true, kind: 'workspace' },
];

function revenueSeries(total, weights) {
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const values = weights.map((weight) => Math.round(total * weight / weightTotal));
  values[values.length - 1] += total - values.reduce((sum, value) => sum + value, 0);
  return values;
}

// Seeded examples keep this preview useful without a database or real orders.
export function buildDashboard(period = '30d') {
  const report = REPORTS[period];
  const current = revenueSeries(report.revenue, report.weights);
  const previousTotal = Math.round(report.revenue / (1 + report.revenueChange / 100));
  const previous = revenueSeries(previousTotal,
    report.weights.map((weight, index) => weight * (0.78 + (index % 3) * 0.08)));
  const goal = period === '7d' ? 400000 : period === '90d' ? 4500000 : 1500000;
  return {
    period,
    updatedAt: new Date().toISOString(),
    isDemo: true,
    metrics: [
      { id: 'revenue', label: 'Total revenue', value: report.revenue, format: 'currency', change: report.revenueChange, sparkline: [20, 34, 25, 44, 39, 52, 47, 68, 62, 84] },
      { id: 'orders', label: 'Total orders', value: report.orders, format: 'number', change: 12.4, sparkline: [30, 24, 37, 33, 48, 43, 62, 58, 73, 80] },
      { id: 'customers', label: 'Active customers', value: report.customers, format: 'number', change: 8.2, sparkline: [20, 22, 38, 32, 35, 47, 42, 59, 67, 72] },
      { id: 'inventory', label: 'Products in stock', value: report.inventory, format: 'number', change: 4.6, sparkline: [40, 45, 37, 55, 50, 58, 53, 68, 65, 75] },
    ],
    revenue: { labels: [...report.labels], current, previous, total: report.revenue, change: report.revenueChange },
    breakdown: [
      { label: 'Electronics', value: 45, color: '#2865ed' },
      { label: 'Office supplies', value: 30, color: '#67b9f5' },
      { label: 'Accessories', value: 25, color: '#c8defb' },
    ],
    orders: ORDERS.map((order) => ({ ...order })),
    activity: ACTIVITY.map((activity) => ({ ...activity })),
    target: { current: report.revenue, goal },
    notifications: NOTIFICATIONS.map((notification) => ({ ...notification })),
  };
}
