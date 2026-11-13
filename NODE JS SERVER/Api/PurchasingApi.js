const express = require("express");
const router = express.Router();
const { request, sql, transaction } = require("../db");

const SYSTEM = 'purchasing';


router.get('/suppliers', async (req, res) => {
  const scope = undefined;
  const data = await request().query(`SELECT id,code,[name],[shortName],[businessStyle],[address],[remarks],[tin],[contactPerson],[email],[countryOfOrigin],[country],[cpnumber],[faxNo],[paymentTerm],[vatCode],[taxCode],[decimalInPrice],[decimalInTotalPrice],[vatInclusive],[isActive] FROM dbo.Suppliers ORDER BY name,id`);
  res.json({ records: data.recordset });
});

router.get('/suppliers/:id', async (req, res) => {
  const scope = undefined;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const data = await request().input('id', sql.Int, id).query(`SELECT id,code,[name],[shortName],[businessStyle],[address],[remarks],[tin],[contactPerson],[email],[countryOfOrigin],[country],[cpnumber],[faxNo],[paymentTerm],[vatCode],[taxCode],[decimalInPrice],[decimalInTotalPrice],[vatInclusive],[isActive] FROM dbo.Suppliers WHERE id=@id`);
  if (!data.recordset.length) {
    const error = new Error('Supplier could not be found.');
    error.status = 404;
    throw error;
  }
  res.json({ record: data.recordset[0] });
});

router.post('/suppliers', async (req, res) => {
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Send a JSON object.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const record = await transaction(async scope => {
    const value = { decimalInPrice: 2, decimalInTotalPrice: 2, vatInclusive: false, isActive: true, ...input };
    for (const key of ['name', 'shortName', 'businessStyle', 'address', 'remarks', 'tin', 'contactPerson', 'email', 'countryOfOrigin', 'country', 'cpnumber', 'faxNo', 'paymentTerm', 'vatCode', 'taxCode']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    const vat = await request(scope).input('code', sql.NVarChar(sql.MAX), value.vatCode).query('SELECT id FROM dbo.ConfigVatCodes WHERE code=@code AND isActive=1');
    if (!vat.recordset.length) {
      const error = new Error('Select an active configured Supplier VAT Code.');
      error.status = 400;
      throw error;
    }
    if (value.paymentTerm) {
      const term = await request(scope).input('term', sql.NVarChar(sql.MAX), value.paymentTerm).query('SELECT id FROM dbo.ConfigPaymentTerms WHERE description=@term AND isActive=1 AND forSupplier=1');
      if (!term.recordset.length) {
        const error = new Error('Select an active Supplier Payment Term.');
        error.status = 400;
        throw error;
      }
    }
    const write = request(scope);
    for (const key of ['name', 'shortName', 'businessStyle', 'address', 'remarks', 'tin', 'contactPerson', 'email', 'countryOfOrigin', 'country', 'cpnumber', 'faxNo', 'paymentTerm', 'vatCode', 'taxCode']) write.input(key, sql.NVarChar(sql.MAX), value[key]);
    for (const key of ['decimalInPrice', 'decimalInTotalPrice']) {
      if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 6) {
        const error = new Error('Supplier price precision must be from 0 to 6.');
        error.status = 400;
        throw error;
      }
      write.input(key, sql.Int, value[key]);
    }
    for (const key of ['vatInclusive', 'isActive']) {
      if (typeof value[key] !== 'boolean') {
        const error = new Error(`${key} must be a boolean.`);
        error.status = 400;
        throw error;
      }
      write.input(key, sql.Bit, value[key]);
    }
    const inserted = await write.query(`INSERT INTO dbo.Suppliers([name],[shortName],[businessStyle],[address],[remarks],[tin],[contactPerson],[email],[countryOfOrigin],[country],[cpnumber],[faxNo],[paymentTerm],[vatCode],[taxCode],[decimalInPrice],[decimalInTotalPrice],[vatInclusive],[isActive]) OUTPUT INSERTED.id VALUES(@name,@shortName,@businessStyle,@address,@remarks,@tin,@contactPerson,@email,@countryOfOrigin,@country,@cpnumber,@faxNo,@paymentTerm,@vatCode,@taxCode,@decimalInPrice,@decimalInTotalPrice,@vatInclusive,@isActive)`);
    const savedId = inserted.recordset[0].id;
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'suppliers')
      .input('action', sql.NVarChar(sql.MAX), 'create').input('recordId', sql.NVarChar(sql.MAX), String(savedId))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const saved = await request(scope).input('id', sql.Int, savedId).query(`SELECT id,code,[name],[shortName],[businessStyle],[address],[remarks],[tin],[contactPerson],[email],[countryOfOrigin],[country],[cpnumber],[faxNo],[paymentTerm],[vatCode],[taxCode],[decimalInPrice],[decimalInTotalPrice],[vatInclusive],[isActive] FROM dbo.Suppliers WHERE id=@id`);
    return saved.recordset[0];
  });
  res.status(201).json({ record });
});

router.put('/suppliers/:id', async (req, res) => {
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Send a JSON object.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const record = await transaction(async scope => {
    const currentData = await request(scope).input('id', sql.Int, id).query(`SELECT id,code,[name],[shortName],[businessStyle],[address],[remarks],[tin],[contactPerson],[email],[countryOfOrigin],[country],[cpnumber],[faxNo],[paymentTerm],[vatCode],[taxCode],[decimalInPrice],[decimalInTotalPrice],[vatInclusive],[isActive] FROM dbo.Suppliers WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`);
    const current = currentData.recordset[0];
    if (!current) {
      const error = new Error('Supplier could not be found.');
      error.status = 404;
      throw error;
    }
    const value = { decimalInPrice: 2, decimalInTotalPrice: 2, vatInclusive: false, isActive: true, ...current, ...input };
    for (const key of ['name', 'shortName', 'businessStyle', 'address', 'remarks', 'tin', 'contactPerson', 'email', 'countryOfOrigin', 'country', 'cpnumber', 'faxNo', 'paymentTerm', 'vatCode', 'taxCode']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    if (value.vatCode !== current.vatCode) {
      const vat = await request(scope).input('code', sql.NVarChar(sql.MAX), value.vatCode).query('SELECT id FROM dbo.ConfigVatCodes WHERE code=@code AND isActive=1');
      if (!vat.recordset.length) {
        const error = new Error('Select an active configured Supplier VAT Code.');
        error.status = 400;
        throw error;
      }
    }
    if (value.paymentTerm && value.paymentTerm !== current.paymentTerm) {
      const term = await request(scope).input('term', sql.NVarChar(sql.MAX), value.paymentTerm).query('SELECT id FROM dbo.ConfigPaymentTerms WHERE description=@term AND isActive=1 AND forSupplier=1');
      if (!term.recordset.length) {
        const error = new Error('Select an active Supplier Payment Term.');
        error.status = 400;
        throw error;
      }
    }
    const write = request(scope);
    for (const key of ['name', 'shortName', 'businessStyle', 'address', 'remarks', 'tin', 'contactPerson', 'email', 'countryOfOrigin', 'country', 'cpnumber', 'faxNo', 'paymentTerm', 'vatCode', 'taxCode']) write.input(key, sql.NVarChar(sql.MAX), value[key]);
    for (const key of ['decimalInPrice', 'decimalInTotalPrice']) {
      if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 6) {
        const error = new Error('Supplier price precision must be from 0 to 6.');
        error.status = 400;
        throw error;
      }
      write.input(key, sql.Int, value[key]);
    }
    for (const key of ['vatInclusive', 'isActive']) {
      if (typeof value[key] !== 'boolean') {
        const error = new Error(`${key} must be a boolean.`);
        error.status = 400;
        throw error;
      }
      write.input(key, sql.Bit, value[key]);
    }
    await write.input('id', sql.Int, id).query(`UPDATE dbo.Suppliers SET [name]=@name,[shortName]=@shortName,[businessStyle]=@businessStyle,[address]=@address,[remarks]=@remarks,[tin]=@tin,[contactPerson]=@contactPerson,[email]=@email,[countryOfOrigin]=@countryOfOrigin,[country]=@country,[cpnumber]=@cpnumber,[faxNo]=@faxNo,[paymentTerm]=@paymentTerm,[vatCode]=@vatCode,[taxCode]=@taxCode,[decimalInPrice]=@decimalInPrice,[decimalInTotalPrice]=@decimalInTotalPrice,[vatInclusive]=@vatInclusive,[isActive]=@isActive,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    const savedId = id;
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'suppliers')
      .input('action', sql.NVarChar(sql.MAX), 'update').input('recordId', sql.NVarChar(sql.MAX), String(savedId))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const saved = await request(scope).input('id', sql.Int, savedId).query(`SELECT id,code,[name],[shortName],[businessStyle],[address],[remarks],[tin],[contactPerson],[email],[countryOfOrigin],[country],[cpnumber],[faxNo],[paymentTerm],[vatCode],[taxCode],[decimalInPrice],[decimalInTotalPrice],[vatInclusive],[isActive] FROM dbo.Suppliers WHERE id=@id`);
    return saved.recordset[0];
  });
  res.json({ record });
});

router.delete('/suppliers/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  await transaction(async scope => {
    const result = await request(scope).input('id', sql.Int, id).query('UPDATE dbo.Suppliers SET isActive=0,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id');
    if (!result.recordset.length) {
      const error = new Error('The master record could not be found.');
      error.status = 404;
      throw error;
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'suppliers')
      .input('action', sql.NVarChar(sql.MAX), 'deactivate').input('recordId', sql.NVarChar(sql.MAX), String(id))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
  });
  res.json({ success: true });
});

router.get('/supplies', async (req, res) => {
  const scope = undefined;
  const recordsData = await request(scope).query(`SELECT s.id,s.code,s.[maker],s.[name],s.[description],s.[remarks],s.[color],s.[unit],s.[weightUnit],s.[category],CONVERT(varchar(60),s.[minimumStock]) AS [minimumStock],CONVERT(varchar(60),s.[thickness]) AS [thickness],CONVERT(varchar(60),s.[netWeight]) AS [netWeight],s.[productId],s.[inventorySetup],s.[isActive],CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.SupplyInventory i WHERE i.suppliesId=s.id),0)) AS stock
      FROM dbo.Supplies s   ORDER BY s.name,s.id;
      SELECT suppliesId,name FROM dbo.SupplyOffices  ORDER BY suppliesId,position;
      SELECT suppliesId,CONVERT(varchar(10),scheduleDate,23) AS scheduleDate,month FROM dbo.SupplyInventorySchedules  ORDER BY suppliesId,position;
      SELECT l.suppliesId,l.supplierId,s.name AS supplierName,CONVERT(varchar(60),l.moq) AS moq,CONVERT(varchar(60),l.price) AS price,l.currency,l.remarks
      FROM dbo.SupplySuppliers l JOIN dbo.Suppliers s ON s.id=l.supplierId  ORDER BY l.suppliesId,l.position;`);
  const recordsRows = new Map(recordsData.recordsets[0].map(row => [row.id, { ...row, offices: [], inventorySchedules: [], suppliers: [] }]));
  ['offices', 'inventorySchedules', 'suppliers'].forEach((key, index) => {
    for (const { suppliesId, ...row } of recordsData.recordsets[index + 1]) recordsRows.get(suppliesId)?.[key].push(row);
  });
  const records = [...recordsRows.values()];
  res.json({ records });
});

router.get('/supplies/:id', async (req, res) => {
  const scope = undefined;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const recordData = await request(scope).input('id', sql.Int, id).query(`SELECT s.id,s.code,s.[maker],s.[name],s.[description],s.[remarks],s.[color],s.[unit],s.[weightUnit],s.[category],CONVERT(varchar(60),s.[minimumStock]) AS [minimumStock],CONVERT(varchar(60),s.[thickness]) AS [thickness],CONVERT(varchar(60),s.[netWeight]) AS [netWeight],s.[productId],s.[inventorySetup],s.[isActive],CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.SupplyInventory i WHERE i.suppliesId=s.id),0)) AS stock
      FROM dbo.Supplies s  WHERE s.id=@id ORDER BY s.name,s.id;
      SELECT suppliesId,name FROM dbo.SupplyOffices WHERE suppliesId=@id ORDER BY suppliesId,position;
      SELECT suppliesId,CONVERT(varchar(10),scheduleDate,23) AS scheduleDate,month FROM dbo.SupplyInventorySchedules WHERE suppliesId=@id ORDER BY suppliesId,position;
      SELECT l.suppliesId,l.supplierId,s.name AS supplierName,CONVERT(varchar(60),l.moq) AS moq,CONVERT(varchar(60),l.price) AS price,l.currency,l.remarks
      FROM dbo.SupplySuppliers l JOIN dbo.Suppliers s ON s.id=l.supplierId WHERE l.suppliesId=@id ORDER BY l.suppliesId,l.position;`);
  const recordRows = new Map(recordData.recordsets[0].map(row => [row.id, { ...row, offices: [], inventorySchedules: [], suppliers: [] }]));
  ['offices', 'inventorySchedules', 'suppliers'].forEach((key, index) => {
    for (const { suppliesId, ...row } of recordData.recordsets[index + 1]) recordRows.get(suppliesId)?.[key].push(row);
  });
  const record = [...recordRows.values()][0];
  if (!record) {
    const error = new Error('Supplies could not be found.');
    error.status = 404;
    throw error;
  }
  res.json({ record });
});

router.post('/supplies', async (req, res) => {
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Send a JSON object.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const record = await transaction(async scope => {
    if (Object.hasOwn(input, 'stock') || Object.hasOwn(input, 'openingStock')) {
      const error = new Error('Supplies stock changes only when a receiving receipt is posted.');
      error.status = 400;
      throw error;
    }
    const value = { productId: null, inventorySetup: '', offices: [], inventorySchedules: [], suppliers: [], isActive: true, minimumStock: 0, thickness: 0, netWeight: 0, ...input };
    for (const key of ['maker', 'name', 'description', 'remarks', 'color', 'unit', 'weightUnit', 'category']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    for (const [key, places, positive, maximum] of ['minimumStock', 'thickness', 'netWeight'].map(key => [key, 6, false, 1000000000])) {
      const entered = value[key];
      if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
        const error = new Error(`${key} must be a valid decimal number.`);
        error.status = 400;
        throw error;
      }
      const source = String(entered).trim();
      if (!/^\d+(?:\.\d+)?$/.test(source)) {
        const error = new Error(`${key} must be zero or greater.`);
        error.status = 400;
        throw error;
      }
      const [whole, rawFraction = ''] = source.split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > places) {
        const error = new Error(`${key} exceeds its supported decimal precision.`);
        error.status = 400;
        throw error;
      }
      const factor = 10n ** BigInt(places);
      const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
      if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
        const error = new Error(`${key} is outside its supported range.`);
        error.status = 400;
        throw error;
      }
      value[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
    }
    value.productId = value.productId == null ? null : Number(value.productId);
    if (value.productId !== null && (!Number.isSafeInteger(value.productId) || value.productId <= 0 || value.productId > 2147483647)) {
      const error = new Error('Enter a valid product id.');
      error.status = 400;
      throw error;
    }
    const unit = await request(scope).input('unit', sql.NVarChar(sql.MAX), value.unit).query('SELECT id FROM dbo.ConfigUnits WHERE shortName=@unit AND isActive=1 AND forSupplies=1');
    if (!unit.recordset.length) {
      const error = new Error('Select an active Unit marked For Supplies.');
      error.status = 400;
      throw error;
    }
    if (value.weightUnit) {
      const reference = await request(scope).input('value', sql.NVarChar(sql.MAX), value.weightUnit).query('SELECT id FROM dbo.ConfigUnits WHERE [shortName]=@value AND isActive=1');
      if (!reference.recordset.length) {
        const error = new Error('Select an active Weight Unit.');
        error.status = 400;
        throw error;
      }
    }
    if (value.category) {
      const reference = await request(scope).input('value', sql.NVarChar(sql.MAX), value.category).query('SELECT id FROM dbo.ConfigSuppliesCategories WHERE [name]=@value AND isActive=1');
      if (!reference.recordset.length) {
        const error = new Error('Select an active Supplies Category.');
        error.status = 400;
        throw error;
      }
    }
    if (value.productId) {
      const product = await request(scope).input('id', sql.Int, value.productId).query('SELECT id FROM dbo.Products WHERE id=@id AND isActive=1');
      if (!product.recordset.length) {
        const error = new Error('Select an active Product Link.');
        error.status = 400;
        throw error;
      }
    }
    for (const key of ['offices', 'inventorySchedules', 'suppliers']) {
      if (!Array.isArray(value[key]) || value[key].some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
        const error = new Error('Send master detail rows as objects.');
        error.status = 400;
        throw error;
      }
    }
    const supplierIds = new Set();
    for (const row of value.suppliers) {
      row.supplierId = Number(row.supplierId);
    if (!Number.isSafeInteger(row.supplierId) || row.supplierId <= 0 || row.supplierId > 2147483647) {
      const error = new Error('Enter a valid id.');
      error.status = 400;
      throw error;
    }
      if (supplierIds.has(row.supplierId)) {
        const error = new Error('A supplier can appear only once per Supplies.');
        error.status = 400;
        throw error;
      }
      supplierIds.add(row.supplierId);
      const supplier = await request(scope).input('id', sql.Int, row.supplierId).query('SELECT id,isActive FROM dbo.Suppliers WHERE id=@id');
      if (!supplier.recordset.length || (!supplier.recordset[0].isActive)) {
        const error = new Error('Select an active Supplier.');
        error.status = 400;
        throw error;
      }
      if (row.currency) {
        const currency = await request(scope).input('code', sql.NVarChar(sql.MAX), row.currency).query('SELECT id FROM dbo.ConfigCurrencies WHERE shortName=@code AND isActive=1');
        if (!currency.recordset.length) {
          const error = new Error('Select an active Supplier Currency.');
          error.status = 400;
          throw error;
        }
      }
    }
    const write = request(scope);
    for (const key of ['maker', 'name', 'description', 'remarks', 'color', 'unit', 'weightUnit', 'category']) write.input(key, sql.NVarChar(sql.MAX), value[key]);
    for (const key of ['minimumStock', 'thickness', 'netWeight']) write.input(key, sql.VarChar(sql.MAX), value[key]);
    for (const key of ['inventorySetup']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    if (typeof value.isActive !== 'boolean') {
      const error = new Error('isActive must be a boolean.');
      error.status = 400;
      throw error;
    }
    write.input('productId', sql.Int, value.productId).input('inventorySetup', sql.NVarChar(sql.MAX), value.inventorySetup).input('isActive', sql.Bit, value.isActive);
    const inserted = await write.query(`INSERT INTO dbo.Supplies([maker],[name],[description],[remarks],[color],[unit],[weightUnit],[category],[minimumStock],[thickness],[netWeight],[productId],[inventorySetup],[isActive]) OUTPUT INSERTED.id VALUES(@maker,@name,@description,@remarks,@color,@unit,@weightUnit,@category,@minimumStock,@thickness,@netWeight,@productId,@inventorySetup,@isActive)`);
    const savedId = inserted.recordset[0].id;
    await request(scope).input('id', sql.Int, savedId).query('DELETE FROM dbo.SupplyOffices WHERE suppliesId=@id');
    for (const [position, row] of value.offices.entries()) {
      for (const key of ['name']) {
        const entered = row[key] ?? '';
        if (typeof entered !== 'string' || entered.includes('\0')) {
          const error = new Error(`${key} must be text without null characters.`);
          error.status = 400;
          throw error;
        }
        row[key] = entered.trim();
      }
      await request(scope).input('id', sql.Int, savedId).input('position', sql.Int, position).input('name', sql.NVarChar(sql.MAX), row.name).query('INSERT INTO dbo.SupplyOffices(suppliesId,position,name) VALUES(@id,@position,@name)');
    }
    await request(scope).input('id', sql.Int, savedId).query('DELETE FROM dbo.SupplyInventorySchedules WHERE suppliesId=@id');
    for (const [position, row] of value.inventorySchedules.entries()) {
      for (const key of ['month']) {
        const entered = row[key] ?? '';
        if (typeof entered !== 'string' || entered.includes('\0')) {
          const error = new Error(`${key} must be text without null characters.`);
          error.status = 400;
          throw error;
        }
        row[key] = entered.trim();
      }
      await request(scope).input('id', sql.Int, savedId).input('position', sql.Int, position).input('scheduleDate', sql.VarChar(sql.MAX), row.scheduleDate || null).input('month', sql.NVarChar(sql.MAX), row.month).query('INSERT INTO dbo.SupplyInventorySchedules(suppliesId,position,scheduleDate,month) VALUES(@id,@position,@scheduleDate,@month)');
    }
    await request(scope).input('id', sql.Int, savedId).query('DELETE FROM dbo.SupplySuppliers WHERE suppliesId=@id');
    for (const [position, row] of value.suppliers.entries()) {
      for (const key of ['currency', 'remarks']) {
        const entered = row[key] ?? '';
        if (typeof entered !== 'string' || entered.includes('\0')) {
          const error = new Error(`${key} must be text without null characters.`);
          error.status = 400;
          throw error;
        }
        row[key] = entered.trim();
      }
      row.moq = row.moq ?? 0;
      row.price = row.price ?? 0;
      for (const [key, places, positive, maximum] of [['moq', 6, false, 1000000000], ['price', 6, false, 1000000000]]) {
        const entered = row[key];
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > places) {
          const error = new Error(`${key} exceeds its supported decimal precision.`);
          error.status = 400;
          throw error;
        }
        const factor = 10n ** BigInt(places);
        const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
        if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
          const error = new Error(`${key} is outside its supported range.`);
          error.status = 400;
          throw error;
        }
        row[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
      }
      await request(scope).input('id', sql.Int, savedId).input('position', sql.Int, position).input('supplierId', sql.Int, row.supplierId)
        .input('moq', sql.VarChar(sql.MAX), row.moq).input('price', sql.VarChar(sql.MAX), row.price)
        .input('currency', sql.NVarChar(sql.MAX), row.currency).input('remarks', sql.NVarChar(sql.MAX), row.remarks)
        .query('INSERT INTO dbo.SupplySuppliers(suppliesId,position,supplierId,moq,price,currency,remarks) VALUES(@id,@position,@supplierId,@moq,@price,@currency,@remarks)');
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'supplies')
      .input('action', sql.NVarChar(sql.MAX), 'create').input('recordId', sql.NVarChar(sql.MAX), String(savedId))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedData = await request(scope).input('id', sql.Int, savedId).query(`SELECT s.id,s.code,s.[maker],s.[name],s.[description],s.[remarks],s.[color],s.[unit],s.[weightUnit],s.[category],CONVERT(varchar(60),s.[minimumStock]) AS [minimumStock],CONVERT(varchar(60),s.[thickness]) AS [thickness],CONVERT(varchar(60),s.[netWeight]) AS [netWeight],s.[productId],s.[inventorySetup],s.[isActive],CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.SupplyInventory i WHERE i.suppliesId=s.id),0)) AS stock
        FROM dbo.Supplies s  WHERE s.id=@id ORDER BY s.name,s.id;
        SELECT suppliesId,name FROM dbo.SupplyOffices WHERE suppliesId=@id ORDER BY suppliesId,position;
        SELECT suppliesId,CONVERT(varchar(10),scheduleDate,23) AS scheduleDate,month FROM dbo.SupplyInventorySchedules WHERE suppliesId=@id ORDER BY suppliesId,position;
        SELECT l.suppliesId,l.supplierId,s.name AS supplierName,CONVERT(varchar(60),l.moq) AS moq,CONVERT(varchar(60),l.price) AS price,l.currency,l.remarks
        FROM dbo.SupplySuppliers l JOIN dbo.Suppliers s ON s.id=l.supplierId WHERE l.suppliesId=@id ORDER BY l.suppliesId,l.position;`);
    const savedRows = new Map(savedData.recordsets[0].map(row => [row.id, { ...row, offices: [], inventorySchedules: [], suppliers: [] }]));
    ['offices', 'inventorySchedules', 'suppliers'].forEach((key, index) => {
      for (const { suppliesId, ...row } of savedData.recordsets[index + 1]) savedRows.get(suppliesId)?.[key].push(row);
    });
    const saved = [...savedRows.values()][0];
    if (!saved) {
      const error = new Error('Supplies could not be found.');
      error.status = 404;
      throw error;
    }
    return saved;
  });
  res.status(201).json({ record });
});

router.put('/supplies/:id', async (req, res) => {
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Send a JSON object.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const record = await transaction(async scope => {
    const currentData = await request(scope).input('id', sql.Int, id).query(`SELECT s.id,s.code,s.[maker],s.[name],s.[description],s.[remarks],s.[color],s.[unit],s.[weightUnit],s.[category],CONVERT(varchar(60),s.[minimumStock]) AS [minimumStock],CONVERT(varchar(60),s.[thickness]) AS [thickness],CONVERT(varchar(60),s.[netWeight]) AS [netWeight],s.[productId],s.[inventorySetup],s.[isActive],CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.SupplyInventory i WHERE i.suppliesId=s.id),0)) AS stock
        FROM dbo.Supplies s WITH (UPDLOCK,HOLDLOCK) WHERE s.id=@id ORDER BY s.name,s.id;
        SELECT suppliesId,name FROM dbo.SupplyOffices WHERE suppliesId=@id ORDER BY suppliesId,position;
        SELECT suppliesId,CONVERT(varchar(10),scheduleDate,23) AS scheduleDate,month FROM dbo.SupplyInventorySchedules WHERE suppliesId=@id ORDER BY suppliesId,position;
        SELECT l.suppliesId,l.supplierId,s.name AS supplierName,CONVERT(varchar(60),l.moq) AS moq,CONVERT(varchar(60),l.price) AS price,l.currency,l.remarks
        FROM dbo.SupplySuppliers l JOIN dbo.Suppliers s ON s.id=l.supplierId WHERE l.suppliesId=@id ORDER BY l.suppliesId,l.position;`);
    const currentRows = new Map(currentData.recordsets[0].map(row => [row.id, { ...row, offices: [], inventorySchedules: [], suppliers: [] }]));
    ['offices', 'inventorySchedules', 'suppliers'].forEach((key, index) => {
      for (const { suppliesId, ...row } of currentData.recordsets[index + 1]) currentRows.get(suppliesId)?.[key].push(row);
    });
    const current = [...currentRows.values()][0];
    if (!current) {
      const error = new Error('Supplies could not be found.');
      error.status = 404;
      throw error;
    }
    if (Object.hasOwn(input, 'stock') || Object.hasOwn(input, 'openingStock')) {
      const error = new Error('Supplies stock changes only when a receiving receipt is posted.');
      error.status = 400;
      throw error;
    }
    const value = { productId: null, inventorySetup: '', offices: [], inventorySchedules: [], suppliers: [], isActive: true, minimumStock: 0, thickness: 0, netWeight: 0, ...current, ...input };
    for (const key of ['maker', 'name', 'description', 'remarks', 'color', 'unit', 'weightUnit', 'category']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    for (const [key, places, positive, maximum] of ['minimumStock', 'thickness', 'netWeight'].map(key => [key, 6, false, 1000000000])) {
      const entered = value[key];
      if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
        const error = new Error(`${key} must be a valid decimal number.`);
        error.status = 400;
        throw error;
      }
      const source = String(entered).trim();
      if (!/^\d+(?:\.\d+)?$/.test(source)) {
        const error = new Error(`${key} must be zero or greater.`);
        error.status = 400;
        throw error;
      }
      const [whole, rawFraction = ''] = source.split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > places) {
        const error = new Error(`${key} exceeds its supported decimal precision.`);
        error.status = 400;
        throw error;
      }
      const factor = 10n ** BigInt(places);
      const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
      if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
        const error = new Error(`${key} is outside its supported range.`);
        error.status = 400;
        throw error;
      }
      value[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
    }
    value.productId = value.productId == null ? null : Number(value.productId);
    if (value.productId !== null && (!Number.isSafeInteger(value.productId) || value.productId <= 0 || value.productId > 2147483647)) {
      const error = new Error('Enter a valid product id.');
      error.status = 400;
      throw error;
    }
    if (value.unit !== current.unit) {
      const unit = await request(scope).input('unit', sql.NVarChar(sql.MAX), value.unit).query('SELECT id FROM dbo.ConfigUnits WHERE shortName=@unit AND isActive=1 AND forSupplies=1');
      if (!unit.recordset.length) {
        const error = new Error('Select an active Unit marked For Supplies.');
        error.status = 400;
        throw error;
      }
      const history = await request(scope).input('id', sql.Int, id).query('SELECT TOP(1) suppliesId FROM (SELECT suppliesId FROM dbo.PurchaseRequestItems WHERE suppliesId=@id UNION ALL SELECT suppliesId FROM dbo.ProductSupplies WHERE suppliesId=@id UNION ALL SELECT suppliesId FROM dbo.SupplyInventory WHERE suppliesId=@id) history');
      if (history.recordset.length) {
        const error = new Error('Supplies UOM cannot change after purchasing history exists.');
        error.status = 409;
        throw error;
      }
    }
    if (value.weightUnit && value.weightUnit !== current.weightUnit) {
      const reference = await request(scope).input('value', sql.NVarChar(sql.MAX), value.weightUnit).query('SELECT id FROM dbo.ConfigUnits WHERE [shortName]=@value AND isActive=1');
      if (!reference.recordset.length) {
        const error = new Error('Select an active Weight Unit.');
        error.status = 400;
        throw error;
      }
    }
    if (value.category && value.category !== current.category) {
      const reference = await request(scope).input('value', sql.NVarChar(sql.MAX), value.category).query('SELECT id FROM dbo.ConfigSuppliesCategories WHERE [name]=@value AND isActive=1');
      if (!reference.recordset.length) {
        const error = new Error('Select an active Supplies Category.');
        error.status = 400;
        throw error;
      }
    }
    if (value.productId && value.productId !== current.productId) {
      const product = await request(scope).input('id', sql.Int, value.productId).query('SELECT id FROM dbo.Products WHERE id=@id AND isActive=1');
      if (!product.recordset.length) {
        const error = new Error('Select an active Product Link.');
        error.status = 400;
        throw error;
      }
    }
    for (const key of ['offices', 'inventorySchedules', 'suppliers']) {
      if (!Array.isArray(value[key]) || value[key].some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
        const error = new Error('Send master detail rows as objects.');
        error.status = 400;
        throw error;
      }
    }
    const supplierIds = new Set();
    for (const row of value.suppliers) {
      row.supplierId = Number(row.supplierId);
    if (!Number.isSafeInteger(row.supplierId) || row.supplierId <= 0 || row.supplierId > 2147483647) {
      const error = new Error('Enter a valid id.');
      error.status = 400;
      throw error;
    }
      if (supplierIds.has(row.supplierId)) {
        const error = new Error('A supplier can appear only once per Supplies.');
        error.status = 400;
        throw error;
      }
      supplierIds.add(row.supplierId);
      const supplier = await request(scope).input('id', sql.Int, row.supplierId).query('SELECT id,isActive FROM dbo.Suppliers WHERE id=@id');
      if (!supplier.recordset.length || (!supplier.recordset[0].isActive && !current.suppliers.some(item => item.supplierId === row.supplierId))) {
        const error = new Error('Select an active Supplier.');
        error.status = 400;
        throw error;
      }
      if (row.currency) {
        const currency = await request(scope).input('code', sql.NVarChar(sql.MAX), row.currency).query('SELECT id FROM dbo.ConfigCurrencies WHERE shortName=@code AND isActive=1');
        if (!currency.recordset.length) {
          const error = new Error('Select an active Supplier Currency.');
          error.status = 400;
          throw error;
        }
      }
    }
    const write = request(scope);
    for (const key of ['maker', 'name', 'description', 'remarks', 'color', 'unit', 'weightUnit', 'category']) write.input(key, sql.NVarChar(sql.MAX), value[key]);
    for (const key of ['minimumStock', 'thickness', 'netWeight']) write.input(key, sql.VarChar(sql.MAX), value[key]);
    for (const key of ['inventorySetup']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    if (typeof value.isActive !== 'boolean') {
      const error = new Error('isActive must be a boolean.');
      error.status = 400;
      throw error;
    }
    write.input('productId', sql.Int, value.productId).input('inventorySetup', sql.NVarChar(sql.MAX), value.inventorySetup).input('isActive', sql.Bit, value.isActive);
    await write.input('id', sql.Int, id).query(`UPDATE dbo.Supplies SET [maker]=@maker,[name]=@name,[description]=@description,[remarks]=@remarks,[color]=@color,[unit]=@unit,[weightUnit]=@weightUnit,[category]=@category,[minimumStock]=@minimumStock,[thickness]=@thickness,[netWeight]=@netWeight,[productId]=@productId,[inventorySetup]=@inventorySetup,[isActive]=@isActive,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    const savedId = id;
    if (Object.hasOwn(input, 'offices')) {
      await request(scope).input('id', sql.Int, savedId).query('DELETE FROM dbo.SupplyOffices WHERE suppliesId=@id');
      for (const [position, row] of value.offices.entries()) {
        for (const key of ['name']) {
          const entered = row[key] ?? '';
          if (typeof entered !== 'string' || entered.includes('\0')) {
            const error = new Error(`${key} must be text without null characters.`);
            error.status = 400;
            throw error;
          }
          row[key] = entered.trim();
        }
        await request(scope).input('id', sql.Int, savedId).input('position', sql.Int, position).input('name', sql.NVarChar(sql.MAX), row.name).query('INSERT INTO dbo.SupplyOffices(suppliesId,position,name) VALUES(@id,@position,@name)');
      }
    }
    if (Object.hasOwn(input, 'inventorySchedules')) {
      await request(scope).input('id', sql.Int, savedId).query('DELETE FROM dbo.SupplyInventorySchedules WHERE suppliesId=@id');
      for (const [position, row] of value.inventorySchedules.entries()) {
        for (const key of ['month']) {
          const entered = row[key] ?? '';
          if (typeof entered !== 'string' || entered.includes('\0')) {
            const error = new Error(`${key} must be text without null characters.`);
            error.status = 400;
            throw error;
          }
          row[key] = entered.trim();
        }
        await request(scope).input('id', sql.Int, savedId).input('position', sql.Int, position).input('scheduleDate', sql.VarChar(sql.MAX), row.scheduleDate || null).input('month', sql.NVarChar(sql.MAX), row.month).query('INSERT INTO dbo.SupplyInventorySchedules(suppliesId,position,scheduleDate,month) VALUES(@id,@position,@scheduleDate,@month)');
      }
    }
    if (Object.hasOwn(input, 'suppliers')) {
      await request(scope).input('id', sql.Int, savedId).query('DELETE FROM dbo.SupplySuppliers WHERE suppliesId=@id');
      for (const [position, row] of value.suppliers.entries()) {
        for (const key of ['currency', 'remarks']) {
          const entered = row[key] ?? '';
          if (typeof entered !== 'string' || entered.includes('\0')) {
            const error = new Error(`${key} must be text without null characters.`);
            error.status = 400;
            throw error;
          }
          row[key] = entered.trim();
        }
        row.moq = row.moq ?? 0;
        row.price = row.price ?? 0;
        for (const [key, places, positive, maximum] of [['moq', 6, false, 1000000000], ['price', 6, false, 1000000000]]) {
          const entered = row[key];
          if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
            const error = new Error(`${key} must be a valid decimal number.`);
            error.status = 400;
            throw error;
          }
          const source = String(entered).trim();
          if (!/^\d+(?:\.\d+)?$/.test(source)) {
            const error = new Error(`${key} must be zero or greater.`);
            error.status = 400;
            throw error;
          }
          const [whole, rawFraction = ''] = source.split('.');
          const fraction = rawFraction.replace(/0+$/, '');
          if (fraction.length > places) {
            const error = new Error(`${key} exceeds its supported decimal precision.`);
            error.status = 400;
            throw error;
          }
          const factor = 10n ** BigInt(places);
          const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
          if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
            const error = new Error(`${key} is outside its supported range.`);
            error.status = 400;
            throw error;
          }
          row[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
        }
        await request(scope).input('id', sql.Int, savedId).input('position', sql.Int, position).input('supplierId', sql.Int, row.supplierId)
          .input('moq', sql.VarChar(sql.MAX), row.moq).input('price', sql.VarChar(sql.MAX), row.price)
          .input('currency', sql.NVarChar(sql.MAX), row.currency).input('remarks', sql.NVarChar(sql.MAX), row.remarks)
          .query('INSERT INTO dbo.SupplySuppliers(suppliesId,position,supplierId,moq,price,currency,remarks) VALUES(@id,@position,@supplierId,@moq,@price,@currency,@remarks)');
      }
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'supplies')
      .input('action', sql.NVarChar(sql.MAX), 'update').input('recordId', sql.NVarChar(sql.MAX), String(savedId))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedData = await request(scope).input('id', sql.Int, savedId).query(`SELECT s.id,s.code,s.[maker],s.[name],s.[description],s.[remarks],s.[color],s.[unit],s.[weightUnit],s.[category],CONVERT(varchar(60),s.[minimumStock]) AS [minimumStock],CONVERT(varchar(60),s.[thickness]) AS [thickness],CONVERT(varchar(60),s.[netWeight]) AS [netWeight],s.[productId],s.[inventorySetup],s.[isActive],CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.SupplyInventory i WHERE i.suppliesId=s.id),0)) AS stock
        FROM dbo.Supplies s  WHERE s.id=@id ORDER BY s.name,s.id;
        SELECT suppliesId,name FROM dbo.SupplyOffices WHERE suppliesId=@id ORDER BY suppliesId,position;
        SELECT suppliesId,CONVERT(varchar(10),scheduleDate,23) AS scheduleDate,month FROM dbo.SupplyInventorySchedules WHERE suppliesId=@id ORDER BY suppliesId,position;
        SELECT l.suppliesId,l.supplierId,s.name AS supplierName,CONVERT(varchar(60),l.moq) AS moq,CONVERT(varchar(60),l.price) AS price,l.currency,l.remarks
        FROM dbo.SupplySuppliers l JOIN dbo.Suppliers s ON s.id=l.supplierId WHERE l.suppliesId=@id ORDER BY l.suppliesId,l.position;`);
    const savedRows = new Map(savedData.recordsets[0].map(row => [row.id, { ...row, offices: [], inventorySchedules: [], suppliers: [] }]));
    ['offices', 'inventorySchedules', 'suppliers'].forEach((key, index) => {
      for (const { suppliesId, ...row } of savedData.recordsets[index + 1]) savedRows.get(suppliesId)?.[key].push(row);
    });
    const saved = [...savedRows.values()][0];
    if (!saved) {
      const error = new Error('Supplies could not be found.');
      error.status = 404;
      throw error;
    }
    return saved;
  });
  res.json({ record });
});

