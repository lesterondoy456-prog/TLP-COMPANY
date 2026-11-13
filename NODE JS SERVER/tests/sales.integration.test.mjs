import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const backend = fileURLToPath(new URL('../', import.meta.url));
const envFile = path.join(backend, '.env');
if (!existsSync(envFile)) throw new Error('Create NODE JS SERVER/.env before running integration tests.');
process.loadEnvFile(envFile);

const requireBackend = createRequire(path.join(backend, 'package.json'));
const sql = requireBackend('mssql/msnodesqlv8');
const databaseName = `TLP Company Test ${process.pid} ${Date.now()}`;
const secret = randomBytes(48).toString('hex');
const adminUsername = 'integration_admin';
const adminPassword = 'admin123';
const salesPassword = randomBytes(24).toString('base64url');
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6H8kAAAAASUVORK5CYII=';

function connectionStringFor(name) {
  const value = process.env.DB_CONNECTION_STRING;
  if (!value || !/(?:^|;)(?:Database|Initial Catalog)\s*=/i.test(value)) {
    throw new Error('DB_CONNECTION_STRING must contain Database= for isolated SQL tests.');
  }
  return value.replace(/((?:^|;)(?:Database|Initial Catalog)\s*=)(?:\{[^}]*\}|[^;]*)/i, `$1${name}`);
}

function redact(value) {
  return [secret, adminPassword, salesPassword, process.env.ADMIN_PASSWORD, process.env.SESSION_SECRET]
    .filter(Boolean).reduce((text, item) => text.split(item).join('[redacted]'), String(value));
}

