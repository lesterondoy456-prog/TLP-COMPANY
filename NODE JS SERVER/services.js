import { db, request, sql, transaction } from './database.js';
import { ApiError, USER_COLUMNS, hashPassword, requireAdmin, requireAccountManager } from './components/auth.js';
import * as v from './components/validation.js';
import { listCustomers, getCustomer, saveCustomer, customerOptions } from './customers.js';
import { canReadSalesUser, canCreateSalesUser, isSalesRole, ownProfilePrivileges } from './components/roles.js';
import { listProducts, getProduct, saveProduct } from './products.js';
import { recordAudit } from './audit.js';
import { salesOrderPricing, commonSalesCurrency } from './components/sales-pricing.js';

export { customerOptions };

export async function listMaster(kind) {
  if (kind === 'customers') return listCustomers();
  return listProducts();
}

export async function getMaster(kind, id, scope) {
  if (kind === 'customers') return getCustomer(id, scope);
  return getProduct(id, scope);
}

export async function saveMaster(kind, input, id, user) {
  if (kind === 'customers') return saveCustomer(input, id, user);
  return saveProduct(input, id, user);
}

export async function deleteMaster(kind, id, user) {
  const table = kind === 'customers' ? 'Customers' : 'Products';
  await transaction(async tx => {
    const result = await request(tx).input('id', sql.Int, id).query(`DELETE FROM dbo.${table} OUTPUT DELETED.id WHERE id=@id`);
    if (!result.recordset.length) throw new ApiError(404, 'The record could not be found.');
    if (user) await recordAudit(tx, user, kind, 'delete', id);
  });
}

const orderColumns = `o.id, o.number, o.customerId, o.customerName, o.customerAddress,o.currency,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate, o.notes, o.status, o.total,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered`;

export async function listOrders() {
  return (await db().request().query(`SELECT ${orderColumns} FROM dbo.SalesOrders o ORDER BY o.id DESC`)).recordset;
}

export async function getOrder(id, scope, lock = false) {
  const result = await request(scope).input('id', sql.Int, id)
    .query(`SELECT ${orderColumns} FROM dbo.SalesOrders o ${lock ? 'WITH (UPDLOCK, HOLDLOCK)' : ''} WHERE o.id=@id`);
  if (!result.recordset.length) throw new ApiError(404, 'Sales order could not be found.');
  const items = await request(scope).input('id', sql.Int, id).query('SELECT productId, productName, sku, unit, quantity, unitPrice, lineTotal FROM dbo.SalesOrderItems WHERE orderId=@id ORDER BY id');
  return { ...result.recordset[0], items: items.recordset };
}

function validateOrder(input) {
  const customerId = v.idValue(input.customerId, 'customer');
  const orderDate = v.date(input, 'orderDate');
  const notes = v.text(input, 'notes', 2000);
  const status = input.status || 'draft';
  if (!['draft', 'confirmed'].includes(status)) throw new ApiError(400, 'Order status must be draft or confirmed.');
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 100) throw new ApiError(400, 'Add between 1 and 100 order items.');
  const ids = new Set();
  const items = input.items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ApiError(400, 'Each item must contain a product, quantity and price.');
    const productId = v.idValue(item.productId, 'product');
    if (ids.has(productId)) throw new ApiError(400, 'Each product can appear only once in an order.');
    ids.add(productId);
    const quantity = v.numeric(item, 'quantity', { min: 0.001, max: 1e6, places: 3 });
    const unitPrice = v.numeric(item, 'unitPrice', { max: 1e8, places: 6 });
    return { productId, quantity, unitPrice };
  });
  const priced = salesOrderPricing(items);
  return { customerId, orderDate, notes, status, items: items.map((item, index) => ({ ...item, lineTotal: priced.lineTotals[index] })), total: priced.total };
}