router.delete('/supplies/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  await transaction(async scope => {
    const result = await request(scope).input('id', sql.Int, id).query('UPDATE dbo.Supplies SET isActive=0,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id');
    if (!result.recordset.length) {
      const error = new Error('The master record could not be found.');
      error.status = 404;
      throw error;
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'supplies')
      .input('action', sql.NVarChar(sql.MAX), 'deactivate').input('recordId', sql.NVarChar(sql.MAX), String(id))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
  });
  res.json({ success: true });
});

router.get('/options', async (req, res) => {
  const scope = undefined;
  const supplierData = await request().query(`SELECT id,code,[name],[shortName],[businessStyle],[address],[remarks],[tin],[contactPerson],[email],[countryOfOrigin],[country],[cpnumber],[faxNo],[paymentTerm],[vatCode],[taxCode],[decimalInPrice],[decimalInTotalPrice],[vatInclusive],[isActive] FROM dbo.Suppliers ORDER BY name,id`);
  const suppliesData = await request(scope).query(`SELECT s.id,s.code,s.[maker],s.[name],s.[description],s.[remarks],s.[color],s.[unit],s.[weightUnit],s.[category],CONVERT(varchar(60),s.[minimumStock]) AS [minimumStock],CONVERT(varchar(60),s.[thickness]) AS [thickness],CONVERT(varchar(60),s.[netWeight]) AS [netWeight],s.[productId],s.[inventorySetup],s.[isActive],CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.SupplyInventory i WHERE i.suppliesId=s.id),0)) AS stock
      FROM dbo.Supplies s   ORDER BY s.name,s.id;
      SELECT suppliesId,name FROM dbo.SupplyOffices  ORDER BY suppliesId,position;
      SELECT suppliesId,CONVERT(varchar(10),scheduleDate,23) AS scheduleDate,month FROM dbo.SupplyInventorySchedules  ORDER BY suppliesId,position;
      SELECT l.suppliesId,l.supplierId,s.name AS supplierName,CONVERT(varchar(60),l.moq) AS moq,CONVERT(varchar(60),l.price) AS price,l.currency,l.remarks
      FROM dbo.SupplySuppliers l JOIN dbo.Suppliers s ON s.id=l.supplierId  ORDER BY l.suppliesId,l.position;`);
  const suppliesRows = new Map(suppliesData.recordsets[0].map(row => [row.id, { ...row, offices: [], inventorySchedules: [], suppliers: [] }]));
  ['offices', 'inventorySchedules', 'suppliers'].forEach((key, index) => {
    for (const { suppliesId, ...row } of suppliesData.recordsets[index + 1]) suppliesRows.get(suppliesId)?.[key].push(row);
  });
  const supplies = [...suppliesRows.values()];
  const reference = await request().query(`SELECT id,description,shortName,forProduct,forSupplies,[decimal],shortName AS name,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigUnits ORDER BY id DESC;
  SELECT id,name,shortName,checkName,symbol,isDefault,shortName AS code,name AS description,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigCurrencies ORDER BY id DESC;
  SELECT id,description,days,month,dateOfMonth,dayOfMonth,dueDateEom,forCustomer,forSupplier,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigPaymentTerms ORDER BY id DESC;
  SELECT id,code,description,type,class,rate,prodVatInd,accountCode,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigVatCodes ORDER BY id DESC;
  SELECT id,code,description,rate,accountCode,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigAtc ORDER BY id DESC;
  SELECT id,name,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigCountries ORDER BY id DESC;
  SELECT id,name,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigSuppliesCategories ORDER BY id DESC;
  SELECT id,code,description,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigWarehouses ORDER BY id DESC;
  SELECT id,code,description,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigLocations ORDER BY id DESC;
  SELECT id,name,username,role FROM dbo.PurchasingUserLogin WHERE isActive=1 ORDER BY name,username;
  SELECT id,sku,name,description FROM dbo.Products WHERE isActive=1 ORDER BY sku;`);
  const [units, currencies, terms, vatCodes, taxCodes, countries, categories, warehouses, locations, users, products] = reference.recordsets;

  res.json({
    suppliers: supplierData.recordset.filter(row => row.isActive), supplies: supplies.filter(row => row.isActive), products, users,
    units: units.filter(row => row.isActive).filter(row => row.forSupplies).map(row => ({ ...row, name: row.shortName })),
    currencies: currencies.filter(row => row.isActive).map(row => ({ ...row, code: row.shortName, description: row.name })),
    paymentTerms: terms.filter(row => row.isActive).filter(row => row.forSupplier), vatCodes: vatCodes.filter(row => row.isActive), taxCodes: taxCodes.filter(row => row.isActive),
    countries: countries.filter(row => row.isActive), suppliesCategories: categories.filter(row => row.isActive), warehouses: warehouses.filter(row => row.isActive), locations: locations.filter(row => row.isActive),
    shipments: ['By Air', 'By Land', 'By Boat', 'N/A'], offices: [process.env.COMPANY_NAME || 'TLP COMPANY'],
  });
});

router.get('/purchasing-options', async (req, res) => {
  const scope = undefined;
  const supplierData = await request().query(`SELECT id,code,[name],[shortName],[businessStyle],[address],[remarks],[tin],[contactPerson],[email],[countryOfOrigin],[country],[cpnumber],[faxNo],[paymentTerm],[vatCode],[taxCode],[decimalInPrice],[decimalInTotalPrice],[vatInclusive],[isActive] FROM dbo.Suppliers ORDER BY name,id`);
  const suppliesData = await request(scope).query(`SELECT s.id,s.code,s.[maker],s.[name],s.[description],s.[remarks],s.[color],s.[unit],s.[weightUnit],s.[category],CONVERT(varchar(60),s.[minimumStock]) AS [minimumStock],CONVERT(varchar(60),s.[thickness]) AS [thickness],CONVERT(varchar(60),s.[netWeight]) AS [netWeight],s.[productId],s.[inventorySetup],s.[isActive],CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.SupplyInventory i WHERE i.suppliesId=s.id),0)) AS stock
      FROM dbo.Supplies s   ORDER BY s.name,s.id;
      SELECT suppliesId,name FROM dbo.SupplyOffices  ORDER BY suppliesId,position;
      SELECT suppliesId,CONVERT(varchar(10),scheduleDate,23) AS scheduleDate,month FROM dbo.SupplyInventorySchedules  ORDER BY suppliesId,position;
      SELECT l.suppliesId,l.supplierId,s.name AS supplierName,CONVERT(varchar(60),l.moq) AS moq,CONVERT(varchar(60),l.price) AS price,l.currency,l.remarks
      FROM dbo.SupplySuppliers l JOIN dbo.Suppliers s ON s.id=l.supplierId  ORDER BY l.suppliesId,l.position;`);
  const suppliesRows = new Map(suppliesData.recordsets[0].map(row => [row.id, { ...row, offices: [], inventorySchedules: [], suppliers: [] }]));
  ['offices', 'inventorySchedules', 'suppliers'].forEach((key, index) => {
    for (const { suppliesId, ...row } of suppliesData.recordsets[index + 1]) suppliesRows.get(suppliesId)?.[key].push(row);
  });
  const supplies = [...suppliesRows.values()];
  const reference = await request().query(`SELECT id,description,shortName,forProduct,forSupplies,[decimal],shortName AS name,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigUnits ORDER BY id DESC;
  SELECT id,name,shortName,checkName,symbol,isDefault,shortName AS code,name AS description,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigCurrencies ORDER BY id DESC;
  SELECT id,description,days,month,dateOfMonth,dayOfMonth,dueDateEom,forCustomer,forSupplier,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigPaymentTerms ORDER BY id DESC;
  SELECT id,code,description,type,class,rate,prodVatInd,accountCode,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigVatCodes ORDER BY id DESC;
  SELECT id,code,description,rate,accountCode,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigAtc ORDER BY id DESC;
  SELECT id,name,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigCountries ORDER BY id DESC;
  SELECT id,name,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigSuppliesCategories ORDER BY id DESC;
  SELECT id,code,description,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigWarehouses ORDER BY id DESC;
  SELECT id,code,description,isActive,deletedDate,createdAt,updatedAt FROM dbo.ConfigLocations ORDER BY id DESC;
  SELECT id,name,username,role FROM dbo.PurchasingUserLogin WHERE isActive=1 ORDER BY name,username;
  SELECT id,sku,name,description FROM dbo.Products WHERE isActive=1 ORDER BY sku;`);
  const [units, currencies, terms, vatCodes, taxCodes, countries, categories, warehouses, locations, users, products] = reference.recordsets;

  res.json({
    suppliers: supplierData.recordset.filter(row => row.isActive), supplies: supplies.filter(row => row.isActive), products, users,
    units: units.filter(row => row.isActive).filter(row => row.forSupplies).map(row => ({ ...row, name: row.shortName })),
    currencies: currencies.filter(row => row.isActive).map(row => ({ ...row, code: row.shortName, description: row.name })),
    paymentTerms: terms.filter(row => row.isActive).filter(row => row.forSupplier), vatCodes: vatCodes.filter(row => row.isActive), taxCodes: taxCodes.filter(row => row.isActive),
    countries: countries.filter(row => row.isActive), suppliesCategories: categories.filter(row => row.isActive), warehouses: warehouses.filter(row => row.isActive), locations: locations.filter(row => row.isActive),
    shipments: ['By Air', 'By Land', 'By Boat', 'N/A'], offices: [process.env.COMPANY_NAME || 'TLP COMPANY'],
  });
});

router.get('/purchase-requests', async (req, res) => {
  const scope = undefined;
  const recordsData = await request(scope).query(`SELECT r.id,r.number,r.branch,CONVERT(varchar(10),r.prDate,23) AS prDate,CONVERT(varchar(10),r.neededDate,23) AS neededDate,
      r.requestedBy,r.requestedDept,r.checkedBy,r.approvedBy,r.approvedBy2,r.remarks,r.preparedById,r.preparedBy,r.status,r.postedAt
      FROM dbo.PurchaseRequests r   ORDER BY r.id DESC;
      SELECT d.id,d.requestId,d.position,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,CONVERT(varchar(60),d.quantity) AS quantity,d.unit,
      CONVERT(varchar(10),d.neededDate,23) AS neededDate,d.remarks,CONVERT(varchar(60),COALESCE(a.orderedQuantity,0)) AS orderedQuantity,
      CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.orderedQuantity,0) AS decimal(28,6))) AS balanceQuantity,a.purchaseOrderNumbers
      FROM dbo.PurchaseRequestItems d OUTER APPLY (
        SELECT SUM(i.quantity) AS orderedQuantity,STRING_AGG(CONVERT(nvarchar(max),o.number),N', ') AS purchaseOrderNumbers
        FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseOrders o ON o.id=i.orderId
        WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')
      ) a  ORDER BY d.requestId,d.position;`);
  const recordsRows = new Map(recordsData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
  for (const { requestId, ...item } of recordsData.recordsets[1]) recordsRows.get(requestId)?.items.push(item);
  const records = [...recordsRows.values()];
  res.json({ records });
});

router.get('/purchase-requests/:id', async (req, res) => {
  const scope = undefined;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const recordData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.branch,CONVERT(varchar(10),r.prDate,23) AS prDate,CONVERT(varchar(10),r.neededDate,23) AS neededDate,
      r.requestedBy,r.requestedDept,r.checkedBy,r.approvedBy,r.approvedBy2,r.remarks,r.preparedById,r.preparedBy,r.status,r.postedAt
      FROM dbo.PurchaseRequests r  WHERE r.id=@id ORDER BY r.id DESC;
      SELECT d.id,d.requestId,d.position,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,CONVERT(varchar(60),d.quantity) AS quantity,d.unit,
      CONVERT(varchar(10),d.neededDate,23) AS neededDate,d.remarks,CONVERT(varchar(60),COALESCE(a.orderedQuantity,0)) AS orderedQuantity,
      CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.orderedQuantity,0) AS decimal(28,6))) AS balanceQuantity,a.purchaseOrderNumbers
      FROM dbo.PurchaseRequestItems d OUTER APPLY (
        SELECT SUM(i.quantity) AS orderedQuantity,STRING_AGG(CONVERT(nvarchar(max),o.number),N', ') AS purchaseOrderNumbers
        FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseOrders o ON o.id=i.orderId
        WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')
      ) a WHERE d.requestId=@id ORDER BY d.requestId,d.position;`);
  const recordRows = new Map(recordData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
  for (const { requestId, ...item } of recordData.recordsets[1]) recordRows.get(requestId)?.items.push(item);
  const record = [...recordRows.values()][0];
  if (!record) {
    const error = new Error('Purchase Request could not be found.');
    error.status = 404;
    throw error;
  }
  res.json({ record });
});

router.get('/purchase-orders', async (req, res) => {
  const scope = undefined;
  const recordsData = await request(scope).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
      CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
      o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
      o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
      FROM dbo.PurchaseOrders o   ORDER BY o.id DESC;
      SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
      CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
      CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
      CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
      FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
      OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
       ORDER BY d.orderId,d.position;`);
  const recordsRows = new Map(recordsData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
  for (const { orderId, ...item } of recordsData.recordsets[1]) recordsRows.get(orderId)?.items.push(item);
  const records = [...recordsRows.values()];
  res.json({ records });
});