async function availablePort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('SQL-backed sales workflow, authorization, validation, and restart persistence', { timeout: 180_000 }, async t => {
  assert.match(databaseName, /^TLP Company Test \d+ \d+$/);
  assert.notEqual(databaseName, 'TLP Company');
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  let child;
  let serverOutput = '';

  async function stopServer() {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const running = child;
    const exited = once(running, 'exit');
    running.kill();
    await Promise.race([exited, sleep(7000).then(() => { running.kill('SIGKILL'); })]);
    if (running.exitCode === null && running.signalCode === null) await Promise.race([exited, sleep(3000)]);
    child = undefined;
  }

  t.after(async () => {
    await stopServer();
    assert.match(databaseName, /^TLP Company Test \d+ \d+$/);
    const pool = await new sql.ConnectionPool({ connectionString: connectionStringFor('master') }).connect();
    try {
      // The generated, strictly checked name is the only database this cleanup can remove.
      await pool.request().query(`IF DB_ID(N'${databaseName}') IS NOT NULL BEGIN ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${databaseName}]; END;`);
    } finally {
      await pool.close();
    }
  });

  async function startServer() {
    serverOutput = '';
    child = spawn(process.execPath, ['server.js'], {
      cwd: backend,
      env: {
        ...process.env, HOST: '127.0.0.1', PORT: String(port), DB_NAME: databaseName,
        DB_CONNECTION_STRING: connectionStringFor(databaseName),
        SESSION_SECRET: secret, ADMIN_USERNAME: adminUsername,
        ADMIN_PASSWORD: adminPassword, ADMIN_NAME: 'Integration Administrator',
      },
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-8000); });
    child.stderr.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-8000); });
    let spawnError;
    child.on('error', error => { spawnError = error; });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Test server stopped before becoming ready: ${redact(serverOutput)}`);
      }
      try {
        const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
          const health = await response.json();
          assert.equal(health.database?.status, 'connected');
          // Refuse every mutating API request unless the server confirms the isolated database.
          assert.equal(health.database?.name, databaseName);
          return;
        }
      } catch (error) {
        if (error instanceof assert.AssertionError) throw error;
      }
      await sleep(200);
    }
    throw new Error(`Test server did not start: ${redact(serverOutput)}`);
  }

  function client(initialCookie = '') {
    let cookie = initialCookie;
    return {
      get cookie() { return cookie; },
      async request(method, endpoint, body, expected = 200) {
        const headers = { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await fetch(`${origin}${endpoint}`, {
          method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(15_000),
        });
        const data = await response.json();
        const allowed = Array.isArray(expected) ? expected : [expected];
        assert.ok(allowed.includes(response.status), `${method} ${endpoint}: expected ${allowed.join('/')}, received ${response.status}: ${data.message || 'unexpected response'}`);
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return data;
      },
    };
  }

  await startServer();
  const anonymous = client();
  const admin = client();
  const sales = client();
  const salesHead = client();
  let customer;
  let product;
  let scarceProduct;
  let order;
  let invoice;
  let shippingInvoice;
  let receipt;
  let salesUser;

  await t.test('authentication and initial admin are database backed', async () => {
    await anonymous.request('GET', '/api/customers', undefined, 401);
    await anonymous.request('GET', '/api/shipping-invoices', undefined, 401);
    await anonymous.request('POST', '/api/auth/login', { username: adminUsername, password: 'incorrect-password' }, 401);
    const result = await admin.request('POST', '/api/auth/login', { username: adminUsername, password: adminPassword, remember: true });
    assert.equal(result.user.role, 'admin');
    assert.equal(result.user.username, adminUsername);
    assert.ok(admin.cookie);
    const session = await admin.request('GET', '/api/auth/session');
    assert.equal(session.user.id, result.user.id);
    for (const field of ['name', 'username', 'cpnumber', 'email', 'photo', 'role']) {
      assert.ok(Object.hasOwn(result.user, field), `User is missing ${field}`);
    }
    assert.equal(Object.hasOwn(result.user, 'passwordHash'), false);
    assert.equal(Object.hasOwn(result.user, 'password'), false);
  });

  await t.test('customer and product CRUD persist validated master data', async () => {
    customer = (await admin.request('POST', '/api/customers', {
      code: 'C-INTEGRATION', name: 'Integration Customer', contactPerson: 'Test Contact',
      cpnumber: '09171234567', email: 'customer@example.test', address: 'Makati, Philippines', isActive: true,
    }, [200, 201])).record;
    assert.ok(Number.isInteger(customer.id));
    await admin.request('POST', '/api/customers', { code: 'C-INTEGRATION', name: 'Duplicate' }, 409);
    customer = (await admin.request('PUT', `/api/customers/${customer.id}`, { ...customer, name: 'Updated Integration Customer' })).record;
    assert.equal(customer.name, 'Updated Integration Customer');
    product = (await admin.request('POST', '/api/products', {
      sku: 'SKU-INTEGRATION', name: 'Integration Product', description: 'For isolated testing',
      unit: 'pcs', price: 125.5, stock: 100, isActive: true,
    }, [200, 201])).record;
    assert.ok(Number.isInteger(product.id));
    await admin.request('POST', '/api/products', { sku: 'SKU-INTEGRATION', name: 'Duplicate', unit: 'pcs', price: 1, stock: 1 }, 409);
    await admin.request('POST', '/api/products', { sku: 'INVALID-STOCK', name: 'Invalid', unit: 'pcs', price: 1, stock: -1 }, 400);
    product = (await admin.request('PUT', `/api/products/${product.id}`, { ...product, price: 140 })).record;
    assert.equal(Number(product.price), 140);
    scarceProduct = (await admin.request('POST', '/api/products', {
      sku: 'SKU-SCARCE', name: 'Scarce Product', unit: 'pcs', price: 50, stock: 1, isActive: true,
    }, [200, 201])).record;
    const customers = await admin.request('GET', '/api/customers');
    const products = await admin.request('GET', '/api/products');
    assert.ok(customers.records.some(record => record.id === customer.id));
    assert.ok(products.records.some(record => record.id === product.id));

    const unused = (await admin.request('POST', '/api/products', { sku: 'SKU-DELETE', name: 'Disposable', unit: 'pcs', price: 1, stock: 1, isActive: true }, [200, 201])).record;
    await admin.request('DELETE', `/api/products/${unused.id}`);
    const remaining = await admin.request('GET', '/api/products');
    assert.equal(remaining.records.some(record => record.id === unused.id), false);
  });

  await t.test('orders calculate totals on the server and protect referenced masters', async () => {
    for (const override of [
      { orderDate: '2026-02-30' },
      { items: [{ productId: product.id, quantity: 1, unitPrice: -5 }] },
    ]) {
      await admin.request('POST', '/api/sales-orders', {
        customerId: customer.id, orderDate: '2026-11-12', status: 'draft',
        items: [{ productId: product.id, quantity: 1, unitPrice: 150 }], ...override,
      }, 400);
    }
    await admin.request('POST', '/api/sales-orders', {
      customerId: customer.id, orderDate: '2026-11-12', status: 'draft',
      items: [{ productId: product.id, quantity: 0, unitPrice: 150 }],
    }, 400);
    order = (await admin.request('POST', '/api/sales-orders', {
      customerId: customer.id, orderDate: '2026-11-12', status: 'draft', notes: 'Integration workflow', total: 0,
      items: [{ productId: product.id, quantity: 2, unitPrice: 150 }],
    }, [200, 201])).record;
    assert.equal(Number(order.total), 300);
    assert.equal(Number(order.items[0].lineTotal), 300);
    assert.ok(order.number);
    const detail = (await admin.request('GET', `/api/sales-orders/${order.id}`)).record;
    assert.equal(detail.customerId, customer.id);
    order = (await admin.request('PUT', `/api/sales-orders/${order.id}`, {
      customerId: customer.id, orderDate: '2026-11-12', status: 'confirmed', notes: 'Ready to invoice',
      items: [{ productId: product.id, quantity: 2, unitPrice: 150 }],
    })).record;
    assert.equal(order.status, 'confirmed');
    await admin.request('DELETE', `/api/customers/${customer.id}`, undefined, 409);
    await admin.request('DELETE', `/api/products/${product.id}`, undefined, 409);
  });

  await t.test('invoice creation is unique, protects source orders, and validates payments', async () => {
    await admin.request('POST', '/api/sales-invoices', {
      orderId: order.id, invoiceDate: '2026-11-12', dueDate: '2026-11-11',
    }, 400);
    invoice = (await admin.request('POST', '/api/sales-invoices', {
      orderId: order.id, invoiceDate: '2026-11-12', dueDate: '2026-12-12', notes: 'Integration invoice',
    }, [200, 201])).record;
    assert.equal(Number(invoice.total), 300);
    assert.equal(invoice.status, 'unpaid');
    await admin.request('POST', '/api/sales-invoices', { orderId: order.id, invoiceDate: '2026-11-12', dueDate: '2026-12-12' }, 409);
    await admin.request('PUT', `/api/sales-orders/${order.id}`, {
      customerId: customer.id, orderDate: '2026-11-12', status: 'confirmed', items: [{ productId: product.id, quantity: 3, unitPrice: 150 }],
    }, 409);
    await admin.request('DELETE', `/api/sales-orders/${order.id}`, undefined, 409);
    await admin.request('PATCH', `/api/sales-invoices/${invoice.id}/payment`, { paidAmount: 301 }, 400);
    await admin.request('PATCH', `/api/sales-invoices/${invoice.id}/payment`, { paidAmount: -1 }, 400);
    const partial = (await admin.request('PATCH', `/api/sales-invoices/${invoice.id}/payment`, { paidAmount: 100 })).record;
    assert.equal(partial.status, 'partial');
    assert.equal(Number(partial.paidAmount), 100);
    invoice = (await admin.request('PATCH', `/api/sales-invoices/${invoice.id}/payment`, { paidAmount: 300 })).record;
    assert.equal(invoice.status, 'paid');
  });

  await t.test('shipping invoices derive existing invoice data without requiring a delivery', async () => {
    await admin.request('POST', '/api/shipping-invoices', { invoiceId: 0, shippingDate: '2026-11-12' }, 400);
    await admin.request('POST', '/api/shipping-invoices', { invoiceId: 2147483000, shippingDate: '2026-11-12' }, 404);
    await admin.request('POST', '/api/shipping-invoices', { invoiceId: invoice.id, shippingDate: '2026-02-30' }, 400);
    await admin.request('POST', '/api/shipping-invoices', { invoiceId: invoice.id, shippingDate: '2026-11-11' }, 400);
    const beforeOrder = (await admin.request('GET', `/api/sales-orders/${order.id}`)).record;
    assert.equal(beforeOrder.delivered, false, 'Shipping documents must not require a delivery receipt.');
    shippingInvoice = (await admin.request('POST', '/api/shipping-invoices', {
      invoiceId: invoice.id, shippingDate: '2026-11-13', carrier: 'Integration Carrier',
      trackingNumber: 'TRACK-INTEGRATION-001', notes: 'Derived shipping document',
      total: 0, customerName: 'Forged customer', items: [],
    }, [200, 201])).record;
    assert.ok(shippingInvoice.number);
    assert.equal(shippingInvoice.invoiceId, invoice.id);
    assert.equal(shippingInvoice.invoiceNumber, invoice.number);
    assert.equal(shippingInvoice.orderNumber, order.number);
    assert.equal(shippingInvoice.customerName, customer.name);
    assert.equal(Number(shippingInvoice.total), Number(invoice.total));
    assert.equal(shippingInvoice.shippingDate, '2026-11-13');
    assert.equal(shippingInvoice.carrier, 'Integration Carrier');
    assert.equal(shippingInvoice.trackingNumber, 'TRACK-INTEGRATION-001');
    assert.equal(shippingInvoice.notes, 'Derived shipping document');
    assert.equal(shippingInvoice.items.length, invoice.items.length);
    assert.equal(shippingInvoice.items[0].productId, product.id);
    assert.equal(Number(shippingInvoice.items[0].quantity), 2);
    assert.equal(Number(shippingInvoice.items[0].unitPrice), 150);
    assert.equal(Number(shippingInvoice.items[0].lineTotal), 300);
    await admin.request('POST', '/api/shipping-invoices', { invoiceId: invoice.id, shippingDate: '2026-11-13' }, 409);
    const detail = (await admin.request('GET', `/api/shipping-invoices/${shippingInvoice.id}`)).record;
    assert.equal(detail.number, shippingInvoice.number);
    assert.equal(detail.trackingNumber, 'TRACK-INTEGRATION-001');
    const rows = (await admin.request('GET', '/api/shipping-invoices')).records;
    assert.equal(rows.filter(row => row.invoiceId === invoice.id).length, 1);
    const sourceInvoice = (await admin.request('GET', `/api/sales-invoices/${invoice.id}`)).record;
    const sourceOrder = (await admin.request('GET', `/api/sales-orders/${order.id}`)).record;
    assert.equal(sourceOrder.customerName, customer.name);
    assert.equal(Number(sourceInvoice.total), 300);
    assert.equal(sourceInvoice.items.length, 1);
    assert.equal(sourceInvoice.items[0].productId, product.id);
    const products = (await admin.request('GET', '/api/products')).records;
    assert.equal(Number(products.find(row => row.id === product.id).stock), 100, 'Shipping invoice must not move inventory.');
    const pool = await new sql.ConnectionPool({ connectionString: connectionStringFor(databaseName) }).connect();
    try {
      const identity = await pool.request().query('SELECT DB_NAME() AS name');
      assert.equal(identity.recordset[0].name, databaseName);
      const columns = await pool.request().query("SELECT name FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.ShippingInvoices') ORDER BY column_id");
      assert.deepEqual(columns.recordset.map(row => row.name), ['id', 'number', 'invoiceId', 'shippingDate', 'carrier', 'trackingNumber', 'notes', 'createdBy', 'createdAt']);
      const tables = await pool.request().query("SELECT name FROM sys.tables WHERE name LIKE '%Shipping%' ORDER BY name");
      assert.deepEqual(tables.recordset.map(row => row.name), ['ShippingInvoices'], 'Shipping metadata must reuse existing invoice items and customer data.');
    } finally {
      await pool.close();
    }
  });

  await t.test('delivery stock movement is atomic and cannot be applied twice', async () => {
    receipt = (await admin.request('POST', '/api/delivery-receipts', {
      orderId: order.id, deliveryDate: '2026-11-12', receivedBy: 'Test Receiver', address: customer.address, notes: 'Integration receipt',
    }, [200, 201])).record;
    assert.ok(receipt.number);
    await admin.request('POST', '/api/delivery-receipts', { orderId: order.id, deliveryDate: '2026-11-12', receivedBy: 'Duplicate Receiver', address: customer.address }, 409);
    let products = (await admin.request('GET', '/api/products')).records;
    assert.equal(Number(products.find(row => row.id === product.id).stock), 98);
    const insufficientOrder = (await admin.request('POST', '/api/sales-orders', {
      customerId: customer.id, orderDate: '2026-11-12', status: 'confirmed',
      items: [{ productId: product.id, quantity: 3, unitPrice: 150 }, { productId: scarceProduct.id, quantity: 2, unitPrice: 50 }],
    }, [200, 201])).record;
    await admin.request('POST', '/api/delivery-receipts', { orderId: insufficientOrder.id, deliveryDate: '2026-11-12', receivedBy: 'Receiver', address: customer.address }, 409);
    products = (await admin.request('GET', '/api/products')).records;
    assert.equal(Number(products.find(row => row.id === product.id).stock), 98);
    assert.equal(Number(products.find(row => row.id === scarceProduct.id).stock), 1);
    const receipts = (await admin.request('GET', '/api/delivery-receipts')).records;
    assert.equal(receipts.some(row => row.orderId === insufficientOrder.id), false);
  });

  await t.test('concurrent deliveries cannot oversell available stock', async () => {
    const raceProduct = (await admin.request('POST', '/api/products', {
      sku: 'SKU-RACE', name: 'Concurrent Stock Product', unit: 'pcs', price: 10, stock: 3, isActive: true,
    }, [200, 201])).record;
    const orders = [];
    for (let index = 0; index < 2; index += 1) {
      orders.push((await admin.request('POST', '/api/sales-orders', {
        customerId: customer.id, orderDate: '2026-11-12', status: 'confirmed',
        items: [{ productId: raceProduct.id, quantity: 2, unitPrice: 10 }],
      }, [200, 201])).record);
    }
    const outcomes = await Promise.all(orders.map(async row => {
      const response = await fetch(`${origin}/api/delivery-receipts`, {
        method: 'POST', headers: { Origin: origin, Cookie: admin.cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: row.id, deliveryDate: '2026-11-12', receivedBy: 'Concurrent Receiver', address: customer.address }),
        signal: AbortSignal.timeout(15_000),
      });
      return { status: response.status, body: await response.json() };
    }));
    assert.equal(outcomes.filter(result => [200, 201].includes(result.status)).length, 1, JSON.stringify(outcomes));
    assert.equal(outcomes.filter(result => result.status === 409).length, 1, JSON.stringify(outcomes));
    const products = (await admin.request('GET', '/api/products')).records;
    assert.equal(Number(products.find(row => row.id === raceProduct.id).stock), 1);
  });

  await t.test('sales roles, editable profiles, and disabled sessions are enforced', async () => {
    salesUser = (await admin.request('POST', '/api/users', {
      name: 'Sales Integration User', username: 'integration_sales', cpnumber: '09179876543',
      email: 'sales@example.test', photo: '', role: 'sales', isActive: true, password: salesPassword,
    }, [200, 201])).record;
    assert.equal(salesUser.role, 'sales');
    await sales.request('POST', '/api/auth/login', { username: salesUser.username, password: salesPassword });
    await sales.request('GET', '/api/customers');
    await sales.request('GET', '/api/shipping-invoices');
    await sales.request('GET', '/api/users', undefined, 403);
    await sales.request('POST', '/api/users', { name: 'Forbidden', username: 'forbidden', password: salesPassword, role: 'admin' }, 403);
    const salesOrder = (await sales.request('POST', '/api/sales-orders', {
      customerId: customer.id, orderDate: '2026-11-13', status: 'confirmed',
      items: [{ productId: product.id, quantity: 1, unitPrice: 150 }],
    }, [200, 201])).record;
    const salesInvoice = (await sales.request('POST', '/api/sales-invoices', {
      orderId: salesOrder.id, invoiceDate: '2026-11-13', dueDate: '2026-12-13',
    }, [200, 201])).record;
    const salesShipping = (await sales.request('POST', '/api/shipping-invoices', {
      invoiceId: salesInvoice.id, shippingDate: '2026-11-13',
    }, [200, 201])).record;
    assert.equal(salesShipping.invoiceId, salesInvoice.id);
    assert.equal(Number(salesShipping.total), 150);
    const profile = (await sales.request('PUT', '/api/auth/profile', {
      name: 'Updated Sales User', username: 'integration_sales_updated', cpnumber: '09170000000', email: 'updated@example.test', photo,
    })).user;
    assert.equal(profile.name, 'Updated Sales User');
    assert.equal(profile.username, 'integration_sales_updated');
    assert.equal(profile.cpnumber, '09170000000');
    assert.equal(profile.email, 'updated@example.test');
    assert.equal(profile.photo, photo);
    assert.equal(profile.role, 'sales');
    await sales.request('PUT', '/api/auth/profile', {
      name: profile.name, username: profile.username, cpnumber: profile.cpnumber,
      email: profile.email, photo: profile.photo, role: 'admin',
    }, [200, 400, 403]);
    const unchangedRole = (await sales.request('GET', '/api/auth/session')).user;
    assert.equal(unchangedRole.role, 'sales');
    salesUser = { ...salesUser, ...profile };
    const adminProfile = (await admin.request('GET', '/api/auth/session')).user;
    await admin.request('PUT', `/api/users/${adminProfile.id}`, { ...adminProfile, role: 'sales', isActive: true }, [400, 409]);
    await admin.request('PUT', `/api/users/${adminProfile.id}`, { ...adminProfile, role: 'admin', isActive: false }, [400, 409]);
    await admin.request('PUT', `/api/users/${salesUser.id}`, { ...salesUser, isActive: false });
    await sales.request('GET', '/api/auth/session', undefined, 401);
    await sales.request('POST', '/api/auth/login', { username: salesUser.username, password: salesPassword }, 401);
    const users = (await admin.request('GET', '/api/users')).records;
    assert.ok(users.some(user => user.id === salesUser.id && user.isActive === false));
    assert.ok(users.every(user => !Object.hasOwn(user, 'passwordHash') && !Object.hasOwn(user, 'password')));
  });

  await t.test('Sales Head account access is restricted to reading and creating Sales', async () => {
    const headUser = (await admin.request('POST', '/api/users', {
      name: 'Integration Sales Head', username: 'integration_head', cpnumber: '', email: '', photo: '',
      role: 'saleshead', isActive: true, password: salesPassword,
    }, [200, 201])).record;
    await salesHead.request('POST', '/api/auth/login', { username: headUser.username, password: salesPassword });
    const visible = (await salesHead.request('GET', '/api/users')).records;
    assert.ok(visible.every(user => user.role === 'sales'));
    assert.ok(visible.some(user => user.id === salesUser.id));
    await salesHead.request('GET', `/api/users/${salesUser.id}`);
    const administrator = (await admin.request('GET', '/api/auth/session')).user;
    await salesHead.request('GET', `/api/users/${administrator.id}`, undefined, 403);
    await salesHead.request('GET', `/api/users/${headUser.id}`, undefined, 403);
    for (const role of ['admin', 'saleshead']) await salesHead.request('POST', '/api/users', { role }, 403);
    await salesHead.request('PUT', `/api/users/${salesUser.id}`, { ...salesUser, role: 'sales' }, 403);
    const created = (await salesHead.request('POST', '/api/users', {
      name: 'Head Created Sales', username: 'head_created_sales', cpnumber: '', email: '', photo: '',
      role: 'sales', isActive: true, password: salesPassword,
    }, [200, 201])).record;
    assert.equal(created.role, 'sales');
    const profile = (await salesHead.request('PUT', '/api/auth/profile', {
      name: 'Updated Integration Sales Head', username: headUser.username, cpnumber: '', email: '', photo: '',
      role: 'admin', isActive: false,
    })).user;
    assert.equal(profile.role, 'saleshead');
    assert.equal(profile.isActive, true);
  });

  await t.test('records and signed admin sessions survive a server restart', async () => {
    await stopServer();
    await startServer();
    const session = await admin.request('GET', '/api/auth/session');
    assert.equal(session.user.username, adminUsername);
    assert.equal((await salesHead.request('GET', '/api/auth/session')).user.role, 'saleshead');
    const savedOrder = (await admin.request('GET', `/api/sales-orders/${order.id}`)).record;
    const savedInvoice = (await admin.request('GET', `/api/sales-invoices/${invoice.id}`)).record;
    const savedReceipt = (await admin.request('GET', `/api/delivery-receipts/${receipt.id}`)).record;
    const savedShipping = (await admin.request('GET', `/api/shipping-invoices/${shippingInvoice.id}`)).record;
    assert.equal(savedOrder.invoiced, true);
    assert.equal(savedOrder.delivered, true);
    assert.equal(Number(savedInvoice.paidAmount), 300);
    assert.equal(savedInvoice.status, 'paid');
    assert.equal(savedReceipt.receivedBy, 'Test Receiver');
    assert.equal(savedShipping.invoiceId, invoice.id);
    assert.equal(savedShipping.trackingNumber, 'TRACK-INTEGRATION-001');
    assert.equal(Number(savedShipping.total), 300);
    assert.equal(savedShipping.items[0].productId, product.id);
    await admin.request('POST', '/api/auth/logout', {});
    await admin.request('GET', '/api/auth/session', undefined, 401);
  });
});