export async function saveOrder(input, user, id) {
  const order = validateOrder(input);
  const savedId = await transaction(async tx => {
    if (id) {
      const current = await getOrder(id, tx, true);
      if (current.invoiced || current.delivered) throw new ApiError(409, 'This order is already linked to an invoice or delivery receipt and cannot be edited.');
    }
    const customer = await getMaster('customers', order.customerId, tx);
    if (!customer.isActive) throw new ApiError(400, 'Select an active customer.');
    const snapshots = [];
    for (const item of [...order.items].sort((a, b) => a.productId - b.productId)) {
      const product = await getMaster('products', item.productId, tx);
      if (!product.isActive) throw new ApiError(400, `${product.name} is inactive.`);
      snapshots.push({ ...item, productName: product.name, sku: product.sku, unit: product.unit, currency: product.currency });
    }
    const currency = commonSalesCurrency(snapshots);
    if (input.currency !== undefined && v.text(input, 'currency', 30, true).toUpperCase() !== currency) throw new ApiError(400, 'Order currency must match the selected product prices.');
    const req = request(tx)
      .input('customerId', sql.Int, order.customerId).input('customerName', sql.NVarChar(180), customer.name)
      .input('customerAddress', sql.NVarChar(500), customer.address).input('orderDate', sql.VarChar(10), order.orderDate)
      .input('notes', sql.NVarChar(2000), order.notes).input('status', sql.NVarChar(20), order.status)
      .input('total', sql.Decimal(18, 2), order.total).input('currency', sql.NVarChar(30), currency);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.SalesOrders SET customerId=@customerId,customerName=@customerName,customerAddress=@customerAddress,
        orderDate=@orderDate,notes=@notes,status=@status,total=@total,currency=@currency,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
      await request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.SalesOrderItems WHERE orderId=@id');
    } else {
      const result = await req.input('createdBy', sql.Int, user.id).query(`INSERT INTO dbo.SalesOrders
        (customerId,customerName,customerAddress,orderDate,notes,status,total,currency,createdBy) OUTPUT INSERTED.id
        VALUES (@customerId,@customerName,@customerAddress,@orderDate,@notes,@status,@total,@currency,@createdBy)`);
      saved = result.recordset[0].id;
    }
    for (const item of snapshots) {
      await request(tx).input('orderId', sql.Int, saved).input('productId', sql.Int, item.productId)
        .input('productName', sql.NVarChar(180), item.productName).input('sku', sql.NVarChar(40), item.sku)
        .input('unit', sql.NVarChar(30), item.unit).input('quantity', sql.Decimal(18, 3), item.quantity)
        .input('unitPrice', sql.Decimal(18, 6), item.unitPrice).input('lineTotal', sql.Decimal(18, 2), item.lineTotal)
        .query(`INSERT INTO dbo.SalesOrderItems (orderId,productId,productName,sku,unit,quantity,unitPrice,lineTotal)
          VALUES (@orderId,@productId,@productName,@sku,@unit,@quantity,@unitPrice,@lineTotal)`);
    }
    if (user) await recordAudit(tx, user, 'sales-orders', id ? 'update' : 'create', saved);
    return saved;
  });
  return getOrder(savedId);
}

export async function deleteOrder(id, user) {
  await transaction(async tx => {
    const order = await getOrder(id, tx, true);
    if (order.invoiced || order.delivered) throw new ApiError(409, 'Orders linked to an invoice or delivery receipt cannot be deleted.');
    await request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.SalesOrderItems WHERE orderId=@id; DELETE FROM dbo.SalesOrders WHERE id=@id;');
    if (user) await recordAudit(tx, user, 'sales-orders', 'delete', id);
  });
}

const invoiceColumns = `i.id,i.number,i.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,o.currency,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,i.total,i.paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status`;

export async function listInvoices() {
  return (await db().request().query(`SELECT ${invoiceColumns} FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId ORDER BY i.id DESC`)).recordset;
}

export async function getInvoice(id, scope) {
  const result = await request(scope).input('id', sql.Int, id)
    .query(`SELECT ${invoiceColumns} FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId WHERE i.id=@id`);
  if (!result.recordset.length) throw new ApiError(404, 'Sales invoice could not be found.');
  const record = result.recordset[0];
  const order = await getOrder(record.orderId, scope);
  return { ...record, items: order.items };
}