router.get('/purchase-orders/:id', async (req, res) => {
  const scope = undefined;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const recordData = await request(scope).input('id', sql.Int, id).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
      CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
      o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
      o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
      FROM dbo.PurchaseOrders o  WHERE o.id=@id ORDER BY o.id DESC;
      SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
      CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
      CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
      CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
      FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
      OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
      WHERE d.orderId=@id ORDER BY d.orderId,d.position;`);
  const recordRows = new Map(recordData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
  for (const { orderId, ...item } of recordData.recordsets[1]) recordRows.get(orderId)?.items.push(item);
  const record = [...recordRows.values()][0];
  if (!record) {
    const error = new Error('Purchase Order could not be found.');
    error.status = 404;
    throw error;
  }
  res.json({ record });
});

router.get('/receivings', async (req, res) => {
  const scope = undefined;
  const recordsData = await request(scope).query(`SELECT r.id,r.number,r.purchaseOrderId,o.number AS purchaseOrderNumber,o.branch,o.supplierId,o.supplierName,o.supplierAddress,
      CONVERT(varchar(10),r.srrDate,23) AS srrDate,r.drNumber,r.pezaReference,r.invoiceNumber,CONVERT(varchar(10),r.invoiceDate,23) AS invoiceDate,
      o.currency,CONVERT(varchar(60),r.rate) AS rate,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
      r.remarks,CONVERT(varchar(60),r.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),r.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),r.[netAmount]) AS [netAmount],CONVERT(varchar(60),r.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),r.[amount]) AS [amount],r.receivedById,r.receivedBy,r.status,r.postedAt
      FROM dbo.SuppliesReceipts r  JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId  ORDER BY r.id DESC;
      SELECT d.id,d.receiptId,d.position,d.orderItemId,o.suppliesId,o.suppliesCode,o.suppliesName,o.description,o.unit,
      CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),o.unitPrice) AS unitPrice,o.currency,
      CONVERT(varchar(60),o.discountRate) AS discountRate,CONVERT(varchar(60),o.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
      CONVERT(varchar(60),o.quantity) AS orderQuantity,CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,
      CONVERT(varchar(60),o.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS orderBalanceQuantity,
      CONVERT(varchar(60),COALESCE(l.allocatedQuantity,0)) AS allocatedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(l.allocatedQuantity,0) AS decimal(28,6))) AS allocationBalanceQuantity
      FROM dbo.SuppliesReceiptItems d JOIN dbo.PurchaseOrderItems o ON o.id=d.orderItemId
      OUTER APPLY(SELECT SUM(x.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems x JOIN dbo.SuppliesReceipts h ON h.id=x.receiptId WHERE x.orderItemId=o.id AND h.status='posted') a
      OUTER APPLY(SELECT SUM(x.quantity) AS allocatedQuantity FROM dbo.SuppliesReceiptAllocations x WHERE x.receiptItemId=d.id) l
       ORDER BY d.receiptId,d.position;
      SELECT a.id,a.receiptItemId,a.position,CONVERT(varchar(60),a.quantity) AS quantity,CONVERT(varchar(10),a.expiryDate,23) AS expiryDate,
      CONVERT(varchar(10),a.mfgDate,23) AS mfgDate,a.imLot,a.qcStatus,a.warehouseId,a.locationId,w.code AS warehouseCode,l.code AS locationCode
      FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems d ON d.id=a.receiptItemId
      LEFT JOIN dbo.ConfigWarehouses w ON w.id=a.warehouseId LEFT JOIN dbo.ConfigLocations l ON l.id=a.locationId
       ORDER BY a.receiptItemId,a.position;`);
  const recordsRows = new Map(recordsData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
  const recordsItems = new Map();
  for (const { receiptId, ...row } of recordsData.recordsets[1]) {
    const item = { ...row, allocations: [] };
    recordsItems.set(row.id, item);
    recordsRows.get(receiptId)?.items.push(item);
  }
  for (const { receiptItemId, ...allocation } of recordsData.recordsets[2]) recordsItems.get(receiptItemId)?.allocations.push(allocation);
  const records = [...recordsRows.values()];
  res.json({ records });
});

router.get('/receivings/:id', async (req, res) => {
  const scope = undefined;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const recordData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.purchaseOrderId,o.number AS purchaseOrderNumber,o.branch,o.supplierId,o.supplierName,o.supplierAddress,
      CONVERT(varchar(10),r.srrDate,23) AS srrDate,r.drNumber,r.pezaReference,r.invoiceNumber,CONVERT(varchar(10),r.invoiceDate,23) AS invoiceDate,
      o.currency,CONVERT(varchar(60),r.rate) AS rate,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
      r.remarks,CONVERT(varchar(60),r.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),r.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),r.[netAmount]) AS [netAmount],CONVERT(varchar(60),r.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),r.[amount]) AS [amount],r.receivedById,r.receivedBy,r.status,r.postedAt
      FROM dbo.SuppliesReceipts r  JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId WHERE r.id=@id ORDER BY r.id DESC;
      SELECT d.id,d.receiptId,d.position,d.orderItemId,o.suppliesId,o.suppliesCode,o.suppliesName,o.description,o.unit,
      CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),o.unitPrice) AS unitPrice,o.currency,
      CONVERT(varchar(60),o.discountRate) AS discountRate,CONVERT(varchar(60),o.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
      CONVERT(varchar(60),o.quantity) AS orderQuantity,CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,
      CONVERT(varchar(60),o.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS orderBalanceQuantity,
      CONVERT(varchar(60),COALESCE(l.allocatedQuantity,0)) AS allocatedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(l.allocatedQuantity,0) AS decimal(28,6))) AS allocationBalanceQuantity
      FROM dbo.SuppliesReceiptItems d JOIN dbo.PurchaseOrderItems o ON o.id=d.orderItemId
      OUTER APPLY(SELECT SUM(x.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems x JOIN dbo.SuppliesReceipts h ON h.id=x.receiptId WHERE x.orderItemId=o.id AND h.status='posted') a
      OUTER APPLY(SELECT SUM(x.quantity) AS allocatedQuantity FROM dbo.SuppliesReceiptAllocations x WHERE x.receiptItemId=d.id) l
      WHERE d.receiptId=@id ORDER BY d.receiptId,d.position;
      SELECT a.id,a.receiptItemId,a.position,CONVERT(varchar(60),a.quantity) AS quantity,CONVERT(varchar(10),a.expiryDate,23) AS expiryDate,
      CONVERT(varchar(10),a.mfgDate,23) AS mfgDate,a.imLot,a.qcStatus,a.warehouseId,a.locationId,w.code AS warehouseCode,l.code AS locationCode
      FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems d ON d.id=a.receiptItemId
      LEFT JOIN dbo.ConfigWarehouses w ON w.id=a.warehouseId LEFT JOIN dbo.ConfigLocations l ON l.id=a.locationId
      WHERE d.receiptId=@id ORDER BY a.receiptItemId,a.position;`);
  const recordRows = new Map(recordData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
  const recordItems = new Map();
  for (const { receiptId, ...row } of recordData.recordsets[1]) {
    const item = { ...row, allocations: [] };
    recordItems.set(row.id, item);
    recordRows.get(receiptId)?.items.push(item);
  }
  for (const { receiptItemId, ...allocation } of recordData.recordsets[2]) recordItems.get(receiptItemId)?.allocations.push(allocation);
  const record = [...recordRows.values()][0];
  if (!record) {
    const error = new Error('Receiving receipt could not be found.');
    error.status = 404;
    throw error;
  }
  res.json({ record });
});

router.post('/purchase-requests', async (req, res) => {
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Send a JSON object.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const record = await transaction(async scope => {
    const value = { ...input };
    for (const key of ['number', 'requestedBy', 'requestedDept', 'checkedBy', 'approvedBy', 'approvedBy2', 'remarks']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    if (!Array.isArray(value.items) || value.items.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      const error = new Error('Send item rows as objects.');
      error.status = 400;
      throw error;
    }
    value.items = value.items.map(row => {
      const line = { ...row, suppliesId: Number(row.suppliesId), neededDate: row.neededDate || value.neededDate };
      if (!Number.isSafeInteger(line.suppliesId) || line.suppliesId <= 0 || line.suppliesId > 2147483647) {
        const error = new Error('Enter a valid supplies id.');
        error.status = 400;
        throw error;
      }
      for (const key of ['unit', 'remarks']) {
        const entered = line[key] ?? '';
        if (typeof entered !== 'string' || entered.includes('\0')) {
          const error = new Error(`${key} must be text without null characters.`);
          error.status = 400;
          throw error;
        }
        line[key] = entered.trim();
      }
      for (const [key, places, positive, maximum] of [['quantity', 6, true, 1000000000]]) {
        const entered = line[key];
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > places) {
          const error = new Error(`${key} exceeds its supported decimal precision.`);
          error.status = 400;
          throw error;
        }
        const factor = 10n ** BigInt(places);
        const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
        if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
          const error = new Error(`${key} is outside its supported range.`);
          error.status = 400;
          throw error;
        }
        line[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
      }
      return line;
    });
    if (!value.items.length || value.items.length > 100) {
      const error = new Error('Use 1-100 supplies lines.');
      error.status = 400;
      throw error;
    }
    const snapshots = [];
    for (const item of value.items) {
      const suppliesData = await request(scope).input('id', sql.Int, item.suppliesId).query('SELECT id,code,name,description,unit,isActive FROM dbo.Supplies WHERE id=@id');
      const supplies = suppliesData.recordset[0];
      if (!supplies) {
        const error = new Error('Supplies could not be found.');
        error.status = 404;
        throw error;
      }
      if (!supplies.isActive) {
        const error = new Error('Select active Supplies for every PR line.');
        error.status = 400;
        throw error;
      }
      if (item.unit && item.unit !== supplies.unit) {
        const error = new Error('PR UOM must match the Supplies master.');
        error.status = 400;
        throw error;
      }
      snapshots.push({ ...item, suppliesCode: supplies.code, suppliesName: supplies.name, description: supplies.description, unit: supplies.unit });
    }
    let number = value.number;
    if (!number) {
      await request(scope).query('SELECT COUNT_BIG(*) AS total FROM dbo.PurchaseRequests WITH (TABLOCKX,HOLDLOCK)');
        const next = await request(scope).query(`SELECT COALESCE(CONVERT(bigint,last_value)+CONVERT(bigint,increment_value),CONVERT(bigint,seed_value)) AS nextId
          FROM sys.identity_columns WHERE object_id=OBJECT_ID(N'dbo.PurchaseRequests') AND name=N'id'`);
        const base = `PR-${String(next.recordset[0].nextId).padStart(8, '0')}`;
        let candidate = base;
        let suffix = 0;
        while ((await request(scope).input('number', sql.NVarChar(sql.MAX), candidate).query('SELECT id FROM dbo.PurchaseRequests WHERE number=@number')).recordset.length) candidate = `${base}-${++suffix}`;
        number = candidate;
    }

    const req = request(scope).input('number', sql.NVarChar(sql.MAX), number).input('prDate', sql.VarChar(sql.MAX), value.prDate).input('neededDate', sql.VarChar(sql.MAX), value.neededDate);
    for (const field of ['requestedBy', 'requestedDept', 'checkedBy', 'approvedBy', 'approvedBy2']) req.input(field, sql.NVarChar(sql.MAX), value[field]);
    req.input('remarks', sql.NVarChar(sql.MAX), value.remarks);
    let saved;
    const result = await req.input('branch', sql.NVarChar(sql.MAX), process.env.COMPANY_NAME || 'TLP COMPANY').input('preparedById', sql.Int, user.id).input('preparedBy', sql.NVarChar(sql.MAX), user.name)
      .query(`INSERT INTO dbo.PurchaseRequests(number,prDate,neededDate,requestedBy,requestedDept,checkedBy,approvedBy,approvedBy2,remarks,branch,preparedById,preparedBy) OUTPUT INSERTED.id
        VALUES(@number,@prDate,@neededDate,@requestedBy,@requestedDept,@checkedBy,@approvedBy,@approvedBy2,@remarks,@branch,@preparedById,@preparedBy)`);
    saved = result.recordset[0].id;
    for (const [position, item] of snapshots.entries()) {
      await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('suppliesId', sql.Int, item.suppliesId)
        .input('suppliesCode', sql.NVarChar(sql.MAX), item.suppliesCode).input('suppliesName', sql.NVarChar(sql.MAX), item.suppliesName).input('description', sql.NVarChar(sql.MAX), item.description)
        .input('quantity', sql.VarChar(sql.MAX), item.quantity).input('unit', sql.NVarChar(sql.MAX), item.unit).input('neededDate', sql.VarChar(sql.MAX), item.neededDate).input('remarks', sql.NVarChar(sql.MAX), item.remarks)
        .query(`INSERT INTO dbo.PurchaseRequestItems(requestId,position,suppliesId,suppliesCode,suppliesName,description,quantity,unit,neededDate,remarks)
          VALUES(@id,@position,@suppliesId,@suppliesCode,@suppliesName,@description,@quantity,@unit,@neededDate,@remarks)`);
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'purchase-requests')
      .input('action', sql.NVarChar(sql.MAX), 'create-draft').input('recordId', sql.NVarChar(sql.MAX), String(saved))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedRecordData = await request(scope).input('id', sql.Int, saved).query(`SELECT r.id,r.number,r.branch,CONVERT(varchar(10),r.prDate,23) AS prDate,CONVERT(varchar(10),r.neededDate,23) AS neededDate,
        r.requestedBy,r.requestedDept,r.checkedBy,r.approvedBy,r.approvedBy2,r.remarks,r.preparedById,r.preparedBy,r.status,r.postedAt
        FROM dbo.PurchaseRequests r  WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.requestId,d.position,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,CONVERT(varchar(60),d.quantity) AS quantity,d.unit,
        CONVERT(varchar(10),d.neededDate,23) AS neededDate,d.remarks,CONVERT(varchar(60),COALESCE(a.orderedQuantity,0)) AS orderedQuantity,
        CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.orderedQuantity,0) AS decimal(28,6))) AS balanceQuantity,a.purchaseOrderNumbers
        FROM dbo.PurchaseRequestItems d OUTER APPLY (
          SELECT SUM(i.quantity) AS orderedQuantity,STRING_AGG(CONVERT(nvarchar(max),o.number),N', ') AS purchaseOrderNumbers
          FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseOrders o ON o.id=i.orderId
          WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')
        ) a WHERE d.requestId=@id ORDER BY d.requestId,d.position;`);
    const savedRecordRows = new Map(savedRecordData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { requestId, ...item } of savedRecordData.recordsets[1]) savedRecordRows.get(requestId)?.items.push(item);
    const savedRecord = [...savedRecordRows.values()][0];
    if (!savedRecord) {
      const error = new Error('Purchase Request could not be found.');
      error.status = 404;
      throw error;
    }
    return savedRecord;
  });
  res.status(201).json({ record });
});

router.put('/purchase-requests/:id', async (req, res) => {
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Send a JSON object.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const record = await transaction(async scope => {
    const currentData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.branch,CONVERT(varchar(10),r.prDate,23) AS prDate,CONVERT(varchar(10),r.neededDate,23) AS neededDate,
        r.requestedBy,r.requestedDept,r.checkedBy,r.approvedBy,r.approvedBy2,r.remarks,r.preparedById,r.preparedBy,r.status,r.postedAt
        FROM dbo.PurchaseRequests r WITH (UPDLOCK,HOLDLOCK) WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.requestId,d.position,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,CONVERT(varchar(60),d.quantity) AS quantity,d.unit,
        CONVERT(varchar(10),d.neededDate,23) AS neededDate,d.remarks,CONVERT(varchar(60),COALESCE(a.orderedQuantity,0)) AS orderedQuantity,
        CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.orderedQuantity,0) AS decimal(28,6))) AS balanceQuantity,a.purchaseOrderNumbers
        FROM dbo.PurchaseRequestItems d OUTER APPLY (
          SELECT SUM(i.quantity) AS orderedQuantity,STRING_AGG(CONVERT(nvarchar(max),o.number),N', ') AS purchaseOrderNumbers
          FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseOrders o ON o.id=i.orderId
          WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')
        ) a WHERE d.requestId=@id ORDER BY d.requestId,d.position;`);
    const currentRows = new Map(currentData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { requestId, ...item } of currentData.recordsets[1]) currentRows.get(requestId)?.items.push(item);
    const current = [...currentRows.values()][0];
    if (!current) {
      const error = new Error('Purchase Request could not be found.');
      error.status = 404;
      throw error;
    }
    if (current && current.status !== 'draft') {
      const error = new Error('Only an unposted Purchase Request can be edited.');
      error.status = 409;
      throw error;
    }
    const value = { ...current, ...input };
    for (const key of ['number', 'requestedBy', 'requestedDept', 'checkedBy', 'approvedBy', 'approvedBy2', 'remarks']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    if (!Array.isArray(value.items) || value.items.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      const error = new Error('Send item rows as objects.');
      error.status = 400;
      throw error;
    }
    value.items = value.items.map(row => {
      const line = { ...row, suppliesId: Number(row.suppliesId), neededDate: row.neededDate || value.neededDate };
      if (!Number.isSafeInteger(line.suppliesId) || line.suppliesId <= 0 || line.suppliesId > 2147483647) {
        const error = new Error('Enter a valid supplies id.');
        error.status = 400;
        throw error;
      }
      for (const key of ['unit', 'remarks']) {
        const entered = line[key] ?? '';
        if (typeof entered !== 'string' || entered.includes('\0')) {
          const error = new Error(`${key} must be text without null characters.`);
          error.status = 400;
          throw error;
        }
        line[key] = entered.trim();
      }
      for (const [key, places, positive, maximum] of [['quantity', 6, true, 1000000000]]) {
        const entered = line[key];
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > places) {
          const error = new Error(`${key} exceeds its supported decimal precision.`);
          error.status = 400;
          throw error;
        }
        const factor = 10n ** BigInt(places);
        const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
        if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
          const error = new Error(`${key} is outside its supported range.`);
          error.status = 400;
          throw error;
        }
        line[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
      }
      return line;
    });
    if (!value.items.length || value.items.length > 100) {
      const error = new Error('Use 1-100 supplies lines.');
      error.status = 400;
      throw error;
    }
    const snapshots = [];
    for (const item of value.items) {
      const suppliesData = await request(scope).input('id', sql.Int, item.suppliesId).query('SELECT id,code,name,description,unit,isActive FROM dbo.Supplies WHERE id=@id');
      const supplies = suppliesData.recordset[0];
      if (!supplies) {
        const error = new Error('Supplies could not be found.');
        error.status = 404;
        throw error;
      }
      if (!supplies.isActive) {
        const error = new Error('Select active Supplies for every PR line.');
        error.status = 400;
        throw error;
      }
      if (item.unit && item.unit !== supplies.unit) {
        const error = new Error('PR UOM must match the Supplies master.');
        error.status = 400;
        throw error;
      }
      snapshots.push({ ...item, suppliesCode: supplies.code, suppliesName: supplies.name, description: supplies.description, unit: supplies.unit });
    }
    let number = value.number || current?.number;
    if (!number) {
      await request(scope).query('SELECT COUNT_BIG(*) AS total FROM dbo.PurchaseRequests WITH (TABLOCKX,HOLDLOCK)');
        const next = await request(scope).query(`SELECT COALESCE(CONVERT(bigint,last_value)+CONVERT(bigint,increment_value),CONVERT(bigint,seed_value)) AS nextId
          FROM sys.identity_columns WHERE object_id=OBJECT_ID(N'dbo.PurchaseRequests') AND name=N'id'`);
        const base = `PR-${String(next.recordset[0].nextId).padStart(8, '0')}`;
        let candidate = base;
        let suffix = 0;
        while ((await request(scope).input('number', sql.NVarChar(sql.MAX), candidate).query('SELECT id FROM dbo.PurchaseRequests WHERE number=@number')).recordset.length) candidate = `${base}-${++suffix}`;
        number = candidate;
    }

    const req = request(scope).input('number', sql.NVarChar(sql.MAX), number).input('prDate', sql.VarChar(sql.MAX), value.prDate).input('neededDate', sql.VarChar(sql.MAX), value.neededDate);
    for (const field of ['requestedBy', 'requestedDept', 'checkedBy', 'approvedBy', 'approvedBy2']) req.input(field, sql.NVarChar(sql.MAX), value[field]);
    req.input('remarks', sql.NVarChar(sql.MAX), value.remarks);
    const saved = id;
    await req.input('id', sql.Int, id).query(`UPDATE dbo.PurchaseRequests SET [number]=@number,[prDate]=@prDate,[neededDate]=@neededDate,[requestedBy]=@requestedBy,[requestedDept]=@requestedDept,[checkedBy]=@checkedBy,[approvedBy]=@approvedBy,[approvedBy2]=@approvedBy2,[remarks]=@remarks,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    await request(scope).input('id', sql.Int, id).query('DELETE FROM dbo.PurchaseRequestItems WHERE requestId=@id');
    for (const [position, item] of snapshots.entries()) {
      await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('suppliesId', sql.Int, item.suppliesId)
        .input('suppliesCode', sql.NVarChar(sql.MAX), item.suppliesCode).input('suppliesName', sql.NVarChar(sql.MAX), item.suppliesName).input('description', sql.NVarChar(sql.MAX), item.description)
        .input('quantity', sql.VarChar(sql.MAX), item.quantity).input('unit', sql.NVarChar(sql.MAX), item.unit).input('neededDate', sql.VarChar(sql.MAX), item.neededDate).input('remarks', sql.NVarChar(sql.MAX), item.remarks)
        .query(`INSERT INTO dbo.PurchaseRequestItems(requestId,position,suppliesId,suppliesCode,suppliesName,description,quantity,unit,neededDate,remarks)
          VALUES(@id,@position,@suppliesId,@suppliesCode,@suppliesName,@description,@quantity,@unit,@neededDate,@remarks)`);
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'purchase-requests')
      .input('action', sql.NVarChar(sql.MAX), 'update-draft').input('recordId', sql.NVarChar(sql.MAX), String(saved))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedRecordData = await request(scope).input('id', sql.Int, saved).query(`SELECT r.id,r.number,r.branch,CONVERT(varchar(10),r.prDate,23) AS prDate,CONVERT(varchar(10),r.neededDate,23) AS neededDate,
        r.requestedBy,r.requestedDept,r.checkedBy,r.approvedBy,r.approvedBy2,r.remarks,r.preparedById,r.preparedBy,r.status,r.postedAt
        FROM dbo.PurchaseRequests r  WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.requestId,d.position,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,CONVERT(varchar(60),d.quantity) AS quantity,d.unit,
        CONVERT(varchar(10),d.neededDate,23) AS neededDate,d.remarks,CONVERT(varchar(60),COALESCE(a.orderedQuantity,0)) AS orderedQuantity,
        CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.orderedQuantity,0) AS decimal(28,6))) AS balanceQuantity,a.purchaseOrderNumbers
        FROM dbo.PurchaseRequestItems d OUTER APPLY (
          SELECT SUM(i.quantity) AS orderedQuantity,STRING_AGG(CONVERT(nvarchar(max),o.number),N', ') AS purchaseOrderNumbers
          FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseOrders o ON o.id=i.orderId
          WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')
        ) a WHERE d.requestId=@id ORDER BY d.requestId,d.position;`);
    const savedRecordRows = new Map(savedRecordData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { requestId, ...item } of savedRecordData.recordsets[1]) savedRecordRows.get(requestId)?.items.push(item);
    const savedRecord = [...savedRecordRows.values()][0];
    if (!savedRecord) {
      const error = new Error('Purchase Request could not be found.');
      error.status = 404;
      throw error;
    }
    return savedRecord;
  });
  res.json({ record });
});

router.post('/purchase-orders', async (req, res) => {
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Send a JSON object.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const record = await transaction(async scope => {
    const value = { ...input };
    value.supplierId = Number(value.supplierId);
    if (!Number.isSafeInteger(value.supplierId) || value.supplierId <= 0 || value.supplierId > 2147483647) {
      const error = new Error('Enter a valid id.');
      error.status = 400;
      throw error;
    }
    for (const key of ['currency', 'paymentTerm', 'shipment', 'suppliesCategory', 'vatCode', 'deliveryAddress', 'remarks']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    value.rate = value.rate ?? 1;
    for (const [key, places, positive, maximum] of [['rate', 5, true, 1000000000]]) {
      const entered = value[key];
      if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
        const error = new Error(`${key} must be a valid decimal number.`);
        error.status = 400;
        throw error;
      }
      const source = String(entered).trim();
      if (!/^\d+(?:\.\d+)?$/.test(source)) {
        const error = new Error(`${key} must be zero or greater.`);
        error.status = 400;
        throw error;
      }
      const [whole, rawFraction = ''] = source.split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > places) {
        const error = new Error(`${key} exceeds its supported decimal precision.`);
        error.status = 400;
        throw error;
      }
      const factor = 10n ** BigInt(places);
      const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
      if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
        const error = new Error(`${key} is outside its supported range.`);
        error.status = 400;
        throw error;
      }
      value[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
    }
    const requestItems = new Set();
    if (!Array.isArray(value.items) || value.items.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      const error = new Error('Send item rows as objects.');
      error.status = 400;
      throw error;
    }
    value.items = value.items.map(row => {
      const requestItemId = Number(row.requestItemId);
      if (!Number.isSafeInteger(requestItemId) || requestItemId <= 0 || requestItemId > 2147483647) {
        const error = new Error('Enter a valid source item id.');
        error.status = 400;
        throw error;
      }
      if (requestItems.has(requestItemId)) {
        const error = new Error('A PR line can appear only once in a purchase order.');
        error.status = 400;
        throw error;
      }
      requestItems.add(requestItemId);
      if (row.currency && row.currency !== value.currency) {
        const error = new Error('PO line currency must match the header currency.');
        error.status = 400;
        throw error;
      }
      const line = { ...row, requestItemId, currency: value.currency, discountRate: row.discountRate ?? 0 };
      for (const key of ['remarks', 'unit']) {
        const entered = line[key] ?? '';
        if (typeof entered !== 'string' || entered.includes('\0')) {
          const error = new Error(`${key} must be text without null characters.`);
          error.status = 400;
          throw error;
        }
        line[key] = entered.trim();
      }
      for (const [key, places, positive, maximum] of [['quantity', 6, true, 1000000000], ['unitPrice', 6, false, 1000000000], ['discountRate', 6, false, 100]]) {
        const entered = line[key];
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > places) {
          const error = new Error(`${key} exceeds its supported decimal precision.`);
          error.status = 400;
          throw error;
        }
        const factor = 10n ** BigInt(places);
        const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
        if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
          const error = new Error(`${key} is outside its supported range.`);
          error.status = 400;
          throw error;
        }
        line[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
      }
      return line;
    });
    if (!value.items.length || value.items.length > 100) {
      const error = new Error('Use 1-100 PR lines.');
      error.status = 400;
      throw error;
    }
    const supplierData = await request(scope).input('id', sql.Int, value.supplierId).query(`SELECT id,code,[name],[shortName],[businessStyle],[address],[remarks],[tin],[contactPerson],[email],[countryOfOrigin],[country],[cpnumber],[faxNo],[paymentTerm],[vatCode],[taxCode],[decimalInPrice],[decimalInTotalPrice],[vatInclusive],[isActive] FROM dbo.Suppliers WHERE id=@id`);
    const supplier = supplierData.recordset[0];
    if (!supplier) {
      const error = new Error('Supplier could not be found.');
      error.status = 404;
      throw error;
    }
    if (!supplier.isActive) {
      const error = new Error('Select an active Supplier.');
      error.status = 400;
      throw error;
    }
    const vat = await request(scope).input('code', sql.NVarChar(sql.MAX), value.vatCode).query('SELECT rate FROM dbo.ConfigVatCodes WHERE code=@code AND isActive=1');
    if (!vat.recordset.length) {
      const error = new Error('Select an active VAT Code.');
      error.status = 400;
      throw error;
    }
    const currency = await request(scope).input('code', sql.NVarChar(sql.MAX), value.currency).query('SELECT id FROM dbo.ConfigCurrencies WHERE shortName=@code AND isActive=1');
    if (!currency.recordset.length) {
      const error = new Error('Select an active Currency.');
      error.status = 400;
      throw error;
    }
    const term = await request(scope).input('term', sql.NVarChar(sql.MAX), value.paymentTerm).query('SELECT id FROM dbo.ConfigPaymentTerms WHERE description=@term AND isActive=1 AND forSupplier=1');
    if (!term.recordset.length) {
      const error = new Error('Select an active Supplier Payment Term.');
      error.status = 400;
      throw error;
    }
    if (value.suppliesCategory) {
      const category = await request(scope).input('name', sql.NVarChar(sql.MAX), value.suppliesCategory).query('SELECT id FROM dbo.ConfigSuppliesCategories WHERE name=@name AND isActive=1');
      if (!category.recordset.length) {
        const error = new Error('Select an active Supplies Category.');
        error.status = 400;
        throw error;
      }
    }
    const snapshots = [];
    for (const item of value.items) {
      const sourceData = await request(scope).input('id', sql.Int, item.requestItemId).query(`SELECT d.*,r.status AS requestStatus,r.number AS requestNumber,
        CONVERT(varchar(60),d.quantity) AS requestedQuantity,CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.PurchaseOrderItems i
        JOIN dbo.PurchaseOrders o ON o.id=i.orderId WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')),0)) AS orderedQuantity
        FROM dbo.PurchaseRequestItems d JOIN dbo.PurchaseRequests r ON r.id=d.requestId WHERE d.id=@id`);
      if (!sourceData.recordset.length) {
        const error = new Error('Select a valid posted PR line.');
        error.status = 400;
        throw error;
      }
      const source = sourceData.recordset[0];
      if (!['posted', 'closed'].includes(source.requestStatus)) {
        const error = new Error('Purchase Orders can only use posted PR lines.');
        error.status = 409;
        throw error;
      }
      const balances = { requested: source.requestedQuantity, ordered: source.orderedQuantity, quantity: item.quantity };
      for (const [key, entered] of Object.entries(balances)) {
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > 6) {
          const error = new Error(`${key} exceeds six decimal places.`);
          error.status = 400;
          throw error;
        }
        const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
        if (units > 1000000000n * 1000000n) {
          const error = new Error(`${key} is too large.`);
          error.status = 400;
          throw error;
        }
        balances[key] = units;
      }
      const remaining = balances.requested - balances.ordered;
      if (balances.quantity > remaining) {
        const error = new Error('PO quantity exceeds the remaining Purchase Request balance.');
        error.status = 409;
        throw error;
      }
      if (item.unit && item.unit !== source.unit) {
        const error = new Error('PO UOM must match the source PR line.');
        error.status = 400;
        throw error;
      }
      snapshots.push({ ...item, suppliesId: source.suppliesId, suppliesCode: source.suppliesCode, suppliesName: source.suppliesName, description: source.description, unit: source.unit });
    }
    const settings = { vatRate: vat.recordset[0].rate, vatInclusive: supplier.vatInclusive, decimalInPrice: supplier.decimalInPrice, decimalInTotalPrice: supplier.decimalInTotalPrice };
    const { vatRate = 0, vatInclusive = false, decimalInPrice = 6, decimalInTotalPrice = 2 } = settings;
    if (!Number.isInteger(decimalInPrice) || decimalInPrice < 0 || decimalInPrice > 6 || !Number.isInteger(decimalInTotalPrice) || decimalInTotalPrice < 0 || decimalInTotalPrice > 6) {
      const error = new Error('Supplier price precision is outside the supported range.');
      error.status = 400;
      throw error;
    }
    const totalFactor = 10n ** BigInt(decimalInTotalPrice);
    const vatUnits = { rate: vatRate };
    for (const [key, entered] of Object.entries(vatUnits)) {
      if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
        const error = new Error(`${key} must be a valid decimal number.`);
        error.status = 400;
        throw error;
      }
      const source = String(entered).trim();
      if (!/^\d+(?:\.\d+)?$/.test(source)) {
        const error = new Error(`${key} must be zero or greater.`);
        error.status = 400;
        throw error;
      }
      const [whole, rawFraction = ''] = source.split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > 6) {
        const error = new Error(`${key} exceeds six decimal places.`);
        error.status = 400;
        throw error;
      }
      const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
      if (units > 100n * 1000000n) {
        const error = new Error(`${key} is too large.`);
        error.status = 400;
        throw error;
      }
      vatUnits[key] = units;
    }
    const taxRateUnits = vatUnits.rate;
    const percentages = 100000000n;
    const totals = { items: [], grossAmount: 0n, discountAmount: 0n, netAmount: 0n, vatAmount: 0n, amount: 0n };
    for (const item of snapshots) {
      const lineUnits = { quantity: item.quantity, unitPrice: item.unitPrice, discountRate: item.discountRate ?? 0 };
      for (const [key, entered] of Object.entries(lineUnits)) {
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > 6) {
          const error = new Error(`${key} exceeds six decimal places.`);
          error.status = 400;
          throw error;
        }
        const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
        if (units > 1000000000n * 1000000n) {
          const error = new Error(`${key} is too large.`);
          error.status = 400;
          throw error;
        }
        lineUnits[key] = units;
      }
      const quantity = lineUnits.quantity;
      if (!quantity) {
        const error = new Error('Quantity must be greater than zero.');
        error.status = 400;
        throw error;
      }
      const step = 10n ** BigInt(6 - decimalInPrice);
      const price = ((lineUnits.unitPrice + step / 2n) / step) * step;
      const discount = lineUnits.discountRate;
      if (discount > percentages) {
        const error = new Error('Discount rate is too large.');
        error.status = 400;
        throw error;
      }
      const grossAmount = (quantity * price * totalFactor + 500000000000n) / 1000000000000n;
      const discountAmount = (grossAmount * discount + percentages / 2n) / percentages;
      const afterDiscount = grossAmount - discountAmount;
      const vatAmount = vatInclusive ? (afterDiscount * taxRateUnits + (percentages + taxRateUnits) / 2n) / (percentages + taxRateUnits) : (afterDiscount * taxRateUnits + percentages / 2n) / percentages;
      const netAmount = vatInclusive ? afterDiscount - vatAmount : afterDiscount;
      const values = { grossAmount, discountAmount, netAmount, vatAmount, amount: netAmount + vatAmount };
      const calculated = { ...item, quantity: `${quantity / 1000000n}.${String(quantity % 1000000n).padStart(6, '0')}`, unitPrice: `${price / 1000000n}.${String(price % 1000000n).padStart(6, '0')}`, discountRate: `${discount / 1000000n}.${String(discount % 1000000n).padStart(6, '0')}`, vatRate: `${taxRateUnits / 1000000n}.${String(taxRateUnits % 1000000n).padStart(6, '0')}` };
      for (const [key, amount] of Object.entries(values)) {
        totals[key] += amount;
        if (totals[key] > 1000000000000n * totalFactor) {
          const error = new Error('The document total exceeds the supported amount.');
          error.status = 400;
          throw error;
        }
        calculated[key] = `${amount / totalFactor}${decimalInTotalPrice ? '.' + String(amount % totalFactor).padStart(decimalInTotalPrice, '0') : ''}`;
      }
      totals.items.push(calculated);
    }
    for (const key of ['grossAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount']) totals[key] = `${totals[key] / totalFactor}${decimalInTotalPrice ? '.' + String(totals[key] % totalFactor).padStart(decimalInTotalPrice, '0') : ''}`;

    const req = request(scope);
    req.input('grossAmount', sql.VarChar(sql.MAX), totals.grossAmount);
    req.input('discountAmount', sql.VarChar(sql.MAX), totals.discountAmount);
    req.input('netAmount', sql.VarChar(sql.MAX), totals.netAmount);
    req.input('vatAmount', sql.VarChar(sql.MAX), totals.vatAmount);
    req.input('amount', sql.VarChar(sql.MAX), totals.amount);
    req.input('supplierId', sql.Int, supplier.id).input('supplierName', sql.NVarChar(sql.MAX), supplier.name)
      .input('supplierAddress', sql.NVarChar(sql.MAX), supplier.address).input('supplierContactPerson', sql.NVarChar(sql.MAX), supplier.contactPerson)
      .input('poDate', sql.VarChar(sql.MAX), value.poDate).input('deliveryDate', sql.VarChar(sql.MAX), value.deliveryDate).input('currency', sql.NVarChar(sql.MAX), value.currency)
      .input('rate', sql.VarChar(sql.MAX), value.rate).input('paymentTerm', sql.NVarChar(sql.MAX), value.paymentTerm).input('shipment', sql.NVarChar(sql.MAX), value.shipment)
      .input('suppliesCategory', sql.NVarChar(sql.MAX), value.suppliesCategory).input('vatCode', sql.NVarChar(sql.MAX), value.vatCode).input('vatRate', sql.VarChar(sql.MAX), String(settings.vatRate))
      .input('vatInclusive', sql.Bit, settings.vatInclusive).input('decimalInPrice', sql.Int, supplier.decimalInPrice).input('decimalInTotalPrice', sql.Int, supplier.decimalInTotalPrice)
      .input('deliveryAddress', sql.NVarChar(sql.MAX), value.deliveryAddress).input('remarks', sql.NVarChar(sql.MAX), value.remarks);
    let saved;
    const result = await req.input('branch', sql.NVarChar(sql.MAX), process.env.COMPANY_NAME || 'TLP COMPANY').input('preparedById', sql.Int, user.id).input('preparedBy', sql.NVarChar(sql.MAX), user.name)
      .query(`INSERT INTO dbo.PurchaseOrders(supplierId,supplierName,supplierAddress,supplierContactPerson,poDate,deliveryDate,currency,rate,paymentTerm,shipment,suppliesCategory,vatCode,vatRate,vatInclusive,decimalInPrice,decimalInTotalPrice,deliveryAddress,remarks,grossAmount,discountAmount,netAmount,vatAmount,amount,branch,preparedById,preparedBy) OUTPUT INSERTED.id VALUES(@supplierId,@supplierName,@supplierAddress,@supplierContactPerson,@poDate,@deliveryDate,@currency,@rate,@paymentTerm,@shipment,@suppliesCategory,@vatCode,@vatRate,@vatInclusive,@decimalInPrice,@decimalInTotalPrice,@deliveryAddress,@remarks,@grossAmount,@discountAmount,@netAmount,@vatAmount,@amount,@branch,@preparedById,@preparedBy)`);
    saved = result.recordset[0].id;
    for (const [position, item] of totals.items.entries()) {
      const lineWrite = request(scope);
      lineWrite.input('grossAmount', sql.VarChar(sql.MAX), item.grossAmount);
    lineWrite.input('discountAmount', sql.VarChar(sql.MAX), item.discountAmount);
    lineWrite.input('netAmount', sql.VarChar(sql.MAX), item.netAmount);
    lineWrite.input('vatAmount', sql.VarChar(sql.MAX), item.vatAmount);
    lineWrite.input('amount', sql.VarChar(sql.MAX), item.amount);
      await lineWrite.input('id', sql.Int, saved).input('position', sql.Int, position).input('requestItemId', sql.Int, item.requestItemId)
        .input('suppliesId', sql.Int, item.suppliesId).input('suppliesCode', sql.NVarChar(sql.MAX), item.suppliesCode).input('suppliesName', sql.NVarChar(sql.MAX), item.suppliesName)
        .input('description', sql.NVarChar(sql.MAX), item.description).input('unit', sql.NVarChar(sql.MAX), item.unit).input('quantity', sql.VarChar(sql.MAX), item.quantity)
        .input('unitPrice', sql.VarChar(sql.MAX), item.unitPrice).input('currency', sql.NVarChar(sql.MAX), item.currency).input('discountRate', sql.VarChar(sql.MAX), item.discountRate)
        .input('vatRate', sql.VarChar(sql.MAX), item.vatRate).input('remarks', sql.NVarChar(sql.MAX), item.remarks)
        .query(`INSERT INTO dbo.PurchaseOrderItems(orderId,position,requestItemId,suppliesId,suppliesCode,suppliesName,description,unit,quantity,unitPrice,currency,discountRate,vatRate,grossAmount,discountAmount,netAmount,vatAmount,amount,remarks)
          VALUES(@id,@position,@requestItemId,@suppliesId,@suppliesCode,@suppliesName,@description,@unit,@quantity,@unitPrice,@currency,@discountRate,@vatRate,@grossAmount,@discountAmount,@netAmount,@vatAmount,@amount,@remarks)`);
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'purchase-orders')
      .input('action', sql.NVarChar(sql.MAX), 'create-draft').input('recordId', sql.NVarChar(sql.MAX), String(saved))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedRecordData = await request(scope).input('id', sql.Int, saved).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
        CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
        o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
        FROM dbo.PurchaseOrders o  WHERE o.id=@id ORDER BY o.id DESC;
        SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
        CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
        FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
        OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
        WHERE d.orderId=@id ORDER BY d.orderId,d.position;`);
    const savedRecordRows = new Map(savedRecordData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { orderId, ...item } of savedRecordData.recordsets[1]) savedRecordRows.get(orderId)?.items.push(item);
    const savedRecord = [...savedRecordRows.values()][0];
    if (!savedRecord) {
      const error = new Error('Purchase Order could not be found.');
      error.status = 404;
      throw error;
    }
    return savedRecord;
  });
  res.status(201).json({ record });
});

router.put('/purchase-orders/:id', async (req, res) => {
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Send a JSON object.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const record = await transaction(async scope => {
    const currentData = await request(scope).input('id', sql.Int, id).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
        CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
        o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
        FROM dbo.PurchaseOrders o WITH (UPDLOCK,HOLDLOCK) WHERE o.id=@id ORDER BY o.id DESC;
        SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
        CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
        FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
        OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
        WHERE d.orderId=@id ORDER BY d.orderId,d.position;`);
    const currentRows = new Map(currentData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { orderId, ...item } of currentData.recordsets[1]) currentRows.get(orderId)?.items.push(item);
    const current = [...currentRows.values()][0];
    if (!current) {
      const error = new Error('Purchase Order could not be found.');
      error.status = 404;
      throw error;
    }
    if (current && current.status !== 'draft') {
      const error = new Error('Only an unposted Purchase Order can be edited.');
      error.status = 409;
      throw error;
    }
    const value = { ...current, ...input };
    value.supplierId = Number(value.supplierId);
    if (!Number.isSafeInteger(value.supplierId) || value.supplierId <= 0 || value.supplierId > 2147483647) {
      const error = new Error('Enter a valid id.');
      error.status = 400;
      throw error;
    }
    for (const key of ['currency', 'paymentTerm', 'shipment', 'suppliesCategory', 'vatCode', 'deliveryAddress', 'remarks']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    value.rate = value.rate ?? 1;
    for (const [key, places, positive, maximum] of [['rate', 5, true, 1000000000]]) {
      const entered = value[key];
      if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
        const error = new Error(`${key} must be a valid decimal number.`);
        error.status = 400;
        throw error;
      }
      const source = String(entered).trim();
      if (!/^\d+(?:\.\d+)?$/.test(source)) {
        const error = new Error(`${key} must be zero or greater.`);
        error.status = 400;
        throw error;
      }
      const [whole, rawFraction = ''] = source.split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > places) {
        const error = new Error(`${key} exceeds its supported decimal precision.`);
        error.status = 400;
        throw error;
      }
      const factor = 10n ** BigInt(places);
      const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
      if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
        const error = new Error(`${key} is outside its supported range.`);
        error.status = 400;
        throw error;
      }
      value[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
    }
    const requestItems = new Set();
    if (!Array.isArray(value.items) || value.items.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      const error = new Error('Send item rows as objects.');
      error.status = 400;
      throw error;
    }
    value.items = value.items.map(row => {
      const requestItemId = Number(row.requestItemId);
      if (!Number.isSafeInteger(requestItemId) || requestItemId <= 0 || requestItemId > 2147483647) {
        const error = new Error('Enter a valid source item id.');
        error.status = 400;
        throw error;
      }
      if (requestItems.has(requestItemId)) {
        const error = new Error('A PR line can appear only once in a purchase order.');
        error.status = 400;
        throw error;
      }
      requestItems.add(requestItemId);
      if (row.currency && row.currency !== value.currency) {
        const error = new Error('PO line currency must match the header currency.');
        error.status = 400;
        throw error;
      }
      const line = { ...row, requestItemId, currency: value.currency, discountRate: row.discountRate ?? 0 };
      for (const key of ['remarks', 'unit']) {
        const entered = line[key] ?? '';
        if (typeof entered !== 'string' || entered.includes('\0')) {
          const error = new Error(`${key} must be text without null characters.`);
          error.status = 400;
          throw error;
        }
        line[key] = entered.trim();
      }
      for (const [key, places, positive, maximum] of [['quantity', 6, true, 1000000000], ['unitPrice', 6, false, 1000000000], ['discountRate', 6, false, 100]]) {
        const entered = line[key];
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > places) {
          const error = new Error(`${key} exceeds its supported decimal precision.`);
          error.status = 400;
          throw error;
        }
        const factor = 10n ** BigInt(places);
        const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
        if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
          const error = new Error(`${key} is outside its supported range.`);
          error.status = 400;
          throw error;
        }
        line[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
      }
      return line;
    });
    if (!value.items.length || value.items.length > 100) {
      const error = new Error('Use 1-100 PR lines.');
      error.status = 400;
      throw error;
    }
    const supplierData = await request(scope).input('id', sql.Int, value.supplierId).query(`SELECT id,code,[name],[shortName],[businessStyle],[address],[remarks],[tin],[contactPerson],[email],[countryOfOrigin],[country],[cpnumber],[faxNo],[paymentTerm],[vatCode],[taxCode],[decimalInPrice],[decimalInTotalPrice],[vatInclusive],[isActive] FROM dbo.Suppliers WHERE id=@id`);
    const supplier = supplierData.recordset[0];
    if (!supplier) {
      const error = new Error('Supplier could not be found.');
      error.status = 404;
      throw error;
    }
    if (!supplier.isActive) {
      const error = new Error('Select an active Supplier.');
      error.status = 400;
      throw error;
    }
    const vat = await request(scope).input('code', sql.NVarChar(sql.MAX), value.vatCode).query('SELECT rate FROM dbo.ConfigVatCodes WHERE code=@code AND isActive=1');
    if (!vat.recordset.length) {
      const error = new Error('Select an active VAT Code.');
      error.status = 400;
      throw error;
    }
    const currency = await request(scope).input('code', sql.NVarChar(sql.MAX), value.currency).query('SELECT id FROM dbo.ConfigCurrencies WHERE shortName=@code AND isActive=1');
    if (!currency.recordset.length) {
      const error = new Error('Select an active Currency.');
      error.status = 400;
      throw error;
    }
    const term = await request(scope).input('term', sql.NVarChar(sql.MAX), value.paymentTerm).query('SELECT id FROM dbo.ConfigPaymentTerms WHERE description=@term AND isActive=1 AND forSupplier=1');
    if (!term.recordset.length) {
      const error = new Error('Select an active Supplier Payment Term.');
      error.status = 400;
      throw error;
    }
    if (value.suppliesCategory) {
      const category = await request(scope).input('name', sql.NVarChar(sql.MAX), value.suppliesCategory).query('SELECT id FROM dbo.ConfigSuppliesCategories WHERE name=@name AND isActive=1');
      if (!category.recordset.length) {
        const error = new Error('Select an active Supplies Category.');
        error.status = 400;
        throw error;
      }
    }
    const snapshots = [];
    for (const item of value.items) {
      const sourceData = await request(scope).input('id', sql.Int, item.requestItemId).query(`SELECT d.*,r.status AS requestStatus,r.number AS requestNumber,
        CONVERT(varchar(60),d.quantity) AS requestedQuantity,CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.PurchaseOrderItems i
        JOIN dbo.PurchaseOrders o ON o.id=i.orderId WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')),0)) AS orderedQuantity
        FROM dbo.PurchaseRequestItems d JOIN dbo.PurchaseRequests r ON r.id=d.requestId WHERE d.id=@id`);
      if (!sourceData.recordset.length) {
        const error = new Error('Select a valid posted PR line.');
        error.status = 400;
        throw error;
      }
      const source = sourceData.recordset[0];
      if (!['posted', 'closed'].includes(source.requestStatus)) {
        const error = new Error('Purchase Orders can only use posted PR lines.');
        error.status = 409;
        throw error;
      }
      const balances = { requested: source.requestedQuantity, ordered: source.orderedQuantity, quantity: item.quantity };
      for (const [key, entered] of Object.entries(balances)) {
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > 6) {
          const error = new Error(`${key} exceeds six decimal places.`);
          error.status = 400;
          throw error;
        }
        const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
        if (units > 1000000000n * 1000000n) {
          const error = new Error(`${key} is too large.`);
          error.status = 400;
          throw error;
        }
        balances[key] = units;
      }
      const remaining = balances.requested - balances.ordered;
      if (balances.quantity > remaining) {
        const error = new Error('PO quantity exceeds the remaining Purchase Request balance.');
        error.status = 409;
        throw error;
      }
      if (item.unit && item.unit !== source.unit) {
        const error = new Error('PO UOM must match the source PR line.');
        error.status = 400;
        throw error;
      }
      snapshots.push({ ...item, suppliesId: source.suppliesId, suppliesCode: source.suppliesCode, suppliesName: source.suppliesName, description: source.description, unit: source.unit });
    }
    const settings = { vatRate: vat.recordset[0].rate, vatInclusive: supplier.vatInclusive, decimalInPrice: supplier.decimalInPrice, decimalInTotalPrice: supplier.decimalInTotalPrice };
    const { vatRate = 0, vatInclusive = false, decimalInPrice = 6, decimalInTotalPrice = 2 } = settings;
    if (!Number.isInteger(decimalInPrice) || decimalInPrice < 0 || decimalInPrice > 6 || !Number.isInteger(decimalInTotalPrice) || decimalInTotalPrice < 0 || decimalInTotalPrice > 6) {
      const error = new Error('Supplier price precision is outside the supported range.');
      error.status = 400;
      throw error;
    }
    const totalFactor = 10n ** BigInt(decimalInTotalPrice);
    const vatUnits = { rate: vatRate };
    for (const [key, entered] of Object.entries(vatUnits)) {
      if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
        const error = new Error(`${key} must be a valid decimal number.`);
        error.status = 400;
        throw error;
      }
      const source = String(entered).trim();
      if (!/^\d+(?:\.\d+)?$/.test(source)) {
        const error = new Error(`${key} must be zero or greater.`);
        error.status = 400;
        throw error;
      }
      const [whole, rawFraction = ''] = source.split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > 6) {
        const error = new Error(`${key} exceeds six decimal places.`);
        error.status = 400;
        throw error;
      }
      const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
      if (units > 100n * 1000000n) {
        const error = new Error(`${key} is too large.`);
        error.status = 400;
        throw error;
      }
      vatUnits[key] = units;
    }
    const taxRateUnits = vatUnits.rate;
    const percentages = 100000000n;
    const totals = { items: [], grossAmount: 0n, discountAmount: 0n, netAmount: 0n, vatAmount: 0n, amount: 0n };
    for (const item of snapshots) {
      const lineUnits = { quantity: item.quantity, unitPrice: item.unitPrice, discountRate: item.discountRate ?? 0 };
      for (const [key, entered] of Object.entries(lineUnits)) {
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > 6) {
          const error = new Error(`${key} exceeds six decimal places.`);
          error.status = 400;
          throw error;
        }
        const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
        if (units > 1000000000n * 1000000n) {
          const error = new Error(`${key} is too large.`);
          error.status = 400;
          throw error;
        }
        lineUnits[key] = units;
      }
      const quantity = lineUnits.quantity;
      if (!quantity) {
        const error = new Error('Quantity must be greater than zero.');
        error.status = 400;
        throw error;
      }
      const step = 10n ** BigInt(6 - decimalInPrice);
      const price = ((lineUnits.unitPrice + step / 2n) / step) * step;
      const discount = lineUnits.discountRate;
      if (discount > percentages) {
        const error = new Error('Discount rate is too large.');
        error.status = 400;
        throw error;
      }
      const grossAmount = (quantity * price * totalFactor + 500000000000n) / 1000000000000n;
      const discountAmount = (grossAmount * discount + percentages / 2n) / percentages;
      const afterDiscount = grossAmount - discountAmount;
      const vatAmount = vatInclusive ? (afterDiscount * taxRateUnits + (percentages + taxRateUnits) / 2n) / (percentages + taxRateUnits) : (afterDiscount * taxRateUnits + percentages / 2n) / percentages;
      const netAmount = vatInclusive ? afterDiscount - vatAmount : afterDiscount;
      const values = { grossAmount, discountAmount, netAmount, vatAmount, amount: netAmount + vatAmount };
      const calculated = { ...item, quantity: `${quantity / 1000000n}.${String(quantity % 1000000n).padStart(6, '0')}`, unitPrice: `${price / 1000000n}.${String(price % 1000000n).padStart(6, '0')}`, discountRate: `${discount / 1000000n}.${String(discount % 1000000n).padStart(6, '0')}`, vatRate: `${taxRateUnits / 1000000n}.${String(taxRateUnits % 1000000n).padStart(6, '0')}` };
      for (const [key, amount] of Object.entries(values)) {
        totals[key] += amount;
        if (totals[key] > 1000000000000n * totalFactor) {
          const error = new Error('The document total exceeds the supported amount.');
          error.status = 400;
          throw error;
        }
        calculated[key] = `${amount / totalFactor}${decimalInTotalPrice ? '.' + String(amount % totalFactor).padStart(decimalInTotalPrice, '0') : ''}`;
      }
      totals.items.push(calculated);
    }
    for (const key of ['grossAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount']) totals[key] = `${totals[key] / totalFactor}${decimalInTotalPrice ? '.' + String(totals[key] % totalFactor).padStart(decimalInTotalPrice, '0') : ''}`;

    const req = request(scope);
    req.input('grossAmount', sql.VarChar(sql.MAX), totals.grossAmount);
    req.input('discountAmount', sql.VarChar(sql.MAX), totals.discountAmount);
    req.input('netAmount', sql.VarChar(sql.MAX), totals.netAmount);
    req.input('vatAmount', sql.VarChar(sql.MAX), totals.vatAmount);
    req.input('amount', sql.VarChar(sql.MAX), totals.amount);
    req.input('supplierId', sql.Int, supplier.id).input('supplierName', sql.NVarChar(sql.MAX), supplier.name)
      .input('supplierAddress', sql.NVarChar(sql.MAX), supplier.address).input('supplierContactPerson', sql.NVarChar(sql.MAX), supplier.contactPerson)
      .input('poDate', sql.VarChar(sql.MAX), value.poDate).input('deliveryDate', sql.VarChar(sql.MAX), value.deliveryDate).input('currency', sql.NVarChar(sql.MAX), value.currency)
      .input('rate', sql.VarChar(sql.MAX), value.rate).input('paymentTerm', sql.NVarChar(sql.MAX), value.paymentTerm).input('shipment', sql.NVarChar(sql.MAX), value.shipment)
      .input('suppliesCategory', sql.NVarChar(sql.MAX), value.suppliesCategory).input('vatCode', sql.NVarChar(sql.MAX), value.vatCode).input('vatRate', sql.VarChar(sql.MAX), String(settings.vatRate))
      .input('vatInclusive', sql.Bit, settings.vatInclusive).input('decimalInPrice', sql.Int, supplier.decimalInPrice).input('decimalInTotalPrice', sql.Int, supplier.decimalInTotalPrice)
      .input('deliveryAddress', sql.NVarChar(sql.MAX), value.deliveryAddress).input('remarks', sql.NVarChar(sql.MAX), value.remarks);
    const saved = id;
    await req.input('id', sql.Int, id).query(`UPDATE dbo.PurchaseOrders SET [supplierId]=@supplierId,[supplierName]=@supplierName,[supplierAddress]=@supplierAddress,[supplierContactPerson]=@supplierContactPerson,[poDate]=@poDate,[deliveryDate]=@deliveryDate,[currency]=@currency,[rate]=@rate,[paymentTerm]=@paymentTerm,[shipment]=@shipment,[suppliesCategory]=@suppliesCategory,[vatCode]=@vatCode,[vatRate]=@vatRate,[vatInclusive]=@vatInclusive,[decimalInPrice]=@decimalInPrice,[decimalInTotalPrice]=@decimalInTotalPrice,[deliveryAddress]=@deliveryAddress,[remarks]=@remarks,[grossAmount]=@grossAmount,[discountAmount]=@discountAmount,[netAmount]=@netAmount,[vatAmount]=@vatAmount,[amount]=@amount,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    await request(scope).input('id', sql.Int, id).query('DELETE FROM dbo.PurchaseOrderItems WHERE orderId=@id');
    for (const [position, item] of totals.items.entries()) {
      const lineWrite = request(scope);
      lineWrite.input('grossAmount', sql.VarChar(sql.MAX), item.grossAmount);
    lineWrite.input('discountAmount', sql.VarChar(sql.MAX), item.discountAmount);
    lineWrite.input('netAmount', sql.VarChar(sql.MAX), item.netAmount);
    lineWrite.input('vatAmount', sql.VarChar(sql.MAX), item.vatAmount);
    lineWrite.input('amount', sql.VarChar(sql.MAX), item.amount);
      await lineWrite.input('id', sql.Int, saved).input('position', sql.Int, position).input('requestItemId', sql.Int, item.requestItemId)
        .input('suppliesId', sql.Int, item.suppliesId).input('suppliesCode', sql.NVarChar(sql.MAX), item.suppliesCode).input('suppliesName', sql.NVarChar(sql.MAX), item.suppliesName)
        .input('description', sql.NVarChar(sql.MAX), item.description).input('unit', sql.NVarChar(sql.MAX), item.unit).input('quantity', sql.VarChar(sql.MAX), item.quantity)
        .input('unitPrice', sql.VarChar(sql.MAX), item.unitPrice).input('currency', sql.NVarChar(sql.MAX), item.currency).input('discountRate', sql.VarChar(sql.MAX), item.discountRate)
        .input('vatRate', sql.VarChar(sql.MAX), item.vatRate).input('remarks', sql.NVarChar(sql.MAX), item.remarks)
        .query(`INSERT INTO dbo.PurchaseOrderItems(orderId,position,requestItemId,suppliesId,suppliesCode,suppliesName,description,unit,quantity,unitPrice,currency,discountRate,vatRate,grossAmount,discountAmount,netAmount,vatAmount,amount,remarks)
          VALUES(@id,@position,@requestItemId,@suppliesId,@suppliesCode,@suppliesName,@description,@unit,@quantity,@unitPrice,@currency,@discountRate,@vatRate,@grossAmount,@discountAmount,@netAmount,@vatAmount,@amount,@remarks)`);
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'purchase-orders')
      .input('action', sql.NVarChar(sql.MAX), 'update-draft').input('recordId', sql.NVarChar(sql.MAX), String(saved))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedRecordData = await request(scope).input('id', sql.Int, saved).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
        CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
        o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
        FROM dbo.PurchaseOrders o  WHERE o.id=@id ORDER BY o.id DESC;
        SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
        CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
        FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
        OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
        WHERE d.orderId=@id ORDER BY d.orderId,d.position;`);
    const savedRecordRows = new Map(savedRecordData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { orderId, ...item } of savedRecordData.recordsets[1]) savedRecordRows.get(orderId)?.items.push(item);
    const savedRecord = [...savedRecordRows.values()][0];
    if (!savedRecord) {
      const error = new Error('Purchase Order could not be found.');
      error.status = 404;
      throw error;
    }
    return savedRecord;
  });
  res.json({ record });
});