export async function createInvoice(input, user) {
  const orderId = v.idValue(input.orderId, 'sales order');
  const invoiceDate = v.date(input, 'invoiceDate');
  const dueDate = v.date(input, 'dueDate');
  if (dueDate < invoiceDate) throw new ApiError(400, 'Due date cannot be earlier than invoice date.');
  const notes = v.text(input, 'notes', 2000);
  const id = await transaction(async tx => {
    const order = await getOrder(orderId, tx, true);
    if (order.status !== 'confirmed') throw new ApiError(400, 'Confirm the sales order before creating an invoice.');
    if (order.invoiced) throw new ApiError(409, 'This sales order already has an invoice.');
    const result = await request(tx).input('orderId', sql.Int, orderId).input('invoiceDate', sql.VarChar(10), invoiceDate)
      .input('dueDate', sql.VarChar(10), dueDate).input('notes', sql.NVarChar(2000), notes)
      .input('total', sql.Decimal(18, 2), order.total).input('createdBy', sql.Int, user.id)
      .query(`INSERT INTO dbo.SalesInvoices (orderId,invoiceDate,dueDate,notes,total,createdBy) OUTPUT INSERTED.id
        VALUES (@orderId,@invoiceDate,@dueDate,@notes,@total,@createdBy)`);
    await recordAudit(tx, user, 'sales-invoices', 'create', result.recordset[0].id);
    return result.recordset[0].id;
  });
  return getInvoice(id);
}

export async function recordPayment(id, input, user) {
  const paidAmount = v.numeric(input, 'paidAmount', { max: 1e12 });
  await transaction(async tx => {
    const result = await request(tx).input('id', sql.Int, id).input('paidAmount', sql.Decimal(18, 2), paidAmount)
      .query('UPDATE dbo.SalesInvoices SET paidAmount=@paidAmount,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id AND total>=@paidAmount');
    if (!result.recordset.length) {
      await getInvoice(id, tx);
      throw new ApiError(400, 'Payment cannot exceed the invoice total.');
    }
    if (user) await recordAudit(tx, user, 'sales-invoices', 'payment', id);
  });
  return getInvoice(id);
}

const deliveryColumns = `d.id,d.number,d.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.total,o.currency,
  CONVERT(varchar(10),d.deliveryDate,23) AS deliveryDate,d.receivedBy,d.address,d.notes`;

export async function listDeliveries() {
  return (await db().request().query(`SELECT ${deliveryColumns} FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId ORDER BY d.id DESC`)).recordset;
}

export async function getDelivery(id, scope) {
  const result = await request(scope).input('id', sql.Int, id)
    .query(`SELECT ${deliveryColumns} FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId WHERE d.id=@id`);
  if (!result.recordset.length) throw new ApiError(404, 'Delivery receipt could not be found.');
  const record = result.recordset[0];
  const order = await getOrder(record.orderId, scope);
  return { ...record, items: order.items };
}

export async function createDelivery(input, user) {
  const orderId = v.idValue(input.orderId, 'sales order');
  const deliveryDate = v.date(input, 'deliveryDate');
  const receivedBy = v.text(input, 'receivedBy', 150);
  const notes = v.text(input, 'notes', 2000);
  const address = v.text(input, 'address', 500);
  const id = await transaction(async tx => {
    const order = await getOrder(orderId, tx, true);
    if (order.status !== 'confirmed') throw new ApiError(400, 'Confirm the sales order before creating a delivery receipt.');
    if (order.delivered) throw new ApiError(409, 'This sales order already has a delivery receipt.');
    for (const item of [...order.items].sort((a, b) => a.productId - b.productId)) {
      const result = await request(tx).input('productId', sql.Int, item.productId).input('quantity', sql.Decimal(18, 3), item.quantity)
        .query('UPDATE dbo.Products SET stock=stock-@quantity,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@productId AND stock>=@quantity');
      if (!result.recordset.length) throw new ApiError(409, `Insufficient finished-product stock for ${item.productName}.`);
    }
    const result = await request(tx).input('orderId', sql.Int, orderId).input('deliveryDate', sql.VarChar(10), deliveryDate)
      .input('receivedBy', sql.NVarChar(150), receivedBy).input('address', sql.NVarChar(500), address || order.customerAddress)
      .input('notes', sql.NVarChar(2000), notes).input('createdBy', sql.Int, user.id)
      .query(`INSERT INTO dbo.DeliveryReceipts (orderId,deliveryDate,receivedBy,address,notes,createdBy) OUTPUT INSERTED.id
        VALUES (@orderId,@deliveryDate,@receivedBy,@address,@notes,@createdBy)`);
    await recordAudit(tx, user, 'delivery-receipts', 'create', result.recordset[0].id);
    return result.recordset[0].id;
  });
  return getDelivery(id);
}