router.post('/receivings', async (req, res) => {
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Send a JSON object.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const record = await transaction(async scope => {
    const value = { ...input };
    value.purchaseOrderId = Number(value.purchaseOrderId);
    if (!Number.isSafeInteger(value.purchaseOrderId) || value.purchaseOrderId <= 0 || value.purchaseOrderId > 2147483647) {
      const error = new Error('Enter a valid id.');
      error.status = 400;
      throw error;
    }
    for (const key of ['drNumber', 'pezaReference', 'invoiceNumber', 'remarks']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    value.invoiceDate = value.invoiceDate || null;
    if (value.rate !== undefined) {
      for (const [key, places, positive, maximum] of [['rate', 5, true, 1000000000]]) {
        const entered = value[key];
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > places) {
          const error = new Error(`${key} exceeds its supported decimal precision.`);
          error.status = 400;
          throw error;
        }
        const factor = 10n ** BigInt(places);
        const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
        if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
          const error = new Error(`${key} is outside its supported range.`);
          error.status = 400;
          throw error;
        }
        value[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
      }
    }
    const orderItemsUsed = new Set();
    if (!Array.isArray(value.items) || value.items.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      const error = new Error('Send item rows as objects.');
      error.status = 400;
      throw error;
    }
    value.items = value.items.map(row => {
      const orderItemId = Number(row.orderItemId);
      if (!Number.isSafeInteger(orderItemId) || orderItemId <= 0 || orderItemId > 2147483647) {
        const error = new Error('Enter a valid source item id.');
        error.status = 400;
        throw error;
      }
      if (orderItemsUsed.has(orderItemId)) {
        const error = new Error('A PO line can appear only once in a receiving receipt.');
        error.status = 400;
        throw error;
      }
      orderItemsUsed.add(orderItemId);
      if (row.allocations !== undefined && (!Array.isArray(row.allocations) || row.allocations.some(allocation => !allocation || typeof allocation !== 'object' || Array.isArray(allocation)))) {
        const error = new Error('Send allocation rows as objects.');
        error.status = 400;
        throw error;
      }
      const allocations = (row.allocations || []).map(allocation => {
        const entry = { ...allocation, expiryDate: allocation.expiryDate || null, mfgDate: allocation.mfgDate || null };
        for (const key of ['warehouseId', 'locationId']) {
          entry[key] = entry[key] == null ? null : Number(entry[key]);
          if (entry[key] !== null && (!Number.isSafeInteger(entry[key]) || entry[key] <= 0 || entry[key] > 2147483647)) {
            const error = new Error('Enter a valid stock destination id.');
            error.status = 400;
            throw error;
          }
        }
        for (const key of ['imLot', 'qcStatus']) {
          const entered = entry[key] ?? '';
          if (typeof entered !== 'string' || entered.includes('\0')) {
            const error = new Error(`${key} must be text without null characters.`);
            error.status = 400;
            throw error;
          }
          entry[key] = entered.trim();
        }
        for (const [key, places, positive, maximum] of [['quantity', 6, true, 1000000000]]) {
          const entered = entry[key];
          if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
            const error = new Error(`${key} must be a valid decimal number.`);
            error.status = 400;
            throw error;
          }
          const source = String(entered).trim();
          if (!/^\d+(?:\.\d+)?$/.test(source)) {
            const error = new Error(`${key} must be zero or greater.`);
            error.status = 400;
            throw error;
          }
          const [whole, rawFraction = ''] = source.split('.');
          const fraction = rawFraction.replace(/0+$/, '');
          if (fraction.length > places) {
            const error = new Error(`${key} exceeds its supported decimal precision.`);
            error.status = 400;
            throw error;
          }
          const factor = 10n ** BigInt(places);
          const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
          if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
            const error = new Error(`${key} is outside its supported range.`);
            error.status = 400;
            throw error;
          }
          entry[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
        }
        return entry;
      });
      if (allocations.length > 200) {
        const error = new Error('Use no more than 200 allocations per item.');
        error.status = 400;
        throw error;
      }
      const line = { ...row, orderItemId, allocations };
      for (const key of ['unit', 'remarks']) {
        const entered = line[key] ?? '';
        if (typeof entered !== 'string' || entered.includes('\0')) {
          const error = new Error(`${key} must be text without null characters.`);
          error.status = 400;
          throw error;
        }
        line[key] = entered.trim();
      }
      for (const [key, places, positive, maximum] of [['quantity', 6, true, 1000000000]]) {
        const entered = line[key];
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > places) {
          const error = new Error(`${key} exceeds its supported decimal precision.`);
          error.status = 400;
          throw error;
        }
        const factor = 10n ** BigInt(places);
        const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
        if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
          const error = new Error(`${key} is outside its supported range.`);
          error.status = 400;
          throw error;
        }
        line[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
      }
      return line;
    });
    if (!value.items.length || value.items.length > 100) {
      const error = new Error('Use 1-100 receiving lines.');
      error.status = 400;
      throw error;
    }
    const orderData = await request(scope).input('id', sql.Int, value.purchaseOrderId).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
        CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
        o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
        FROM dbo.PurchaseOrders o WITH (UPDLOCK,HOLDLOCK) WHERE o.id=@id ORDER BY o.id DESC;
        SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
        CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
        FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
        OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
        WHERE d.orderId=@id ORDER BY d.orderId,d.position;`);
    const orderRows = new Map(orderData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { orderId, ...item } of orderData.recordsets[1]) orderRows.get(orderId)?.items.push(item);
    const order = [...orderRows.values()][0];
    if (!order) {
      const error = new Error('Purchase Order could not be found.');
      error.status = 404;
      throw error;
    }
    if (!['posted', 'closed'].includes(order.status)) {
      const error = new Error('Load a posted Purchase Order for receiving.');
      error.status = 409;
      throw error;
    }
    const orderItems = new Map(order.items.map(item => [item.id, item]));
    const snapshots = [];
    for (const item of value.items) {
      const source = orderItems.get(item.orderItemId);
      if (!source) {
        const error = new Error('Receiving items must belong to the selected Purchase Order.');
        error.status = 400;
        throw error;
      }
      if (item.unit && item.unit !== source.unit) {
        const error = new Error('Receiving UOM must match its Purchase Order.');
        error.status = 400;
        throw error;
      }
      const balances = { ordered: source.quantity, received: source.receivedQuantity, quantity: item.quantity };
      for (const [key, entered] of Object.entries(balances)) {
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > 6) {
          const error = new Error(`${key} exceeds six decimal places.`);
          error.status = 400;
          throw error;
        }
        const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
        if (units > 1000000000n * 1000000n) {
          const error = new Error(`${key} is too large.`);
          error.status = 400;
          throw error;
        }
        balances[key] = units;
      }
      const available = balances.ordered - balances.received;
      if (balances.quantity > available) {
        const error = new Error('Receiving quantity exceeds the open Purchase Order balance.');
        error.status = 409;
        throw error;
      }
      for (const allocation of item.allocations) {
        if (allocation.warehouseId) {
          const warehouse = await request(scope).input('id', sql.Int, allocation.warehouseId).query('SELECT id FROM dbo.ConfigWarehouses WHERE id=@id AND isActive=1');
          if (!warehouse.recordset.length) {
            const error = new Error('Select active configured Warehouses and Locations.');
            error.status = 400;
            throw error;
          }
        }
        if (allocation.locationId) {
          const location = await request(scope).input('id', sql.Int, allocation.locationId).query('SELECT id FROM dbo.ConfigLocations WHERE id=@id AND isActive=1');
          if (!location.recordset.length) {
            const error = new Error('Select active configured Warehouses and Locations.');
            error.status = 400;
            throw error;
          }
        }
      }
      snapshots.push({ ...item, unitPrice: source.unitPrice, discountRate: source.discountRate });
    }
    const { vatRate = 0, vatInclusive = false, decimalInPrice = 6, decimalInTotalPrice = 2 } = order;
    if (!Number.isInteger(decimalInPrice) || decimalInPrice < 0 || decimalInPrice > 6 || !Number.isInteger(decimalInTotalPrice) || decimalInTotalPrice < 0 || decimalInTotalPrice > 6) {
      const error = new Error('Supplier price precision is outside the supported range.');
      error.status = 400;
      throw error;
    }
    const totalFactor = 10n ** BigInt(decimalInTotalPrice);
    const vatUnits = { rate: vatRate };
    for (const [key, entered] of Object.entries(vatUnits)) {
      if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
        const error = new Error(`${key} must be a valid decimal number.`);
        error.status = 400;
        throw error;
      }
      const source = String(entered).trim();
      if (!/^\d+(?:\.\d+)?$/.test(source)) {
        const error = new Error(`${key} must be zero or greater.`);
        error.status = 400;
        throw error;
      }
      const [whole, rawFraction = ''] = source.split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > 6) {
        const error = new Error(`${key} exceeds six decimal places.`);
        error.status = 400;
        throw error;
      }
      const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
      if (units > 100n * 1000000n) {
        const error = new Error(`${key} is too large.`);
        error.status = 400;
        throw error;
      }
      vatUnits[key] = units;
    }
    const taxRateUnits = vatUnits.rate;
    const percentages = 100000000n;
    const totals = { items: [], grossAmount: 0n, discountAmount: 0n, netAmount: 0n, vatAmount: 0n, amount: 0n };
    for (const item of snapshots) {
      const lineUnits = { quantity: item.quantity, unitPrice: item.unitPrice, discountRate: item.discountRate ?? 0 };
      for (const [key, entered] of Object.entries(lineUnits)) {
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > 6) {
          const error = new Error(`${key} exceeds six decimal places.`);
          error.status = 400;
          throw error;
        }
        const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
        if (units > 1000000000n * 1000000n) {
          const error = new Error(`${key} is too large.`);
          error.status = 400;
          throw error;
        }
        lineUnits[key] = units;
      }
      const quantity = lineUnits.quantity;
      if (!quantity) {
        const error = new Error('Quantity must be greater than zero.');
        error.status = 400;
        throw error;
      }
      const step = 10n ** BigInt(6 - decimalInPrice);
      const price = ((lineUnits.unitPrice + step / 2n) / step) * step;
      const discount = lineUnits.discountRate;
      if (discount > percentages) {
        const error = new Error('Discount rate is too large.');
        error.status = 400;
        throw error;
      }
      const grossAmount = (quantity * price * totalFactor + 500000000000n) / 1000000000000n;
      const discountAmount = (grossAmount * discount + percentages / 2n) / percentages;
      const afterDiscount = grossAmount - discountAmount;
      const vatAmount = vatInclusive ? (afterDiscount * taxRateUnits + (percentages + taxRateUnits) / 2n) / (percentages + taxRateUnits) : (afterDiscount * taxRateUnits + percentages / 2n) / percentages;
      const netAmount = vatInclusive ? afterDiscount - vatAmount : afterDiscount;
      const values = { grossAmount, discountAmount, netAmount, vatAmount, amount: netAmount + vatAmount };
      const calculated = { ...item, quantity: `${quantity / 1000000n}.${String(quantity % 1000000n).padStart(6, '0')}`, unitPrice: `${price / 1000000n}.${String(price % 1000000n).padStart(6, '0')}`, discountRate: `${discount / 1000000n}.${String(discount % 1000000n).padStart(6, '0')}`, vatRate: `${taxRateUnits / 1000000n}.${String(taxRateUnits % 1000000n).padStart(6, '0')}` };
      for (const [key, amount] of Object.entries(values)) {
        totals[key] += amount;
        if (totals[key] > 1000000000000n * totalFactor) {
          const error = new Error('The document total exceeds the supported amount.');
          error.status = 400;
          throw error;
        }
        calculated[key] = `${amount / totalFactor}${decimalInTotalPrice ? '.' + String(amount % totalFactor).padStart(decimalInTotalPrice, '0') : ''}`;
      }
      totals.items.push(calculated);
    }
    for (const key of ['grossAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount']) totals[key] = `${totals[key] / totalFactor}${decimalInTotalPrice ? '.' + String(totals[key] % totalFactor).padStart(decimalInTotalPrice, '0') : ''}`;

    const req = request(scope);
    req.input('grossAmount', sql.VarChar(sql.MAX), totals.grossAmount);
    req.input('discountAmount', sql.VarChar(sql.MAX), totals.discountAmount);
    req.input('netAmount', sql.VarChar(sql.MAX), totals.netAmount);
    req.input('vatAmount', sql.VarChar(sql.MAX), totals.vatAmount);
    req.input('amount', sql.VarChar(sql.MAX), totals.amount);
    req.input('purchaseOrderId', sql.Int, order.id).input('srrDate', sql.VarChar(sql.MAX), value.srrDate)
      .input('drNumber', sql.NVarChar(sql.MAX), value.drNumber).input('pezaReference', sql.NVarChar(sql.MAX), value.pezaReference).input('invoiceNumber', sql.NVarChar(sql.MAX), value.invoiceNumber)
      .input('invoiceDate', sql.VarChar(sql.MAX), value.invoiceDate).input('rate', sql.VarChar(sql.MAX), value.rate || order.rate).input('remarks', sql.NVarChar(sql.MAX), value.remarks);
    let saved;
    const result = await req.input('receivedById', sql.Int, user.id).input('receivedBy', sql.NVarChar(sql.MAX), user.name)
      .query(`INSERT INTO dbo.SuppliesReceipts(purchaseOrderId,srrDate,drNumber,pezaReference,invoiceNumber,invoiceDate,rate,remarks,grossAmount,discountAmount,netAmount,vatAmount,amount,receivedById,receivedBy) OUTPUT INSERTED.id VALUES(@purchaseOrderId,@srrDate,@drNumber,@pezaReference,@invoiceNumber,@invoiceDate,@rate,@remarks,@grossAmount,@discountAmount,@netAmount,@vatAmount,@amount,@receivedById,@receivedBy)`);
    saved = result.recordset[0].id;
    for (const [position, item] of totals.items.entries()) {
      const lineWrite = request(scope);
      lineWrite.input('grossAmount', sql.VarChar(sql.MAX), item.grossAmount);
    lineWrite.input('discountAmount', sql.VarChar(sql.MAX), item.discountAmount);
    lineWrite.input('netAmount', sql.VarChar(sql.MAX), item.netAmount);
    lineWrite.input('vatAmount', sql.VarChar(sql.MAX), item.vatAmount);
    lineWrite.input('amount', sql.VarChar(sql.MAX), item.amount);
      const inserted = await lineWrite.input('id', sql.Int, saved).input('position', sql.Int, position).input('orderItemId', sql.Int, item.orderItemId)
        .input('quantity', sql.VarChar(sql.MAX), item.quantity).input('remarks', sql.NVarChar(sql.MAX), item.remarks)
        .query(`INSERT INTO dbo.SuppliesReceiptItems(receiptId,position,orderItemId,quantity,remarks,grossAmount,discountAmount,netAmount,vatAmount,amount) OUTPUT INSERTED.id
          VALUES(@id,@position,@orderItemId,@quantity,@remarks,@grossAmount,@discountAmount,@netAmount,@vatAmount,@amount)`);
      const itemId = inserted.recordset[0].id;
      for (const [allocationPosition, allocation] of item.allocations.entries()) {
        await request(scope).input('id', sql.Int, itemId).input('position', sql.Int, allocationPosition).input('quantity', sql.VarChar(sql.MAX), allocation.quantity)
          .input('expiryDate', sql.VarChar(sql.MAX), allocation.expiryDate).input('mfgDate', sql.VarChar(sql.MAX), allocation.mfgDate).input('imLot', sql.NVarChar(sql.MAX), allocation.imLot)
          .input('qcStatus', sql.NVarChar(sql.MAX), allocation.qcStatus).input('warehouseId', sql.Int, allocation.warehouseId).input('locationId', sql.Int, allocation.locationId)
          .query(`INSERT INTO dbo.SuppliesReceiptAllocations(receiptItemId,position,quantity,expiryDate,mfgDate,imLot,qcStatus,warehouseId,locationId)
            VALUES(@id,@position,@quantity,@expiryDate,@mfgDate,@imLot,@qcStatus,@warehouseId,@locationId)`);
      }
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'receivings')
      .input('action', sql.NVarChar(sql.MAX), 'create-draft').input('recordId', sql.NVarChar(sql.MAX), String(saved))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedRecordData = await request(scope).input('id', sql.Int, saved).query(`SELECT r.id,r.number,r.purchaseOrderId,o.number AS purchaseOrderNumber,o.branch,o.supplierId,o.supplierName,o.supplierAddress,
        CONVERT(varchar(10),r.srrDate,23) AS srrDate,r.drNumber,r.pezaReference,r.invoiceNumber,CONVERT(varchar(10),r.invoiceDate,23) AS invoiceDate,
        o.currency,CONVERT(varchar(60),r.rate) AS rate,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        r.remarks,CONVERT(varchar(60),r.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),r.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),r.[netAmount]) AS [netAmount],CONVERT(varchar(60),r.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),r.[amount]) AS [amount],r.receivedById,r.receivedBy,r.status,r.postedAt
        FROM dbo.SuppliesReceipts r  JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.receiptId,d.position,d.orderItemId,o.suppliesId,o.suppliesCode,o.suppliesName,o.description,o.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),o.unitPrice) AS unitPrice,o.currency,
        CONVERT(varchar(60),o.discountRate) AS discountRate,CONVERT(varchar(60),o.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),o.quantity) AS orderQuantity,CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,
        CONVERT(varchar(60),o.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS orderBalanceQuantity,
        CONVERT(varchar(60),COALESCE(l.allocatedQuantity,0)) AS allocatedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(l.allocatedQuantity,0) AS decimal(28,6))) AS allocationBalanceQuantity
        FROM dbo.SuppliesReceiptItems d JOIN dbo.PurchaseOrderItems o ON o.id=d.orderItemId
        OUTER APPLY(SELECT SUM(x.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems x JOIN dbo.SuppliesReceipts h ON h.id=x.receiptId WHERE x.orderItemId=o.id AND h.status='posted') a
        OUTER APPLY(SELECT SUM(x.quantity) AS allocatedQuantity FROM dbo.SuppliesReceiptAllocations x WHERE x.receiptItemId=d.id) l
        WHERE d.receiptId=@id ORDER BY d.receiptId,d.position;
        SELECT a.id,a.receiptItemId,a.position,CONVERT(varchar(60),a.quantity) AS quantity,CONVERT(varchar(10),a.expiryDate,23) AS expiryDate,
        CONVERT(varchar(10),a.mfgDate,23) AS mfgDate,a.imLot,a.qcStatus,a.warehouseId,a.locationId,w.code AS warehouseCode,l.code AS locationCode
        FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems d ON d.id=a.receiptItemId
        LEFT JOIN dbo.ConfigWarehouses w ON w.id=a.warehouseId LEFT JOIN dbo.ConfigLocations l ON l.id=a.locationId
        WHERE d.receiptId=@id ORDER BY a.receiptItemId,a.position;`);
    const savedRecordRows = new Map(savedRecordData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    const savedRecordItems = new Map();
    for (const { receiptId, ...row } of savedRecordData.recordsets[1]) {
      const item = { ...row, allocations: [] };
      savedRecordItems.set(row.id, item);
      savedRecordRows.get(receiptId)?.items.push(item);
    }
    for (const { receiptItemId, ...allocation } of savedRecordData.recordsets[2]) savedRecordItems.get(receiptItemId)?.allocations.push(allocation);
    const savedRecord = [...savedRecordRows.values()][0];
    if (!savedRecord) {
      const error = new Error('Receiving receipt could not be found.');
      error.status = 404;
      throw error;
    }
    return savedRecord;
  });
  res.status(201).json({ record });
});

router.put('/receivings/:id', async (req, res) => {
  if (!req.get('content-type')?.toLowerCase().startsWith('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Send a JSON object.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const record = await transaction(async scope => {
    const currentData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.purchaseOrderId,o.number AS purchaseOrderNumber,o.branch,o.supplierId,o.supplierName,o.supplierAddress,
        CONVERT(varchar(10),r.srrDate,23) AS srrDate,r.drNumber,r.pezaReference,r.invoiceNumber,CONVERT(varchar(10),r.invoiceDate,23) AS invoiceDate,
        o.currency,CONVERT(varchar(60),r.rate) AS rate,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        r.remarks,CONVERT(varchar(60),r.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),r.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),r.[netAmount]) AS [netAmount],CONVERT(varchar(60),r.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),r.[amount]) AS [amount],r.receivedById,r.receivedBy,r.status,r.postedAt
        FROM dbo.SuppliesReceipts r WITH (UPDLOCK,HOLDLOCK) JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.receiptId,d.position,d.orderItemId,o.suppliesId,o.suppliesCode,o.suppliesName,o.description,o.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),o.unitPrice) AS unitPrice,o.currency,
        CONVERT(varchar(60),o.discountRate) AS discountRate,CONVERT(varchar(60),o.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),o.quantity) AS orderQuantity,CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,
        CONVERT(varchar(60),o.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS orderBalanceQuantity,
        CONVERT(varchar(60),COALESCE(l.allocatedQuantity,0)) AS allocatedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(l.allocatedQuantity,0) AS decimal(28,6))) AS allocationBalanceQuantity
        FROM dbo.SuppliesReceiptItems d JOIN dbo.PurchaseOrderItems o ON o.id=d.orderItemId
        OUTER APPLY(SELECT SUM(x.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems x JOIN dbo.SuppliesReceipts h ON h.id=x.receiptId WHERE x.orderItemId=o.id AND h.status='posted') a
        OUTER APPLY(SELECT SUM(x.quantity) AS allocatedQuantity FROM dbo.SuppliesReceiptAllocations x WHERE x.receiptItemId=d.id) l
        WHERE d.receiptId=@id ORDER BY d.receiptId,d.position;
        SELECT a.id,a.receiptItemId,a.position,CONVERT(varchar(60),a.quantity) AS quantity,CONVERT(varchar(10),a.expiryDate,23) AS expiryDate,
        CONVERT(varchar(10),a.mfgDate,23) AS mfgDate,a.imLot,a.qcStatus,a.warehouseId,a.locationId,w.code AS warehouseCode,l.code AS locationCode
        FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems d ON d.id=a.receiptItemId
        LEFT JOIN dbo.ConfigWarehouses w ON w.id=a.warehouseId LEFT JOIN dbo.ConfigLocations l ON l.id=a.locationId
        WHERE d.receiptId=@id ORDER BY a.receiptItemId,a.position;`);
    const currentRows = new Map(currentData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    const currentItems = new Map();
    for (const { receiptId, ...row } of currentData.recordsets[1]) {
      const item = { ...row, allocations: [] };
      currentItems.set(row.id, item);
      currentRows.get(receiptId)?.items.push(item);
    }
    for (const { receiptItemId, ...allocation } of currentData.recordsets[2]) currentItems.get(receiptItemId)?.allocations.push(allocation);
    const current = [...currentRows.values()][0];
    if (!current) {
      const error = new Error('Receiving receipt could not be found.');
      error.status = 404;
      throw error;
    }
    if (current && current.status !== 'draft') {
      const error = new Error('Only an unposted receiving receipt can be edited.');
      error.status = 409;
      throw error;
    }
    const value = { ...current, ...input };
    value.purchaseOrderId = Number(value.purchaseOrderId);
    if (!Number.isSafeInteger(value.purchaseOrderId) || value.purchaseOrderId <= 0 || value.purchaseOrderId > 2147483647) {
      const error = new Error('Enter a valid id.');
      error.status = 400;
      throw error;
    }
    for (const key of ['drNumber', 'pezaReference', 'invoiceNumber', 'remarks']) {
      const entered = value[key] ?? '';
      if (typeof entered !== 'string' || entered.includes('\0')) {
        const error = new Error(`${key} must be text without null characters.`);
        error.status = 400;
        throw error;
      }
      value[key] = entered.trim();
    }
    value.invoiceDate = value.invoiceDate || null;
    if (value.rate !== undefined) {
      for (const [key, places, positive, maximum] of [['rate', 5, true, 1000000000]]) {
        const entered = value[key];
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > places) {
          const error = new Error(`${key} exceeds its supported decimal precision.`);
          error.status = 400;
          throw error;
        }
        const factor = 10n ** BigInt(places);
        const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
        if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
          const error = new Error(`${key} is outside its supported range.`);
          error.status = 400;
          throw error;
        }
        value[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
      }
    }
    const orderItemsUsed = new Set();
    if (!Array.isArray(value.items) || value.items.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      const error = new Error('Send item rows as objects.');
      error.status = 400;
      throw error;
    }
    value.items = value.items.map(row => {
      const orderItemId = Number(row.orderItemId);
      if (!Number.isSafeInteger(orderItemId) || orderItemId <= 0 || orderItemId > 2147483647) {
        const error = new Error('Enter a valid source item id.');
        error.status = 400;
        throw error;
      }
      if (orderItemsUsed.has(orderItemId)) {
        const error = new Error('A PO line can appear only once in a receiving receipt.');
        error.status = 400;
        throw error;
      }
      orderItemsUsed.add(orderItemId);
      if (row.allocations !== undefined && (!Array.isArray(row.allocations) || row.allocations.some(allocation => !allocation || typeof allocation !== 'object' || Array.isArray(allocation)))) {
        const error = new Error('Send allocation rows as objects.');
        error.status = 400;
        throw error;
      }
      const allocations = (row.allocations || []).map(allocation => {
        const entry = { ...allocation, expiryDate: allocation.expiryDate || null, mfgDate: allocation.mfgDate || null };
        for (const key of ['warehouseId', 'locationId']) {
          entry[key] = entry[key] == null ? null : Number(entry[key]);
          if (entry[key] !== null && (!Number.isSafeInteger(entry[key]) || entry[key] <= 0 || entry[key] > 2147483647)) {
            const error = new Error('Enter a valid stock destination id.');
            error.status = 400;
            throw error;
          }
        }
        for (const key of ['imLot', 'qcStatus']) {
          const entered = entry[key] ?? '';
          if (typeof entered !== 'string' || entered.includes('\0')) {
            const error = new Error(`${key} must be text without null characters.`);
            error.status = 400;
            throw error;
          }
          entry[key] = entered.trim();
        }
        for (const [key, places, positive, maximum] of [['quantity', 6, true, 1000000000]]) {
          const entered = entry[key];
          if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
            const error = new Error(`${key} must be a valid decimal number.`);
            error.status = 400;
            throw error;
          }
          const source = String(entered).trim();
          if (!/^\d+(?:\.\d+)?$/.test(source)) {
            const error = new Error(`${key} must be zero or greater.`);
            error.status = 400;
            throw error;
          }
          const [whole, rawFraction = ''] = source.split('.');
          const fraction = rawFraction.replace(/0+$/, '');
          if (fraction.length > places) {
            const error = new Error(`${key} exceeds its supported decimal precision.`);
            error.status = 400;
            throw error;
          }
          const factor = 10n ** BigInt(places);
          const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
          if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
            const error = new Error(`${key} is outside its supported range.`);
            error.status = 400;
            throw error;
          }
          entry[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
        }
        return entry;
      });
      if (allocations.length > 200) {
        const error = new Error('Use no more than 200 allocations per item.');
        error.status = 400;
        throw error;
      }
      const line = { ...row, orderItemId, allocations };
      for (const key of ['unit', 'remarks']) {
        const entered = line[key] ?? '';
        if (typeof entered !== 'string' || entered.includes('\0')) {
          const error = new Error(`${key} must be text without null characters.`);
          error.status = 400;
          throw error;
        }
        line[key] = entered.trim();
      }
      for (const [key, places, positive, maximum] of [['quantity', 6, true, 1000000000]]) {
        const entered = line[key];
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > places) {
          const error = new Error(`${key} exceeds its supported decimal precision.`);
          error.status = 400;
          throw error;
        }
        const factor = 10n ** BigInt(places);
        const units = BigInt(whole) * factor + BigInt(fraction.padEnd(places, '0') || '0');
        if (units > BigInt(maximum) * factor || (positive && units === 0n)) {
          const error = new Error(`${key} is outside its supported range.`);
          error.status = 400;
          throw error;
        }
        line[key] = `${units / factor}${places ? '.' + String(units % factor).padStart(places, '0') : ''}`;
      }
      return line;
    });
    if (!value.items.length || value.items.length > 100) {
      const error = new Error('Use 1-100 receiving lines.');
      error.status = 400;
      throw error;
    }
    const orderData = await request(scope).input('id', sql.Int, value.purchaseOrderId).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
        CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
        o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
        FROM dbo.PurchaseOrders o WITH (UPDLOCK,HOLDLOCK) WHERE o.id=@id ORDER BY o.id DESC;
        SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
        CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
        FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
        OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
        WHERE d.orderId=@id ORDER BY d.orderId,d.position;`);
    const orderRows = new Map(orderData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { orderId, ...item } of orderData.recordsets[1]) orderRows.get(orderId)?.items.push(item);
    const order = [...orderRows.values()][0];
    if (!order) {
      const error = new Error('Purchase Order could not be found.');
      error.status = 404;
      throw error;
    }
    if (!['posted', 'closed'].includes(order.status)) {
      const error = new Error('Load a posted Purchase Order for receiving.');
      error.status = 409;
      throw error;
    }
    const orderItems = new Map(order.items.map(item => [item.id, item]));
    const snapshots = [];
    for (const item of value.items) {
      const source = orderItems.get(item.orderItemId);
      if (!source) {
        const error = new Error('Receiving items must belong to the selected Purchase Order.');
        error.status = 400;
        throw error;
      }
      if (item.unit && item.unit !== source.unit) {
        const error = new Error('Receiving UOM must match its Purchase Order.');
        error.status = 400;
        throw error;
      }
      const balances = { ordered: source.quantity, received: source.receivedQuantity, quantity: item.quantity };
      for (const [key, entered] of Object.entries(balances)) {
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > 6) {
          const error = new Error(`${key} exceeds six decimal places.`);
          error.status = 400;
          throw error;
        }
        const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
        if (units > 1000000000n * 1000000n) {
          const error = new Error(`${key} is too large.`);
          error.status = 400;
          throw error;
        }
        balances[key] = units;
      }
      const available = balances.ordered - balances.received;
      if (balances.quantity > available) {
        const error = new Error('Receiving quantity exceeds the open Purchase Order balance.');
        error.status = 409;
        throw error;
      }
      for (const allocation of item.allocations) {
        if (allocation.warehouseId) {
          const warehouse = await request(scope).input('id', sql.Int, allocation.warehouseId).query('SELECT id FROM dbo.ConfigWarehouses WHERE id=@id AND isActive=1');
          if (!warehouse.recordset.length) {
            const error = new Error('Select active configured Warehouses and Locations.');
            error.status = 400;
            throw error;
          }
        }
        if (allocation.locationId) {
          const location = await request(scope).input('id', sql.Int, allocation.locationId).query('SELECT id FROM dbo.ConfigLocations WHERE id=@id AND isActive=1');
          if (!location.recordset.length) {
            const error = new Error('Select active configured Warehouses and Locations.');
            error.status = 400;
            throw error;
          }
        }
      }
      snapshots.push({ ...item, unitPrice: source.unitPrice, discountRate: source.discountRate });
    }
    const { vatRate = 0, vatInclusive = false, decimalInPrice = 6, decimalInTotalPrice = 2 } = order;
    if (!Number.isInteger(decimalInPrice) || decimalInPrice < 0 || decimalInPrice > 6 || !Number.isInteger(decimalInTotalPrice) || decimalInTotalPrice < 0 || decimalInTotalPrice > 6) {
      const error = new Error('Supplier price precision is outside the supported range.');
      error.status = 400;
      throw error;
    }
    const totalFactor = 10n ** BigInt(decimalInTotalPrice);
    const vatUnits = { rate: vatRate };
    for (const [key, entered] of Object.entries(vatUnits)) {
      if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
        const error = new Error(`${key} must be a valid decimal number.`);
        error.status = 400;
        throw error;
      }
      const source = String(entered).trim();
      if (!/^\d+(?:\.\d+)?$/.test(source)) {
        const error = new Error(`${key} must be zero or greater.`);
        error.status = 400;
        throw error;
      }
      const [whole, rawFraction = ''] = source.split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > 6) {
        const error = new Error(`${key} exceeds six decimal places.`);
        error.status = 400;
        throw error;
      }
      const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
      if (units > 100n * 1000000n) {
        const error = new Error(`${key} is too large.`);
        error.status = 400;
        throw error;
      }
      vatUnits[key] = units;
    }
    const taxRateUnits = vatUnits.rate;
    const percentages = 100000000n;
    const totals = { items: [], grossAmount: 0n, discountAmount: 0n, netAmount: 0n, vatAmount: 0n, amount: 0n };
    for (const item of snapshots) {
      const lineUnits = { quantity: item.quantity, unitPrice: item.unitPrice, discountRate: item.discountRate ?? 0 };
      for (const [key, entered] of Object.entries(lineUnits)) {
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > 6) {
          const error = new Error(`${key} exceeds six decimal places.`);
          error.status = 400;
          throw error;
        }
        const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
        if (units > 1000000000n * 1000000n) {
          const error = new Error(`${key} is too large.`);
          error.status = 400;
          throw error;
        }
        lineUnits[key] = units;
      }
      const quantity = lineUnits.quantity;
      if (!quantity) {
        const error = new Error('Quantity must be greater than zero.');
        error.status = 400;
        throw error;
      }
      const step = 10n ** BigInt(6 - decimalInPrice);
      const price = ((lineUnits.unitPrice + step / 2n) / step) * step;
      const discount = lineUnits.discountRate;
      if (discount > percentages) {
        const error = new Error('Discount rate is too large.');
        error.status = 400;
        throw error;
      }
      const grossAmount = (quantity * price * totalFactor + 500000000000n) / 1000000000000n;
      const discountAmount = (grossAmount * discount + percentages / 2n) / percentages;
      const afterDiscount = grossAmount - discountAmount;
      const vatAmount = vatInclusive ? (afterDiscount * taxRateUnits + (percentages + taxRateUnits) / 2n) / (percentages + taxRateUnits) : (afterDiscount * taxRateUnits + percentages / 2n) / percentages;
      const netAmount = vatInclusive ? afterDiscount - vatAmount : afterDiscount;
      const values = { grossAmount, discountAmount, netAmount, vatAmount, amount: netAmount + vatAmount };
      const calculated = { ...item, quantity: `${quantity / 1000000n}.${String(quantity % 1000000n).padStart(6, '0')}`, unitPrice: `${price / 1000000n}.${String(price % 1000000n).padStart(6, '0')}`, discountRate: `${discount / 1000000n}.${String(discount % 1000000n).padStart(6, '0')}`, vatRate: `${taxRateUnits / 1000000n}.${String(taxRateUnits % 1000000n).padStart(6, '0')}` };
      for (const [key, amount] of Object.entries(values)) {
        totals[key] += amount;
        if (totals[key] > 1000000000000n * totalFactor) {
          const error = new Error('The document total exceeds the supported amount.');
          error.status = 400;
          throw error;
        }
        calculated[key] = `${amount / totalFactor}${decimalInTotalPrice ? '.' + String(amount % totalFactor).padStart(decimalInTotalPrice, '0') : ''}`;
      }
      totals.items.push(calculated);
    }
    for (const key of ['grossAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount']) totals[key] = `${totals[key] / totalFactor}${decimalInTotalPrice ? '.' + String(totals[key] % totalFactor).padStart(decimalInTotalPrice, '0') : ''}`;

    const req = request(scope);
    req.input('grossAmount', sql.VarChar(sql.MAX), totals.grossAmount);
    req.input('discountAmount', sql.VarChar(sql.MAX), totals.discountAmount);
    req.input('netAmount', sql.VarChar(sql.MAX), totals.netAmount);
    req.input('vatAmount', sql.VarChar(sql.MAX), totals.vatAmount);
    req.input('amount', sql.VarChar(sql.MAX), totals.amount);
    req.input('purchaseOrderId', sql.Int, order.id).input('srrDate', sql.VarChar(sql.MAX), value.srrDate)
      .input('drNumber', sql.NVarChar(sql.MAX), value.drNumber).input('pezaReference', sql.NVarChar(sql.MAX), value.pezaReference).input('invoiceNumber', sql.NVarChar(sql.MAX), value.invoiceNumber)
      .input('invoiceDate', sql.VarChar(sql.MAX), value.invoiceDate).input('rate', sql.VarChar(sql.MAX), value.rate || order.rate).input('remarks', sql.NVarChar(sql.MAX), value.remarks);
    const saved = id;
    await req.input('id', sql.Int, id).query(`UPDATE dbo.SuppliesReceipts SET [purchaseOrderId]=@purchaseOrderId,[srrDate]=@srrDate,[drNumber]=@drNumber,[pezaReference]=@pezaReference,[invoiceNumber]=@invoiceNumber,[invoiceDate]=@invoiceDate,[rate]=@rate,[remarks]=@remarks,[grossAmount]=@grossAmount,[discountAmount]=@discountAmount,[netAmount]=@netAmount,[vatAmount]=@vatAmount,[amount]=@amount,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    await request(scope).input('id', sql.Int, id).query('DELETE a FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems i ON i.id=a.receiptItemId WHERE i.receiptId=@id; DELETE FROM dbo.SuppliesReceiptItems WHERE receiptId=@id;');
    for (const [position, item] of totals.items.entries()) {
      const lineWrite = request(scope);
      lineWrite.input('grossAmount', sql.VarChar(sql.MAX), item.grossAmount);
    lineWrite.input('discountAmount', sql.VarChar(sql.MAX), item.discountAmount);
    lineWrite.input('netAmount', sql.VarChar(sql.MAX), item.netAmount);
    lineWrite.input('vatAmount', sql.VarChar(sql.MAX), item.vatAmount);
    lineWrite.input('amount', sql.VarChar(sql.MAX), item.amount);
      const inserted = await lineWrite.input('id', sql.Int, saved).input('position', sql.Int, position).input('orderItemId', sql.Int, item.orderItemId)
        .input('quantity', sql.VarChar(sql.MAX), item.quantity).input('remarks', sql.NVarChar(sql.MAX), item.remarks)
        .query(`INSERT INTO dbo.SuppliesReceiptItems(receiptId,position,orderItemId,quantity,remarks,grossAmount,discountAmount,netAmount,vatAmount,amount) OUTPUT INSERTED.id
          VALUES(@id,@position,@orderItemId,@quantity,@remarks,@grossAmount,@discountAmount,@netAmount,@vatAmount,@amount)`);
      const itemId = inserted.recordset[0].id;
      for (const [allocationPosition, allocation] of item.allocations.entries()) {
        await request(scope).input('id', sql.Int, itemId).input('position', sql.Int, allocationPosition).input('quantity', sql.VarChar(sql.MAX), allocation.quantity)
          .input('expiryDate', sql.VarChar(sql.MAX), allocation.expiryDate).input('mfgDate', sql.VarChar(sql.MAX), allocation.mfgDate).input('imLot', sql.NVarChar(sql.MAX), allocation.imLot)
          .input('qcStatus', sql.NVarChar(sql.MAX), allocation.qcStatus).input('warehouseId', sql.Int, allocation.warehouseId).input('locationId', sql.Int, allocation.locationId)
          .query(`INSERT INTO dbo.SuppliesReceiptAllocations(receiptItemId,position,quantity,expiryDate,mfgDate,imLot,qcStatus,warehouseId,locationId)
            VALUES(@id,@position,@quantity,@expiryDate,@mfgDate,@imLot,@qcStatus,@warehouseId,@locationId)`);
      }
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'receivings')
      .input('action', sql.NVarChar(sql.MAX), 'update-draft').input('recordId', sql.NVarChar(sql.MAX), String(saved))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedRecordData = await request(scope).input('id', sql.Int, saved).query(`SELECT r.id,r.number,r.purchaseOrderId,o.number AS purchaseOrderNumber,o.branch,o.supplierId,o.supplierName,o.supplierAddress,
        CONVERT(varchar(10),r.srrDate,23) AS srrDate,r.drNumber,r.pezaReference,r.invoiceNumber,CONVERT(varchar(10),r.invoiceDate,23) AS invoiceDate,
        o.currency,CONVERT(varchar(60),r.rate) AS rate,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        r.remarks,CONVERT(varchar(60),r.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),r.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),r.[netAmount]) AS [netAmount],CONVERT(varchar(60),r.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),r.[amount]) AS [amount],r.receivedById,r.receivedBy,r.status,r.postedAt
        FROM dbo.SuppliesReceipts r  JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.receiptId,d.position,d.orderItemId,o.suppliesId,o.suppliesCode,o.suppliesName,o.description,o.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),o.unitPrice) AS unitPrice,o.currency,
        CONVERT(varchar(60),o.discountRate) AS discountRate,CONVERT(varchar(60),o.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),o.quantity) AS orderQuantity,CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,
        CONVERT(varchar(60),o.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS orderBalanceQuantity,
        CONVERT(varchar(60),COALESCE(l.allocatedQuantity,0)) AS allocatedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(l.allocatedQuantity,0) AS decimal(28,6))) AS allocationBalanceQuantity
        FROM dbo.SuppliesReceiptItems d JOIN dbo.PurchaseOrderItems o ON o.id=d.orderItemId
        OUTER APPLY(SELECT SUM(x.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems x JOIN dbo.SuppliesReceipts h ON h.id=x.receiptId WHERE x.orderItemId=o.id AND h.status='posted') a
        OUTER APPLY(SELECT SUM(x.quantity) AS allocatedQuantity FROM dbo.SuppliesReceiptAllocations x WHERE x.receiptItemId=d.id) l
        WHERE d.receiptId=@id ORDER BY d.receiptId,d.position;
        SELECT a.id,a.receiptItemId,a.position,CONVERT(varchar(60),a.quantity) AS quantity,CONVERT(varchar(10),a.expiryDate,23) AS expiryDate,
        CONVERT(varchar(10),a.mfgDate,23) AS mfgDate,a.imLot,a.qcStatus,a.warehouseId,a.locationId,w.code AS warehouseCode,l.code AS locationCode
        FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems d ON d.id=a.receiptItemId
        LEFT JOIN dbo.ConfigWarehouses w ON w.id=a.warehouseId LEFT JOIN dbo.ConfigLocations l ON l.id=a.locationId
        WHERE d.receiptId=@id ORDER BY a.receiptItemId,a.position;`);
    const savedRecordRows = new Map(savedRecordData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    const savedRecordItems = new Map();
    for (const { receiptId, ...row } of savedRecordData.recordsets[1]) {
      const item = { ...row, allocations: [] };
      savedRecordItems.set(row.id, item);
      savedRecordRows.get(receiptId)?.items.push(item);
    }
    for (const { receiptItemId, ...allocation } of savedRecordData.recordsets[2]) savedRecordItems.get(receiptItemId)?.allocations.push(allocation);
    const savedRecord = [...savedRecordRows.values()][0];
    if (!savedRecord) {
      const error = new Error('Receiving receipt could not be found.');
      error.status = 404;
      throw error;
    }
    return savedRecord;
  });
  res.json({ record });
});

router.post('/purchase-requests/:id/post', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const record = await transaction(async scope => {
    const valueData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.branch,CONVERT(varchar(10),r.prDate,23) AS prDate,CONVERT(varchar(10),r.neededDate,23) AS neededDate,
        r.requestedBy,r.requestedDept,r.checkedBy,r.approvedBy,r.approvedBy2,r.remarks,r.preparedById,r.preparedBy,r.status,r.postedAt
        FROM dbo.PurchaseRequests r WITH (UPDLOCK,HOLDLOCK) WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.requestId,d.position,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,CONVERT(varchar(60),d.quantity) AS quantity,d.unit,
        CONVERT(varchar(10),d.neededDate,23) AS neededDate,d.remarks,CONVERT(varchar(60),COALESCE(a.orderedQuantity,0)) AS orderedQuantity,
        CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.orderedQuantity,0) AS decimal(28,6))) AS balanceQuantity,a.purchaseOrderNumbers
        FROM dbo.PurchaseRequestItems d OUTER APPLY (
          SELECT SUM(i.quantity) AS orderedQuantity,STRING_AGG(CONVERT(nvarchar(max),o.number),N', ') AS purchaseOrderNumbers
          FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseOrders o ON o.id=i.orderId
          WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')
        ) a WHERE d.requestId=@id ORDER BY d.requestId,d.position;`);
    const valueRows = new Map(valueData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { requestId, ...item } of valueData.recordsets[1]) valueRows.get(requestId)?.items.push(item);
    const value = [...valueRows.values()][0];
    if (!value) {
      const error = new Error('Purchase Request could not be found.');
      error.status = 404;
      throw error;
    }
    if (['posted', 'closed'].includes(value.status)) return value;
    if (value.status !== 'draft' || !value.items.length) {
      const error = new Error('Only a nonempty unposted document can be posted.');
      error.status = 409;
      throw error;
    }
    await request(scope).input('id', sql.Int, id).input('user', sql.Int, user.id).query("UPDATE dbo.PurchaseRequests SET status='posted',postedById=@user,postedAt=SYSUTCDATETIME(),updatedAt=SYSUTCDATETIME() WHERE id=@id");
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'purchase-requests')
      .input('action', sql.NVarChar(sql.MAX), 'post').input('recordId', sql.NVarChar(sql.MAX), String(id))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.branch,CONVERT(varchar(10),r.prDate,23) AS prDate,CONVERT(varchar(10),r.neededDate,23) AS neededDate,
        r.requestedBy,r.requestedDept,r.checkedBy,r.approvedBy,r.approvedBy2,r.remarks,r.preparedById,r.preparedBy,r.status,r.postedAt
        FROM dbo.PurchaseRequests r  WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.requestId,d.position,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,CONVERT(varchar(60),d.quantity) AS quantity,d.unit,
        CONVERT(varchar(10),d.neededDate,23) AS neededDate,d.remarks,CONVERT(varchar(60),COALESCE(a.orderedQuantity,0)) AS orderedQuantity,
        CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.orderedQuantity,0) AS decimal(28,6))) AS balanceQuantity,a.purchaseOrderNumbers
        FROM dbo.PurchaseRequestItems d OUTER APPLY (
          SELECT SUM(i.quantity) AS orderedQuantity,STRING_AGG(CONVERT(nvarchar(max),o.number),N', ') AS purchaseOrderNumbers
          FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseOrders o ON o.id=i.orderId
          WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')
        ) a WHERE d.requestId=@id ORDER BY d.requestId,d.position;`);
    const savedRows = new Map(savedData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { requestId, ...item } of savedData.recordsets[1]) savedRows.get(requestId)?.items.push(item);
    const saved = [...savedRows.values()][0];
    if (!saved) {
      const error = new Error('Purchase Request could not be found.');
      error.status = 404;
      throw error;
    }
    return saved;
  });
  res.json({ record });
});