const shippingColumns = `s.id,s.number,s.invoiceId,i.number AS invoiceNumber,i.orderId,o.number AS orderNumber,
  o.customerId,o.customerName,o.customerAddress,o.currency,CONVERT(varchar(10),s.shippingDate,23) AS shippingDate,
  s.carrier,s.trackingNumber,s.notes,i.total,i.paidAmount,d.number AS deliveryNumber`;
const shippingJoins = `FROM dbo.ShippingInvoices s
  JOIN dbo.SalesInvoices i ON i.id=s.invoiceId
  JOIN dbo.SalesOrders o ON o.id=i.orderId
  LEFT JOIN dbo.DeliveryReceipts d ON d.orderId=o.id`;

export async function listShippingInvoices() {
  return (await db().request().query(`SELECT ${shippingColumns} ${shippingJoins} ORDER BY s.id DESC`)).recordset;
}

export async function getShippingInvoice(id, scope) {
  const result = await request(scope).input('id', sql.Int, id)
    .query(`SELECT ${shippingColumns} ${shippingJoins} WHERE s.id=@id`);
  if (!result.recordset.length) throw new ApiError(404, 'Shipping invoice could not be found.');
  const record = result.recordset[0];
  const order = await getOrder(record.orderId, scope);
  return { ...record, items: order.items };
}

export async function createShippingInvoice(input, user) {
  const invoiceId = v.idValue(input.invoiceId, 'sales invoice');
  const shippingDate = v.date(input, 'shippingDate');
  const carrier = v.text(input, 'carrier', 150);
  const trackingNumber = v.text(input, 'trackingNumber', 100);
  const notes = v.text(input, 'notes', 2000);
  const id = await transaction(async tx => {
    // Serialize requests for the same source invoice without changing its data.
    const invoice = await request(tx).input('id', sql.Int, invoiceId)
      .query('SELECT CONVERT(varchar(10),invoiceDate,23) AS invoiceDate FROM dbo.SalesInvoices WITH (UPDLOCK,HOLDLOCK) WHERE id=@id');
    if (!invoice.recordset.length) throw new ApiError(404, 'Sales invoice could not be found.');
    if (shippingDate < invoice.recordset[0].invoiceDate) throw new ApiError(400, 'Shipping date cannot be earlier than invoice date.');
    const existing = await request(tx).input('invoiceId', sql.Int, invoiceId)
      .query('SELECT id FROM dbo.ShippingInvoices WHERE invoiceId=@invoiceId');
    if (existing.recordset.length) throw new ApiError(409, 'This sales invoice already has a shipping invoice.');
    const result = await request(tx).input('invoiceId', sql.Int, invoiceId)
      .input('shippingDate', sql.VarChar(10), shippingDate).input('carrier', sql.NVarChar(150), carrier)
      .input('trackingNumber', sql.NVarChar(100), trackingNumber).input('notes', sql.NVarChar(2000), notes)
      .input('createdBy', sql.Int, user.id)
      .query(`INSERT INTO dbo.ShippingInvoices (invoiceId,shippingDate,carrier,trackingNumber,notes,createdBy)
        OUTPUT INSERTED.id VALUES (@invoiceId,@shippingDate,@carrier,@trackingNumber,@notes,@createdBy)`);
    await recordAudit(tx, user, 'shipping-invoices', 'create', result.recordset[0].id);
    return result.recordset[0].id;
  });
  return getShippingInvoice(id);
}