router.post('/purchase-requests/:id/cancel', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const record = await transaction(async scope => {
    const valueData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.branch,CONVERT(varchar(10),r.prDate,23) AS prDate,CONVERT(varchar(10),r.neededDate,23) AS neededDate,
        r.requestedBy,r.requestedDept,r.checkedBy,r.approvedBy,r.approvedBy2,r.remarks,r.preparedById,r.preparedBy,r.status,r.postedAt
        FROM dbo.PurchaseRequests r WITH (UPDLOCK,HOLDLOCK) WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.requestId,d.position,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,CONVERT(varchar(60),d.quantity) AS quantity,d.unit,
        CONVERT(varchar(10),d.neededDate,23) AS neededDate,d.remarks,CONVERT(varchar(60),COALESCE(a.orderedQuantity,0)) AS orderedQuantity,
        CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.orderedQuantity,0) AS decimal(28,6))) AS balanceQuantity,a.purchaseOrderNumbers
        FROM dbo.PurchaseRequestItems d OUTER APPLY (
          SELECT SUM(i.quantity) AS orderedQuantity,STRING_AGG(CONVERT(nvarchar(max),o.number),N', ') AS purchaseOrderNumbers
          FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseOrders o ON o.id=i.orderId
          WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')
        ) a WHERE d.requestId=@id ORDER BY d.requestId,d.position;`);
    const valueRows = new Map(valueData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { requestId, ...item } of valueData.recordsets[1]) valueRows.get(requestId)?.items.push(item);
    const value = [...valueRows.values()][0];
    if (!value) {
      const error = new Error('Purchase Request could not be found.');
      error.status = 404;
      throw error;
    }
    if (value.status === 'cancelled') return value;
    const linked = await request(scope).input('id', sql.Int, id).query("SELECT TOP(1) i.id FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseRequestItems d ON d.id=i.requestItemId JOIN dbo.PurchaseOrders o ON o.id=i.orderId WHERE d.requestId=@id AND o.status<>'cancelled'");
    if (linked.recordset.length) {
      const error = new Error('Cancel downstream documents before cancelling this source document.');
      error.status = 409;
      throw error;
    }
    await request(scope).input('id', sql.Int, id).query("UPDATE dbo.PurchaseRequests SET status='cancelled',updatedAt=SYSUTCDATETIME() WHERE id=@id");
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'purchase-requests')
      .input('action', sql.NVarChar(sql.MAX), 'cancel').input('recordId', sql.NVarChar(sql.MAX), String(id))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.branch,CONVERT(varchar(10),r.prDate,23) AS prDate,CONVERT(varchar(10),r.neededDate,23) AS neededDate,
        r.requestedBy,r.requestedDept,r.checkedBy,r.approvedBy,r.approvedBy2,r.remarks,r.preparedById,r.preparedBy,r.status,r.postedAt
        FROM dbo.PurchaseRequests r  WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.requestId,d.position,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,CONVERT(varchar(60),d.quantity) AS quantity,d.unit,
        CONVERT(varchar(10),d.neededDate,23) AS neededDate,d.remarks,CONVERT(varchar(60),COALESCE(a.orderedQuantity,0)) AS orderedQuantity,
        CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.orderedQuantity,0) AS decimal(28,6))) AS balanceQuantity,a.purchaseOrderNumbers
        FROM dbo.PurchaseRequestItems d OUTER APPLY (
          SELECT SUM(i.quantity) AS orderedQuantity,STRING_AGG(CONVERT(nvarchar(max),o.number),N', ') AS purchaseOrderNumbers
          FROM dbo.PurchaseOrderItems i JOIN dbo.PurchaseOrders o ON o.id=i.orderId
          WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')
        ) a WHERE d.requestId=@id ORDER BY d.requestId,d.position;`);
    const savedRows = new Map(savedData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { requestId, ...item } of savedData.recordsets[1]) savedRows.get(requestId)?.items.push(item);
    const saved = [...savedRows.values()][0];
    if (!saved) {
      const error = new Error('Purchase Request could not be found.');
      error.status = 404;
      throw error;
    }
    return saved;
  });
  res.json({ record });
});

router.post('/purchase-orders/:id/post', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const record = await transaction(async scope => {
    const valueData = await request(scope).input('id', sql.Int, id).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
        CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
        o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
        FROM dbo.PurchaseOrders o WITH (UPDLOCK,HOLDLOCK) WHERE o.id=@id ORDER BY o.id DESC;
        SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
        CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
        FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
        OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
        WHERE d.orderId=@id ORDER BY d.orderId,d.position;`);
    const valueRows = new Map(valueData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { orderId, ...item } of valueData.recordsets[1]) valueRows.get(orderId)?.items.push(item);
    const value = [...valueRows.values()][0];
    if (!value) {
      const error = new Error('Purchase Order could not be found.');
      error.status = 404;
      throw error;
    }
    if (['posted', 'closed'].includes(value.status)) return value;
    if (value.status !== 'draft' || !value.items.length) {
      const error = new Error('Only a nonempty unposted document can be posted.');
      error.status = 409;
      throw error;
    }
    const requestIds = [...new Set(value.items.map(item => item.requestId))].sort((left, right) => left - right);
    for (const requestId of requestIds) {
      const sourceHeader = await request(scope).input('id', sql.Int, requestId).query('SELECT id FROM dbo.PurchaseRequests WITH (UPDLOCK,HOLDLOCK) WHERE id=@id');
      if (!sourceHeader.recordset.length) {
        const error = new Error('Purchase Request could not be found.');
        error.status = 404;
        throw error;
      }
    }
    for (const item of value.items) {
      const sourceData = await request(scope).input('id', sql.Int, item.requestItemId).query(`SELECT d.*,r.status AS requestStatus,r.number AS requestNumber,
          CONVERT(varchar(60),d.quantity) AS requestedQuantity,CONVERT(varchar(60),COALESCE((SELECT SUM(i.quantity) FROM dbo.PurchaseOrderItems i
          JOIN dbo.PurchaseOrders o ON o.id=i.orderId WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')),0)) AS orderedQuantity
          FROM dbo.PurchaseRequestItems d JOIN dbo.PurchaseRequests r ON r.id=d.requestId WHERE d.id=@id`);
        if (!sourceData.recordset.length) {
          const error = new Error('Select a valid posted PR line.');
          error.status = 400;
          throw error;
        }
        const source = sourceData.recordset[0];
      if (!['posted', 'closed'].includes(source.requestStatus)) {
        const error = new Error('Purchase Orders can only use posted PR lines.');
        error.status = 409;
        throw error;
      }
        const balances = { requested: source.requestedQuantity, ordered: source.orderedQuantity, quantity: item.quantity };
        for (const [key, entered] of Object.entries(balances)) {
          if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
            const error = new Error(`${key} must be a valid decimal number.`);
            error.status = 400;
            throw error;
          }
          const source = String(entered).trim();
          if (!/^\d+(?:\.\d+)?$/.test(source)) {
            const error = new Error(`${key} must be zero or greater.`);
            error.status = 400;
            throw error;
          }
          const [whole, rawFraction = ''] = source.split('.');
          const fraction = rawFraction.replace(/0+$/, '');
          if (fraction.length > 6) {
            const error = new Error(`${key} exceeds six decimal places.`);
            error.status = 400;
            throw error;
          }
          const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
          if (units > 1000000000n * 1000000n) {
            const error = new Error(`${key} is too large.`);
            error.status = 400;
            throw error;
          }
          balances[key] = units;
        }
        const remaining = balances.requested - balances.ordered;
        if (balances.quantity > remaining) {
          const error = new Error('PO quantity exceeds the remaining Purchase Request balance.');
          error.status = 409;
          throw error;
        }
    }
    await request(scope).input('id', sql.Int, id).input('user', sql.Int, user.id).query("UPDATE dbo.PurchaseOrders SET status='posted',postedById=@user,postedAt=SYSUTCDATETIME(),updatedAt=SYSUTCDATETIME() WHERE id=@id");
    for (const requestId of requestIds) {
      await request(scope).input('id', sql.Int, requestId).query(`UPDATE r SET status=CASE WHEN EXISTS (
          SELECT 1 FROM dbo.PurchaseRequestItems d WHERE d.requestId=r.id AND d.quantity>COALESCE((SELECT SUM(i.quantity) FROM dbo.PurchaseOrderItems i
          JOIN dbo.PurchaseOrders o ON o.id=i.orderId WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')),0)) THEN 'posted' ELSE 'closed' END,
          updatedAt=SYSUTCDATETIME() FROM dbo.PurchaseRequests r WHERE r.id=@id AND r.status IN ('posted','closed')`);
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'purchase-orders')
      .input('action', sql.NVarChar(sql.MAX), 'post').input('recordId', sql.NVarChar(sql.MAX), String(id))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedData = await request(scope).input('id', sql.Int, id).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
        CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
        o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
        FROM dbo.PurchaseOrders o  WHERE o.id=@id ORDER BY o.id DESC;
        SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
        CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
        FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
        OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
        WHERE d.orderId=@id ORDER BY d.orderId,d.position;`);
    const savedRows = new Map(savedData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { orderId, ...item } of savedData.recordsets[1]) savedRows.get(orderId)?.items.push(item);
    const saved = [...savedRows.values()][0];
    if (!saved) {
      const error = new Error('Purchase Order could not be found.');
      error.status = 404;
      throw error;
    }
    return saved;
  });
  res.json({ record });
});

router.post('/purchase-orders/:id/cancel', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const record = await transaction(async scope => {
    const valueData = await request(scope).input('id', sql.Int, id).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
        CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
        o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
        FROM dbo.PurchaseOrders o WITH (UPDLOCK,HOLDLOCK) WHERE o.id=@id ORDER BY o.id DESC;
        SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
        CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
        FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
        OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
        WHERE d.orderId=@id ORDER BY d.orderId,d.position;`);
    const valueRows = new Map(valueData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { orderId, ...item } of valueData.recordsets[1]) valueRows.get(orderId)?.items.push(item);
    const value = [...valueRows.values()][0];
    if (!value) {
      const error = new Error('Purchase Order could not be found.');
      error.status = 404;
      throw error;
    }
    if (value.status === 'cancelled') return value;
    const linked = await request(scope).input('id', sql.Int, id).query("SELECT TOP(1) id FROM dbo.SuppliesReceipts WHERE purchaseOrderId=@id AND status<>'cancelled'");
    if (linked.recordset.length) {
      const error = new Error('Cancel downstream documents before cancelling this source document.');
      error.status = 409;
      throw error;
    }
    await request(scope).input('id', sql.Int, id).query("UPDATE dbo.PurchaseOrders SET status='cancelled',updatedAt=SYSUTCDATETIME() WHERE id=@id");
    for (const requestId of new Set(value.items.map(item => item.requestId))) {
      await request(scope).input('id', sql.Int, requestId).query(`UPDATE r SET status=CASE WHEN EXISTS (
          SELECT 1 FROM dbo.PurchaseRequestItems d WHERE d.requestId=r.id AND d.quantity>COALESCE((SELECT SUM(i.quantity) FROM dbo.PurchaseOrderItems i
          JOIN dbo.PurchaseOrders o ON o.id=i.orderId WHERE i.requestItemId=d.id AND o.status IN ('posted','closed')),0)) THEN 'posted' ELSE 'closed' END,
          updatedAt=SYSUTCDATETIME() FROM dbo.PurchaseRequests r WHERE r.id=@id AND r.status IN ('posted','closed')`);
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'purchase-orders')
      .input('action', sql.NVarChar(sql.MAX), 'cancel').input('recordId', sql.NVarChar(sql.MAX), String(id))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedData = await request(scope).input('id', sql.Int, id).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
        CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
        o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
        FROM dbo.PurchaseOrders o  WHERE o.id=@id ORDER BY o.id DESC;
        SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
        CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
        FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
        OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
        WHERE d.orderId=@id ORDER BY d.orderId,d.position;`);
    const savedRows = new Map(savedData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { orderId, ...item } of savedData.recordsets[1]) savedRows.get(orderId)?.items.push(item);
    const saved = [...savedRows.values()][0];
    if (!saved) {
      const error = new Error('Purchase Order could not be found.');
      error.status = 404;
      throw error;
    }
    return saved;
  });
  res.json({ record });
});

router.post('/receivings/:id/post', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const result = await transaction(async scope => {
    const receiptData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.purchaseOrderId,o.number AS purchaseOrderNumber,o.branch,o.supplierId,o.supplierName,o.supplierAddress,
        CONVERT(varchar(10),r.srrDate,23) AS srrDate,r.drNumber,r.pezaReference,r.invoiceNumber,CONVERT(varchar(10),r.invoiceDate,23) AS invoiceDate,
        o.currency,CONVERT(varchar(60),r.rate) AS rate,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        r.remarks,CONVERT(varchar(60),r.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),r.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),r.[netAmount]) AS [netAmount],CONVERT(varchar(60),r.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),r.[amount]) AS [amount],r.receivedById,r.receivedBy,r.status,r.postedAt
        FROM dbo.SuppliesReceipts r WITH (UPDLOCK,HOLDLOCK) JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.receiptId,d.position,d.orderItemId,o.suppliesId,o.suppliesCode,o.suppliesName,o.description,o.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),o.unitPrice) AS unitPrice,o.currency,
        CONVERT(varchar(60),o.discountRate) AS discountRate,CONVERT(varchar(60),o.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),o.quantity) AS orderQuantity,CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,
        CONVERT(varchar(60),o.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS orderBalanceQuantity,
        CONVERT(varchar(60),COALESCE(l.allocatedQuantity,0)) AS allocatedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(l.allocatedQuantity,0) AS decimal(28,6))) AS allocationBalanceQuantity
        FROM dbo.SuppliesReceiptItems d JOIN dbo.PurchaseOrderItems o ON o.id=d.orderItemId
        OUTER APPLY(SELECT SUM(x.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems x JOIN dbo.SuppliesReceipts h ON h.id=x.receiptId WHERE x.orderItemId=o.id AND h.status='posted') a
        OUTER APPLY(SELECT SUM(x.quantity) AS allocatedQuantity FROM dbo.SuppliesReceiptAllocations x WHERE x.receiptItemId=d.id) l
        WHERE d.receiptId=@id ORDER BY d.receiptId,d.position;
        SELECT a.id,a.receiptItemId,a.position,CONVERT(varchar(60),a.quantity) AS quantity,CONVERT(varchar(10),a.expiryDate,23) AS expiryDate,
        CONVERT(varchar(10),a.mfgDate,23) AS mfgDate,a.imLot,a.qcStatus,a.warehouseId,a.locationId,w.code AS warehouseCode,l.code AS locationCode
        FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems d ON d.id=a.receiptItemId
        LEFT JOIN dbo.ConfigWarehouses w ON w.id=a.warehouseId LEFT JOIN dbo.ConfigLocations l ON l.id=a.locationId
        WHERE d.receiptId=@id ORDER BY a.receiptItemId,a.position;`);
    const receiptRows = new Map(receiptData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    const receiptItems = new Map();
    for (const { receiptId, ...row } of receiptData.recordsets[1]) {
      const item = { ...row, allocations: [] };
      receiptItems.set(row.id, item);
      receiptRows.get(receiptId)?.items.push(item);
    }
    for (const { receiptItemId, ...allocation } of receiptData.recordsets[2]) receiptItems.get(receiptItemId)?.allocations.push(allocation);
    const receipt = [...receiptRows.values()][0];
    if (!receipt) {
      const error = new Error('Receiving receipt could not be found.');
      error.status = 404;
      throw error;
    }
    if (receipt.status === 'posted') return { record: receipt, alreadyPosted: true };
    if (receipt.status !== 'draft') {
      const error = new Error('Only an unposted receiving receipt can be posted.');
      error.status = 409;
      throw error;
    }
    const orderData = await request(scope).input('id', sql.Int, receipt.purchaseOrderId).query(`SELECT o.id,o.number,o.branch,o.supplierId,o.supplierName,o.supplierAddress,o.supplierContactPerson,
        CONVERT(varchar(10),o.poDate,23) AS poDate,CONVERT(varchar(10),o.deliveryDate,23) AS deliveryDate,o.currency,CONVERT(varchar(60),o.rate) AS rate,
        o.paymentTerm,o.shipment,o.suppliesCategory,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        o.deliveryAddress,o.remarks,CONVERT(varchar(60),o.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),o.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),o.[netAmount]) AS [netAmount],CONVERT(varchar(60),o.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),o.[amount]) AS [amount],o.preparedById,o.preparedBy,o.status,o.postedAt
        FROM dbo.PurchaseOrders o WITH (UPDLOCK,HOLDLOCK) WHERE o.id=@id ORDER BY o.id DESC;
        SELECT d.id,d.orderId,d.position,d.requestItemId,r.requestId,pr.number AS requestNumber,d.suppliesId,d.suppliesCode,d.suppliesName,d.description,d.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),d.unitPrice) AS unitPrice,d.currency,CONVERT(varchar(60),d.discountRate) AS discountRate,
        CONVERT(varchar(60),d.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS balanceQuantity
        FROM dbo.PurchaseOrderItems d JOIN dbo.PurchaseRequestItems r ON r.id=d.requestItemId JOIN dbo.PurchaseRequests pr ON pr.id=r.requestId
        OUTER APPLY(SELECT SUM(i.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted') a
        WHERE d.orderId=@id ORDER BY d.orderId,d.position;`);
    const orderRows = new Map(orderData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    for (const { orderId, ...item } of orderData.recordsets[1]) orderRows.get(orderId)?.items.push(item);
    const order = [...orderRows.values()][0];
    if (!order) {
      const error = new Error('Purchase Order could not be found.');
      error.status = 404;
      throw error;
    }
    if (!['posted', 'closed'].includes(order.status)) {
      const error = new Error('Receiving requires a posted purchase order.');
      error.status = 409;
      throw error;
    }
    if (!receipt.items.length) {
      const error = new Error('Add at least one receiving item.');
      error.status = 400;
      throw error;
    }
    const sources = new Map(order.items.map(item => [item.id, item]));
    const usedItems = new Set();
    const movements = [];
    for (const item of receipt.items) {
      const source = sources.get(item.orderItemId);
      if (!source || source.suppliesId !== item.suppliesId) {
        const error = new Error('Receiving items must match their purchase order Supplies.');
        error.status = 400;
        throw error;
      }
      if (usedItems.has(source.id)) {
        const error = new Error('A purchase order line can appear only once in a receipt.');
        error.status = 400;
        throw error;
      }
      usedItems.add(source.id);
      if (item.unit && item.unit !== source.unit) {
        const error = new Error('Receiving UOM must match the purchase order.');
        error.status = 400;
        throw error;
      }
      const balances = { receiving: item.quantity, ordered: source.quantity, received: source.receivedQuantity || 0 };
      for (const [key, entered] of Object.entries(balances)) {
        if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
          const error = new Error(`${key} must be a valid decimal number.`);
          error.status = 400;
          throw error;
        }
        const source = String(entered).trim();
        if (!/^\d+(?:\.\d+)?$/.test(source)) {
          const error = new Error(`${key} must be zero or greater.`);
          error.status = 400;
          throw error;
        }
        const [whole, rawFraction = ''] = source.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > 6) {
          const error = new Error(`${key} exceeds six decimal places.`);
          error.status = 400;
          throw error;
        }
        const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
        if (units > 1000000000n * 1000000n) {
          const error = new Error(`${key} is too large.`);
          error.status = 400;
          throw error;
        }
        balances[key] = units;
      }
      const quantity = balances.receiving;
      if (!quantity) {
        const error = new Error('Receiving quantity must be greater than zero.');
        error.status = 400;
        throw error;
      }
      const outstanding = balances.ordered - balances.received;
      if (quantity > outstanding) {
        const error = new Error('Receiving quantity exceeds the remaining purchase order balance.');
        error.status = 409;
        throw error;
      }
      if (!item.allocations.length) {
        const error = new Error('Allocate every receiving item to stock before posting.');
        error.status = 400;
        throw error;
      }
      let allocated = 0n;
      for (const allocation of item.allocations) {
        const allocationUnits = { quantity: allocation.quantity };
        for (const [key, entered] of Object.entries(allocationUnits)) {
          if (!['string', 'number'].includes(typeof entered) || (typeof entered === 'number' && !Number.isFinite(entered))) {
            const error = new Error(`${key} must be a valid decimal number.`);
            error.status = 400;
            throw error;
          }
          const source = String(entered).trim();
          if (!/^\d+(?:\.\d+)?$/.test(source)) {
            const error = new Error(`${key} must be zero or greater.`);
            error.status = 400;
            throw error;
          }
          const [whole, rawFraction = ''] = source.split('.');
          const fraction = rawFraction.replace(/0+$/, '');
          if (fraction.length > 6) {
            const error = new Error(`${key} exceeds six decimal places.`);
            error.status = 400;
            throw error;
          }
          const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
          if (units > 1000000000n * 1000000n) {
            const error = new Error(`${key} is too large.`);
            error.status = 400;
            throw error;
          }
          allocationUnits[key] = units;
        }
        const allocationQuantity = allocationUnits.quantity;
        if (!allocationQuantity) {
          const error = new Error('Allocation quantity must be greater than zero.');
          error.status = 400;
          throw error;
        }
        allocated += allocationQuantity;
        if (!Number.isInteger(allocation.warehouseId) || allocation.warehouseId <= 0 || !Number.isInteger(allocation.locationId) || allocation.locationId <= 0) {
          const error = new Error('Every allocation needs an active Warehouse and Location.');
          error.status = 400;
          throw error;
        }
        const destination = await request(scope).input('warehouse', sql.Int, allocation.warehouseId).input('location', sql.Int, allocation.locationId)
          .query('SELECT w.id FROM dbo.ConfigWarehouses w CROSS JOIN dbo.ConfigLocations l WHERE w.id=@warehouse AND l.id=@location AND w.isActive=1 AND l.isActive=1');
        if (destination.recordset.length !== 1) {
          const error = new Error('Every allocation needs an active Warehouse and Location.');
          error.status = 400;
          throw error;
        }
        movements.push({ ...allocation, quantity: `${allocationQuantity / 1000000n}.${String(allocationQuantity % 1000000n).padStart(6, '0')}`, suppliesId: item.suppliesId, receiptId: id, receiptItemId: item.id, allocationId: allocation.id });
      }
      if (allocated !== quantity) {
        const error = new Error('Allocated quantity must equal the receiving item quantity exactly.');
        error.status = 400;
        throw error;
      }
    }
    // All source balances and destinations passed; every stock effect shares this transaction.
    for (const movement of movements) {
      const existing = await request(scope).input('suppliesId', sql.Int, movement.suppliesId).input('warehouseId', sql.Int, movement.warehouseId)
          .input('locationId', sql.Int, movement.locationId).input('imLot', sql.NVarChar(sql.MAX), movement.imLot || '').input('qcStatus', sql.NVarChar(sql.MAX), movement.qcStatus || '')
          .input('expiryDate', sql.VarChar(sql.MAX), movement.expiryDate || null).input('mfgDate', sql.VarChar(sql.MAX), movement.mfgDate || null).input('quantity', sql.VarChar(sql.MAX), movement.quantity).query(`SELECT id FROM dbo.SupplyInventory WITH (UPDLOCK,HOLDLOCK) WHERE suppliesId=@suppliesId AND warehouseId=@warehouseId AND locationId=@locationId
          AND imLot=@imLot AND qcStatus=@qcStatus AND (expiryDate=@expiryDate OR (expiryDate IS NULL AND @expiryDate IS NULL)) AND (mfgDate=@mfgDate OR (mfgDate IS NULL AND @mfgDate IS NULL))`);
        let inventoryId = existing.recordset[0]?.id;
        if (inventoryId) {
          const result = await request(scope).input('suppliesId', sql.Int, movement.suppliesId).input('warehouseId', sql.Int, movement.warehouseId)
          .input('locationId', sql.Int, movement.locationId).input('imLot', sql.NVarChar(sql.MAX), movement.imLot || '').input('qcStatus', sql.NVarChar(sql.MAX), movement.qcStatus || '')
          .input('expiryDate', sql.VarChar(sql.MAX), movement.expiryDate || null).input('mfgDate', sql.VarChar(sql.MAX), movement.mfgDate || null).input('quantity', sql.VarChar(sql.MAX), movement.quantity).input('id', sql.Int, inventoryId).query(`UPDATE dbo.SupplyInventory SET quantity=quantity+CONVERT(decimal(18,6),@quantity),updatedAt=SYSUTCDATETIME()
            OUTPUT INSERTED.id WHERE id=@id AND quantity<=CONVERT(decimal(18,6),'999999999999.999999')-CONVERT(decimal(18,6),@quantity)`);
          if (!result.recordset.length) {
            const error = new Error('This inventory balance exceeds the supported stock quantity.');
            error.status = 409;
            throw error;
          }
        } else {
          const result = await request(scope).input('suppliesId', sql.Int, movement.suppliesId).input('warehouseId', sql.Int, movement.warehouseId)
          .input('locationId', sql.Int, movement.locationId).input('imLot', sql.NVarChar(sql.MAX), movement.imLot || '').input('qcStatus', sql.NVarChar(sql.MAX), movement.qcStatus || '')
          .input('expiryDate', sql.VarChar(sql.MAX), movement.expiryDate || null).input('mfgDate', sql.VarChar(sql.MAX), movement.mfgDate || null).input('quantity', sql.VarChar(sql.MAX), movement.quantity).query(`INSERT INTO dbo.SupplyInventory(suppliesId,warehouseId,locationId,imLot,qcStatus,expiryDate,mfgDate,quantity) OUTPUT INSERTED.id
            VALUES(@suppliesId,@warehouseId,@locationId,@imLot,@qcStatus,@expiryDate,@mfgDate,@quantity)`);
          inventoryId = result.recordset[0].id;
        }
        await request(scope).input('receiptId', sql.Int, movement.receiptId).input('receiptItemId', sql.Int, movement.receiptItemId).input('allocationId', sql.Int, movement.allocationId)
          .input('inventoryId', sql.Int, inventoryId).input('quantity', sql.VarChar(sql.MAX), movement.quantity).input('user', sql.Int, user.id)
          .query(`INSERT INTO dbo.SupplyStockMovements(receiptId,receiptItemId,allocationId,inventoryId,quantity,createdById)
            VALUES(@receiptId,@receiptItemId,@allocationId,@inventoryId,@quantity,@user)`);
    }
    await request(scope).input('id', sql.Int, id).input('user', sql.Int, user.id).query("UPDATE dbo.SuppliesReceipts SET status='posted',postedById=@user,postedAt=SYSUTCDATETIME(),updatedAt=SYSUTCDATETIME() WHERE id=@id");
    await request(scope).input('id', sql.Int, order.id).query(`UPDATE o SET status=CASE WHEN EXISTS(SELECT 1 FROM dbo.PurchaseOrderItems d WHERE d.orderId=o.id
        AND d.quantity>COALESCE((SELECT SUM(i.quantity) FROM dbo.SuppliesReceiptItems i JOIN dbo.SuppliesReceipts h ON h.id=i.receiptId WHERE i.orderItemId=d.id AND h.status='posted'),0))
        THEN 'posted' ELSE 'closed' END,updatedAt=SYSUTCDATETIME() FROM dbo.PurchaseOrders o WHERE o.id=@id AND o.status IN ('posted','closed')`);
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'receivings')
      .input('action', sql.NVarChar(sql.MAX), 'post').input('recordId', sql.NVarChar(sql.MAX), String(id))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.purchaseOrderId,o.number AS purchaseOrderNumber,o.branch,o.supplierId,o.supplierName,o.supplierAddress,
        CONVERT(varchar(10),r.srrDate,23) AS srrDate,r.drNumber,r.pezaReference,r.invoiceNumber,CONVERT(varchar(10),r.invoiceDate,23) AS invoiceDate,
        o.currency,CONVERT(varchar(60),r.rate) AS rate,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        r.remarks,CONVERT(varchar(60),r.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),r.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),r.[netAmount]) AS [netAmount],CONVERT(varchar(60),r.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),r.[amount]) AS [amount],r.receivedById,r.receivedBy,r.status,r.postedAt
        FROM dbo.SuppliesReceipts r  JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.receiptId,d.position,d.orderItemId,o.suppliesId,o.suppliesCode,o.suppliesName,o.description,o.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),o.unitPrice) AS unitPrice,o.currency,
        CONVERT(varchar(60),o.discountRate) AS discountRate,CONVERT(varchar(60),o.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),o.quantity) AS orderQuantity,CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,
        CONVERT(varchar(60),o.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS orderBalanceQuantity,
        CONVERT(varchar(60),COALESCE(l.allocatedQuantity,0)) AS allocatedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(l.allocatedQuantity,0) AS decimal(28,6))) AS allocationBalanceQuantity
        FROM dbo.SuppliesReceiptItems d JOIN dbo.PurchaseOrderItems o ON o.id=d.orderItemId
        OUTER APPLY(SELECT SUM(x.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems x JOIN dbo.SuppliesReceipts h ON h.id=x.receiptId WHERE x.orderItemId=o.id AND h.status='posted') a
        OUTER APPLY(SELECT SUM(x.quantity) AS allocatedQuantity FROM dbo.SuppliesReceiptAllocations x WHERE x.receiptItemId=d.id) l
        WHERE d.receiptId=@id ORDER BY d.receiptId,d.position;
        SELECT a.id,a.receiptItemId,a.position,CONVERT(varchar(60),a.quantity) AS quantity,CONVERT(varchar(10),a.expiryDate,23) AS expiryDate,
        CONVERT(varchar(10),a.mfgDate,23) AS mfgDate,a.imLot,a.qcStatus,a.warehouseId,a.locationId,w.code AS warehouseCode,l.code AS locationCode
        FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems d ON d.id=a.receiptItemId
        LEFT JOIN dbo.ConfigWarehouses w ON w.id=a.warehouseId LEFT JOIN dbo.ConfigLocations l ON l.id=a.locationId
        WHERE d.receiptId=@id ORDER BY a.receiptItemId,a.position;`);
    const savedRows = new Map(savedData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    const savedItems = new Map();
    for (const { receiptId, ...row } of savedData.recordsets[1]) {
      const item = { ...row, allocations: [] };
      savedItems.set(row.id, item);
      savedRows.get(receiptId)?.items.push(item);
    }
    for (const { receiptItemId, ...allocation } of savedData.recordsets[2]) savedItems.get(receiptItemId)?.allocations.push(allocation);
    const saved = [...savedRows.values()][0];
    if (!saved) {
      const error = new Error('Receiving receipt could not be found.');
      error.status = 404;
      throw error;
    }
    return { record: saved, alreadyPosted: false };
  });
  res.json(result);
});

router.post('/receivings/:id/cancel', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const user = req.purchasingUser;
  const record = await transaction(async scope => {
    const receiptData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.purchaseOrderId,o.number AS purchaseOrderNumber,o.branch,o.supplierId,o.supplierName,o.supplierAddress,
        CONVERT(varchar(10),r.srrDate,23) AS srrDate,r.drNumber,r.pezaReference,r.invoiceNumber,CONVERT(varchar(10),r.invoiceDate,23) AS invoiceDate,
        o.currency,CONVERT(varchar(60),r.rate) AS rate,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        r.remarks,CONVERT(varchar(60),r.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),r.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),r.[netAmount]) AS [netAmount],CONVERT(varchar(60),r.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),r.[amount]) AS [amount],r.receivedById,r.receivedBy,r.status,r.postedAt
        FROM dbo.SuppliesReceipts r WITH (UPDLOCK,HOLDLOCK) JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.receiptId,d.position,d.orderItemId,o.suppliesId,o.suppliesCode,o.suppliesName,o.description,o.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),o.unitPrice) AS unitPrice,o.currency,
        CONVERT(varchar(60),o.discountRate) AS discountRate,CONVERT(varchar(60),o.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),o.quantity) AS orderQuantity,CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,
        CONVERT(varchar(60),o.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS orderBalanceQuantity,
        CONVERT(varchar(60),COALESCE(l.allocatedQuantity,0)) AS allocatedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(l.allocatedQuantity,0) AS decimal(28,6))) AS allocationBalanceQuantity
        FROM dbo.SuppliesReceiptItems d JOIN dbo.PurchaseOrderItems o ON o.id=d.orderItemId
        OUTER APPLY(SELECT SUM(x.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems x JOIN dbo.SuppliesReceipts h ON h.id=x.receiptId WHERE x.orderItemId=o.id AND h.status='posted') a
        OUTER APPLY(SELECT SUM(x.quantity) AS allocatedQuantity FROM dbo.SuppliesReceiptAllocations x WHERE x.receiptItemId=d.id) l
        WHERE d.receiptId=@id ORDER BY d.receiptId,d.position;
        SELECT a.id,a.receiptItemId,a.position,CONVERT(varchar(60),a.quantity) AS quantity,CONVERT(varchar(10),a.expiryDate,23) AS expiryDate,
        CONVERT(varchar(10),a.mfgDate,23) AS mfgDate,a.imLot,a.qcStatus,a.warehouseId,a.locationId,w.code AS warehouseCode,l.code AS locationCode
        FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems d ON d.id=a.receiptItemId
        LEFT JOIN dbo.ConfigWarehouses w ON w.id=a.warehouseId LEFT JOIN dbo.ConfigLocations l ON l.id=a.locationId
        WHERE d.receiptId=@id ORDER BY a.receiptItemId,a.position;`);
    const receiptRows = new Map(receiptData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    const receiptItems = new Map();
    for (const { receiptId, ...row } of receiptData.recordsets[1]) {
      const item = { ...row, allocations: [] };
      receiptItems.set(row.id, item);
      receiptRows.get(receiptId)?.items.push(item);
    }
    for (const { receiptItemId, ...allocation } of receiptData.recordsets[2]) receiptItems.get(receiptItemId)?.allocations.push(allocation);
    const receipt = [...receiptRows.values()][0];
    if (!receipt) {
      const error = new Error('Receiving receipt could not be found.');
      error.status = 404;
      throw error;
    }
    if (receipt.status === 'cancelled') return receipt;
    if (receipt.status !== 'draft') {
      const error = new Error('Posted receiving receipts cannot be cancelled from the inventory-only system.');
      error.status = 409;
      throw error;
    }
    await request(scope).input('id', sql.Int, id).query("UPDATE dbo.SuppliesReceipts SET status='cancelled',updatedAt=SYSUTCDATETIME() WHERE id=@id");
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name)
      .input('system', sql.NVarChar(sql.MAX), SYSTEM).input('module', sql.NVarChar(sql.MAX), 'receivings')
      .input('action', sql.NVarChar(sql.MAX), 'cancel').input('recordId', sql.NVarChar(sql.MAX), String(id))
      .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
    const savedData = await request(scope).input('id', sql.Int, id).query(`SELECT r.id,r.number,r.purchaseOrderId,o.number AS purchaseOrderNumber,o.branch,o.supplierId,o.supplierName,o.supplierAddress,
        CONVERT(varchar(10),r.srrDate,23) AS srrDate,r.drNumber,r.pezaReference,r.invoiceNumber,CONVERT(varchar(10),r.invoiceDate,23) AS invoiceDate,
        o.currency,CONVERT(varchar(60),r.rate) AS rate,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.decimalInPrice,o.decimalInTotalPrice,
        r.remarks,CONVERT(varchar(60),r.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),r.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),r.[netAmount]) AS [netAmount],CONVERT(varchar(60),r.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),r.[amount]) AS [amount],r.receivedById,r.receivedBy,r.status,r.postedAt
        FROM dbo.SuppliesReceipts r  JOIN dbo.PurchaseOrders o ON o.id=r.purchaseOrderId WHERE r.id=@id ORDER BY r.id DESC;
        SELECT d.id,d.receiptId,d.position,d.orderItemId,o.suppliesId,o.suppliesCode,o.suppliesName,o.description,o.unit,
        CONVERT(varchar(60),d.quantity) AS quantity,CONVERT(varchar(60),o.unitPrice) AS unitPrice,o.currency,
        CONVERT(varchar(60),o.discountRate) AS discountRate,CONVERT(varchar(60),o.vatRate) AS vatRate,CONVERT(varchar(60),d.[grossAmount]) AS [grossAmount],CONVERT(varchar(60),d.[discountAmount]) AS [discountAmount],CONVERT(varchar(60),d.[netAmount]) AS [netAmount],CONVERT(varchar(60),d.[vatAmount]) AS [vatAmount],CONVERT(varchar(60),d.[amount]) AS [amount],d.remarks,
        CONVERT(varchar(60),o.quantity) AS orderQuantity,CONVERT(varchar(60),COALESCE(a.receivedQuantity,0)) AS receivedQuantity,
        CONVERT(varchar(60),o.quantity-CAST(COALESCE(a.receivedQuantity,0) AS decimal(28,6))) AS orderBalanceQuantity,
        CONVERT(varchar(60),COALESCE(l.allocatedQuantity,0)) AS allocatedQuantity,CONVERT(varchar(60),d.quantity-CAST(COALESCE(l.allocatedQuantity,0) AS decimal(28,6))) AS allocationBalanceQuantity
        FROM dbo.SuppliesReceiptItems d JOIN dbo.PurchaseOrderItems o ON o.id=d.orderItemId
        OUTER APPLY(SELECT SUM(x.quantity) AS receivedQuantity FROM dbo.SuppliesReceiptItems x JOIN dbo.SuppliesReceipts h ON h.id=x.receiptId WHERE x.orderItemId=o.id AND h.status='posted') a
        OUTER APPLY(SELECT SUM(x.quantity) AS allocatedQuantity FROM dbo.SuppliesReceiptAllocations x WHERE x.receiptItemId=d.id) l
        WHERE d.receiptId=@id ORDER BY d.receiptId,d.position;
        SELECT a.id,a.receiptItemId,a.position,CONVERT(varchar(60),a.quantity) AS quantity,CONVERT(varchar(10),a.expiryDate,23) AS expiryDate,
        CONVERT(varchar(10),a.mfgDate,23) AS mfgDate,a.imLot,a.qcStatus,a.warehouseId,a.locationId,w.code AS warehouseCode,l.code AS locationCode
        FROM dbo.SuppliesReceiptAllocations a JOIN dbo.SuppliesReceiptItems d ON d.id=a.receiptItemId
        LEFT JOIN dbo.ConfigWarehouses w ON w.id=a.warehouseId LEFT JOIN dbo.ConfigLocations l ON l.id=a.locationId
        WHERE d.receiptId=@id ORDER BY a.receiptItemId,a.position;`);
    const savedRows = new Map(savedData.recordsets[0].map(row => [row.id, { ...row, items: [] }]));
    const savedItems = new Map();
    for (const { receiptId, ...row } of savedData.recordsets[1]) {
      const item = { ...row, allocations: [] };
      savedItems.set(row.id, item);
      savedRows.get(receiptId)?.items.push(item);
    }
    for (const { receiptItemId, ...allocation } of savedData.recordsets[2]) savedItems.get(receiptItemId)?.allocations.push(allocation);
    const saved = [...savedRows.values()][0];
    if (!saved) {
      const error = new Error('Receiving receipt could not be found.');
      error.status = 404;
      throw error;
    }
    return saved;
  });
  res.json({ record });
});

router.all('/suppliers', (_req, res) => res.set('Allow', 'GET, POST').status(405).json({ message: 'This request method is not supported.' }));
router.all('/suppliers/:id', (_req, res) => res.set('Allow', 'GET, PUT, DELETE').status(405).json({ message: 'This request method is not supported.' }));
router.all('/supplies', (_req, res) => res.set('Allow', 'GET, POST').status(405).json({ message: 'This request method is not supported.' }));
router.all('/supplies/:id', (_req, res) => res.set('Allow', 'GET, PUT, DELETE').status(405).json({ message: 'This request method is not supported.' }));
router.all('/options', (_req, res) => res.set('Allow', 'GET').status(405).json({ message: 'This request method is not supported.' }));
router.all('/purchasing-options', (_req, res) => res.set('Allow', 'GET').status(405).json({ message: 'This request method is not supported.' }));
router.all('/purchase-requests', (_req, res) => res.set('Allow', 'GET, POST').status(405).json({ message: 'This request method is not supported.' }));
router.all('/purchase-requests/:id', (_req, res) => res.set('Allow', 'GET, PUT').status(405).json({ message: 'This request method is not supported.' }));
router.all('/purchase-orders', (_req, res) => res.set('Allow', 'GET, POST').status(405).json({ message: 'This request method is not supported.' }));
router.all('/purchase-orders/:id', (_req, res) => res.set('Allow', 'GET, PUT').status(405).json({ message: 'This request method is not supported.' }));
router.all('/receivings', (_req, res) => res.set('Allow', 'GET, POST').status(405).json({ message: 'This request method is not supported.' }));
router.all('/receivings/:id', (_req, res) => res.set('Allow', 'GET, PUT').status(405).json({ message: 'This request method is not supported.' }));
router.all('/purchase-requests/:id/post', (_req, res) => res.set('Allow', 'POST').status(405).json({ message: 'This request method is not supported.' }));
router.all('/purchase-requests/:id/cancel', (_req, res) => res.set('Allow', 'POST').status(405).json({ message: 'This request method is not supported.' }));
router.all('/purchase-orders/:id/post', (_req, res) => res.set('Allow', 'POST').status(405).json({ message: 'This request method is not supported.' }));
router.all('/purchase-orders/:id/cancel', (_req, res) => res.set('Allow', 'POST').status(405).json({ message: 'This request method is not supported.' }));
router.all('/receivings/:id/post', (_req, res) => res.set('Allow', 'POST').status(405).json({ message: 'This request method is not supported.' }));
router.all('/receivings/:id/cancel', (_req, res) => res.set('Allow', 'POST').status(405).json({ message: 'This request method is not supported.' }));

module.exports = router;