export async function listUsers(user) {
  requireAccountManager(user);
  return (await db().request().query(`SELECT ${USER_COLUMNS} FROM dbo.SalesUserLogin ${user.role === 'saleshead' ? "WHERE role='sales'" : ''} ORDER BY id`)).recordset;
}

async function getUserRecord(id, scope) {
  const result = await request(scope).input('id', sql.Int, id).query(`SELECT ${USER_COLUMNS} FROM dbo.SalesUserLogin WHERE id=@id`);
  if (!result.recordset.length) throw new ApiError(404, 'Sales user could not be found.');
  return result.recordset[0];
}

export async function getUser(id, currentUser) {
  requireAccountManager(currentUser);
  const target = await getUserRecord(id);
  if (!canReadSalesUser(currentUser, target)) throw new ApiError(403, 'Sales heads can only view Sales accounts.');
  return target;
}

export async function saveUser(input, currentUser, id, ownProfile = false) {
  if (!ownProfile) {
    requireAccountManager(currentUser);
    if (id) requireAdmin(currentUser);
    else if (currentUser.role === 'saleshead' && !canCreateSalesUser(currentUser, input.role)) {
      throw new ApiError(403, 'Sales heads can only create Sales accounts.');
    }
  }
  if (ownProfile && id !== currentUser.id) throw new ApiError(403, 'You can only update your own profile.');
  const name = v.text(input, 'name', 150, true);
  const username = v.username(input);
  const cpnumber = v.text(input, 'cpnumber', 30);
  const email = v.email(input);
  const photo = v.photo(input);
  const privileges = ownProfile ? ownProfilePrivileges(currentUser) : { role: input.role, isActive: v.bool(input, 'isActive') };
  const { role, isActive } = privileges;
  if (!isSalesRole(role)) throw new ApiError(400, 'Role must be admin, saleshead or sales.');
  const plainPassword = ownProfile ? undefined : v.password(input, !id);
  const passwordHash = plainPassword ? await hashPassword(plainPassword) : undefined;
  const savedId = await transaction(async tx => {
    if (id) {
      const current = await getUserRecord(id, tx);
      if (id === currentUser.id && (!isActive || role !== 'admin') && currentUser.role === 'admin') {
        throw new ApiError(400, 'Keep your own administrator account active with the admin role.');
      }
      if (current.role === 'admin' && current.isActive && (role !== 'admin' || !isActive)) {
        const count = await request(tx).query("SELECT COUNT(*) AS total FROM dbo.SalesUserLogin WITH (UPDLOCK,HOLDLOCK) WHERE role='admin' AND isActive=1");
        if (count.recordset[0].total <= 1) throw new ApiError(409, 'At least one active administrator is required.');
      }
    }
    const req = request(tx).input('name', sql.NVarChar(150), name).input('username', sql.NVarChar(80), username)
      .input('cpnumber', sql.NVarChar(30), cpnumber).input('email', sql.NVarChar(254), email)
      .input('photo', sql.NVarChar(sql.MAX), photo).input('role', sql.NVarChar(20), role).input('isActive', sql.Bit, isActive);
    if (passwordHash) req.input('passwordHash', sql.VarChar(300), passwordHash);
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.SalesUserLogin SET name=@name,username=@username,cpnumber=@cpnumber,
        email=@email,photo=@photo,role=@role,isActive=@isActive,updatedAt=SYSUTCDATETIME()${passwordHash ? ',passwordHash=@passwordHash' : ''} WHERE id=@id`);
      await recordAudit(tx, currentUser, 'users', ownProfile ? 'profile' : 'update', id);
      return id;
    }
    const result = await req.query(`INSERT INTO dbo.SalesUserLogin (name,username,cpnumber,email,photo,role,isActive,passwordHash)
      OUTPUT INSERTED.id VALUES (@name,@username,@cpnumber,@email,@photo,@role,@isActive,@passwordHash)`);
    await recordAudit(tx, currentUser, 'users', 'create', result.recordset[0].id);
    return result.recordset[0].id;
  });
  return getUserRecord(savedId);
}
