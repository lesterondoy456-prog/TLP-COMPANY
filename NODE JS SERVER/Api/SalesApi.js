const express = require('express');
const path = require('node:path');
const ExcelJS = require('exceljs');
const router = express.Router();
const {
  request,
  sql,
  transaction
} = require('../db');
const defaults = {
  name: '', shortName: '', businessStyle: '', address: '', salesName: '', drName: '', vatCode: '',
  contactPerson: null, cpnumber: null, email: null, salesInCharge: null, tin: null, faxNo: null,
  countryOfOrigin: null, country: null, category: null, remarks: null, paymentTerm: null, taxCode: null,
  isActive: true, decimalInPrice: 2, decimalInTotalPrice: 2,
  salesAddressType: null, drAddressType: null, discount: null, discountType: null,
  includePoInInvoice: null, vatInclusive: null, deliveryAddresses: [], salesInChargeId: null
};
const PRODUCT_QUANTITIES = ['quantityPerSecondaryUnit', 'moq', 'spq', 'unitCost', 'divisor', 'weight'];

router.use((req, res, next) => {
  if (res.locals.user?.system !== 'sales') {
    const error = new Error('Sign in to Sales to continue.');
    error.status = 401;
    throw error;
  }
  next();
});

router.get('/customers', async (req, res) => {
  const result = await request().query(`SELECT c.[id],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId],CONVERT(varchar(10),(SELECT MAX(i.invoiceDate)
    FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId
    WHERE o.customerId=c.id),23) AS lastSalesDate FROM dbo.Customers c LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId ORDER BY c.id DESC`);
  const addressRows = (await request().query('SELECT customerId,position,address FROM dbo.CustomerDeliveryAddresses ORDER BY customerId,position')).recordset;
  const grouped = new Map();
  for (const row of addressRows) {
    if (!grouped.has(row.customerId)) grouped.set(row.customerId, []);
    grouped.get(row.customerId).push(row.address);
  }
  res.json({
    records: result.recordset.map(record => ({
      ...record,
      deliveryAddresses: grouped.get(record.id) || []
    }))
  });
});
router.get('/customers/:id', async (req, res) => {
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT c.[id],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId],CONVERT(varchar(10),(SELECT MAX(i.invoiceDate)
    FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId
    WHERE o.customerId=c.id),23) AS lastSalesDate FROM dbo.Customers c LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId WHERE c.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('The customer could not be found.');
    error.status = 404;
    throw error;
  }
  const recordAddresses = await request().input('id', sql.Int, id).query('SELECT address FROM dbo.CustomerDeliveryAddresses WHERE customerId=@id ORDER BY position');
  const record = {
    ...recordResult.recordset[0],
    deliveryAddresses: recordAddresses.recordset.map(row => row.address)
  };
  res.json({
    record
  });
});
router.get('/customer-options', async (req, res) => {
  const fields = [['countriesOfOrigin', 'countryOfOrigin'], ['countries', 'country'], ['paymentTerms', 'paymentTerm'], ['categories', 'category'], ['taxCodes', 'taxCode']];
  const result = await request().query(`SELECT id,name,username,role FROM dbo.SalesUserLogin WHERE isActive=1 AND role='sales' ORDER BY name,username,id;
    SELECT DISTINCT LTRIM(RTRIM([countryOfOrigin])) AS value FROM dbo.Customers WHERE LEN(LTRIM(RTRIM([countryOfOrigin])))>0 ORDER BY value;
SELECT DISTINCT LTRIM(RTRIM([country])) AS value FROM dbo.Customers WHERE LEN(LTRIM(RTRIM([country])))>0 ORDER BY value;
SELECT DISTINCT LTRIM(RTRIM([paymentTerm])) AS value FROM dbo.Customers WHERE LEN(LTRIM(RTRIM([paymentTerm])))>0 ORDER BY value;
SELECT DISTINCT LTRIM(RTRIM([category])) AS value FROM dbo.Customers WHERE LEN(LTRIM(RTRIM([category])))>0 ORDER BY value;
SELECT DISTINCT LTRIM(RTRIM([taxCode])) AS value FROM dbo.Customers WHERE LEN(LTRIM(RTRIM([taxCode])))>0 ORDER BY value;
    SELECT name FROM dbo.ConfigCountries WHERE isActive=1 ORDER BY name;
    SELECT description FROM dbo.ConfigPaymentTerms WHERE isActive=1 AND forCustomer=1 ORDER BY description;
    SELECT name FROM dbo.ConfigCustomerCategories WHERE isActive=1 ORDER BY name;
    SELECT code FROM dbo.ConfigAtc WHERE isActive=1 ORDER BY code;
    SELECT id,code,description,rate FROM dbo.ConfigVatCodes WHERE isActive=1 ORDER BY code;`);
  const existing = Object.fromEntries(fields.map(([key], index) => [key, result.recordsets[index + 1].map(row => row.value)]));
  const countries = result.recordsets[6].map(row => row.name);
  res.json({
    salesInCharges: result.recordsets[0],
    countriesOfOrigin: [...new Set([...countries, ...existing.countriesOfOrigin])].sort((leftValue, rightValue) => leftValue.localeCompare(rightValue)),
    countries: [...new Set([...countries, ...existing.countries])].sort((leftValue, rightValue) => leftValue.localeCompare(rightValue)),
    paymentTerms: [...new Set([...result.recordsets[7].map(productRow => productRow.description), ...existing.paymentTerms])].sort((leftValue, rightValue) => leftValue.localeCompare(rightValue)),
    categories: [...new Set([...result.recordsets[8].map(productRow => productRow.name), ...existing.categories])].sort((leftValue, rightValue) => leftValue.localeCompare(rightValue)),
    taxCodes: [...new Set([...result.recordsets[9].map(productRow => productRow.code), ...existing.taxCodes])].sort((leftValue, rightValue) => leftValue.localeCompare(rightValue)),
    vatCodes: result.recordsets[10]
  });
});
router.post('/customers', async (req, res) => {
  if (!req.is('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    const error = new Error('Send a valid JSON object.');
    error.status = 400;
    throw error;
  }
  const input = req.body;
  const user = res.locals.user;
  const id = undefined;
  const savedId = await transaction(async tx => {
    let current;
    if (id) {
      const currentResult = await request(tx).input('id', sql.Int, id).query(`SELECT c.[id],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId],c.salesInCharge AS _salesInChargeSnapshot FROM dbo.Customers c WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId WHERE c.id=@id`);
      if (!currentResult.recordset.length) {
        const error = new Error('The customer could not be found.');
        error.status = 404;
        throw error;
      }
      const currentAddresses = await request(tx).input('id', sql.Int, id).query('SELECT address FROM dbo.CustomerDeliveryAddresses WHERE customerId=@id ORDER BY position');
      current = {
        ...currentResult.recordset[0],
        deliveryAddresses: currentAddresses.recordset.map(row => row.address)
      };
    }
    const customer = {
      ...defaults,
      ...(current || {})
    };
    for (const key of ["name", "contactPerson", "cpnumber", "email", "address", "shortName", "businessStyle", "salesInCharge", "tin", "faxNo", "countryOfOrigin", "country", "category", "remarks", "salesName", "drName", "paymentTerm", "vatCode", "taxCode"]) if (Object.hasOwn(input, key) && input[key] !== undefined) customer[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
    for (const key of ['includePoInInvoice', 'vatInclusive']) if (Object.hasOwn(input, key) && input[key] !== undefined) customer[key] = input[key] === null || input[key] === '' ? null : input[key] === true;
    for (const key of ['decimalInPrice', 'decimalInTotalPrice', 'discount']) if (Object.hasOwn(input, key) && input[key] !== undefined) {
      const numericFieldValue = input[key] === null || String(input[key]).trim() === '' ? null : Number(input[key]);
      if (numericFieldValue !== null && !Number.isFinite(numericFieldValue)) {
        const error = new Error('A database numeric value is invalid.');
        error.status = 400;
        throw error;
      }
      customer[key] = numericFieldValue;
    }
    for (const key of ['salesAddressType', 'drAddressType', 'discountType']) if (Object.hasOwn(input, key) && input[key] !== undefined) customer[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
    if (customer.discountType === null) customer.discount = null;
    if (Object.hasOwn(input, 'deliveryAddresses') && input['deliveryAddresses'] !== undefined) {
      if (!Array.isArray(input.deliveryAddresses) || input.deliveryAddresses.length > 50) {
        const error = new Error('The submitted collection exceeds the supported size.');
        error.status = 400;
        throw error;
      }
      customer.deliveryAddresses = input.deliveryAddresses.map(value => typeof value === 'string' ? value.trim() : '');
    }
    if (![customer.decimalInPrice, customer.decimalInTotalPrice].every(value => Number.isInteger(value) && value >= 0 && value <= 6)) {
      const error = new Error('Customer decimal settings must be whole numbers from 0 to 6.');
      error.status = 400;
      throw error;
    }
    if (customer.salesAddressType !== null && !['office', 'delivery'].includes(customer.salesAddressType) || customer.drAddressType !== null && !['office', 'delivery'].includes(customer.drAddressType) || customer.discountType !== null && !['percent', 'amount'].includes(customer.discountType) || customer.discount !== null && (customer.discount < 0 || customer.discount > 1000000000)) {
      const error = new Error('Customer address, discount type or discount amount is invalid.');
      error.status = 400;
      throw error;
    }
    if (customer.discountType === 'percent' && customer.discount > 100) {
      const error = new Error('Percentage discount cannot exceed 100.');
      error.status = 400;
      throw error;
    }
    const storedName = current?._salesInChargeSnapshot ?? current?.salesInCharge ?? null;
    let assignment = {
      id: current?.salesInChargeId ?? null,
      name: storedName
    };
    if (Object.hasOwn(input, 'salesInChargeId') && input['salesInChargeId'] !== undefined) {
      if (input.salesInChargeId === null) assignment = {
        id: null,
        name: null
      };else {
        const parsedSalesInChargeId = Number(input.salesInChargeId);
        if (!Number.isSafeInteger(parsedSalesInChargeId) || parsedSalesInChargeId <= 0 || parsedSalesInChargeId > 2147483647) {
          const error = new Error(`Enter a valid ${'Sales account'}.`);
          error.status = 400;
          throw error;
        }
        const accountId = parsedSalesInChargeId;
        if (!current || accountId !== current.salesInChargeId) {
          const accountResult = await request(tx).input('id', sql.Int, accountId).query('SELECT id,name,role,isActive FROM dbo.SalesUserLogin WHERE id=@id');
          const account = accountResult.recordset[0];
          if (!(account?.role === 'sales' && account.isActive === true)) {
            const error = new Error('Sales In-charge must be an active Sales account.');
            error.status = 400;
            throw error;
          }
          assignment = {
            id: account.id,
            name: account.name
          };
        }
      }
    } else if (Object.hasOwn(input, 'salesInCharge') && input['salesInCharge'] !== undefined) {
      const name = typeof input.salesInCharge === 'string' ? input.salesInCharge.trim() : '';
      if (name !== current?.salesInCharge && name !== storedName) {
        if (!name) assignment = {
          id: null,
          name: null
        };else {
          const accountResult = await request(tx).input('name', sql.NVarChar(sql.MAX), name).query("SELECT id,name FROM dbo.SalesUserLogin WHERE name=@name AND role='sales' AND isActive=1");
          if (accountResult.recordset.length !== 1) {
            const error = new Error('Select an active Sales account; names must resolve to one account.');
            error.status = 400;
            throw error;
          }
          assignment = {
            id: accountResult.recordset[0].id,
            name: accountResult.recordset[0].name
          };
        }
      }
    }
    customer.salesInChargeId = assignment.id;
    customer.salesInCharge = assignment.name;
    const req = request(tx);
    for (const fieldName of ["name", "contactPerson", "cpnumber", "email", "address", "shortName", "businessStyle", "salesInCharge", "tin", "faxNo", "countryOfOrigin", "country", "category", "remarks", "salesName", "drName", "paymentTerm", "vatCode", "taxCode"]) req.input(fieldName, sql.NVarChar(sql.MAX), customer[fieldName]);
    for (const fieldName of ['isActive', 'includePoInInvoice', 'vatInclusive']) req.input(fieldName, sql.Bit, customer[fieldName]);
    for (const fieldName of ['decimalInPrice', 'decimalInTotalPrice']) req.input(fieldName, sql.Int, customer[fieldName]);
    for (const fieldName of ['salesAddressType', 'drAddressType', 'discountType']) req.input(fieldName, sql.NVarChar(sql.MAX), customer[fieldName]);
    req.input('discount', sql.Decimal(18, 6), customer.discount);
    req.input('salesInChargeId', sql.Int, customer.salesInChargeId);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Customers SET [name]=@name,[contactPerson]=@contactPerson,[cpnumber]=@cpnumber,[email]=@email,[address]=@address,[shortName]=@shortName,[businessStyle]=@businessStyle,[salesInCharge]=@salesInCharge,[tin]=@tin,[faxNo]=@faxNo,[countryOfOrigin]=@countryOfOrigin,[country]=@country,[category]=@category,[remarks]=@remarks,[salesName]=@salesName,[drName]=@drName,[paymentTerm]=@paymentTerm,[vatCode]=@vatCode,[taxCode]=@taxCode,[isActive]=@isActive,[decimalInPrice]=@decimalInPrice,[decimalInTotalPrice]=@decimalInTotalPrice,[salesAddressType]=@salesAddressType,[drAddressType]=@drAddressType,[discount]=@discount,[discountType]=@discountType,[includePoInInvoice]=@includePoInInvoice,[vatInclusive]=@vatInclusive,[salesInChargeId]=@salesInChargeId,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Customers ([name],[contactPerson],[cpnumber],[email],[address],[shortName],[businessStyle],[salesInCharge],[tin],[faxNo],[countryOfOrigin],[country],[category],[remarks],[salesName],[drName],[paymentTerm],[vatCode],[taxCode],[isActive],[decimalInPrice],[decimalInTotalPrice],[salesAddressType],[drAddressType],[discount],[discountType],[includePoInInvoice],[vatInclusive],[salesInChargeId],createdAt,updatedAt) OUTPUT INSERTED.id VALUES (@name,@contactPerson,@cpnumber,@email,@address,@shortName,@businessStyle,@salesInCharge,@tin,@faxNo,@countryOfOrigin,@country,@category,@remarks,@salesName,@drName,@paymentTerm,@vatCode,@taxCode,@isActive,@decimalInPrice,@decimalInTotalPrice,@salesAddressType,@drAddressType,@discount,@discountType,@includePoInInvoice,@vatInclusive,@salesInChargeId,SYSUTCDATETIME(),SYSUTCDATETIME())`);
      saved = result.recordset[0].id;
    }
    if (!current || Object.hasOwn(input, 'deliveryAddresses') && input['deliveryAddresses'] !== undefined) {
      await request(tx).input('id', sql.Int, saved).query('DELETE FROM dbo.CustomerDeliveryAddresses WHERE customerId=@id');
      for (const [position, address] of customer.deliveryAddresses.entries()) {
        await request(tx).input('id', sql.Int, saved).input('position', sql.Int, position).input('address', sql.NVarChar(sql.MAX), address).query('INSERT INTO dbo.CustomerDeliveryAddresses(customerId,position,address) VALUES(@id,@position,@address)');
      }
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'customers').input('action', sql.NVarChar(sql.MAX), id ? 'update' : 'create').input('recordId', sql.NVarChar(sql.MAX), String(saved)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return saved;
  });
  const recordResult = await request().input('id', sql.Int, savedId).query(`SELECT c.[id],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId],CONVERT(varchar(10),(SELECT MAX(i.invoiceDate)
    FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId
    WHERE o.customerId=c.id),23) AS lastSalesDate FROM dbo.Customers c LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId WHERE c.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('The customer could not be found.');
    error.status = 404;
    throw error;
  }
  const recordAddresses = await request().input('id', sql.Int, savedId).query('SELECT address FROM dbo.CustomerDeliveryAddresses WHERE customerId=@id ORDER BY position');
  const record = {
    ...recordResult.recordset[0],
    deliveryAddresses: recordAddresses.recordset.map(row => row.address)
  };
  res.status(201).json({
    record
  });
});
router.put('/customers/:id', async (req, res) => {
  if (!req.is('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    const error = new Error('Send a valid JSON object.');
    error.status = 400;
    throw error;
  }
  const input = req.body;
  const user = res.locals.user;
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  const savedId = await transaction(async tx => {
    let current;
    if (id) {
      const currentResult = await request(tx).input('id', sql.Int, id).query(`SELECT c.[id],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId],c.salesInCharge AS _salesInChargeSnapshot FROM dbo.Customers c WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId WHERE c.id=@id`);
      if (!currentResult.recordset.length) {
        const error = new Error('The customer could not be found.');
        error.status = 404;
        throw error;
      }
      const currentAddresses = await request(tx).input('id', sql.Int, id).query('SELECT address FROM dbo.CustomerDeliveryAddresses WHERE customerId=@id ORDER BY position');
      current = {
        ...currentResult.recordset[0],
        deliveryAddresses: currentAddresses.recordset.map(row => row.address)
      };
    }
    const customer = {
      ...defaults,
      ...(current || {})
    };
    for (const key of ["name", "contactPerson", "cpnumber", "email", "address", "shortName", "businessStyle", "salesInCharge", "tin", "faxNo", "countryOfOrigin", "country", "category", "remarks", "salesName", "drName", "paymentTerm", "vatCode", "taxCode"]) if (Object.hasOwn(input, key) && input[key] !== undefined) customer[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
    for (const key of ['isActive', 'includePoInInvoice', 'vatInclusive']) if (Object.hasOwn(input, key) && input[key] !== undefined) customer[key] = input[key] === null || input[key] === '' ? null : input[key] === true;
    for (const key of ['decimalInPrice', 'decimalInTotalPrice', 'discount']) if (Object.hasOwn(input, key) && input[key] !== undefined) {
      const numericFieldValue = input[key] === null || String(input[key]).trim() === '' ? null : Number(input[key]);
      if (numericFieldValue !== null && !Number.isFinite(numericFieldValue)) {
        const error = new Error('A database numeric value is invalid.');
        error.status = 400;
        throw error;
      }
      customer[key] = numericFieldValue;
    }
    for (const key of ['salesAddressType', 'drAddressType', 'discountType']) if (Object.hasOwn(input, key) && input[key] !== undefined) customer[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
    if (customer.discountType === null) customer.discount = null;
    if (Object.hasOwn(input, 'deliveryAddresses') && input['deliveryAddresses'] !== undefined) {
      if (!Array.isArray(input.deliveryAddresses) || input.deliveryAddresses.length > 50) {
        const error = new Error('The submitted collection exceeds the supported size.');
        error.status = 400;
        throw error;
      }
      customer.deliveryAddresses = input.deliveryAddresses.map(value => typeof value === 'string' ? value.trim() : '');
    }
    if (![customer.decimalInPrice, customer.decimalInTotalPrice].every(value => Number.isInteger(value) && value >= 0 && value <= 6)) {
      const error = new Error('Customer decimal settings must be whole numbers from 0 to 6.');
      error.status = 400;
      throw error;
    }
    if (customer.salesAddressType !== null && !['office', 'delivery'].includes(customer.salesAddressType) || customer.drAddressType !== null && !['office', 'delivery'].includes(customer.drAddressType) || customer.discountType !== null && !['percent', 'amount'].includes(customer.discountType) || customer.discount !== null && (customer.discount < 0 || customer.discount > 1000000000)) {
      const error = new Error('Customer address, discount type or discount amount is invalid.');
      error.status = 400;
      throw error;
    }
    if (customer.discountType === 'percent' && customer.discount > 100) {
      const error = new Error('Percentage discount cannot exceed 100.');
      error.status = 400;
      throw error;
    }
    const storedName = current?._salesInChargeSnapshot ?? current?.salesInCharge ?? null;
    let assignment = {
      id: current?.salesInChargeId ?? null,
      name: storedName
    };
    if (Object.hasOwn(input, 'salesInChargeId') && input['salesInChargeId'] !== undefined) {
      if (input.salesInChargeId === null) assignment = {
        id: null,
        name: null
      };else {
        const parsedSalesInChargeId = Number(input.salesInChargeId);
        if (!Number.isSafeInteger(parsedSalesInChargeId) || parsedSalesInChargeId <= 0 || parsedSalesInChargeId > 2147483647) {
          const error = new Error(`Enter a valid ${'Sales account'}.`);
          error.status = 400;
          throw error;
        }
        const accountId = parsedSalesInChargeId;
        if (!current || accountId !== current.salesInChargeId) {
          const accountResult = await request(tx).input('id', sql.Int, accountId).query('SELECT id,name,role,isActive FROM dbo.SalesUserLogin WHERE id=@id');
          const account = accountResult.recordset[0];
          if (!(account?.role === 'sales' && account.isActive === true)) {
            const error = new Error('Sales In-charge must be an active Sales account.');
            error.status = 400;
            throw error;
          }
          assignment = {
            id: account.id,
            name: account.name
          };
        }
      }
    } else if (Object.hasOwn(input, 'salesInCharge') && input['salesInCharge'] !== undefined) {
      const name = typeof input.salesInCharge === 'string' ? input.salesInCharge.trim() : '';
      if (name !== current?.salesInCharge && name !== storedName) {
        if (!name) assignment = {
          id: null,
          name: null
        };else {
          const accountResult = await request(tx).input('name', sql.NVarChar(sql.MAX), name).query("SELECT id,name FROM dbo.SalesUserLogin WHERE name=@name AND role='sales' AND isActive=1");
          if (accountResult.recordset.length !== 1) {
            const error = new Error('Select an active Sales account; names must resolve to one account.');
            error.status = 400;
            throw error;
          }
          assignment = {
            id: accountResult.recordset[0].id,
            name: accountResult.recordset[0].name
          };
        }
      }
    }
    customer.salesInChargeId = assignment.id;
    customer.salesInCharge = assignment.name;
    const req = request(tx);
    for (const fieldName of ["name", "contactPerson", "cpnumber", "email", "address", "shortName", "businessStyle", "salesInCharge", "tin", "faxNo", "countryOfOrigin", "country", "category", "remarks", "salesName", "drName", "paymentTerm", "vatCode", "taxCode"]) req.input(fieldName, sql.NVarChar(sql.MAX), customer[fieldName]);
    for (const fieldName of ['isActive', 'includePoInInvoice', 'vatInclusive']) req.input(fieldName, sql.Bit, customer[fieldName]);
    for (const fieldName of ['decimalInPrice', 'decimalInTotalPrice']) req.input(fieldName, sql.Int, customer[fieldName]);
    for (const fieldName of ['salesAddressType', 'drAddressType', 'discountType']) req.input(fieldName, sql.NVarChar(sql.MAX), customer[fieldName]);
    req.input('discount', sql.Decimal(18, 6), customer.discount);
    req.input('salesInChargeId', sql.Int, customer.salesInChargeId);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Customers SET [name]=@name,[contactPerson]=@contactPerson,[cpnumber]=@cpnumber,[email]=@email,[address]=@address,[shortName]=@shortName,[businessStyle]=@businessStyle,[salesInCharge]=@salesInCharge,[tin]=@tin,[faxNo]=@faxNo,[countryOfOrigin]=@countryOfOrigin,[country]=@country,[category]=@category,[remarks]=@remarks,[salesName]=@salesName,[drName]=@drName,[paymentTerm]=@paymentTerm,[vatCode]=@vatCode,[taxCode]=@taxCode,[isActive]=@isActive,[decimalInPrice]=@decimalInPrice,[decimalInTotalPrice]=@decimalInTotalPrice,[salesAddressType]=@salesAddressType,[drAddressType]=@drAddressType,[discount]=@discount,[discountType]=@discountType,[includePoInInvoice]=@includePoInInvoice,[vatInclusive]=@vatInclusive,[salesInChargeId]=@salesInChargeId,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Customers ([name],[contactPerson],[cpnumber],[email],[address],[shortName],[businessStyle],[salesInCharge],[tin],[faxNo],[countryOfOrigin],[country],[category],[remarks],[salesName],[drName],[paymentTerm],[vatCode],[taxCode],[isActive],[decimalInPrice],[decimalInTotalPrice],[salesAddressType],[drAddressType],[discount],[discountType],[includePoInInvoice],[vatInclusive],[salesInChargeId],createdAt,updatedAt) OUTPUT INSERTED.id VALUES (@name,@contactPerson,@cpnumber,@email,@address,@shortName,@businessStyle,@salesInCharge,@tin,@faxNo,@countryOfOrigin,@country,@category,@remarks,@salesName,@drName,@paymentTerm,@vatCode,@taxCode,@isActive,@decimalInPrice,@decimalInTotalPrice,@salesAddressType,@drAddressType,@discount,@discountType,@includePoInInvoice,@vatInclusive,@salesInChargeId,SYSUTCDATETIME(),SYSUTCDATETIME())`);
      saved = result.recordset[0].id;
    }
    if (!current || Object.hasOwn(input, 'deliveryAddresses') && input['deliveryAddresses'] !== undefined) {
      await request(tx).input('id', sql.Int, saved).query('DELETE FROM dbo.CustomerDeliveryAddresses WHERE customerId=@id');
      for (const [position, address] of customer.deliveryAddresses.entries()) {
        await request(tx).input('id', sql.Int, saved).input('position', sql.Int, position).input('address', sql.NVarChar(sql.MAX), address).query('INSERT INTO dbo.CustomerDeliveryAddresses(customerId,position,address) VALUES(@id,@position,@address)');
      }
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'customers').input('action', sql.NVarChar(sql.MAX), id ? 'update' : 'create').input('recordId', sql.NVarChar(sql.MAX), String(saved)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return saved;
  });
  const recordResult = await request().input('id', sql.Int, savedId).query(`SELECT c.[id],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId],CONVERT(varchar(10),(SELECT MAX(i.invoiceDate)
    FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId
    WHERE o.customerId=c.id),23) AS lastSalesDate FROM dbo.Customers c LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId WHERE c.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('The customer could not be found.');
    error.status = 404;
    throw error;
  }
  const recordAddresses = await request().input('id', sql.Int, savedId).query('SELECT address FROM dbo.CustomerDeliveryAddresses WHERE customerId=@id ORDER BY position');
  const record = {
    ...recordResult.recordset[0],
    deliveryAddresses: recordAddresses.recordset.map(row => row.address)
  };
  res.json({
    record
  });
});
router.delete('/customers/:id', async (req, res) => {
  const kind = 'customers';
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  const user = res.locals.user;
  await transaction(async tx => {
    const result = await request(tx).input('id', sql.Int, id).query(`DELETE FROM dbo.Customers OUTPUT DELETED.id WHERE id=@id`);
    if (!result.recordset.length) {
      const error = new Error('The record could not be found.');
      error.status = 404;
      throw error;
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), kind).input('action', sql.NVarChar(sql.MAX), 'delete').input('recordId', sql.NVarChar(sql.MAX), String(id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
  });
  res.json({
    success: true
  });
});
router.delete('/products/:id', async (req, res) => {
  const kind = 'products';
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  const user = res.locals.user;
  await transaction(async tx => {
    const result = await request(tx).input('id', sql.Int, id).query(`DELETE FROM dbo.Products OUTPUT DELETED.id WHERE id=@id`);
    if (!result.recordset.length) {
      const error = new Error('The record could not be found.');
      error.status = 404;
      throw error;
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), kind).input('action', sql.NVarChar(sql.MAX), 'delete').input('recordId', sql.NVarChar(sql.MAX), String(id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
  });
  res.json({
    success: true
  });
});

router.get('/products/:id/stock-movements', async (req, res) => {
  const user = res.locals.user;
  if (user?.system !== 'sales' || !user.isActive || !['admin', 'saleshead', 'sales'].includes(user.role)) { const error = new Error('Sign in to Sales to view stock transactions.'); error.status = 403; throw error; }
  const productId = Number(req.params.id);
  if (!Number.isSafeInteger(productId) || productId <= 0 || productId > 2147483647) { const error = new Error('Select a valid product.'); error.status = 400; throw error; }
  const productResult = await request().input('productId', sql.Int, productId).query('SELECT id,sku,name,description,unit,CONVERT(varchar(60),stock) AS stock,isActive FROM dbo.Products WHERE id=@productId');
  if (!productResult.recordset.length) { const error = new Error('The product could not be found.'); error.status = 404; throw error; }
  const result = await request().input('productId', sql.Int, productId).query(`SELECT CASE WHEN m.invoiceId IS NULL THEN 'manual:' ELSE 'invoice:' END + CONVERT(varchar(20),m.id) AS id,m.id AS movementId,
    CASE WHEN m.invoiceId IS NOT NULL THEN 'invoice-out' WHEN m.direction='in' THEN 'manual-in' ELSE 'manual-out' END AS type,m.direction,
    CONVERT(varchar(60),m.quantity) AS quantity,m.unit,CONVERT(varchar(60),m.stockBefore) AS stockBefore,CONVERT(varchar(60),m.stockAfter) AS stockAfter,
    CONVERT(varchar(10),m.movementDate,23) AS movementDate,m.sourceDestination,m.reference,m.reason,u.username AS createdByUsername,u.name AS createdByName,
    CONVERT(varchar(33),m.createdAt,126)+'Z' AS createdAt,d.id AS deliveryReceiptId,d.number AS deliveryReceiptNumber,
    o.id AS orderId,o.number AS orderNumber,si.id AS invoiceId,si.number AS invoiceNumber,o.customerName,d.address,d.receivedBy
    FROM dbo.ProductStockMovements m JOIN dbo.SalesUserLogin u ON u.id=m.createdById
    LEFT JOIN dbo.SalesInvoices si ON si.id=m.invoiceId LEFT JOIN dbo.SalesOrders o ON o.id=si.orderId
    LEFT JOIN dbo.DeliveryReceipts d ON d.invoiceId=si.id WHERE m.productId=@productId
    UNION ALL
    SELECT 'delivery:' + CONVERT(varchar(20),d.id) + ':' + CONVERT(varchar(20),i.id) AS id,CAST(NULL AS int) AS movementId,
    'delivery-out' AS type,'out' AS direction,CONVERT(varchar(60),i.quantity) AS quantity,i.unit,
    CAST(NULL AS varchar(60)) AS stockBefore,CAST(NULL AS varchar(60)) AS stockAfter,CONVERT(varchar(10),d.deliveryDate,23) AS movementDate,
    o.customerName AS sourceDestination,d.number AS reference,d.notes AS reason,u.username AS createdByUsername,u.name AS createdByName,
    CONVERT(varchar(33),d.createdAt,126)+'Z' AS createdAt,d.id AS deliveryReceiptId,d.number AS deliveryReceiptNumber,
    o.id AS orderId,o.number AS orderNumber,si.id AS invoiceId,si.number AS invoiceNumber,o.customerName,d.address,d.receivedBy
    FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId JOIN dbo.DeliveryReceiptItems i ON i.deliveryReceiptId=d.id
    JOIN dbo.SalesUserLogin u ON u.id=d.createdBy LEFT JOIN dbo.SalesInvoices si ON si.id=d.invoiceId
    WHERE i.productId=@productId AND d.stockDeducted=1 AND NOT EXISTS(SELECT 1 FROM dbo.ProductStockMovements posted
      JOIN dbo.SalesInvoiceItems billed ON billed.id=posted.invoiceItemId WHERE posted.invoiceId=d.invoiceId AND billed.orderItemId=i.orderItemId)
    ORDER BY movementDate DESC,createdAt DESC,id DESC`);
  res.json({ product: productResult.recordset[0], records: result.recordset });
});

router.post('/products/:id/stock-movements', async (_req, _res) => {
  const error = new Error('Manual stock in and stock out are not permitted in Sales.');
  error.status = 403;
  throw error;
});


// Product master with customer approvals, inventory setup and linked supplies.
router.get('/products', async (req, res) => {
  const recordsQuery = request();
  const recordsResult = await recordsQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[weight],CONVERT(varchar(60),p.price) AS price,CONVERT(varchar(60),p.stock) AS stock,p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId  ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses  ORDER BY productId,position;
SELECT a.productId,a.customerId,c.name AS customerName,CONVERT(varchar(10),a.approvalDate,23) AS approvalDate,a.approvalRemarks FROM dbo.ProductCustomerApprovals a JOIN dbo.Customers c ON c.id=a.customerId ORDER BY a.productId,a.position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId  ORDER BY l.productId,l.position;`);
  const productsById = new Map(recordsResult.recordsets[0].map(productRow => [productRow.id, {
    ...productRow,
    processes: [],
    customerApprovals: [],
    linkedSupplies: []
  }]));
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordsResult.recordsets[1]) productsById.get(linkedProductId)?.["processes"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordsResult.recordsets[2]) productsById.get(linkedProductId)?.["customerApprovals"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordsResult.recordsets[3]) productsById.get(linkedProductId)?.linkedSupplies.push(productRow);
  const recordsRows = [...productsById.values()];
  const records = recordsRows;
  res.json({
    records
  });
});
router.get('/products/:id', async (req, res) => {
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  const recordQuery = request();
  recordQuery.input('id', sql.Int, id);
  const recordResult = await recordQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[weight],CONVERT(varchar(60),p.price) AS price,CONVERT(varchar(60),p.stock) AS stock,p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId WHERE p.id=@id ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses WHERE productId=@id ORDER BY productId,position;
SELECT a.productId,a.customerId,c.name AS customerName,CONVERT(varchar(10),a.approvalDate,23) AS approvalDate,a.approvalRemarks FROM dbo.ProductCustomerApprovals a JOIN dbo.Customers c ON c.id=a.customerId WHERE a.productId=@id ORDER BY a.productId,a.position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId WHERE l.productId=@id ORDER BY l.productId,l.position;`);
  const productsById = new Map(recordResult.recordsets[0].map(productRow => [productRow.id, {
    ...productRow,
    processes: [],
    customerApprovals: [],
    linkedSupplies: []
  }]));
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[1]) productsById.get(linkedProductId)?.["processes"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[2]) productsById.get(linkedProductId)?.["customerApprovals"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[3]) productsById.get(linkedProductId)?.linkedSupplies.push(productRow);
  const recordRows = [...productsById.values()];
  if (!recordRows.length) {
    const error = new Error('The product could not be found.');
    error.status = 404;
    throw error;
  }
  const record = recordRows[0];
  res.json({
    record
  });
});
router.get('/product-options', async (req, res) => {
  const result = await request().query(`
    SELECT id,shortName AS name,description,[decimal],isActive FROM dbo.ConfigUnits WHERE isActive=1 AND forProduct=1 ORDER BY shortName;
    SELECT id,shortName AS code,name AS description,isDefault,isActive FROM dbo.ConfigCurrencies WHERE isActive=1 ORDER BY shortName;
    SELECT id,name,isActive FROM dbo.ConfigProductCategories WHERE isActive=1 ORDER BY name;
    SELECT id,sku,name,description FROM dbo.Products WHERE isActive=1 ORDER BY sku;
    SELECT id,code,name,description,unit,isActive FROM dbo.Supplies WHERE isActive=1 ORDER BY name;
    SELECT id,name FROM dbo.Customers WHERE isActive=1 ORDER BY name;
    SELECT DISTINCT name FROM dbo.ProductProcesses ORDER BY name;`);
  res.json({
    units: result.recordsets[0],
    currencies: result.recordsets[1],
    categories: result.recordsets[2],
    headers: result.recordsets[3],
    supplies: result.recordsets[4],
    customers: result.recordsets[5],
    processes: result.recordsets[6].map(row => row.name)
  });
});
router.post('/products', async (req, res) => {
  if (!req.is('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    const error = new Error('Send a valid JSON object.');
    error.status = 400;
    throw error;
  }
  const input = req.body;
  const user = res.locals.user;
  const id = undefined;
  const savedId = await transaction(async scope => {
    let current;
    if (id) {
      const currentQuery = request(scope);
      currentQuery.input('id', sql.Int, id);
      const currentResult = await currentQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[weight],CONVERT(varchar(60),p.price) AS price,CONVERT(varchar(60),p.stock) AS stock,p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p WITH (UPDLOCK,HOLDLOCK)
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId WHERE p.id=@id ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses WHERE productId=@id ORDER BY productId,position;
SELECT a.productId,a.customerId,c.name AS customerName,CONVERT(varchar(10),a.approvalDate,23) AS approvalDate,a.approvalRemarks FROM dbo.ProductCustomerApprovals a JOIN dbo.Customers c ON c.id=a.customerId WHERE a.productId=@id ORDER BY a.productId,a.position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId WHERE l.productId=@id ORDER BY l.productId,l.position;`);
      const productsById2 = new Map(currentResult.recordsets[0].map(productRow => [productRow.id, {
        ...productRow,
        processes: [],
        customerApprovals: [],
        linkedSupplies: []
      }]));
      for (const {
        productId: linkedProductId,
        ...productRow
      } of currentResult.recordsets[1]) productsById2.get(linkedProductId)?.["processes"].push(productRow);
      for (const {
        productId: linkedProductId,
        ...productRow
      } of currentResult.recordsets[2]) productsById2.get(linkedProductId)?.["customerApprovals"].push(productRow);
      for (const {
        productId: linkedProductId,
        ...productRow
      } of currentResult.recordsets[3]) productsById2.get(linkedProductId)?.linkedSupplies.push(productRow);
      const currentRows = [...productsById2.values()];
      if (!currentRows.length) {
        const error = new Error('The product could not be found.');
        error.status = 404;
        throw error;
      }
      current = currentRows[0];
    }
    const product = {
      ...Object.fromEntries(["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "remarks", "tagColor"].map(key => [key, null])),
      ...Object.fromEntries(PRODUCT_QUANTITIES.map(key => [key, null])),
      revision: null,
      vatMode: null,
      productHeaderId: null,
      price: null,
      stock: 0,
      isActive: true,
      processes: [],
      customerApprovals: [],
      linkedSupplies: [],
      inventorySetup: null,
      ...(current || {})
    };
    for (const key of ["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "remarks", "tagColor"]) if (Object.hasOwn(input, key) && input[key] !== undefined) product[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
    if (!(Object.hasOwn(input, 'name') && input['name'] !== undefined) && (!current || Object.hasOwn(input, 'description') && input['description'] !== undefined)) product.name = product.description || product.sku;
    if (!product.name) product.name = product.sku;
    for (const key of [...PRODUCT_QUANTITIES, 'price', 'stock']) if (Object.hasOwn(input, key) && input[key] !== undefined) {
      if (key === 'stock' && (input[key] === null || String(input[key]).trim() === '')) continue;
      const numericFieldValue = input[key] === null || String(input[key]).trim() === '' ? null : Number(input[key]);
      if (numericFieldValue !== null && !Number.isFinite(numericFieldValue)) {
        const error = new Error('A database numeric value is invalid.');
        error.status = 400;
        throw error;
      }
      product[key] = numericFieldValue;
    }
    for (const key of ['vatMode', 'inventorySetup']) if (Object.hasOwn(input, key) && input[key] !== undefined) product[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
    if ([...PRODUCT_QUANTITIES, 'price', 'stock'].some(key => product[key] !== null && (!Number.isFinite(Number(product[key])) || Number(product[key]) < 0)) || product.vatMode !== null && !['customer', 'inclusive', 'exclusive'].includes(product.vatMode)) {
      const error = new Error('Product amounts must be nonnegative and VAT mode must be valid.');
      error.status = 400;
      throw error;
    }
    if (Object.hasOwn(input, 'productHeaderId') && input['productHeaderId'] !== undefined) if (input.productHeaderId === null) {
      product.productHeaderId = null;
    } else {
      const parsedProductHeaderId = Number(input.productHeaderId);
      if (!Number.isSafeInteger(parsedProductHeaderId) || parsedProductHeaderId <= 0 || parsedProductHeaderId > 2147483647) {
        const error = new Error(`Enter a valid ${'Product Header'}.`);
        error.status = 400;
        throw error;
      }
      product.productHeaderId = parsedProductHeaderId;
    }
    if (Object.hasOwn(input, 'processes') && input.processes !== undefined) {
      if (!Array.isArray(input.processes) || input.processes.length > 100) {
        const error = new Error('The submitted collection exceeds the supported size.');
        error.status = 400;
        throw error;
      }
      product.processes = input.processes.map(row => {
        return {
          name: typeof row.name === 'string' ? row.name.trim() : ''
        };
      });
    }
    if (Object.hasOwn(input, 'customerApprovals') && input['customerApprovals'] !== undefined) {
      if (!Array.isArray(input.customerApprovals) || input.customerApprovals.length > 1) {
        const error = new Error('A product can have only one customer.');
        error.status = 400;
        throw error;
      }
      product.customerApprovals = input.customerApprovals.map(row => {
        const parsedCustomerId = Number(row.customerId);
        if (!Number.isSafeInteger(parsedCustomerId) || parsedCustomerId <= 0 || parsedCustomerId > 2147483647) {
          const error = new Error(`Enter a valid ${'customer'}.`);
          error.status = 400;
          throw error;
        }
        return {
          customerId: parsedCustomerId,
          approvalDate: row.approvalDate || null,
          approvalRemarks: typeof row.approvalRemarks === 'string' ? row.approvalRemarks.trim() || null : null
        };
      });
    }
    if (Object.hasOwn(input, 'linkedSupplies') && input['linkedSupplies'] !== undefined) {
      if (!Array.isArray(input.linkedSupplies) || input.linkedSupplies.length > 200) {
        const error = new Error('The submitted collection exceeds the supported size.');
        error.status = 400;
        throw error;
      }
      product.linkedSupplies = input.linkedSupplies.map(row => {
        const parsedSuppliesId = Number(row.suppliesId);
        if (!Number.isSafeInteger(parsedSuppliesId) || parsedSuppliesId <= 0 || parsedSuppliesId > 2147483647) {
          const error = new Error(`Enter a valid ${'Supplies'}.`);
          error.status = 400;
          throw error;
        }
        const numericFieldValue = Number(row.quantity ?? 0);
        if (!Number.isFinite(numericFieldValue) || numericFieldValue < 0.000001) {
          const error = new Error('A database numeric value is invalid.');
          error.status = 400;
          throw error;
        }
        return {
          suppliesId: parsedSuppliesId,
          quantity: numericFieldValue,
          unit: typeof row.unit === 'string' ? row.unit.trim() : ''
        };
      });
    }
    if (product.secondaryUnit && product.quantityPerSecondaryUnit <= 0) {
      const error = new Error('UOP2 conversion quantity must be positive.');
      error.status = 400;
      throw error;
    }
    if (user && Number(product.stock) !== Number(current?.stock || 0)) {
      {
        const error = new Error('Finished-product stock cannot be adjusted from the Product master.');
        error.status = 400;
        throw error;
      }
    }
    for (const field of ['unit', 'secondaryUnit']) {
      if (!product[field] || product[field] === current?.[field]) continue;
      const result = await request(scope).input('name', sql.NVarChar(sql.MAX), product[field]).query('SELECT id FROM dbo.ConfigUnits WHERE shortName=@name AND isActive=1 AND forProduct=1');
      if (!result.recordset.length) {
        const error = new Error('Product UOP and UOP2 must use active Configuration units marked For Product.');
        error.status = 400;
        throw error;
      }
    }
    if (product.currency && product.currency !== current?.currency) {
      const result = await request(scope).input('code', sql.NVarChar(sql.MAX), product.currency).query('SELECT id FROM dbo.ConfigCurrencies WHERE shortName=@code AND isActive=1');
      if (!result.recordset.length) {
        const error = new Error('Select an active configured Currency.');
        error.status = 400;
        throw error;
      }
    }
    if (product.category && product.category !== current?.category) {
      const result = await request(scope).input('name', sql.NVarChar(sql.MAX), product.category).query('SELECT id FROM dbo.ConfigProductCategories WHERE name=@name AND isActive=1');
      if (!result.recordset.length) {
        const error = new Error('Select an active configured Product Category.');
        error.status = 400;
        throw error;
      }
    }
    if (current && product.unit !== current.unit) {
      const result = await request(scope).input('id', sql.Int, current.id).query('SELECT TOP(1) id FROM dbo.SalesOrderItems WHERE productId=@id UNION ALL SELECT TOP(1) id FROM dbo.ProductStockMovements WHERE productId=@id');
      if (Number(current.stock) > 0 || result.recordset.length) {
        const error = new Error('UOP cannot change after finished-product stock, stock movements or sales history exist.');
        error.status = 409;
        throw error;
      }
    }
    let headerId = product.productHeaderId;
    if (headerId) {
      const visited = new Set(id ? [id] : []);
      let first = true;
      while (headerId) {
        if (visited.has(headerId)) {
          const error = new Error('Product Header cannot refer to this product or form a circular group.');
          error.status = 400;
          throw error;
        }
        if (visited.size >= 100) {
          const error = new Error('Product Header grouping exceeds the supported depth.');
          error.status = 400;
          throw error;
        }
        visited.add(headerId);
        const result = await request(scope).input('id', sql.Int, headerId).query('SELECT productHeaderId,isActive FROM dbo.Products WHERE id=@id');
        if (!result.recordset.length) {
          const error = new Error('Select an existing Product Header.');
          error.status = 400;
          throw error;
        }
        if (first && !result.recordset[0].isActive && product.productHeaderId !== current?.productHeaderId) {
          const error = new Error('Select an active Product Header.');
          error.status = 400;
          throw error;
        }
        first = false;
        headerId = result.recordset[0].productHeaderId;
      }
    }
    for (const row of product.customerApprovals) {
      const result = await request(scope).input('id', sql.Int, row.customerId).query('SELECT id FROM dbo.Customers WHERE id=@id');
      if (!result.recordset.length) {
        const error = new Error('A Product Customer row references a customer that does not exist.');
        error.status = 400;
        throw error;
      }
    }
    const previous = new Set(current?.linkedSupplies.map(row => row.suppliesId) || []);
    for (const row of product.linkedSupplies) {
      const result = await request(scope).input('id', sql.Int, row.suppliesId).query('SELECT unit,isActive FROM dbo.Supplies WHERE id=@id');
      const supplies = result.recordset[0];
      if (!supplies || !supplies.isActive && !previous.has(row.suppliesId)) {
        const error = new Error('Select an active Supplies record for each linked material.');
        error.status = 400;
        throw error;
      }
      if (row.unit && row.unit !== supplies.unit) {
        const error = new Error('Linked Supplies UOM must match its Supplies master record.');
        error.status = 400;
        throw error;
      }
      row.unit = supplies.unit;
    }
    const req = request(scope);
    for (const fieldName of ["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "remarks", "tagColor"]) req.input(fieldName, sql.NVarChar(sql.MAX), product[fieldName]);
    for (const fieldName of PRODUCT_QUANTITIES) req.input(fieldName, sql.Decimal(18, 6), product[fieldName]);
    req.input('price', sql.VarChar(sql.MAX), product.price === null ? null : String(product.price)).input('isActive', sql.Bit, product.isActive).input('vatMode', sql.NVarChar(sql.MAX), product.vatMode).input('productHeaderId', sql.Int, product.productHeaderId).input('inventorySetup', sql.NVarChar(sql.MAX), product.inventorySetup);
    if (!id) req.input('stock', sql.Decimal(18, 3), 0);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Products SET [sku]=@sku,[name]=@name,[description]=@description,[unit]=@unit,[revision]=@revision,[secondaryUnit]=@secondaryUnit,[currency]=@currency,[model]=@model,[category]=@category,[remarks]=@remarks,[tagColor]=@tagColor,[quantityPerSecondaryUnit]=@quantityPerSecondaryUnit,[moq]=@moq,[spq]=@spq,[unitCost]=@unitCost,[divisor]=@divisor,[weight]=@weight,[price]=@price,[isActive]=@isActive,[vatMode]=@vatMode,[productHeaderId]=@productHeaderId,[inventorySetup]=@inventorySetup,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Products([sku],[name],[description],[unit],[revision],[secondaryUnit],[currency],[model],[category],[remarks],[tagColor],[quantityPerSecondaryUnit],[moq],[spq],[unitCost],[divisor],[weight],[price],[stock],[isActive],[vatMode],[productHeaderId],[inventorySetup],createdAt,updatedAt) OUTPUT INSERTED.id VALUES(@sku,@name,@description,@unit,@revision,@secondaryUnit,@currency,@model,@category,@remarks,@tagColor,@quantityPerSecondaryUnit,@moq,@spq,@unitCost,@divisor,@weight,@price,@stock,@isActive,@vatMode,@productHeaderId,@inventorySetup,SYSUTCDATETIME(),SYSUTCDATETIME())`);
      saved = result.recordset[0].id;
    }
    if (!current || Object.hasOwn(input, 'processes') && input.processes !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductProcesses WHERE productId=@id');
      for (const [position, row] of product.processes.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('name', sql.NVarChar(sql.MAX), row.name).query('INSERT INTO dbo.ProductProcesses(productId,position,name) VALUES(@id,@position,@name)');
      }
    }
    if (!current || Object.hasOwn(input, 'customerApprovals') && input.customerApprovals !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductCustomerApprovals WHERE productId=@id');
      for (const [position, row] of product.customerApprovals.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('customerId', sql.Int, row.customerId).input('approvalDate', sql.VarChar(sql.MAX), row.approvalDate).input('approvalRemarks', sql.NVarChar(sql.MAX), row.approvalRemarks).query('INSERT INTO dbo.ProductCustomerApprovals(productId,position,customerId,approvalDate,approvalRemarks) VALUES(@id,@position,@customerId,@approvalDate,@approvalRemarks)');
      }
    }
    if (!current || Object.hasOwn(input, 'linkedSupplies') && input['linkedSupplies'] !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductSupplies WHERE productId=@id');
      for (const [position, row] of product.linkedSupplies.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('suppliesId', sql.Int, row.suppliesId).input('quantity', sql.Decimal(18, 6), row.quantity).input('unit', sql.NVarChar(sql.MAX), row.unit).query('INSERT INTO dbo.ProductSupplies(productId,position,suppliesId,quantity,unit) VALUES(@id,@position,@suppliesId,@quantity,@unit)');
      }
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'products').input('action', sql.NVarChar(sql.MAX), id ? 'update' : 'create').input('recordId', sql.NVarChar(sql.MAX), String(saved)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return saved;
  });
  const recordQuery = request();
  recordQuery.input('id', sql.Int, savedId);
  const recordResult = await recordQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[weight],CONVERT(varchar(60),p.price) AS price,CONVERT(varchar(60),p.stock) AS stock,p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId WHERE p.id=@id ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses WHERE productId=@id ORDER BY productId,position;
SELECT a.productId,a.customerId,c.name AS customerName,CONVERT(varchar(10),a.approvalDate,23) AS approvalDate,a.approvalRemarks FROM dbo.ProductCustomerApprovals a JOIN dbo.Customers c ON c.id=a.customerId WHERE a.productId=@id ORDER BY a.productId,a.position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId WHERE l.productId=@id ORDER BY l.productId,l.position;`);
  const productsById = new Map(recordResult.recordsets[0].map(productRow => [productRow.id, {
    ...productRow,
    processes: [],
    customerApprovals: [],
    linkedSupplies: []
  }]));
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[1]) productsById.get(linkedProductId)?.["processes"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[2]) productsById.get(linkedProductId)?.["customerApprovals"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[3]) productsById.get(linkedProductId)?.linkedSupplies.push(productRow);
  const recordRows = [...productsById.values()];
  if (!recordRows.length) {
    const error = new Error('The product could not be found.');
    error.status = 404;
    throw error;
  }
  const record = recordRows[0];
  res.status(201).json({
    record
  });
});
router.put('/products/:id', async (req, res) => {
  if (!req.is('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    const error = new Error('Send a valid JSON object.');
    error.status = 400;
    throw error;
  }
  const input = req.body;
  const user = res.locals.user;
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  const savedId = await transaction(async scope => {
    let current;
    if (id) {
      const currentQuery = request(scope);
      currentQuery.input('id', sql.Int, id);
      const currentResult = await currentQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[weight],CONVERT(varchar(60),p.price) AS price,CONVERT(varchar(60),p.stock) AS stock,p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p WITH (UPDLOCK,HOLDLOCK)
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId WHERE p.id=@id ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses WHERE productId=@id ORDER BY productId,position;
SELECT a.productId,a.customerId,c.name AS customerName,CONVERT(varchar(10),a.approvalDate,23) AS approvalDate,a.approvalRemarks FROM dbo.ProductCustomerApprovals a JOIN dbo.Customers c ON c.id=a.customerId WHERE a.productId=@id ORDER BY a.productId,a.position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId WHERE l.productId=@id ORDER BY l.productId,l.position;`);
      const productsById2 = new Map(currentResult.recordsets[0].map(productRow => [productRow.id, {
        ...productRow,
        processes: [],
        customerApprovals: [],
        linkedSupplies: []
      }]));
      for (const {
        productId: linkedProductId,
        ...productRow
      } of currentResult.recordsets[1]) productsById2.get(linkedProductId)?.["processes"].push(productRow);
      for (const {
        productId: linkedProductId,
        ...productRow
      } of currentResult.recordsets[2]) productsById2.get(linkedProductId)?.["customerApprovals"].push(productRow);
      for (const {
        productId: linkedProductId,
        ...productRow
      } of currentResult.recordsets[3]) productsById2.get(linkedProductId)?.linkedSupplies.push(productRow);
      const currentRows = [...productsById2.values()];
      if (!currentRows.length) {
        const error = new Error('The product could not be found.');
        error.status = 404;
        throw error;
      }
      current = currentRows[0];
    }
    const product = {
      ...Object.fromEntries(["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "remarks", "tagColor"].map(key => [key, null])),
      ...Object.fromEntries(PRODUCT_QUANTITIES.map(key => [key, null])),
      revision: null,
      vatMode: null,
      productHeaderId: null,
      price: null,
      stock: 0,
      isActive: true,
      processes: [],
      customerApprovals: [],
      linkedSupplies: [],
      inventorySetup: null,
      ...(current || {})
    };
    for (const key of ["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "remarks", "tagColor"]) if (Object.hasOwn(input, key) && input[key] !== undefined) product[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
    if (!(Object.hasOwn(input, 'name') && input['name'] !== undefined) && (!current || Object.hasOwn(input, 'description') && input['description'] !== undefined)) product.name = product.description || product.sku;
    if (!product.name) product.name = product.sku;
    for (const key of [...PRODUCT_QUANTITIES, 'price', 'stock']) if (Object.hasOwn(input, key) && input[key] !== undefined) {
      if (key === 'stock' && (input[key] === null || String(input[key]).trim() === '')) continue;
      const numericFieldValue = input[key] === null || String(input[key]).trim() === '' ? null : Number(input[key]);
      if (numericFieldValue !== null && !Number.isFinite(numericFieldValue)) {
        const error = new Error('A database numeric value is invalid.');
        error.status = 400;
        throw error;
      }
      product[key] = numericFieldValue;
    }
    if (Object.hasOwn(input, 'isActive') && input['isActive'] !== undefined) product.isActive = input.isActive === true;
    for (const key of ['vatMode', 'inventorySetup']) if (Object.hasOwn(input, key) && input[key] !== undefined) product[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
    if ([...PRODUCT_QUANTITIES, 'price', 'stock'].some(key => product[key] !== null && (!Number.isFinite(Number(product[key])) || Number(product[key]) < 0)) || product.vatMode !== null && !['customer', 'inclusive', 'exclusive'].includes(product.vatMode)) {
      const error = new Error('Product amounts must be nonnegative and VAT mode must be valid.');
      error.status = 400;
      throw error;
    }
    if (Object.hasOwn(input, 'productHeaderId') && input['productHeaderId'] !== undefined) if (input.productHeaderId === null) {
      product.productHeaderId = null;
    } else {
      const parsedProductHeaderId = Number(input.productHeaderId);
      if (!Number.isSafeInteger(parsedProductHeaderId) || parsedProductHeaderId <= 0 || parsedProductHeaderId > 2147483647) {
        const error = new Error(`Enter a valid ${'Product Header'}.`);
        error.status = 400;
        throw error;
      }
      product.productHeaderId = parsedProductHeaderId;
    }
    if (Object.hasOwn(input, 'processes') && input.processes !== undefined) {
      if (!Array.isArray(input.processes) || input.processes.length > 100) {
        const error = new Error('The submitted collection exceeds the supported size.');
        error.status = 400;
        throw error;
      }
      product.processes = input.processes.map(row => {
        return {
          name: typeof row.name === 'string' ? row.name.trim() : ''
        };
      });
    }
    if (Object.hasOwn(input, 'customerApprovals') && input['customerApprovals'] !== undefined) {
      if (!Array.isArray(input.customerApprovals) || input.customerApprovals.length > 1) {
        const error = new Error('A product can have only one customer.');
        error.status = 400;
        throw error;
      }
      product.customerApprovals = input.customerApprovals.map(row => {
        const parsedCustomerId = Number(row.customerId);
        if (!Number.isSafeInteger(parsedCustomerId) || parsedCustomerId <= 0 || parsedCustomerId > 2147483647) {
          const error = new Error(`Enter a valid ${'customer'}.`);
          error.status = 400;
          throw error;
        }
        return {
          customerId: parsedCustomerId,
          approvalDate: row.approvalDate || null,
          approvalRemarks: typeof row.approvalRemarks === 'string' ? row.approvalRemarks.trim() || null : null
        };
      });
    }
    if (Object.hasOwn(input, 'linkedSupplies') && input['linkedSupplies'] !== undefined) {
      if (!Array.isArray(input.linkedSupplies) || input.linkedSupplies.length > 200) {
        const error = new Error('The submitted collection exceeds the supported size.');
        error.status = 400;
        throw error;
      }
      product.linkedSupplies = input.linkedSupplies.map(row => {
        const parsedSuppliesId = Number(row.suppliesId);
        if (!Number.isSafeInteger(parsedSuppliesId) || parsedSuppliesId <= 0 || parsedSuppliesId > 2147483647) {
          const error = new Error(`Enter a valid ${'Supplies'}.`);
          error.status = 400;
          throw error;
        }
        const numericFieldValue = Number(row.quantity ?? 0);
        if (!Number.isFinite(numericFieldValue) || numericFieldValue < 0.000001) {
          const error = new Error('A database numeric value is invalid.');
          error.status = 400;
          throw error;
        }
        return {
          suppliesId: parsedSuppliesId,
          quantity: numericFieldValue,
          unit: typeof row.unit === 'string' ? row.unit.trim() : ''
        };
      });
    }
    if (product.secondaryUnit && product.quantityPerSecondaryUnit <= 0) {
      const error = new Error('UOP2 conversion quantity must be positive.');
      error.status = 400;
      throw error;
    }
    if (user && Number(product.stock) !== Number(current?.stock || 0)) {
      {
        const error = new Error('Finished-product stock cannot be adjusted from the Product master.');
        error.status = 400;
        throw error;
      }
    }
    for (const field of ['unit', 'secondaryUnit']) {
      if (!product[field] || product[field] === current?.[field]) continue;
      const result = await request(scope).input('name', sql.NVarChar(sql.MAX), product[field]).query('SELECT id FROM dbo.ConfigUnits WHERE shortName=@name AND isActive=1 AND forProduct=1');
      if (!result.recordset.length) {
        const error = new Error('Product UOP and UOP2 must use active Configuration units marked For Product.');
        error.status = 400;
        throw error;
      }
    }
    if (product.currency && product.currency !== current?.currency) {
      const result = await request(scope).input('code', sql.NVarChar(sql.MAX), product.currency).query('SELECT id FROM dbo.ConfigCurrencies WHERE shortName=@code AND isActive=1');
      if (!result.recordset.length) {
        const error = new Error('Select an active configured Currency.');
        error.status = 400;
        throw error;
      }
    }
    if (product.category && product.category !== current?.category) {
      const result = await request(scope).input('name', sql.NVarChar(sql.MAX), product.category).query('SELECT id FROM dbo.ConfigProductCategories WHERE name=@name AND isActive=1');
      if (!result.recordset.length) {
        const error = new Error('Select an active configured Product Category.');
        error.status = 400;
        throw error;
      }
    }
    if (current && product.unit !== current.unit) {
      const result = await request(scope).input('id', sql.Int, current.id).query('SELECT TOP(1) id FROM dbo.SalesOrderItems WHERE productId=@id UNION ALL SELECT TOP(1) id FROM dbo.ProductStockMovements WHERE productId=@id');
      if (Number(current.stock) > 0 || result.recordset.length) {
        const error = new Error('UOP cannot change after finished-product stock, stock movements or sales history exist.');
        error.status = 409;
        throw error;
      }
    }
    let headerId = product.productHeaderId;
    if (headerId) {
      const visited = new Set(id ? [id] : []);
      let first = true;
      while (headerId) {
        if (visited.has(headerId)) {
          const error = new Error('Product Header cannot refer to this product or form a circular group.');
          error.status = 400;
          throw error;
        }
        if (visited.size >= 100) {
          const error = new Error('Product Header grouping exceeds the supported depth.');
          error.status = 400;
          throw error;
        }
        visited.add(headerId);
        const result = await request(scope).input('id', sql.Int, headerId).query('SELECT productHeaderId,isActive FROM dbo.Products WHERE id=@id');
        if (!result.recordset.length) {
          const error = new Error('Select an existing Product Header.');
          error.status = 400;
          throw error;
        }
        if (first && !result.recordset[0].isActive && product.productHeaderId !== current?.productHeaderId) {
          const error = new Error('Select an active Product Header.');
          error.status = 400;
          throw error;
        }
        first = false;
        headerId = result.recordset[0].productHeaderId;
      }
    }
    for (const row of product.customerApprovals) {
      const result = await request(scope).input('id', sql.Int, row.customerId).query('SELECT id FROM dbo.Customers WHERE id=@id');
      if (!result.recordset.length) {
        const error = new Error('A Product Customer row references a customer that does not exist.');
        error.status = 400;
        throw error;
      }
    }
    const previous = new Set(current?.linkedSupplies.map(row => row.suppliesId) || []);
    for (const row of product.linkedSupplies) {
      const result = await request(scope).input('id', sql.Int, row.suppliesId).query('SELECT unit,isActive FROM dbo.Supplies WHERE id=@id');
      const supplies = result.recordset[0];
      if (!supplies || !supplies.isActive && !previous.has(row.suppliesId)) {
        const error = new Error('Select an active Supplies record for each linked material.');
        error.status = 400;
        throw error;
      }
      if (row.unit && row.unit !== supplies.unit) {
        const error = new Error('Linked Supplies UOM must match its Supplies master record.');
        error.status = 400;
        throw error;
      }
      row.unit = supplies.unit;
    }
    const req = request(scope);
    for (const fieldName of ["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "remarks", "tagColor"]) req.input(fieldName, sql.NVarChar(sql.MAX), product[fieldName]);
    for (const fieldName of PRODUCT_QUANTITIES) req.input(fieldName, sql.Decimal(18, 6), product[fieldName]);
    req.input('price', sql.VarChar(sql.MAX), product.price === null ? null : String(product.price)).input('isActive', sql.Bit, product.isActive).input('vatMode', sql.NVarChar(sql.MAX), product.vatMode).input('productHeaderId', sql.Int, product.productHeaderId).input('inventorySetup', sql.NVarChar(sql.MAX), product.inventorySetup);
    if (!id) req.input('stock', sql.Decimal(18, 3), 0);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Products SET [sku]=@sku,[name]=@name,[description]=@description,[unit]=@unit,[revision]=@revision,[secondaryUnit]=@secondaryUnit,[currency]=@currency,[model]=@model,[category]=@category,[remarks]=@remarks,[tagColor]=@tagColor,[quantityPerSecondaryUnit]=@quantityPerSecondaryUnit,[moq]=@moq,[spq]=@spq,[unitCost]=@unitCost,[divisor]=@divisor,[weight]=@weight,[price]=@price,[isActive]=@isActive,[vatMode]=@vatMode,[productHeaderId]=@productHeaderId,[inventorySetup]=@inventorySetup,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Products([sku],[name],[description],[unit],[revision],[secondaryUnit],[currency],[model],[category],[remarks],[tagColor],[quantityPerSecondaryUnit],[moq],[spq],[unitCost],[divisor],[weight],[price],[stock],[isActive],[vatMode],[productHeaderId],[inventorySetup],createdAt,updatedAt) OUTPUT INSERTED.id VALUES(@sku,@name,@description,@unit,@revision,@secondaryUnit,@currency,@model,@category,@remarks,@tagColor,@quantityPerSecondaryUnit,@moq,@spq,@unitCost,@divisor,@weight,@price,@stock,@isActive,@vatMode,@productHeaderId,@inventorySetup,SYSUTCDATETIME(),SYSUTCDATETIME())`);
      saved = result.recordset[0].id;
    }
    if (!current || Object.hasOwn(input, 'processes') && input.processes !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductProcesses WHERE productId=@id');
      for (const [position, row] of product.processes.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('name', sql.NVarChar(sql.MAX), row.name).query('INSERT INTO dbo.ProductProcesses(productId,position,name) VALUES(@id,@position,@name)');
      }
    }
    if (!current || Object.hasOwn(input, 'customerApprovals') && input.customerApprovals !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductCustomerApprovals WHERE productId=@id');
      for (const [position, row] of product.customerApprovals.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('customerId', sql.Int, row.customerId).input('approvalDate', sql.VarChar(sql.MAX), row.approvalDate).input('approvalRemarks', sql.NVarChar(sql.MAX), row.approvalRemarks).query('INSERT INTO dbo.ProductCustomerApprovals(productId,position,customerId,approvalDate,approvalRemarks) VALUES(@id,@position,@customerId,@approvalDate,@approvalRemarks)');
      }
    }
    if (!current || Object.hasOwn(input, 'linkedSupplies') && input['linkedSupplies'] !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductSupplies WHERE productId=@id');
      for (const [position, row] of product.linkedSupplies.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('suppliesId', sql.Int, row.suppliesId).input('quantity', sql.Decimal(18, 6), row.quantity).input('unit', sql.NVarChar(sql.MAX), row.unit).query('INSERT INTO dbo.ProductSupplies(productId,position,suppliesId,quantity,unit) VALUES(@id,@position,@suppliesId,@quantity,@unit)');
      }
    }
    await request(scope).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'products').input('action', sql.NVarChar(sql.MAX), id ? 'update' : 'create').input('recordId', sql.NVarChar(sql.MAX), String(saved)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return saved;
  });
  const recordQuery = request();
  recordQuery.input('id', sql.Int, savedId);
  const recordResult = await recordQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[weight],CONVERT(varchar(60),p.price) AS price,CONVERT(varchar(60),p.stock) AS stock,p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId WHERE p.id=@id ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses WHERE productId=@id ORDER BY productId,position;
SELECT a.productId,a.customerId,c.name AS customerName,CONVERT(varchar(10),a.approvalDate,23) AS approvalDate,a.approvalRemarks FROM dbo.ProductCustomerApprovals a JOIN dbo.Customers c ON c.id=a.customerId WHERE a.productId=@id ORDER BY a.productId,a.position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId WHERE l.productId=@id ORDER BY l.productId,l.position;`);
  const productsById = new Map(recordResult.recordsets[0].map(productRow => [productRow.id, {
    ...productRow,
    processes: [],
    customerApprovals: [],
    linkedSupplies: []
  }]));
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[1]) productsById.get(linkedProductId)?.["processes"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[2]) productsById.get(linkedProductId)?.["customerApprovals"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[3]) productsById.get(linkedProductId)?.linkedSupplies.push(productRow);
  const recordRows = [...productsById.values()];
  if (!recordRows.length) {
    const error = new Error('The product could not be found.');
    error.status = 404;
    throw error;
  }
  const record = recordRows[0];
  res.json({
    record
  });
});

// Sales orders snapshot customer/product data and use exact six-place prices.
router.get('/sales-order-options', async (req, res) => {
  const result = await request().query(`SELECT id,shortName AS code,name AS description,isDefault,isActive FROM dbo.ConfigCurrencies WHERE isActive=1 ORDER BY shortName;
    SELECT id,description AS name,description,isActive FROM dbo.ConfigPaymentTerms WHERE isActive=1 AND forCustomer=1 ORDER BY description;
    SELECT id,code,description,CONVERT(varchar(60),rate) AS rate,[type],[class],isActive FROM dbo.ConfigVatCodes WHERE isActive=1 ORDER BY code;
    SELECT id,name,isActive FROM dbo.ConfigCountries WHERE isActive=1 ORDER BY name;`);
  res.json({ currencies: result.recordsets[0], paymentTerms: result.recordsets[1], vatCodes: result.recordsets[2], countries: result.recordsets[3], shipments: [{ value: 'air', label: 'By Air' }, { value: 'land', label: 'By Land' }, { value: 'boat', label: 'By Boat' }, { value: 'na', label: 'N/A' }] });
});
router.get('/sales-orders', async (req, res) => {
  const result = await request().query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked JOIN dbo.SalesOrderItems originalLine ON originalLine.id=linked.orderItemId WHERE originalLine.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy ORDER BY o.id DESC`);
  const itemResult = await request().query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CAST(CASE WHEN
  EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked WHERE linked.orderItemId=oi.id)
  OR EXISTS(SELECT 1 FROM dbo.SalesInvoices legacy WHERE legacy.orderId=oi.orderId AND (
    NOT EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail WHERE detail.invoiceId=legacy.id)
    OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail LEFT JOIN dbo.SalesOrderItems originalLine
      ON originalLine.id=detail.orderItemId AND originalLine.orderId=legacy.orderId
      WHERE detail.invoiceId=legacy.id AND originalLine.id IS NULL)))
  THEN 1 ELSE 0 END AS bit) AS hasInvoice,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped ORDER BY orderId,id`);
  const records = new Map(result.recordset.map(row => [row.id, { ...row, items: [] }]));
  for (const item of itemResult.recordset) records.get(item.orderId)?.items.push(item);
  res.json({ records: [...records.values()] });
});
router.get('/sales-orders/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) { const error = new Error('Enter a valid order.'); error.status = 400; throw error; }
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked JOIN dbo.SalesOrderItems originalLine ON originalLine.id=linked.orderItemId WHERE originalLine.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
  if (!recordResult.recordset.length) { const error = new Error('Sales order could not be found.'); error.status = 404; throw error; }
  const recordItems = await request().input('id', sql.Int, id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CAST(CASE WHEN
  EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked WHERE linked.orderItemId=oi.id)
  OR EXISTS(SELECT 1 FROM dbo.SalesInvoices legacy WHERE legacy.orderId=oi.orderId AND (
    NOT EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail WHERE detail.invoiceId=legacy.id)
    OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail LEFT JOIN dbo.SalesOrderItems originalLine
      ON originalLine.id=detail.orderItemId AND originalLine.orderId=legacy.orderId
      WHERE detail.invoiceId=legacy.id AND originalLine.id IS NULL)))
  THEN 1 ELSE 0 END AS bit) AS hasInvoice,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
  res.json({ record: { ...recordResult.recordset[0], items: recordItems.recordset } });
});
router.post('/sales-orders', async (req, res) => {
  if (!req.is('application/json')) { const error = new Error('Send this request as JSON.'); error.status = 415; throw error; }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') { const error = new Error('Send a valid JSON object.'); error.status = 400; throw error; }
  const input = req.body;
  const user = res.locals.user;
  const id = undefined;
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) { const error = new Error('Add between 1 and 100 order items.'); error.status = 400; throw error; }
  const detailed = ['billToCustomerId', 'expectedDeliveryDate', 'rate', 'paymentTerm', 'shipment', 'countryOfOrigin', 'vatCode', 'vatInclusive', 'discountType', 'discount'].some(key => Object.hasOwn(input, key)) || input.items.some(item => item.discountRate != null && String(item.discountRate).trim() !== '');
  const items = input.items.map(item => {
    const productId = Number(item.productId);
    if (!Number.isSafeInteger(productId) || productId <= 0 || productId > 2147483647) { const error = new Error('Enter a valid product.'); error.status = 400; throw error; }
    const parsed = {};
    for (const [key, places, maximum] of [['quantity', 3, 1000000000n], ['unitPrice', 6, 100000000000000n], ['discountRate', 6, 100000000n]]) {
      if (key === 'discountRate' && (item[key] == null || String(item[key]).trim() === '')) { parsed[key] = null; continue; }
      if (!['string', 'number'].includes(typeof item[key]) || !/^\d+(?:\.\d+)?$/.test(String(item[key]).trim())) { const error = new Error('Enter a valid nonnegative ' + key + '.'); error.status = 400; throw error; }
      const [whole, rawFraction = ''] = String(item[key]).trim().split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > places) { const error = new Error(key + ' supports at most ' + places + ' decimal places.'); error.status = 400; throw error; }
      const value = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0');
      if (value > maximum || key === 'quantity' && value === 0n) { const error = new Error('Order ' + key + ' exceeds its allowed range.'); error.status = 400; throw error; }
      parsed[key] = value;
    }
    return {
      productId,
      quantity: Number(parsed.quantity) / 1000,
      quantityThousandths: parsed.quantity,
      unitPrice: `${parsed.unitPrice / 1000000n}.${(parsed.unitPrice % 1000000n).toString().padStart(6, '0')}`,
      priceMillionths: parsed.unitPrice,
      discountRate: parsed.discountRate === null ? null : `${parsed.discountRate / 1000000n}.${(parsed.discountRate % 1000000n).toString().padStart(6, '0')}`,
      discountMillionths: parsed.discountRate ?? 0n,
      refNumber: typeof item.refNumber === 'string' ? item.refNumber.trim() || null : null,
      quotationNumber: typeof item.quotationNumber === 'string' ? item.quotationNumber.trim() || null : null,
      deliveryDate: typeof item.deliveryDate === 'string' ? item.deliveryDate.trim() || null : null,
    };
  });
  if (new Set(items.map(item => item.productId)).size !== items.length) { const error = new Error('Orders need distinct product lines.'); error.status = 400; throw error; }
  const customerId = Number(input.customerId);
  const billToCustomerId = input.billToCustomerId === undefined ? customerId : Number(input.billToCustomerId);
  if (![customerId, billToCustomerId].every(value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647)) { const error = new Error('Select a valid Customer and Bill To customer.'); error.status = 400; throw error; }
  const order = {
    customerId, billToCustomerId,
    orderDate: typeof input.orderDate === 'string' ? input.orderDate.trim() : '',
    expectedDeliveryDate: typeof input.expectedDeliveryDate === 'string' ? input.expectedDeliveryDate.trim() || null : null,
    paymentTerm: typeof input.paymentTerm === 'string' ? input.paymentTerm.trim() || null : null,
    shipment: typeof input.shipment === 'string' ? input.shipment.trim() || null : null,
    countryOfOrigin: typeof input.countryOfOrigin === 'string' ? input.countryOfOrigin.trim() || null : null,
    notes: typeof input.notes === 'string' ? input.notes.trim() || null : null,
    discountType: typeof input.discountType === 'string' ? input.discountType.trim() || null : null,
    discount: null,
    status: input.status || 'draft',
  };
  if (!['draft', 'confirmed'].includes(order.status)) { const error = new Error('The order state is invalid.'); error.status = 400; throw error; }
  if (order.discountType !== null && !['percent', 'amount'].includes(order.discountType)) { const error = new Error('Choose Percent, Amount or None for the discount.'); error.status = 400; throw error; }
  if (!order.orderDate || detailed && !order.expectedDeliveryDate) { const error = new Error('Enter the order date and expected delivery date.'); error.status = 400; throw error; }
  for (const date of [order.orderDate, order.expectedDeliveryDate, ...items.map(item => item.deliveryDate)].filter(Boolean)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 4) === '0000' || !Number.isFinite(new Date(date + 'T00:00:00Z').getTime()) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) { const error = new Error('Enter valid order and delivery dates.'); error.status = 400; throw error; }
    if (date < order.orderDate) { const error = new Error('Delivery dates cannot be earlier than the order date.'); error.status = 400; throw error; }
  }
  let rateMillionths = 1000000n;
  if (detailed) {
    if (!['string', 'number'].includes(typeof input.rate) || !/^\d+(?:\.\d+)?$/.test(String(input.rate).trim())) { const error = new Error('Enter a positive exchange rate.'); error.status = 400; throw error; }
    const [whole, rawFraction = ''] = String(input.rate).trim().split('.');
    const fraction = rawFraction.replace(/0+$/, '');
    if (fraction.length > 6) { const error = new Error('Exchange rate supports at most 6 decimal places.'); error.status = 400; throw error; }
    rateMillionths = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
    if (rateMillionths <= 0n || rateMillionths > 1000000000000n) { const error = new Error('Exchange rate must be greater than zero and at most 1,000,000.'); error.status = 400; throw error; }
  }
  let enteredDiscount = 0n;
  if (order.discountType && input.discount != null && String(input.discount).trim() !== '') {
    if (!['string', 'number'].includes(typeof input.discount) || !/^\d+(?:\.\d+)?$/.test(String(input.discount).trim())) { const error = new Error('Enter a valid header discount.'); error.status = 400; throw error; }
    const [whole, rawFraction = ''] = String(input.discount).trim().split('.');
    const fraction = rawFraction.replace(/0+$/, '');
    if (fraction.length > 6) { const error = new Error('Header discount supports at most 6 decimal places.'); error.status = 400; throw error; }
    enteredDiscount = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
    if (enteredDiscount > (order.discountType === 'percent' ? 100000000n : 1000000000000000000n)) { const error = new Error('Header discount exceeds its allowed range.'); error.status = 400; throw error; }
    order.discount = `${enteredDiscount / 1000000n}.${(enteredDiscount % 1000000n).toString().padStart(6, '0')}`;
  }
  const savedId = await transaction(async tx => {
    let current;
    if (id) {
      const currentResult = await request(tx).input('id', sql.Int, id).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked JOIN dbo.SalesOrderItems originalLine ON originalLine.id=linked.orderItemId WHERE originalLine.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
      if (!currentResult.recordset.length) { const error = new Error('Sales order could not be found.'); error.status = 404; throw error; }
      const currentItems = await request(tx).input('id', sql.Int, id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CAST(CASE WHEN
  EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked WHERE linked.orderItemId=oi.id)
  OR EXISTS(SELECT 1 FROM dbo.SalesInvoices legacy WHERE legacy.orderId=oi.orderId AND (
    NOT EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail WHERE detail.invoiceId=legacy.id)
    OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail LEFT JOIN dbo.SalesOrderItems originalLine
      ON originalLine.id=detail.orderItemId AND originalLine.orderId=legacy.orderId
      WHERE detail.invoiceId=legacy.id AND originalLine.id IS NULL)))
  THEN 1 ELSE 0 END AS bit) AS hasInvoice,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
      current = { ...currentResult.recordset[0], items: currentItems.recordset };
      if (current.invoiced || current.delivered) { const error = new Error('This order is already linked to an invoice or delivery receipt and cannot be edited.'); error.status = 409; throw error; }
    }
    const customerResult = await request(tx).input('id', sql.Int, order.customerId).query('SELECT id,name,salesName,address,salesAddressType,isActive,vatCode,vatInclusive,decimalInPrice,decimalInTotalPrice FROM dbo.Customers WHERE id=@id');
    const customer = customerResult.recordset[0];
    if (!customer) { const error = new Error('The customer could not be found.'); error.status = 404; throw error; }
    if (!customer.isActive) { const error = new Error('Select an active customer.'); error.status = 400; throw error; }
    let billTo = customer;
    if (order.billToCustomerId !== order.customerId) {
      const billToResult = await request(tx).input('id', sql.Int, order.billToCustomerId).query('SELECT id,name,salesName,address,salesAddressType,isActive,decimalInPrice,decimalInTotalPrice FROM dbo.Customers WHERE id=@id');
      billTo = billToResult.recordset[0];
      if (!billTo?.isActive) { const error = new Error('Select an active Bill To customer.'); error.status = 400; throw error; }
    }
    order.customerName = customer.name;
    order.customerAddress = customer.address;
    order.billToName = billTo.salesName || billTo.name;
    order.billToAddress = billTo.address ?? null;
    if (detailed) {
      const addresses = await request(tx).input('id', sql.Int, order.billToCustomerId).query('SELECT address FROM dbo.CustomerDeliveryAddresses WHERE customerId=@id ORDER BY position');
      const deliveryAddresses = addresses.recordset.map(row => row.address);
      if (Object.hasOwn(input, 'billToAddress')) {
        order.billToAddress = typeof input.billToAddress === 'string' ? input.billToAddress.trim() || null : null;
        if (order.billToAddress !== null && order.billToAddress !== billTo.address && !deliveryAddresses.includes(order.billToAddress) && !(current?.billToCustomerId === order.billToCustomerId && current.billToAddress === order.billToAddress)) { const error = new Error('Select an office or delivery address for the Bill To customer.'); error.status = 400; throw error; }
      } else if (billTo.salesAddressType === 'delivery') order.billToAddress = deliveryAddresses[0] || billTo.address || null;
    }
    order.preparedByName = current?.preparedByName || user.name;
    order.decimalInPrice = detailed ? billTo.decimalInPrice : 2;
    order.decimalInTotalPrice = detailed ? billTo.decimalInTotalPrice : 2;
    if (![order.decimalInPrice, order.decimalInTotalPrice].every(value => Number.isInteger(value) && value >= 0 && value <= 6)) { const error = new Error('Set the Bill To customer decimal settings from 0 to 6.'); error.status = 400; throw error; }
    const snapshots = [];
    for (const item of [...items].sort((a, b) => a.productId - b.productId)) {
      const productResult = await request(tx).input('id', sql.Int, item.productId).query('SELECT id,name,description,sku,unit,currency,isActive FROM dbo.Products WHERE id=@id');
      const product = productResult.recordset[0];
      if (!product) { const error = new Error('The product could not be found.'); error.status = 404; throw error; }
      if (!product.isActive) { const error = new Error(product.name + ' is inactive.'); error.status = 400; throw error; }
      const sourceCurrency = String(product.currency || '').trim().toUpperCase();
      if (detailed && !sourceCurrency) { const error = new Error('Set the currency of every selected product.'); error.status = 400; throw error; }
      snapshots.push({ ...item, productName: product.name, description: product.description ?? null, sku: product.sku, unit: product.unit, currency: sourceCurrency || 'PHP' });
    }
    const sourceCurrencies = new Set(snapshots.map(item => item.currency));
    if (sourceCurrencies.size !== 1) { const error = new Error('Use products with the same source currency in one sales order.'); error.status = 400; throw error; }
    order.sourceCurrency = [...sourceCurrencies][0];
    order.currency = typeof input.currency === 'string' && input.currency.trim() ? input.currency.trim().toUpperCase() : order.sourceCurrency;
    if (!detailed && input.currency !== undefined && (typeof input.currency !== 'string' || !input.currency.trim() || order.currency !== order.sourceCurrency)) { const error = new Error('Order currency must match the selected product prices.'); error.status = 400; throw error; }
    if (order.currency === order.sourceCurrency && rateMillionths !== 1000000n) { const error = new Error('Use an exchange rate of 1 when source and document currencies match.'); error.status = 400; throw error; }
    order.rate = `${rateMillionths / 1000000n}.${(rateMillionths % 1000000n).toString().padStart(6, '0')}`;
    let vatMillionths = 0n;
    order.vatCode = null;
    order.vatRate = null;
    order.vatInclusive = null;
    if (detailed) {
      if (typeof input.currency !== 'string' || !input.currency.trim() || !order.paymentTerm || !['air', 'land', 'boat', 'na'].includes(order.shipment)) { const error = new Error('Select Currency, Payment Term and Shipment.'); error.status = 400; throw error; }
      const currencyResult = await request(tx).input('code', sql.NVarChar(sql.MAX), order.currency).query('SELECT id FROM dbo.ConfigCurrencies WHERE shortName=@code AND isActive=1');
      if (!currencyResult.recordset.length) { const error = new Error('Select an active currency from Configuration.'); error.status = 400; throw error; }
      const termResult = await request(tx).input('name', sql.NVarChar(sql.MAX), order.paymentTerm).query('SELECT id FROM dbo.ConfigPaymentTerms WHERE description=@name AND forCustomer=1 AND isActive=1');
      if (!termResult.recordset.length) { const error = new Error('Select an active Customer payment term from Configuration.'); error.status = 400; throw error; }
      if (order.countryOfOrigin) {
        const countryResult = await request(tx).input('name', sql.NVarChar(sql.MAX), order.countryOfOrigin).query('SELECT id FROM dbo.ConfigCountries WHERE name=@name AND isActive=1');
        if (!countryResult.recordset.length) { const error = new Error('Select an active Country of Origin from Configuration.'); error.status = 400; throw error; }
      }
      order.vatCode = input.vatCode === undefined ? customer.vatCode : typeof input.vatCode === 'string' ? input.vatCode.trim() || null : null;
      order.vatInclusive = input.vatInclusive === undefined ? customer.vatInclusive : input.vatInclusive;
      if (!order.vatCode || typeof order.vatInclusive !== 'boolean') { const error = new Error('Choose a VAT code and Inclusive or Exclusive VAT.'); error.status = 400; throw error; }
      const vatResult = await request(tx).input('code', sql.NVarChar(sql.MAX), order.vatCode).query('SELECT id,rate FROM dbo.ConfigVatCodes WHERE code=@code AND isActive=1');
      const configuredRate = vatResult.recordset[0]?.rate;
      if (configuredRate == null || String(configuredRate).trim() === '') { const error = new Error('Set the active VAT rate in Configuration before saving.'); error.status = 400; throw error; }
      if (!/^\d+(?:\.\d+)?$/.test(String(configuredRate).trim())) { const error = new Error('The configured VAT rate is invalid.'); error.status = 400; throw error; }
      const [whole, rawFraction = ''] = String(configuredRate).trim().split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > 6) { const error = new Error('VAT rate supports at most 6 decimal places.'); error.status = 400; throw error; }
      vatMillionths = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
      if (vatMillionths > 100000000n) { const error = new Error('VAT rate must be from 0 to 100.'); error.status = 400; throw error; }
      order.vatRate = `${vatMillionths / 1000000n}.${(vatMillionths % 1000000n).toString().padStart(6, '0')}`;
    }
    const places = order.decimalInTotalPrice;
    const moneyScale = 10n ** BigInt(places);
    const moneyDivisor = 10n ** BigInt(9 - places);
    const percent = 100000000n;
    const calculated = items.map(item => {
      const snapshot = snapshots.find(row => row.productId === item.productId);
      const converted = (item.priceMillionths * rateMillionths + 500000n) / 1000000n;
      if (converted > 1000000000000000000n) { const error = new Error('The converted price is too large.'); error.status = 400; throw error; }
      const gross = (item.quantityThousandths * converted + moneyDivisor / 2n) / moneyDivisor;
      if (gross > 1000000000000n * moneyScale) { const error = new Error('Order gross amount exceeds the supported amount.'); error.status = 400; throw error; }
      const lineDiscount = (gross * item.discountMillionths + percent / 2n) / percent;
      return { ...snapshot, converted, gross, lineDiscount, remaining: gross - lineDiscount };
    });
    let remainingNet = calculated.reduce((sum, item) => sum + item.remaining, 0n);
    const headerDivisor = 10n ** BigInt(6 - places);
    const headerDiscount = order.discountType === 'percent' ? (remainingNet * enteredDiscount + percent / 2n) / percent : order.discountType === 'amount' ? (enteredDiscount + headerDivisor / 2n) / headerDivisor : 0n;
    if (headerDiscount > remainingNet) { const error = new Error('Header discount cannot exceed the amount after line discounts.'); error.status = 400; throw error; }
    let remainingDiscount = headerDiscount;
    const totals = { grossAmount: 0n, lineDiscountAmount: 0n, headerDiscountAmount: headerDiscount, discountAmount: 0n, netAmount: 0n, vatAmount: 0n, amount: 0n };
    const savedItems = calculated.map(item => {
      const allocation = remainingNet === 0n ? 0n : remainingNet === item.remaining ? remainingDiscount : remainingDiscount * item.remaining / remainingNet;
      remainingNet -= item.remaining;
      remainingDiscount -= allocation;
      const discountAmount = item.lineDiscount + allocation;
      const discounted = item.gross - discountAmount;
      const taxDivisor = order.vatInclusive ? percent + vatMillionths : percent;
      const vat = (discounted * vatMillionths + taxDivisor / 2n) / taxDivisor;
      const net = order.vatInclusive ? discounted - vat : discounted;
      const amount = order.vatInclusive ? discounted : discounted + vat;
      totals.grossAmount += item.gross;
      totals.lineDiscountAmount += item.lineDiscount;
      totals.discountAmount += discountAmount;
      totals.netAmount += net;
      totals.vatAmount += vat;
      totals.amount += amount;
      const row = { ...item, convertedUnitPrice: `${item.converted / 1000000n}.${(item.converted % 1000000n).toString().padStart(6, '0')}` };
      for (const [key, value] of Object.entries({ grossAmount: item.gross, lineDiscountAmount: item.lineDiscount, headerDiscountAmount: allocation, discountAmount, netAmount: net, vatAmount: vat, amount, lineTotal: amount })) row[key] = `${value / moneyScale}.${(value % moneyScale).toString().padStart(places, '0').padEnd(6, '0')}`;
      return row;
    });
    if (totals.grossAmount > 1000000000000n * moneyScale || totals.amount > 1000000000000n * moneyScale) { const error = new Error('The document total exceeds the supported amount.'); error.status = 400; throw error; }
    for (const [key, value] of Object.entries(totals)) order[key] = `${value / moneyScale}.${(value % moneyScale).toString().padStart(places, '0').padEnd(6, '0')}`;
    order.total = order.amount;
    const req = request(tx).input('customerId', sql.Int, order.customerId).input('customerName', sql.NVarChar(sql.MAX), order.customerName).input('customerAddress', sql.NVarChar(sql.MAX), order.customerAddress)
      .input('billToCustomerId', sql.Int, order.billToCustomerId).input('billToName', sql.NVarChar(sql.MAX), order.billToName).input('billToAddress', sql.NVarChar(sql.MAX), order.billToAddress)
      .input('orderDate', sql.VarChar(sql.MAX), order.orderDate).input('expectedDeliveryDate', sql.VarChar(sql.MAX), order.expectedDeliveryDate)
      .input('currency', sql.NVarChar(sql.MAX), order.currency).input('sourceCurrency', sql.NVarChar(sql.MAX), order.sourceCurrency).input('rate', sql.VarChar(sql.MAX), order.rate)
      .input('paymentTerm', sql.NVarChar(sql.MAX), order.paymentTerm).input('shipment', sql.NVarChar(sql.MAX), order.shipment).input('countryOfOrigin', sql.NVarChar(sql.MAX), order.countryOfOrigin)
      .input('vatCode', sql.NVarChar(sql.MAX), order.vatCode).input('vatRate', sql.VarChar(sql.MAX), order.vatRate).input('vatInclusive', sql.Bit, order.vatInclusive)
      .input('discountType', sql.NVarChar(sql.MAX), order.discountType).input('discount', sql.VarChar(sql.MAX), order.discount)
      .input('decimalInPrice', sql.Int, order.decimalInPrice).input('decimalInTotalPrice', sql.Int, order.decimalInTotalPrice)
      .input('preparedByName', sql.NVarChar(sql.MAX), order.preparedByName).input('notes', sql.NVarChar(sql.MAX), order.notes).input('status', sql.NVarChar(sql.MAX), order.status);
    for (const key of ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'total']) req.input(key, sql.VarChar(sql.MAX), order[key]);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.SalesOrders SET customerId=@customerId,customerName=@customerName,customerAddress=@customerAddress,
        billToCustomerId=@billToCustomerId,billToName=@billToName,billToAddress=@billToAddress,orderDate=@orderDate,expectedDeliveryDate=@expectedDeliveryDate,
        currency=@currency,sourceCurrency=@sourceCurrency,rate=@rate,paymentTerm=@paymentTerm,shipment=@shipment,countryOfOrigin=@countryOfOrigin,
        vatCode=@vatCode,vatRate=@vatRate,vatInclusive=@vatInclusive,discountType=@discountType,discount=@discount,decimalInPrice=@decimalInPrice,decimalInTotalPrice=@decimalInTotalPrice,
        grossAmount=@grossAmount,lineDiscountAmount=@lineDiscountAmount,headerDiscountAmount=@headerDiscountAmount,discountAmount=@discountAmount,
        netAmount=@netAmount,vatAmount=@vatAmount,amount=@amount,total=@total,preparedByName=@preparedByName,notes=@notes,status=@status,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
      await request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.SalesOrderItems WHERE orderId=@id');
    } else {
      const result = await req.input('createdBy', sql.Int, user.id).query(`INSERT INTO dbo.SalesOrders
        (customerId,customerName,customerAddress,billToCustomerId,billToName,billToAddress,orderDate,expectedDeliveryDate,currency,sourceCurrency,rate,
        paymentTerm,shipment,countryOfOrigin,vatCode,vatRate,vatInclusive,discountType,discount,decimalInPrice,decimalInTotalPrice,
        grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,total,preparedByName,notes,status,createdBy,createdAt,updatedAt)
        OUTPUT INSERTED.id VALUES(@customerId,@customerName,@customerAddress,@billToCustomerId,@billToName,@billToAddress,@orderDate,@expectedDeliveryDate,@currency,@sourceCurrency,@rate,
        @paymentTerm,@shipment,@countryOfOrigin,@vatCode,@vatRate,@vatInclusive,@discountType,@discount,@decimalInPrice,@decimalInTotalPrice,
        @grossAmount,@lineDiscountAmount,@headerDiscountAmount,@discountAmount,@netAmount,@vatAmount,@amount,@total,@preparedByName,@notes,@status,@createdBy,SYSUTCDATETIME(),SYSUTCDATETIME())`);
      saved = result.recordset[0].id;
      const number = `SO-${String(saved).padStart(8, '0')}`;
      await request(tx).input('id', sql.Int, saved).input('number', sql.NVarChar(sql.MAX), number).query('UPDATE dbo.SalesOrders SET number=@number WHERE id=@id');
    }
    for (const item of savedItems) {
      const req = request(tx).input('orderId', sql.Int, saved).input('productId', sql.Int, item.productId).input('productName', sql.NVarChar(sql.MAX), item.productName)
        .input('description', sql.NVarChar(sql.MAX), item.description).input('sku', sql.NVarChar(sql.MAX), item.sku).input('unit', sql.NVarChar(sql.MAX), item.unit)
        .input('refNumber', sql.NVarChar(sql.MAX), item.refNumber).input('quotationNumber', sql.NVarChar(sql.MAX), item.quotationNumber)
        .input('currency', sql.NVarChar(sql.MAX), item.currency).input('quantity', sql.Decimal(18, 3), item.quantity).input('unitPrice', sql.VarChar(sql.MAX), item.unitPrice)
        .input('convertedUnitPrice', sql.VarChar(sql.MAX), item.convertedUnitPrice).input('discountRate', sql.VarChar(sql.MAX), item.discountRate).input('deliveryDate', sql.VarChar(sql.MAX), item.deliveryDate);
      for (const key of ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'lineTotal']) req.input(key, sql.VarChar(sql.MAX), item[key]);
      await req.query(`INSERT INTO dbo.SalesOrderItems (orderId,productId,productName,description,sku,unit,refNumber,quotationNumber,currency,quantity,unitPrice,convertedUnitPrice,discountRate,deliveryDate,
        grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,lineTotal)
        VALUES(@orderId,@productId,@productName,@description,@sku,@unit,@refNumber,@quotationNumber,@currency,@quantity,@unitPrice,@convertedUnitPrice,@discountRate,@deliveryDate,
        @grossAmount,@lineDiscountAmount,@headerDiscountAmount,@discountAmount,@netAmount,@vatAmount,@amount,@lineTotal)`);
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'sales-orders').input('action', sql.NVarChar(sql.MAX), id ? 'update' : 'create').input('recordId', sql.NVarChar(sql.MAX), String(saved)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return saved;
  });
  const recordResult = await request().input('id', sql.Int, savedId).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked JOIN dbo.SalesOrderItems originalLine ON originalLine.id=linked.orderItemId WHERE originalLine.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
  if (!recordResult.recordset.length) { const error = new Error('Sales order could not be found.'); error.status = 404; throw error; }
  const recordItems = await request().input('id', sql.Int, savedId).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CAST(CASE WHEN
  EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked WHERE linked.orderItemId=oi.id)
  OR EXISTS(SELECT 1 FROM dbo.SalesInvoices legacy WHERE legacy.orderId=oi.orderId AND (
    NOT EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail WHERE detail.invoiceId=legacy.id)
    OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail LEFT JOIN dbo.SalesOrderItems originalLine
      ON originalLine.id=detail.orderItemId AND originalLine.orderId=legacy.orderId
      WHERE detail.invoiceId=legacy.id AND originalLine.id IS NULL)))
  THEN 1 ELSE 0 END AS bit) AS hasInvoice,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
  res.status(201).json({ record: { ...recordResult.recordset[0], items: recordItems.recordset } });
});
router.put('/sales-orders/:id', async (req, res) => {
  if (!req.is('application/json')) { const error = new Error('Send this request as JSON.'); error.status = 415; throw error; }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') { const error = new Error('Send a valid JSON object.'); error.status = 400; throw error; }
  const input = req.body;
  const user = res.locals.user;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) { const error = new Error('Enter a valid order.'); error.status = 400; throw error; }
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) { const error = new Error('Add between 1 and 100 order items.'); error.status = 400; throw error; }
  const detailed = ['billToCustomerId', 'expectedDeliveryDate', 'rate', 'paymentTerm', 'shipment', 'countryOfOrigin', 'vatCode', 'vatInclusive', 'discountType', 'discount'].some(key => Object.hasOwn(input, key)) || input.items.some(item => item.discountRate != null && String(item.discountRate).trim() !== '');
  const items = input.items.map(item => {
    const productId = Number(item.productId);
    if (!Number.isSafeInteger(productId) || productId <= 0 || productId > 2147483647) { const error = new Error('Enter a valid product.'); error.status = 400; throw error; }
    const parsed = {};
    for (const [key, places, maximum] of [['quantity', 3, 1000000000n], ['unitPrice', 6, 100000000000000n], ['discountRate', 6, 100000000n]]) {
      if (key === 'discountRate' && (item[key] == null || String(item[key]).trim() === '')) { parsed[key] = null; continue; }
      if (!['string', 'number'].includes(typeof item[key]) || !/^\d+(?:\.\d+)?$/.test(String(item[key]).trim())) { const error = new Error('Enter a valid nonnegative ' + key + '.'); error.status = 400; throw error; }
      const [whole, rawFraction = ''] = String(item[key]).trim().split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > places) { const error = new Error(key + ' supports at most ' + places + ' decimal places.'); error.status = 400; throw error; }
      const value = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0');
      if (value > maximum || key === 'quantity' && value === 0n) { const error = new Error('Order ' + key + ' exceeds its allowed range.'); error.status = 400; throw error; }
      parsed[key] = value;
    }
    return {
      productId,
      quantity: Number(parsed.quantity) / 1000,
      quantityThousandths: parsed.quantity,
      unitPrice: `${parsed.unitPrice / 1000000n}.${(parsed.unitPrice % 1000000n).toString().padStart(6, '0')}`,
      priceMillionths: parsed.unitPrice,
      discountRate: parsed.discountRate === null ? null : `${parsed.discountRate / 1000000n}.${(parsed.discountRate % 1000000n).toString().padStart(6, '0')}`,
      discountMillionths: parsed.discountRate ?? 0n,
      refNumber: typeof item.refNumber === 'string' ? item.refNumber.trim() || null : null,
      quotationNumber: typeof item.quotationNumber === 'string' ? item.quotationNumber.trim() || null : null,
      deliveryDate: typeof item.deliveryDate === 'string' ? item.deliveryDate.trim() || null : null,
    };
  });
  if (new Set(items.map(item => item.productId)).size !== items.length) { const error = new Error('Orders need distinct product lines.'); error.status = 400; throw error; }
  const customerId = Number(input.customerId);
  const billToCustomerId = input.billToCustomerId === undefined ? customerId : Number(input.billToCustomerId);
  if (![customerId, billToCustomerId].every(value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647)) { const error = new Error('Select a valid Customer and Bill To customer.'); error.status = 400; throw error; }
  const order = {
    customerId, billToCustomerId,
    orderDate: typeof input.orderDate === 'string' ? input.orderDate.trim() : '',
    expectedDeliveryDate: typeof input.expectedDeliveryDate === 'string' ? input.expectedDeliveryDate.trim() || null : null,
    paymentTerm: typeof input.paymentTerm === 'string' ? input.paymentTerm.trim() || null : null,
    shipment: typeof input.shipment === 'string' ? input.shipment.trim() || null : null,
    countryOfOrigin: typeof input.countryOfOrigin === 'string' ? input.countryOfOrigin.trim() || null : null,
    notes: typeof input.notes === 'string' ? input.notes.trim() || null : null,
    discountType: typeof input.discountType === 'string' ? input.discountType.trim() || null : null,
    discount: null,
    status: input.status || 'draft',
  };
  if (!['draft', 'confirmed'].includes(order.status)) { const error = new Error('The order state is invalid.'); error.status = 400; throw error; }
  if (order.discountType !== null && !['percent', 'amount'].includes(order.discountType)) { const error = new Error('Choose Percent, Amount or None for the discount.'); error.status = 400; throw error; }
  if (!order.orderDate || detailed && !order.expectedDeliveryDate) { const error = new Error('Enter the order date and expected delivery date.'); error.status = 400; throw error; }
  for (const date of [order.orderDate, order.expectedDeliveryDate, ...items.map(item => item.deliveryDate)].filter(Boolean)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 4) === '0000' || !Number.isFinite(new Date(date + 'T00:00:00Z').getTime()) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) { const error = new Error('Enter valid order and delivery dates.'); error.status = 400; throw error; }
    if (date < order.orderDate) { const error = new Error('Delivery dates cannot be earlier than the order date.'); error.status = 400; throw error; }
  }
  let rateMillionths = 1000000n;
  if (detailed) {
    if (!['string', 'number'].includes(typeof input.rate) || !/^\d+(?:\.\d+)?$/.test(String(input.rate).trim())) { const error = new Error('Enter a positive exchange rate.'); error.status = 400; throw error; }
    const [whole, rawFraction = ''] = String(input.rate).trim().split('.');
    const fraction = rawFraction.replace(/0+$/, '');
    if (fraction.length > 6) { const error = new Error('Exchange rate supports at most 6 decimal places.'); error.status = 400; throw error; }
    rateMillionths = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
    if (rateMillionths <= 0n || rateMillionths > 1000000000000n) { const error = new Error('Exchange rate must be greater than zero and at most 1,000,000.'); error.status = 400; throw error; }
  }
  let enteredDiscount = 0n;
  if (order.discountType && input.discount != null && String(input.discount).trim() !== '') {
    if (!['string', 'number'].includes(typeof input.discount) || !/^\d+(?:\.\d+)?$/.test(String(input.discount).trim())) { const error = new Error('Enter a valid header discount.'); error.status = 400; throw error; }
    const [whole, rawFraction = ''] = String(input.discount).trim().split('.');
    const fraction = rawFraction.replace(/0+$/, '');
    if (fraction.length > 6) { const error = new Error('Header discount supports at most 6 decimal places.'); error.status = 400; throw error; }
    enteredDiscount = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
    if (enteredDiscount > (order.discountType === 'percent' ? 100000000n : 1000000000000000000n)) { const error = new Error('Header discount exceeds its allowed range.'); error.status = 400; throw error; }
    order.discount = `${enteredDiscount / 1000000n}.${(enteredDiscount % 1000000n).toString().padStart(6, '0')}`;
  }
  const savedId = await transaction(async tx => {
    let current;
    if (id) {
      const currentResult = await request(tx).input('id', sql.Int, id).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked JOIN dbo.SalesOrderItems originalLine ON originalLine.id=linked.orderItemId WHERE originalLine.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
      if (!currentResult.recordset.length) { const error = new Error('Sales order could not be found.'); error.status = 404; throw error; }
      const currentItems = await request(tx).input('id', sql.Int, id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CAST(CASE WHEN
  EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked WHERE linked.orderItemId=oi.id)
  OR EXISTS(SELECT 1 FROM dbo.SalesInvoices legacy WHERE legacy.orderId=oi.orderId AND (
    NOT EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail WHERE detail.invoiceId=legacy.id)
    OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail LEFT JOIN dbo.SalesOrderItems originalLine
      ON originalLine.id=detail.orderItemId AND originalLine.orderId=legacy.orderId
      WHERE detail.invoiceId=legacy.id AND originalLine.id IS NULL)))
  THEN 1 ELSE 0 END AS bit) AS hasInvoice,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
      current = { ...currentResult.recordset[0], items: currentItems.recordset };
      if (current.invoiced || current.delivered) { const error = new Error('This order is already linked to an invoice or delivery receipt and cannot be edited.'); error.status = 409; throw error; }
    }
    const customerResult = await request(tx).input('id', sql.Int, order.customerId).query('SELECT id,name,salesName,address,salesAddressType,isActive,vatCode,vatInclusive,decimalInPrice,decimalInTotalPrice FROM dbo.Customers WHERE id=@id');
    const customer = customerResult.recordset[0];
    if (!customer) { const error = new Error('The customer could not be found.'); error.status = 404; throw error; }
    if (!customer.isActive) { const error = new Error('Select an active customer.'); error.status = 400; throw error; }
    let billTo = customer;
    if (order.billToCustomerId !== order.customerId) {
      const billToResult = await request(tx).input('id', sql.Int, order.billToCustomerId).query('SELECT id,name,salesName,address,salesAddressType,isActive,decimalInPrice,decimalInTotalPrice FROM dbo.Customers WHERE id=@id');
      billTo = billToResult.recordset[0];
      if (!billTo?.isActive) { const error = new Error('Select an active Bill To customer.'); error.status = 400; throw error; }
    }
    order.customerName = customer.name;
    order.customerAddress = customer.address;
    order.billToName = billTo.salesName || billTo.name;
    order.billToAddress = billTo.address ?? null;
    if (detailed) {
      const addresses = await request(tx).input('id', sql.Int, order.billToCustomerId).query('SELECT address FROM dbo.CustomerDeliveryAddresses WHERE customerId=@id ORDER BY position');
      const deliveryAddresses = addresses.recordset.map(row => row.address);
      if (Object.hasOwn(input, 'billToAddress')) {
        order.billToAddress = typeof input.billToAddress === 'string' ? input.billToAddress.trim() || null : null;
        if (order.billToAddress !== null && order.billToAddress !== billTo.address && !deliveryAddresses.includes(order.billToAddress) && !(current?.billToCustomerId === order.billToCustomerId && current.billToAddress === order.billToAddress)) { const error = new Error('Select an office or delivery address for the Bill To customer.'); error.status = 400; throw error; }
      } else if (billTo.salesAddressType === 'delivery') order.billToAddress = deliveryAddresses[0] || billTo.address || null;
    }
    order.preparedByName = current?.preparedByName || user.name;
    order.decimalInPrice = detailed ? billTo.decimalInPrice : 2;
    order.decimalInTotalPrice = detailed ? billTo.decimalInTotalPrice : 2;
    if (![order.decimalInPrice, order.decimalInTotalPrice].every(value => Number.isInteger(value) && value >= 0 && value <= 6)) { const error = new Error('Set the Bill To customer decimal settings from 0 to 6.'); error.status = 400; throw error; }
    const snapshots = [];
    for (const item of [...items].sort((a, b) => a.productId - b.productId)) {
      const productResult = await request(tx).input('id', sql.Int, item.productId).query('SELECT id,name,description,sku,unit,currency,isActive FROM dbo.Products WHERE id=@id');
      const product = productResult.recordset[0];
      if (!product) { const error = new Error('The product could not be found.'); error.status = 404; throw error; }
      if (!product.isActive) { const error = new Error(product.name + ' is inactive.'); error.status = 400; throw error; }
      const sourceCurrency = String(product.currency || '').trim().toUpperCase();
      if (detailed && !sourceCurrency) { const error = new Error('Set the currency of every selected product.'); error.status = 400; throw error; }
      snapshots.push({ ...item, productName: product.name, description: product.description ?? null, sku: product.sku, unit: product.unit, currency: sourceCurrency || 'PHP' });
    }
    const sourceCurrencies = new Set(snapshots.map(item => item.currency));
    if (sourceCurrencies.size !== 1) { const error = new Error('Use products with the same source currency in one sales order.'); error.status = 400; throw error; }
    order.sourceCurrency = [...sourceCurrencies][0];
    order.currency = typeof input.currency === 'string' && input.currency.trim() ? input.currency.trim().toUpperCase() : order.sourceCurrency;
    if (!detailed && input.currency !== undefined && (typeof input.currency !== 'string' || !input.currency.trim() || order.currency !== order.sourceCurrency)) { const error = new Error('Order currency must match the selected product prices.'); error.status = 400; throw error; }
    if (order.currency === order.sourceCurrency && rateMillionths !== 1000000n) { const error = new Error('Use an exchange rate of 1 when source and document currencies match.'); error.status = 400; throw error; }
    order.rate = `${rateMillionths / 1000000n}.${(rateMillionths % 1000000n).toString().padStart(6, '0')}`;
    let vatMillionths = 0n;
    order.vatCode = null;
    order.vatRate = null;
    order.vatInclusive = null;
    if (detailed) {
      if (typeof input.currency !== 'string' || !input.currency.trim() || !order.paymentTerm || !['air', 'land', 'boat', 'na'].includes(order.shipment)) { const error = new Error('Select Currency, Payment Term and Shipment.'); error.status = 400; throw error; }
      const currencyResult = await request(tx).input('code', sql.NVarChar(sql.MAX), order.currency).query('SELECT id FROM dbo.ConfigCurrencies WHERE shortName=@code AND isActive=1');
      if (!currencyResult.recordset.length) { const error = new Error('Select an active currency from Configuration.'); error.status = 400; throw error; }
      const termResult = await request(tx).input('name', sql.NVarChar(sql.MAX), order.paymentTerm).query('SELECT id FROM dbo.ConfigPaymentTerms WHERE description=@name AND forCustomer=1 AND isActive=1');
      if (!termResult.recordset.length) { const error = new Error('Select an active Customer payment term from Configuration.'); error.status = 400; throw error; }
      if (order.countryOfOrigin) {
        const countryResult = await request(tx).input('name', sql.NVarChar(sql.MAX), order.countryOfOrigin).query('SELECT id FROM dbo.ConfigCountries WHERE name=@name AND isActive=1');
        if (!countryResult.recordset.length) { const error = new Error('Select an active Country of Origin from Configuration.'); error.status = 400; throw error; }
      }
      order.vatCode = input.vatCode === undefined ? customer.vatCode : typeof input.vatCode === 'string' ? input.vatCode.trim() || null : null;
      order.vatInclusive = input.vatInclusive === undefined ? customer.vatInclusive : input.vatInclusive;
      if (!order.vatCode || typeof order.vatInclusive !== 'boolean') { const error = new Error('Choose a VAT code and Inclusive or Exclusive VAT.'); error.status = 400; throw error; }
      const vatResult = await request(tx).input('code', sql.NVarChar(sql.MAX), order.vatCode).query('SELECT id,rate FROM dbo.ConfigVatCodes WHERE code=@code AND isActive=1');
      const configuredRate = vatResult.recordset[0]?.rate;
      if (configuredRate == null || String(configuredRate).trim() === '') { const error = new Error('Set the active VAT rate in Configuration before saving.'); error.status = 400; throw error; }
      if (!/^\d+(?:\.\d+)?$/.test(String(configuredRate).trim())) { const error = new Error('The configured VAT rate is invalid.'); error.status = 400; throw error; }
      const [whole, rawFraction = ''] = String(configuredRate).trim().split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > 6) { const error = new Error('VAT rate supports at most 6 decimal places.'); error.status = 400; throw error; }
      vatMillionths = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
      if (vatMillionths > 100000000n) { const error = new Error('VAT rate must be from 0 to 100.'); error.status = 400; throw error; }
      order.vatRate = `${vatMillionths / 1000000n}.${(vatMillionths % 1000000n).toString().padStart(6, '0')}`;
    }
    const places = order.decimalInTotalPrice;
    const moneyScale = 10n ** BigInt(places);
    const moneyDivisor = 10n ** BigInt(9 - places);
    const percent = 100000000n;
    const calculated = items.map(item => {
      const snapshot = snapshots.find(row => row.productId === item.productId);
      const converted = (item.priceMillionths * rateMillionths + 500000n) / 1000000n;
      if (converted > 1000000000000000000n) { const error = new Error('The converted price is too large.'); error.status = 400; throw error; }
      const gross = (item.quantityThousandths * converted + moneyDivisor / 2n) / moneyDivisor;
      if (gross > 1000000000000n * moneyScale) { const error = new Error('Order gross amount exceeds the supported amount.'); error.status = 400; throw error; }
      const lineDiscount = (gross * item.discountMillionths + percent / 2n) / percent;
      return { ...snapshot, converted, gross, lineDiscount, remaining: gross - lineDiscount };
    });
    let remainingNet = calculated.reduce((sum, item) => sum + item.remaining, 0n);
    const headerDivisor = 10n ** BigInt(6 - places);
    const headerDiscount = order.discountType === 'percent' ? (remainingNet * enteredDiscount + percent / 2n) / percent : order.discountType === 'amount' ? (enteredDiscount + headerDivisor / 2n) / headerDivisor : 0n;
    if (headerDiscount > remainingNet) { const error = new Error('Header discount cannot exceed the amount after line discounts.'); error.status = 400; throw error; }
    let remainingDiscount = headerDiscount;
    const totals = { grossAmount: 0n, lineDiscountAmount: 0n, headerDiscountAmount: headerDiscount, discountAmount: 0n, netAmount: 0n, vatAmount: 0n, amount: 0n };
    const savedItems = calculated.map(item => {
      const allocation = remainingNet === 0n ? 0n : remainingNet === item.remaining ? remainingDiscount : remainingDiscount * item.remaining / remainingNet;
      remainingNet -= item.remaining;
      remainingDiscount -= allocation;
      const discountAmount = item.lineDiscount + allocation;
      const discounted = item.gross - discountAmount;
      const taxDivisor = order.vatInclusive ? percent + vatMillionths : percent;
      const vat = (discounted * vatMillionths + taxDivisor / 2n) / taxDivisor;
      const net = order.vatInclusive ? discounted - vat : discounted;
      const amount = order.vatInclusive ? discounted : discounted + vat;
      totals.grossAmount += item.gross;
      totals.lineDiscountAmount += item.lineDiscount;
      totals.discountAmount += discountAmount;
      totals.netAmount += net;
      totals.vatAmount += vat;
      totals.amount += amount;
      const row = { ...item, convertedUnitPrice: `${item.converted / 1000000n}.${(item.converted % 1000000n).toString().padStart(6, '0')}` };
      for (const [key, value] of Object.entries({ grossAmount: item.gross, lineDiscountAmount: item.lineDiscount, headerDiscountAmount: allocation, discountAmount, netAmount: net, vatAmount: vat, amount, lineTotal: amount })) row[key] = `${value / moneyScale}.${(value % moneyScale).toString().padStart(places, '0').padEnd(6, '0')}`;
      return row;
    });
    if (totals.grossAmount > 1000000000000n * moneyScale || totals.amount > 1000000000000n * moneyScale) { const error = new Error('The document total exceeds the supported amount.'); error.status = 400; throw error; }
    for (const [key, value] of Object.entries(totals)) order[key] = `${value / moneyScale}.${(value % moneyScale).toString().padStart(places, '0').padEnd(6, '0')}`;
    order.total = order.amount;
    const req = request(tx).input('customerId', sql.Int, order.customerId).input('customerName', sql.NVarChar(sql.MAX), order.customerName).input('customerAddress', sql.NVarChar(sql.MAX), order.customerAddress)
      .input('billToCustomerId', sql.Int, order.billToCustomerId).input('billToName', sql.NVarChar(sql.MAX), order.billToName).input('billToAddress', sql.NVarChar(sql.MAX), order.billToAddress)
      .input('orderDate', sql.VarChar(sql.MAX), order.orderDate).input('expectedDeliveryDate', sql.VarChar(sql.MAX), order.expectedDeliveryDate)
      .input('currency', sql.NVarChar(sql.MAX), order.currency).input('sourceCurrency', sql.NVarChar(sql.MAX), order.sourceCurrency).input('rate', sql.VarChar(sql.MAX), order.rate)
      .input('paymentTerm', sql.NVarChar(sql.MAX), order.paymentTerm).input('shipment', sql.NVarChar(sql.MAX), order.shipment).input('countryOfOrigin', sql.NVarChar(sql.MAX), order.countryOfOrigin)
      .input('vatCode', sql.NVarChar(sql.MAX), order.vatCode).input('vatRate', sql.VarChar(sql.MAX), order.vatRate).input('vatInclusive', sql.Bit, order.vatInclusive)
      .input('discountType', sql.NVarChar(sql.MAX), order.discountType).input('discount', sql.VarChar(sql.MAX), order.discount)
      .input('decimalInPrice', sql.Int, order.decimalInPrice).input('decimalInTotalPrice', sql.Int, order.decimalInTotalPrice)
      .input('preparedByName', sql.NVarChar(sql.MAX), order.preparedByName).input('notes', sql.NVarChar(sql.MAX), order.notes).input('status', sql.NVarChar(sql.MAX), order.status);
    for (const key of ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'total']) req.input(key, sql.VarChar(sql.MAX), order[key]);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.SalesOrders SET customerId=@customerId,customerName=@customerName,customerAddress=@customerAddress,
        billToCustomerId=@billToCustomerId,billToName=@billToName,billToAddress=@billToAddress,orderDate=@orderDate,expectedDeliveryDate=@expectedDeliveryDate,
        currency=@currency,sourceCurrency=@sourceCurrency,rate=@rate,paymentTerm=@paymentTerm,shipment=@shipment,countryOfOrigin=@countryOfOrigin,
        vatCode=@vatCode,vatRate=@vatRate,vatInclusive=@vatInclusive,discountType=@discountType,discount=@discount,decimalInPrice=@decimalInPrice,decimalInTotalPrice=@decimalInTotalPrice,
        grossAmount=@grossAmount,lineDiscountAmount=@lineDiscountAmount,headerDiscountAmount=@headerDiscountAmount,discountAmount=@discountAmount,
        netAmount=@netAmount,vatAmount=@vatAmount,amount=@amount,total=@total,preparedByName=@preparedByName,notes=@notes,status=@status,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
      await request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.SalesOrderItems WHERE orderId=@id');
    } else {
      const result = await req.input('createdBy', sql.Int, user.id).query(`INSERT INTO dbo.SalesOrders
        (customerId,customerName,customerAddress,billToCustomerId,billToName,billToAddress,orderDate,expectedDeliveryDate,currency,sourceCurrency,rate,
        paymentTerm,shipment,countryOfOrigin,vatCode,vatRate,vatInclusive,discountType,discount,decimalInPrice,decimalInTotalPrice,
        grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,total,preparedByName,notes,status,createdBy,createdAt,updatedAt)
        OUTPUT INSERTED.id VALUES(@customerId,@customerName,@customerAddress,@billToCustomerId,@billToName,@billToAddress,@orderDate,@expectedDeliveryDate,@currency,@sourceCurrency,@rate,
        @paymentTerm,@shipment,@countryOfOrigin,@vatCode,@vatRate,@vatInclusive,@discountType,@discount,@decimalInPrice,@decimalInTotalPrice,
        @grossAmount,@lineDiscountAmount,@headerDiscountAmount,@discountAmount,@netAmount,@vatAmount,@amount,@total,@preparedByName,@notes,@status,@createdBy,SYSUTCDATETIME(),SYSUTCDATETIME())`);
      saved = result.recordset[0].id;
      const number = `SO-${String(saved).padStart(8, '0')}`;
      await request(tx).input('id', sql.Int, saved).input('number', sql.NVarChar(sql.MAX), number).query('UPDATE dbo.SalesOrders SET number=@number WHERE id=@id');
    }
    for (const item of savedItems) {
      const req = request(tx).input('orderId', sql.Int, saved).input('productId', sql.Int, item.productId).input('productName', sql.NVarChar(sql.MAX), item.productName)
        .input('description', sql.NVarChar(sql.MAX), item.description).input('sku', sql.NVarChar(sql.MAX), item.sku).input('unit', sql.NVarChar(sql.MAX), item.unit)
        .input('refNumber', sql.NVarChar(sql.MAX), item.refNumber).input('quotationNumber', sql.NVarChar(sql.MAX), item.quotationNumber)
        .input('currency', sql.NVarChar(sql.MAX), item.currency).input('quantity', sql.Decimal(18, 3), item.quantity).input('unitPrice', sql.VarChar(sql.MAX), item.unitPrice)
        .input('convertedUnitPrice', sql.VarChar(sql.MAX), item.convertedUnitPrice).input('discountRate', sql.VarChar(sql.MAX), item.discountRate).input('deliveryDate', sql.VarChar(sql.MAX), item.deliveryDate);
      for (const key of ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'lineTotal']) req.input(key, sql.VarChar(sql.MAX), item[key]);
      await req.query(`INSERT INTO dbo.SalesOrderItems (orderId,productId,productName,description,sku,unit,refNumber,quotationNumber,currency,quantity,unitPrice,convertedUnitPrice,discountRate,deliveryDate,
        grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,lineTotal)
        VALUES(@orderId,@productId,@productName,@description,@sku,@unit,@refNumber,@quotationNumber,@currency,@quantity,@unitPrice,@convertedUnitPrice,@discountRate,@deliveryDate,
        @grossAmount,@lineDiscountAmount,@headerDiscountAmount,@discountAmount,@netAmount,@vatAmount,@amount,@lineTotal)`);
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'sales-orders').input('action', sql.NVarChar(sql.MAX), id ? 'update' : 'create').input('recordId', sql.NVarChar(sql.MAX), String(saved)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return saved;
  });
  const recordResult = await request().input('id', sql.Int, savedId).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked JOIN dbo.SalesOrderItems originalLine ON originalLine.id=linked.orderItemId WHERE originalLine.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
  if (!recordResult.recordset.length) { const error = new Error('Sales order could not be found.'); error.status = 404; throw error; }
  const recordItems = await request().input('id', sql.Int, savedId).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CAST(CASE WHEN
  EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked WHERE linked.orderItemId=oi.id)
  OR EXISTS(SELECT 1 FROM dbo.SalesInvoices legacy WHERE legacy.orderId=oi.orderId AND (
    NOT EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail WHERE detail.invoiceId=legacy.id)
    OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail LEFT JOIN dbo.SalesOrderItems originalLine
      ON originalLine.id=detail.orderItemId AND originalLine.orderId=legacy.orderId
      WHERE detail.invoiceId=legacy.id AND originalLine.id IS NULL)))
  THEN 1 ELSE 0 END AS bit) AS hasInvoice,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
  res.status(200).json({ record: { ...recordResult.recordset[0], items: recordItems.recordset } });
});
router.patch('/sales-orders/:id/items', async (req, res) => {
  const user = res.locals.user;
  if (user?.system !== 'sales' || !user.isActive || !['admin', 'saleshead', 'sales'].includes(user.role)) throw Object.assign(new Error('Sign in to Sales to edit order items.'), { status: 403 });
  if (!req.is('application/json')) throw Object.assign(new Error('Send this request as JSON.'), { status: 415 });
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') throw Object.assign(new Error('Send a valid JSON object.'), { status: 400 });
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw Object.assign(new Error('Select a valid sales order.'), { status: 400 });
  const input = req.body;
  const allowedBody = ['items', 'removedItemIds'];
  if (Object.keys(input).some(key => !allowedBody.includes(key))) throw Object.assign(new Error('Order header information cannot be changed after an invoice exists.'), { status: 400 });
  if (!Array.isArray(input.items) || input.items.length > 100) throw Object.assign(new Error('Submit up to 100 editable order items.'), { status: 400 });
  const removed = input.removedItemIds === undefined ? [] : input.removedItemIds;
  if (!Array.isArray(removed) || removed.length > 100) throw Object.assign(new Error('Submit valid existing order items.'), { status: 400 });
  const removedItemIds = removed.map(value => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 2147483647) throw Object.assign(new Error('Enter a valid existing item.'), { status: 400 });
    return parsed;
  });
  if (new Set(removedItemIds).size !== removedItemIds.length) throw Object.assign(new Error('Each removed item must appear once.'), { status: 400 });
  const fields = ['id', 'productId', 'quantity', 'unitPrice', 'discountRate', 'refNumber', 'quotationNumber', 'deliveryDate'];
  const requested = input.items.map(item => {
    if (!item || Array.isArray(item) || typeof item !== 'object' || Object.keys(item).some(key => !fields.includes(key))) throw Object.assign(new Error('Submit only editable order item fields.'), { status: 400 });
    const itemId = item.id === undefined ? null : Number(item.id);
    if (itemId !== null && (!Number.isSafeInteger(itemId) || itemId <= 0 || itemId > 2147483647)) throw Object.assign(new Error('Enter a valid existing item.'), { status: 400 });
    return { ...item, id: itemId };
  });
  const requestedIds = requested.filter(item => item.id !== null).map(item => item.id);
  if (new Set(requestedIds).size !== requestedIds.length || requestedIds.some(itemId => removedItemIds.includes(itemId))) throw Object.assign(new Error('Each item can only be changed or removed once.'), { status: 400 });
  if (!requested.length && !removedItemIds.length) throw Object.assign(new Error('Select an editable item to save.'), { status: 400 });
  await transaction(async tx => {
    const orderResult = await request(tx).input('id', sql.Int, id).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked JOIN dbo.SalesOrderItems originalLine ON originalLine.id=linked.orderItemId WHERE originalLine.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
    if (!orderResult.recordset.length) throw Object.assign(new Error('Sales order could not be found.'), { status: 404 });
    const itemResult = await request(tx).input('id', sql.Int, id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CAST(CASE WHEN
  EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked WHERE linked.orderItemId=oi.id)
  OR EXISTS(SELECT 1 FROM dbo.SalesInvoices legacy WHERE legacy.orderId=oi.orderId AND (
    NOT EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail WHERE detail.invoiceId=legacy.id)
    OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail LEFT JOIN dbo.SalesOrderItems originalLine
      ON originalLine.id=detail.orderItemId AND originalLine.orderId=legacy.orderId
      WHERE detail.invoiceId=legacy.id AND originalLine.id IS NULL)))
  THEN 1 ELSE 0 END AS bit) AS hasInvoice,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi WITH (UPDLOCK,HOLDLOCK)
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
    const order = { ...orderResult.recordset[0], items: itemResult.recordset };
    const current = new Map(order.items.map(item => [item.id, item]));
    // Lock both the references and their empty key ranges. Invoice creation takes
    // this same order lock, so a stale form cannot race a newly issued invoice.
    const references = await request(tx).input('id', sql.Int, id).query(`SELECT i.id AS invoiceId,linked.orderItemId
      FROM dbo.SalesInvoices i WITH (UPDLOCK,HOLDLOCK)
      LEFT JOIN dbo.SalesInvoiceItems linked WITH (UPDLOCK,HOLDLOCK) ON linked.invoiceId=i.id
      WHERE i.orderId=@id OR linked.orderItemId IN (SELECT id FROM dbo.SalesOrderItems WHERE orderId=@id)`);
    const deliveries = await request(tx).input('id', sql.Int, id).query(`SELECT d.id AS deliveryReceiptId,linked.orderItemId
      FROM dbo.DeliveryReceipts d WITH (UPDLOCK,HOLDLOCK)
      LEFT JOIN dbo.DeliveryReceiptItems linked WITH (UPDLOCK,HOLDLOCK) ON linked.deliveryReceiptId=d.id
      WHERE d.orderId=@id OR linked.orderItemId IN (SELECT id FROM dbo.SalesOrderItems WHERE orderId=@id)`);
    const unknownInvoice = references.recordset.some(row => !current.has(row.orderItemId));
    const unknownDelivery = deliveries.recordset.some(row => !current.has(row.orderItemId));
    const invoiceIds = new Set(references.recordset.map(row => row.orderItemId));
    const deliveryIds = new Set(deliveries.recordset.map(row => row.orderItemId));
    const frozen = new Set(order.items.filter(item => item.hasInvoice || unknownInvoice || invoiceIds.has(item.id) || unknownDelivery || deliveryIds.has(item.id)).map(item => item.id));
    if (!order.invoiced && !references.recordset.length && !order.items.some(item => item.hasInvoice)) throw Object.assign(new Error('Use the regular sales order form until an invoice exists.'), { status: 409 });
    for (const itemId of [...requestedIds, ...removedItemIds]) {
      if (!current.has(itemId)) throw Object.assign(new Error('The item no longer belongs to this sales order. Refresh the order.'), { status: 409 });
      if (frozen.has(itemId)) throw Object.assign(new Error('This item already has an SI or delivery reference and is locked. Refresh the sales order.'), { status: 409 });
    }
    const rows = order.items.filter(item => !removedItemIds.includes(item.id)).map(item => ({ ...item }));
    for (const item of requested) {
      const previous = item.id === null ? null : current.get(item.id);
      const row = { ...(previous || {}), ...item };
      if (fields.slice(1).some(field => !Object.hasOwn(item, field))) throw Object.assign(new Error('Submit all editable fields for each order item.'), { status: 400 });
      row.productId = Number(row.productId);
      if (!Number.isSafeInteger(row.productId) || row.productId <= 0 || row.productId > 2147483647) throw Object.assign(new Error('Enter a valid product.'), { status: 400 });
      const parsed = {};
      for (const [name, source, places, maximum] of [['quantity', row.quantity, 3, 1000000000n], ['unitPrice', row.unitPrice, 6, 100000000000000n], ['discountRate', row.discountRate == null || String(row.discountRate).trim() === '' ? '0' : row.discountRate, 6, 100000000n]]) {
        if (!['string', 'number'].includes(typeof source) || !/^\d+(?:\.\d+)?$/.test(String(source).trim())) throw Object.assign(new Error('Enter a valid nonnegative ' + name + '.'), { status: 400 });
        const [whole, rawFraction = ''] = String(source).trim().split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > places) throw Object.assign(new Error(name + ' supports at most ' + places + ' decimal places.'), { status: 400 });
        const units = BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0') || '0');
        if (units > maximum) throw Object.assign(new Error(name + ' exceeds its supported range.'), { status: 400 });
        parsed[name] = units;
      }
      if (parsed.quantity === 0n) throw Object.assign(new Error('Order quantity must be greater than zero.'), { status: 400 });
      row.quantity = `${(parsed.quantity) / 1000n}.${((parsed.quantity) % 1000n).toString().padStart(3, '0')}`;
      row.unitPrice = `${(parsed.unitPrice) / 1000000n}.${((parsed.unitPrice) % 1000000n).toString().padStart(6, '0')}`;
      row.discountRate = row.discountRate == null || String(row.discountRate).trim() === '' ? null : `${(parsed.discountRate) / 1000000n}.${((parsed.discountRate) % 1000000n).toString().padStart(6, '0')}`;
      for (const field of ['refNumber', 'quotationNumber', 'deliveryDate']) {
        if (row[field] !== null && row[field] !== undefined && typeof row[field] !== 'string') throw Object.assign(new Error('Enter valid item references and delivery date.'), { status: 400 });
        row[field] = typeof row[field] === 'string' ? row[field].trim() || null : null;
      }
      if (row.deliveryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(row.deliveryDate) || row.deliveryDate.slice(0, 4) === '0000' || !Number.isFinite(new Date(row.deliveryDate + 'T00:00:00Z').getTime()) || new Date(row.deliveryDate + 'T00:00:00Z').toISOString().slice(0, 10) !== row.deliveryDate || row.deliveryDate < order.orderDate)) throw Object.assign(new Error('Enter a valid item delivery date on or after the order date.'), { status: 400 });
      if (!previous || previous.productId !== row.productId) {
        const productResult = await request(tx).input('id', sql.Int, row.productId).query('SELECT id,name,description,sku,unit,currency,isActive FROM dbo.Products WHERE id=@id');
        const product = productResult.recordset[0];
        if (!product?.isActive) throw Object.assign(new Error('Select an active product.'), { status: 400 });
        const sourceCurrency = String(product.currency || '').trim().toUpperCase();
        if (!sourceCurrency || sourceCurrency !== String(order.sourceCurrency || order.currency).trim().toUpperCase()) throw Object.assign(new Error('Use products with the saved source currency.'), { status: 400 });
        Object.assign(row, { productName: product.name, description: product.description ?? null, sku: product.sku, unit: product.unit, currency: sourceCurrency });
      }
      if (previous) rows[rows.findIndex(candidate => candidate.id === row.id)] = row;
      else rows.push(row);
    }
    if (!rows.length || rows.length > 100) throw Object.assign(new Error('Keep between 1 and 100 order items.'), { status: 400 });
    if (new Set(rows.map(row => row.productId)).size !== rows.length) throw Object.assign(new Error('Orders need distinct product lines.'), { status: 400 });
    const pricing = {};
    for (const [name, source, maximum] of [['rate', order.rate ?? '1', 1000000000000n], ['vatRate', order.vatRate ?? '0', 100000000n], ['discount', order.discount ?? '0', order.discountType === 'percent' ? 100000000n : 1000000000000000000n]]) {
      if (!['string', 'number'].includes(typeof source) || !/^\d+(?:\.\d+)?$/.test(String(source).trim())) throw Object.assign(new Error('The saved order pricing is invalid.'), { status: 409 });
      const [whole, rawFraction = ''] = String(source).trim().split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > 6) throw Object.assign(new Error('The saved order pricing precision is invalid.'), { status: 409 });
      const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
      if (units > maximum) throw Object.assign(new Error('The saved order pricing exceeds its supported range.'), { status: 409 });
      pricing[name] = units;
    }
    const { rate, vatRate, discount } = pricing;
    const places = order.decimalInTotalPrice ?? 2;
    if (rate === 0n || !Number.isInteger(places) || places < 0 || places > 6 || order.discountType != null && !['percent', 'amount'].includes(order.discountType)) throw Object.assign(new Error('The saved order pricing is invalid.'), { status: 409 });
    const moneyScale = 10n ** BigInt(places);
    const moneyDivisor = 10n ** BigInt(9 - places);
    const percent = 100000000n;
    const moneyFields = ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount'];
    const editable = rows.filter(row => !frozen.has(row.id)).map(row => {
      const parsed = {};
      for (const [name, source, precision, maximum] of [['quantity', row.quantity, 3, 1000000000n], ['unitPrice', row.unitPrice, 6, 100000000000000n], ['discountRate', row.discountRate ?? '0', 6, 100000000n]]) {
        if (!['string', 'number'].includes(typeof source) || !/^\d+(?:\.\d+)?$/.test(String(source).trim())) throw Object.assign(new Error('The saved order item pricing is invalid.'), { status: 409 });
        const [whole, rawFraction = ''] = String(source).trim().split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > precision) throw Object.assign(new Error('The saved order item precision is invalid.'), { status: 409 });
        const units = BigInt(whole) * 10n ** BigInt(precision) + BigInt(fraction.padEnd(precision, '0') || '0');
        if (units > maximum) throw Object.assign(new Error('The saved order item pricing exceeds its supported range.'), { status: 409 });
        parsed[name] = units;
      }
      const { quantity, unitPrice: price, discountRate: lineRate } = parsed;
      const converted = (price * rate + 500000n) / 1000000n;
      if (quantity === 0n || converted > 1000000000000000000n) throw Object.assign(new Error('The saved order pricing is invalid.'), { status: 409 });
      const gross = (quantity * converted + moneyDivisor / 2n) / moneyDivisor;
      const lineDiscount = (gross * lineRate + percent / 2n) / percent;
      return { row, converted, gross, lineDiscount, remaining: gross - lineDiscount };
    });
    const frozenRows = rows.filter(row => frozen.has(row.id));
    const frozenTotals = Object.fromEntries(moneyFields.map(field => [field, frozenRows.reduce((sum, row) => {
      const source = row[field];
      if (!['string', 'number'].includes(typeof source) || !/^\d+(?:\.\d+)?$/.test(String(source).trim())) throw Object.assign(new Error('The saved SI item pricing is incomplete or invalid.'), { status: 409 });
      const [whole, rawFraction = ''] = String(source).trim().split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > 6) throw Object.assign(new Error('The saved SI item pricing precision is invalid.'), { status: 409 });
      const units = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
      if (units > 1000000000000000000n) throw Object.assign(new Error('The saved SI item pricing exceeds its supported range.'), { status: 409 });
      return sum + units;
    }, 0n)]));
    let remainingNet = editable.reduce((sum, item) => sum + item.remaining, 0n);
    const headerDivisor = 10n ** BigInt(6 - places);
    const fixedDiscountRemainder = discount - frozenTotals.headerDiscountAmount;
    if (order.discountType === 'amount' && fixedDiscountRemainder < 0n) throw Object.assign(new Error('The saved header discount cannot be allocated without changing a locked item.'), { status: 400 });
    const headerDiscount = order.discountType === 'percent' ? (remainingNet * discount + percent / 2n) / percent : order.discountType === 'amount' ? (fixedDiscountRemainder + headerDivisor / 2n) / headerDivisor : 0n;
    if (headerDiscount < 0n || headerDiscount > remainingNet) throw Object.assign(new Error('The saved header discount cannot be allocated without changing a locked item.'), { status: 400 });
    let remainingDiscount = headerDiscount;
    const totals = { ...frozenTotals };
    const savedItems = editable.map(item => {
      const allocation = remainingNet === 0n ? 0n : remainingNet === item.remaining ? remainingDiscount : remainingDiscount * item.remaining / remainingNet;
      remainingNet -= item.remaining; remainingDiscount -= allocation;
      const discountAmount = item.lineDiscount + allocation;
      const discounted = item.gross - discountAmount;
      const taxDivisor = order.vatInclusive ? percent + vatRate : percent;
      const vat = (discounted * vatRate + taxDivisor / 2n) / taxDivisor;
      const net = order.vatInclusive ? discounted - vat : discounted;
      const amount = order.vatInclusive ? discounted : discounted + vat;
      const result = { ...item.row, convertedUnitPrice: `${(item.converted) / 1000000n}.${((item.converted) % 1000000n).toString().padStart(6, '0')}` };
      for (const [field, value] of Object.entries({ grossAmount: item.gross, lineDiscountAmount: item.lineDiscount, headerDiscountAmount: allocation, discountAmount, netAmount: net, vatAmount: vat, amount })) {
        const millionths = value * headerDivisor;
        totals[field] += millionths;
        result[field] = `${(millionths) / 1000000n}.${((millionths) % 1000000n).toString().padStart(6, '0')}`;
      }
      result.lineTotal = result.amount;
      return result;
    });
    if (totals.grossAmount > 1000000000000000000n || totals.amount > 1000000000000000000n) throw Object.assign(new Error('The document total exceeds the supported amount.'), { status: 400 });
    // Only derived order totals change. Header inputs and every frozen row stay untouched.
    const totalsRequest = request(tx).input('id', sql.Int, id);
    for (const field of [...moneyFields, 'total']) totalsRequest.input(field, sql.VarChar(sql.MAX), `${(field === 'total' ? totals.amount : totals[field]) / 1000000n}.${((field === 'total' ? totals.amount : totals[field]) % 1000000n).toString().padStart(6, '0')}`);
    await totalsRequest.query(`UPDATE dbo.SalesOrders SET grossAmount=@grossAmount,lineDiscountAmount=@lineDiscountAmount,headerDiscountAmount=@headerDiscountAmount,
      discountAmount=@discountAmount,netAmount=@netAmount,vatAmount=@vatAmount,amount=@amount,total=@total,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    for (const itemId of removedItemIds) await request(tx).input('id', sql.Int, itemId).input('orderId', sql.Int, id).query('DELETE FROM dbo.SalesOrderItems WHERE id=@id AND orderId=@orderId');
    for (const row of savedItems) {
      const lineRequest = request(tx).input('orderId', sql.Int, id).input('productId', sql.Int, row.productId).input('quantity', sql.VarChar(sql.MAX), String(row.quantity));
      for (const field of ['productName', 'description', 'sku', 'unit', 'refNumber', 'quotationNumber', 'currency', 'deliveryDate']) lineRequest.input(field, sql.NVarChar(sql.MAX), row[field] ?? null);
      for (const field of ['unitPrice', 'convertedUnitPrice', 'discountRate', ...moneyFields, 'lineTotal']) lineRequest.input(field, sql.VarChar(sql.MAX), row[field] == null ? null : String(row[field]));
      if (row.id !== null) {
        lineRequest.input('id', sql.Int, row.id);
        await lineRequest.query(`UPDATE dbo.SalesOrderItems SET productId=@productId,productName=@productName,description=@description,sku=@sku,unit=@unit,
          refNumber=@refNumber,quotationNumber=@quotationNumber,currency=@currency,quantity=CAST(@quantity AS DECIMAL(18,3)),unitPrice=@unitPrice,convertedUnitPrice=@convertedUnitPrice,
          discountRate=@discountRate,deliveryDate=@deliveryDate,grossAmount=@grossAmount,lineDiscountAmount=@lineDiscountAmount,headerDiscountAmount=@headerDiscountAmount,
          discountAmount=@discountAmount,netAmount=@netAmount,vatAmount=@vatAmount,amount=@amount,lineTotal=@lineTotal WHERE id=@id AND orderId=@orderId`);
      } else await lineRequest.query(`INSERT INTO dbo.SalesOrderItems (orderId,productId,productName,description,sku,unit,refNumber,quotationNumber,currency,quantity,unitPrice,convertedUnitPrice,discountRate,deliveryDate,
        grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,lineTotal)
        VALUES (@orderId,@productId,@productName,@description,@sku,@unit,@refNumber,@quotationNumber,@currency,CAST(@quantity AS DECIMAL(18,3)),@unitPrice,@convertedUnitPrice,@discountRate,@deliveryDate,
          @grossAmount,@lineDiscountAmount,@headerDiscountAmount,@discountAmount,@netAmount,@vatAmount,@amount,@lineTotal)`);
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), 'sales').input('module', sql.NVarChar(sql.MAX), 'sales-orders').input('action', sql.NVarChar(sql.MAX), 'item-update').input('recordId', sql.NVarChar(sql.MAX), String(id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
  });
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked JOIN dbo.SalesOrderItems originalLine ON originalLine.id=linked.orderItemId WHERE originalLine.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o  LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
  const recordItems = await request().input('id', sql.Int, id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CAST(CASE WHEN
  EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked WHERE linked.orderItemId=oi.id)
  OR EXISTS(SELECT 1 FROM dbo.SalesInvoices legacy WHERE legacy.orderId=oi.orderId AND (
    NOT EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail WHERE detail.invoiceId=legacy.id)
    OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail LEFT JOIN dbo.SalesOrderItems originalLine
      ON originalLine.id=detail.orderItemId AND originalLine.orderId=legacy.orderId
      WHERE detail.invoiceId=legacy.id AND originalLine.id IS NULL)))
  THEN 1 ELSE 0 END AS bit) AS hasInvoice,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
  res.json({ record: { ...recordResult.recordset[0], items: recordItems.recordset } });
});
router.patch('/sales-orders/:id/quantities', async (_req, _res) => {
  const error = new Error('SI-linked items are locked. Use the full sales order form for uninvoiced items.');
  error.status = 409;
  throw error;
});

router.delete('/sales-orders/:id', async (req, res) => {
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  const user = res.locals.user;
  await transaction(async tx => {
    const orderResult = await request(tx).input('id', sql.Int, id).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked JOIN dbo.SalesOrderItems originalLine ON originalLine.id=linked.orderItemId WHERE originalLine.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
    if (!orderResult.recordset.length) {
      const error = new Error('Sales order could not be found.');
      error.status = 404;
      throw error;
    }
    const orderItems = await request(tx).input('id', sql.Int, id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CAST(CASE WHEN
  EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked WHERE linked.orderItemId=oi.id)
  OR EXISTS(SELECT 1 FROM dbo.SalesInvoices legacy WHERE legacy.orderId=oi.orderId AND (
    NOT EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail WHERE detail.invoiceId=legacy.id)
    OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail LEFT JOIN dbo.SalesOrderItems originalLine
      ON originalLine.id=detail.orderItemId AND originalLine.orderId=legacy.orderId
      WHERE detail.invoiceId=legacy.id AND originalLine.id IS NULL)))
  THEN 1 ELSE 0 END AS bit) AS hasInvoice,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
    const order = {
      ...orderResult.recordset[0],
      items: orderItems.recordset
    };
    if (order.invoiced || order.delivered) {
      const error = new Error('Orders linked to an invoice or delivery receipt cannot be deleted.');
      error.status = 409;
      throw error;
    }
    await request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.SalesOrderItems WHERE orderId=@id; DELETE FROM dbo.SalesOrders WHERE id=@id;');
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'sales-orders').input('action', sql.NVarChar(sql.MAX), 'delete').input('recordId', sql.NVarChar(sql.MAX), String(id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
  });
  res.json({
    success: true
  });
});

// Invoice, delivery and shipping documents retain their source-order snapshots.
router.get('/sales-invoices', async (req, res) => {
  const result = await request().query(`SELECT i.id,i.number,i.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,i.buyerTin,i.buyerBusinessStyle,i.shipToName,i.vatClass,COALESCE(i.preparedByName,invoiceCreator.name) AS preparedByName,o.preparedByName AS sourcePreparedByName,
  CAST(CASE WHEN linkedDelivery.id IS NULL THEN 0 ELSE 1 END AS bit) AS delivered,linkedDelivery.id AS deliveryReceiptId,linkedDelivery.number AS deliveryReceiptNumber,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId LEFT JOIN dbo.SalesUserLogin invoiceCreator ON invoiceCreator.id=i.createdBy LEFT JOIN dbo.DeliveryReceipts linkedDelivery ON linkedDelivery.invoiceId=i.id ORDER BY i.id DESC`);
  res.json({
    records: result.recordset
  });
});
router.get('/sales-invoices/:id', async (req, res) => {
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT i.id,i.number,i.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,i.buyerTin,i.buyerBusinessStyle,i.shipToName,i.vatClass,COALESCE(i.preparedByName,invoiceCreator.name) AS preparedByName,o.preparedByName AS sourcePreparedByName,
  CAST(CASE WHEN linkedDelivery.id IS NULL THEN 0 ELSE 1 END AS bit) AS delivered,linkedDelivery.id AS deliveryReceiptId,linkedDelivery.number AS deliveryReceiptNumber,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId LEFT JOIN dbo.SalesUserLogin invoiceCreator ON invoiceCreator.id=i.createdBy LEFT JOIN dbo.DeliveryReceipts linkedDelivery ON linkedDelivery.invoiceId=i.id WHERE i.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Sales invoice could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).input('invoiceId', sql.Int, recordResult.recordset[0].id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderItemId,@orderId AS orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount FROM dbo.SalesInvoiceItems WHERE invoiceId=@invoiceId ORDER BY id`);
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.json({
    record
  });
});
router.get('/sales-invoices/:id/excel', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    const error = new Error('Enter a valid id.');
    error.status = 400;
    throw error;
  }
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT i.id,i.number,i.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,i.buyerTin,i.buyerBusinessStyle,i.shipToName,i.vatClass,COALESCE(i.preparedByName,invoiceCreator.name) AS preparedByName,o.preparedByName AS sourcePreparedByName,
  CAST(CASE WHEN linkedDelivery.id IS NULL THEN 0 ELSE 1 END AS bit) AS delivered,linkedDelivery.id AS deliveryReceiptId,linkedDelivery.number AS deliveryReceiptNumber,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId LEFT JOIN dbo.SalesUserLogin invoiceCreator ON invoiceCreator.id=i.createdBy LEFT JOIN dbo.DeliveryReceipts linkedDelivery ON linkedDelivery.invoiceId=i.id WHERE i.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Sales invoice could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).input('invoiceId', sql.Int, recordResult.recordset[0].id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderItemId,@orderId AS orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount FROM dbo.SalesInvoiceItems WHERE invoiceId=@invoiceId ORDER BY id`);
  const record = { ...recordResult.recordset[0], items: recordItems.recordset };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(__dirname, '../templates/SalesInvoice.xlsx'));
  const template = workbook.worksheets[0];
  // ExcelJS reads fractional template font sizes as integers; retain the source sizes.
  for (const [address, size] of [['G2', 9.65], ['C5', 8.25], ['X2', 9.75], ['X8', 9.75]]) template.getCell(address).font = { ...template.getCell(address).font, size };
  template.eachRow({ includeEmpty: true }, row => row.eachCell({ includeEmpty: true }, cell => { cell.value = null; }));
  const templateModel = structuredClone(template.model);
  const headers = [
    ['G2', 'Customer Name', record.billToName ?? (record.billToCustomerId == null ? record.customerName : null), 94, 9.65],
    ['C5', 'Address', record.billToAddress ?? (record.billToCustomerId == null ? record.customerAddress : null), 106, 8.25],
    ['G8', 'Ship To', record.shipToName, 106, 9], ['X5', 'Terms', record.paymentTerm, 48, 9],
    ['X8', 'TIN', record.buyerTin, 52, 9.75], ['F45', 'Prepared by', record.preparedByName, 59, 7],
  ];
  const printedHeaders = [], entries = [];
  for (const [address, label, raw, width, size] of headers) {
    const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
    let textWidth = 0;
    for (const character of Array.from(value)) textWidth += /[MW@%]/.test(character) ? 1000 : /[mw]/.test(character) ? 800 : /[A-Z]/.test(character) ? 750 : /[il.,:;'!|]/.test(character) ? 350 : /[0-9]/.test(character) ? 500 : character === ' ' ? 250 : /[\x20-\x7e]/.test(character) ? 550 : 1000;
    const fittingSize = textWidth ? Math.min(size, width * 72 / 25.4 * 1000 / textWidth) : size;
    printedHeaders.push({ address, value: fittingSize < 7 ? 'See continuation' : value || null, size: fittingSize === size ? size : Math.max(7, Math.floor(fittingSize * 10) / 10) });
    if (fittingSize < 7) entries.push({ text: label + ': ' + value });
  }
  for (const [index, item] of record.items.entries()) {
    const sku = String(item.sku || '').trim();
    const description = String(item.description || item.productDescription || item.productName || '').trim();
    let text = sku && (description === sku || description.startsWith(sku + ' ') || description.startsWith(sku + '\n')) ? description : [sku, description].filter(Boolean).join(' ');
    const unit = String(item.unit || '').trim();
    let unitWidth = 0;
    for (const character of Array.from(unit)) unitWidth += /[MW@%]/.test(character) ? 1000 : /[mw]/.test(character) ? 800 : /[A-Z]/.test(character) ? 750 : /[il.,:;'!|]/.test(character) ? 350 : /[0-9]/.test(character) ? 500 : character === ' ' ? 250 : /[\x20-\x7e]/.test(character) ? 550 : 1000;
    const unitSize = unitWidth ? Math.min(8, 11 * 72 / 25.4 * 1000 / unitWidth) : 8;
    if (unitSize < 7) text += '\nUOP: ' + unit;
    entries.push({ item, index, text, unit: unitSize < 7 ? 'See note' : unit || null, unitSize: Math.max(7, Math.floor(unitSize * 10) / 10) });
  }
  const notes = String(record.notes || '').trim();
  const shortNotes = notes.replace(/\s+/g, ' ');
  if (shortNotes.length > 120) entries.push({ text: 'Remarks: ' + notes });
  const lines = [];
  for (const entry of entries) {
    let part = 0;
    for (const paragraph of entry.text.replace(/\r/g, '').split('\n')) {
      let line = '', used = 0;
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const characters = Array.from(word, character => ({ value: character, width: /[MW@%]/.test(character) ? 1000 : /[mw]/.test(character) ? 800 : /[A-Z]/.test(character) ? 750 : /[il.,:;'!|]/.test(character) ? 350 : /[0-9]/.test(character) ? 500 : /[\x20-\x7e]/.test(character) ? 550 : 1000 }));
        const wordWidth = characters.reduce((total, character) => total + character.width, 0);
        if (line && used + 250 + wordWidth <= 22000) { line += ' ' + word; used += 250 + wordWidth; continue; }
        if (line) { lines.push({ ...entry, part: part++, text: line }); line = ''; used = 0; }
        for (const character of characters) {
          if (line && used + character.width > 22000) { lines.push({ ...entry, part: part++, text: line }); line = ''; used = 0; }
          line += character.value; used += character.width;
        }
      }
      lines.push({ ...entry, part: part++, text: line });
    }
  }
  const pages = Math.max(1, Math.ceil(lines.length / 14));
  const knownClass = ['Vatable', 'Vat-Exempt', 'Zero Rated'].includes(record.vatClass);
  const knownVat = record.vatAmount != null && /^\d+(?:\.\d+)?$/.test(String(record.vatAmount));
  const knownMode = typeof record.vatInclusive === 'boolean';
  const currency = /^[A-Z]{3}$/.test(record.currency || '') ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: record.currency }).formatToParts(0).find(part => part.type === 'currency')?.value || record.currency : record.currency || '';
  const currencyFormat = currency ? '"' + currency.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ') + '" ' : '';
  let totalQuantity = 0n;
  let knownQuantity = record.items.length > 0;
  for (const item of record.items) {
    const value = String(item.quantity ?? '');
    if (!/^\d+(?:\.\d{1,3})?$/.test(value)) { knownQuantity = false; continue; }
    const [whole, fraction = ''] = value.split('.');
    totalQuantity += BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  }
  for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
    const final = pageIndex === pages - 1;
    let sheet = template;
    if (pageIndex > 0) {
      sheet = workbook.addWorksheet('Invoice ' + (pageIndex + 1));
      const model = structuredClone(templateModel);
      model.id = sheet.id; model.name = sheet.name; model.mergeCells = model.merges;
      sheet.model = model;
    } else sheet.name = 'Invoice 1';
    sheet.pageSetup = { ...sheet.pageSetup, paperSize: 9, orientation: 'portrait', scale: 100, fitToPage: false, printArea: 'A1:AA51', margins: { left: 0.23, right: 0.27, top: 0.30, bottom: 0.20, header: 0.30, footer: 0.30 } };
    sheet.headerFooter = { oddFooter: '&L' + String(record.number || '').replaceAll('&', '&&') + '&RPage ' + (pageIndex + 1) + ' of ' + pages };
    for (const header of printedHeaders) {
      if (header.address === 'F45' && !final) continue;
      const cell = sheet.getCell(header.address);
      cell.value = header.value;
      cell.font = { ...cell.font, size: header.size };
      cell.alignment = { ...cell.alignment, wrapText: false, shrinkToFit: false };
    }
    sheet.getCell('V51').value = record.number || null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(record.invoiceDate || '')) { sheet.getCell('X2').value = new Date(record.invoiceDate + 'T00:00:00Z'); sheet.getCell('X2').numFmt = 'm/d/yy'; }
    const numericCells = [];
    for (const [slot, line] of lines.slice(pageIndex * 14, (pageIndex + 1) * 14).entries()) {
      const row = 11 + slot;
      sheet.getCell('J' + row).value = line.text;
      sheet.getCell('J' + row).alignment = { ...sheet.getCell('J' + row).alignment, wrapText: false, shrinkToFit: true };
      if (!line.item || line.part !== 0) continue;
      sheet.getCell('H' + row).value = line.unit;
      sheet.getCell('H' + row).font = { ...sheet.getCell('H' + row).font, size: line.unitSize };
      sheet.getCell('H' + row).alignment = { ...sheet.getCell('H' + row).alignment, wrapText: false, shrinkToFit: false };
      numericCells.push(['A' + row, line.item.quantity, 3, true], ['T' + row, line.item.convertedUnitPrice ?? line.item.unitPrice, 5, false, true], ['W' + row, line.item.grossAmount, 2, false]);
    }
    if (final) {
      if (knownQuantity) numericCells.push(['A25', totalQuantity / 1000n + '.' + (totalQuantity % 1000n).toString().padStart(3, '0'), 3, true]);
      sheet.getCell('D25').value = 'TOTAL';
      sheet.getCell('A26').value = '********NF********';
      sheet.getCell('A27').value = shortNotes && shortNotes.length <= 120 ? 'Remarks: ' + shortNotes : shortNotes ? 'Remarks continued in item rows.' : null;
      sheet.getCell('A27').alignment = { ...sheet.getCell('A27').alignment, wrapText: false, shrinkToFit: true };
      numericCells.push(
        ['M29', knownClass ? record.vatClass === 'Vatable' ? record.netAmount : '0' : null, 2, false],
        ['M30', knownClass ? record.vatClass === 'Vat-Exempt' ? record.netAmount : '0' : null, 2, false],
        ['M33', knownClass ? record.vatClass === 'Zero Rated' ? record.netAmount : '0' : null, 2, false],
        ['M35', record.vatAmount, 2, false],
        ['Y31', knownVat && knownMode ? record.vatInclusive ? record.vatAmount : '0' : null, 2, false],
        ['Y36', record.discountAmount, 2, false],
        ['Y41', knownVat && knownMode ? record.vatInclusive ? '0' : record.vatAmount : null, 2, false],
        ['Y43', record.total, 2, false, true],
      );
    }
    for (const [address, raw, places, trim, withCurrency] of numericCells) {
      if (raw == null || !/^-?\d+(?:\.\d+)?$/.test(String(raw))) continue;
      const text = String(raw), negative = text.startsWith('-');
      const [whole, fraction = ''] = text.replace(/^-/, '').split('.');
      let units = BigInt(whole + fraction.padEnd(places, '0').slice(0, places));
      if (Number(fraction[places] || 0) >= 5) units++;
      const digits = units.toString().padStart(places + 1, '0');
      const canonical = (negative && units ? '-' : '') + digits.slice(0, -places) + '.' + digits.slice(-places);
      const cell = sheet.getCell(address);
      const visibleFraction = digits.slice(-places).replace(/0+$/, '');
      cell.numFmt = (withCurrency ? currencyFormat : '') + (trim ? '#,##0' + (visibleFraction ? '.' + '0'.repeat(visibleFraction.length) : '') : places === 5 ? '#,##0.00000' : '#,##0.00');
      const significantDigits = (whole + fraction).replace(/^0+/, '').replace(/0+$/, '').length;
      if (significantDigits <= 15) cell.value = Number(text);
      else if (units.toString().length <= 15) cell.value = Number(canonical);
      else cell.value = (withCurrency && currency ? currency + ' ' : '') + (negative && units ? '-' : '') + digits.slice(0, -places).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (trim ? visibleFraction ? '.' + visibleFraction : '' : '.' + digits.slice(-places));
      cell.alignment = { ...cell.alignment, horizontal: 'right', wrapText: false, shrinkToFit: true };
    }
  }
  // Keep every page on the active worksheet so Excel's default Print prints the full invoice.
  const pageSheets = [...workbook.worksheets];
  const invoiceSheet = pageSheets[0];
  for (let pageIndex = 1; pageIndex < pageSheets.length; pageIndex++) {
    const source = pageSheets[pageIndex];
    const offset = pageIndex * 51;
    source.eachRow({ includeEmpty: true }, row => {
      const target = invoiceSheet.getRow(row.number + offset);
      target.height = row.height; target.hidden = row.hidden; target.style = structuredClone(row.style);
      row.eachCell({ includeEmpty: true }, cell => {
        const destination = target.getCell(cell.col);
        destination.style = structuredClone(cell.style);
        if (cell.type !== ExcelJS.ValueType.Merge) destination.value = structuredClone(cell.value);
      });
    });
    for (const range of source.model.merges) {
      const parts = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      invoiceSheet.mergeCellsWithoutStyle(parts[1] + (Number(parts[2]) + offset) + ':' + parts[3] + (Number(parts[4]) + offset));
    }
    workbook.removeWorksheet(source.id);
  }
  invoiceSheet.name = 'Invoice';
  invoiceSheet.rowBreaks = [];
  for (let pageIndex = 1; pageIndex < pages; pageIndex++) invoiceSheet.getRow(pageIndex * 51).addPageBreak();
  invoiceSheet.pageSetup.printArea = 'A1:AA' + (51 * pages);
  invoiceSheet.headerFooter.oddFooter = '&L' + String(record.number || '').replaceAll('&', '&&') + '&RPage &P of &N';
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = String(record.number || 'SI-' + id).replace(/[^a-zA-Z0-9._-]/g, '_') + '.xlsx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(Buffer.from(buffer));
});

router.get('/delivery-receipts', async (req, res) => {
  const result = await request().query(`SELECT d.id,d.number,d.orderId,d.invoiceId,si.number AS invoiceNumber,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,
  o.billToName,o.billToAddress,si.shipToName,COALESCE(si.shipToName,o.billToName,o.customerName) AS deliveredTo,
  si.buyerTin,si.buyerBusinessStyle AS businessStyle,o.paymentTerm,CONVERT(varchar(10),si.invoiceDate,23) AS invoiceDate,
  CONVERT(varchar(10),d.deliveryDate,23) AS deliveryDate,d.receivedBy,d.address,d.notes,d.stockDeducted,
  COALESCE(d.preparedByName,creator.name) AS preparedByName,CAST(NULL AS nvarchar(max)) AS purchaseOrderNumber
  FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId LEFT JOIN dbo.SalesInvoices si ON si.id=d.invoiceId
  LEFT JOIN dbo.SalesUserLogin creator ON creator.id=d.createdBy ORDER BY d.id DESC`);
  res.json({
    records: result.recordset
  });
});
router.get('/delivery-receipts/:id', async (req, res) => {
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT d.id,d.number,d.orderId,d.invoiceId,si.number AS invoiceNumber,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,
  o.billToName,o.billToAddress,si.shipToName,COALESCE(si.shipToName,o.billToName,o.customerName) AS deliveredTo,
  si.buyerTin,si.buyerBusinessStyle AS businessStyle,o.paymentTerm,CONVERT(varchar(10),si.invoiceDate,23) AS invoiceDate,
  CONVERT(varchar(10),d.deliveryDate,23) AS deliveryDate,d.receivedBy,d.address,d.notes,d.stockDeducted,
  COALESCE(d.preparedByName,creator.name) AS preparedByName,CAST(NULL AS nvarchar(max)) AS purchaseOrderNumber
  FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId LEFT JOIN dbo.SalesInvoices si ON si.id=d.invoiceId
  LEFT JOIN dbo.SalesUserLogin creator ON creator.id=d.createdBy WHERE d.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Delivery receipt could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).input('deliveryReceiptId', sql.Int, recordResult.recordset[0].id).query(`SELECT id,orderItemId,@orderId AS orderId,productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,
  refNumber,quotationNumber,description,description AS productDescription,CONVERT(varchar(10),deliveryDate,23) AS deliveryDate
  FROM dbo.DeliveryReceiptItems WHERE deliveryReceiptId=@deliveryReceiptId ORDER BY id`);
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.json({
    record
  });
});
router.get('/delivery-receipts/:id/excel', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) { const error = new Error('Select a valid delivery receipt.'); error.status = 400; throw error; }
  const header = await request().input('id', sql.Int, id).query(`SELECT d.id,d.number,d.invoiceId,si.number AS invoiceNumber,
    COALESCE(si.shipToName,o.billToName,o.customerName) AS deliveredTo,d.address,d.receivedBy,d.notes,
    CONVERT(varchar(10),d.deliveryDate,23) AS deliveryDate,o.paymentTerm,si.buyerTin,si.buyerBusinessStyle AS businessStyle,
    COALESCE(d.preparedByName,creator.name) AS preparedByName,CAST(NULL AS nvarchar(max)) AS purchaseOrderNumber
    FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId LEFT JOIN dbo.SalesInvoices si ON si.id=d.invoiceId
    LEFT JOIN dbo.SalesUserLogin creator ON creator.id=d.createdBy WHERE d.id=@id`);
  if (!header.recordset.length) { const error = new Error('Delivery receipt could not be found.'); error.status = 404; throw error; }
  const items = await request().input('deliveryReceiptId', sql.Int, id).query(`SELECT id,productId,productName,sku,description,unit,
    CONVERT(varchar(60),quantity) AS quantity,refNumber FROM dbo.DeliveryReceiptItems WHERE deliveryReceiptId=@deliveryReceiptId ORDER BY id`);
  const record = { ...header.recordset[0], items: items.recordset };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.join(__dirname, '../templates/DeliveryReceipt.xlsx'));
  const template = workbook.worksheets[0];
  template.eachRow({ includeEmpty: true }, row => row.eachCell({ includeEmpty: true }, cell => { cell.value = null; }));
  const templateModel = structuredClone(template.model);
  const headers = [
    ['H2', 'Delivered to', record.deliveredTo, 90, 9, 1], ['G5', 'Address', record.address, 97, 9, 3],
    ['M5', 'Terms', record.paymentTerm, 38, 9, 1], ['M7', 'TIN', record.buyerTin, 38, 9, 1],
    ['H10', 'Business style', record.businessStyle, 90, 9, 1], ['H11', 'SI number', record.invoiceNumber, 90, 9, 1],
    ['M10', 'PO number', record.purchaseOrderNumber, 38, 9, 1], ['F31', 'Prepared by', record.preparedByName, 40, 7, 1],
    ['M33', 'Received by', record.receivedBy, 38, 7, 2],
  ];
  const printedHeaders = [], entries = [];
  for (const [address, label, raw, width, startSize, maximumLines] of headers) {
    const value = String(raw ?? '').replace(/\r/g, '').trim();
    let size = startSize, count = 1;
    for (; size >= 7; size -= .25) {
      const limit = width * 72 / 25.4 * 1000 / size;
      let used = 0;
      count = 1;
      for (const character of Array.from(value)) {
        if (character === '\n') { count++; used = 0; continue; }
        const advance = /[MW@%]/.test(character) ? 1000 : /[mw]/.test(character) ? 800 : /[A-Z]/.test(character) ? 750 : /[il.,:;'!|]/.test(character) ? 350 : /[0-9]/.test(character) ? 500 : character === ' ' ? 250 : /[\x20-\x7e]/.test(character) ? 550 : 1000;
        if (used + advance > limit) { count++; used = 0; }
        used += advance;
      }
      if (count <= maximumLines) break;
    }
    const continued = count > maximumLines;
    printedHeaders.push({ address, value: continued ? 'See continuation' : value || null, size: Math.max(7, size), wrap: maximumLines > 1 });
    if (continued) entries.push({ text: label + ': ' + value });
  }
  for (const item of record.items) {
    const sku = String(item.sku || '').trim();
    const description = String(item.description || item.productName || '').trim();
    let text = sku && (description === sku || description.startsWith(sku + ' ') || description.startsWith(sku + '\n')) ? description : [sku, description].filter(Boolean).join(' ');
    const unit = String(item.unit || '').trim();
    let unitWidth = 0;
    for (const character of Array.from(unit)) unitWidth += /[MW@%]/.test(character) ? 1000 : /[mw]/.test(character) ? 800 : /[A-Z]/.test(character) ? 750 : /[il.,:;'!|]/.test(character) ? 350 : /[0-9]/.test(character) ? 500 : character === ' ' ? 250 : /[\x20-\x7e]/.test(character) ? 550 : 1000;
    const unitSize = unitWidth ? Math.min(9, 23 * 72 / 25.4 * 1000 / unitWidth) : 9;
    if (unitSize < 7) text += '\nUOP: ' + unit;
    entries.push({ item, text, unit: unitSize < 7 ? 'See note' : unit || null, unitSize: Math.max(7, Math.floor(unitSize * 10) / 10) });
  }
  const notes = String(record.notes || '').trim();
  let remarks = [], remarksSize = 9;
  if (notes) {
    for (let size = 9; size >= 7; size -= .25) {
      const candidate = [''];
      let line = 0, used = 0;
      for (const character of Array.from(notes.replace(/\r/g, ''))) {
        const advance = /[MW@%]/.test(character) ? 1000 : /[mw]/.test(character) ? 800 : /[A-Z]/.test(character) ? 750 : /[il.,:;'!|]/.test(character) ? 350 : /[0-9]/.test(character) ? 500 : character === ' ' ? 250 : /[\x20-\x7e]/.test(character) ? 550 : 1000;
        const limit = (line === 0 ? 155 / size : 130 / 7) * 72 / 25.4 * 1000;
        if (character === '\n' || used + advance > limit) { line++; used = 0; candidate.push(''); }
        if (line > 1) break;
        if (character !== '\n') { candidate[line] += character; used += advance; }
      }
      if (line < 2) { remarks = candidate; remarksSize = size; break; }
    }
    if (!remarks.length) entries.push({ text: 'Remarks: ' + notes });
  }
  const lines = [];
  for (const entry of entries) {
    let part = 0;
    for (const paragraph of entry.text.replace(/\r/g, '').split('\n')) {
      let line = '', used = 0;
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const characters = Array.from(word, character => ({ value: character, width: /[MW@%]/.test(character) ? 1000 : /[mw]/.test(character) ? 800 : /[A-Z]/.test(character) ? 750 : /[il.,:;'!|]/.test(character) ? 350 : /[0-9]/.test(character) ? 500 : /[\x20-\x7e]/.test(character) ? 550 : 1000 }));
        const width = characters.reduce((total, character) => total + character.width, 0);
        if (line && used + 250 + width <= 40000) { line += ' ' + word; used += 250 + width; continue; }
        if (line) { lines.push({ ...entry, part: part++, text: line }); line = ''; used = 0; }
        for (const character of characters) {
          if (line && used + character.width > 40000) { lines.push({ ...entry, part: part++, text: line }); line = ''; used = 0; }
          line += character.value; used += character.width;
        }
      }
      lines.push({ ...entry, part: part++, text: line });
    }
  }
  const pages = Math.max(1, Math.ceil(lines.length / 14));
  let totalQuantity = 0n;
  let knownTotal = record.items.length > 0;
  for (const item of record.items) {
    const value = String(item.quantity ?? '');
    if (!/^\d+(?:\.\d{1,3})?$/.test(value)) { knownTotal = false; continue; }
    const [whole, fraction = ''] = value.split('.');
    totalQuantity += BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  }
  for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
    const final = pageIndex === pages - 1;
    let sheet = template;
    if (pageIndex > 0) {
      sheet = workbook.addWorksheet('DR ' + (pageIndex + 1));
      const model = structuredClone(templateModel);
      model.id = sheet.id; model.name = sheet.name; model.mergeCells = model.merges;
      sheet.model = model;
    } else sheet.name = 'DR 1';
    for (const field of printedHeaders) {
      if (['F31', 'M33'].includes(field.address) && !final) continue;
      const cell = sheet.getCell(field.address);
      cell.style = structuredClone(cell.style);
      cell.value = field.value;
      cell.font = { ...cell.font, size: field.size };
      cell.alignment = { ...cell.alignment, vertical: 'top', wrapText: field.wrap, shrinkToFit: false };
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(record.deliveryDate || '')) {
      const date = sheet.getCell('M2');
      date.style = structuredClone(date.style);
      date.value = new Date(record.deliveryDate + 'T00:00:00Z'); date.numFmt = 'm/d/yy';
    }
    sheet.getCell('D37').style = structuredClone(sheet.getCell('D37').style);
    sheet.getCell('D37').value = record.number || null;
    const quantities = [];
    for (const [slot, line] of lines.slice(pageIndex * 14, (pageIndex + 1) * 14).entries()) {
      const row = 12 + slot;
      const description = sheet.getCell('J' + row);
      description.style = structuredClone(description.style);
      description.value = line.text;
      description.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false, shrinkToFit: true };
      if (!line.item || line.part !== 0) continue;
      const unit = sheet.getCell('F' + row);
      unit.style = structuredClone(unit.style);
      unit.value = line.unit; unit.font = { ...unit.font, size: line.unitSize };
      unit.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false, shrinkToFit: false };
      quantities.push(['A' + row, line.item.quantity]);
    }
    if (final) {
      if (knownTotal) quantities.push(['B26', totalQuantity / 1000n + '.' + (totalQuantity % 1000n).toString().padStart(3, '0')]);
      sheet.getCell('E26').style = structuredClone(sheet.getCell('E26').style);
      sheet.getCell('E26').value = 'TOTAL';
      sheet.getCell('C27').style = structuredClone(sheet.getCell('C27').style);
      sheet.getCell('C27').value = '********NF********';
      for (const [address, value, size] of [['C28', remarks[0] ?? (notes ? 'Remarks continued in item rows.' : null), remarksSize], ['C29', remarks[1] ?? null, 7]]) {
        const cell = sheet.getCell(address);
        cell.style = structuredClone(cell.style);
        cell.value = value;
        cell.font = { ...cell.font, size };
        cell.alignment = { ...cell.alignment, horizontal: 'left', wrapText: false, shrinkToFit: false };
      }
    }
    for (const [address, raw] of quantities) {
      const value = String(raw ?? '');
      if (!/^\d+(?:\.\d{1,3})?$/.test(value)) continue;
      const [whole, fraction = ''] = value.split('.');
      const decimal = fraction.replace(/0+$/, '');
      const significant = (whole + fraction).replace(/^0+/, '').replace(/0+$/, '').length;
      const cell = sheet.getCell(address);
      cell.style = structuredClone(cell.style);
      cell.numFmt = '#,##0' + (decimal ? '.' + '0'.repeat(decimal.length) : '');
      cell.value = significant <= 15 ? Number(value) : BigInt(whole).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (decimal ? '.' + decimal : '');
      cell.alignment = { horizontal: 'right', vertical: 'middle', shrinkToFit: true };
    }
  }
  const pageSheets = [...workbook.worksheets];
  const sheet = pageSheets[0];
  for (let pageIndex = 1; pageIndex < pageSheets.length; pageIndex++) {
    const source = pageSheets[pageIndex], offset = pageIndex * 37;
    source.eachRow({ includeEmpty: true }, row => {
      const target = sheet.getRow(row.number + offset);
      target.height = row.height; target.hidden = row.hidden; target.style = structuredClone(row.style);
      row.eachCell({ includeEmpty: true }, cell => {
        const destination = target.getCell(cell.col);
        destination.style = structuredClone(cell.style);
        if (cell.type !== ExcelJS.ValueType.Merge) destination.value = structuredClone(cell.value);
      });
    });
    for (const range of source.model.merges) {
      const parts = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      sheet.mergeCellsWithoutStyle(parts[1] + (Number(parts[2]) + offset) + ':' + parts[3] + (Number(parts[4]) + offset));
    }
    workbook.removeWorksheet(source.id);
  }
  sheet.name = 'Delivery Receipt'; sheet.rowBreaks = [];
  for (let pageIndex = 1; pageIndex < pages; pageIndex++) sheet.getRow(pageIndex * 37).addPageBreak();
  sheet.pageSetup = { ...sheet.pageSetup, paperSize: 1, orientation: 'portrait', scale: 100, fitToPage: false, printArea: 'A1:N' + (pages * 37), margins: { left: .23, right: .27, top: .15, bottom: .20, header: .30, footer: .30 } };
  sheet.headerFooter = {};
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = String(record.number || 'DR-' + id).replace(/[^a-zA-Z0-9._-]/g, '_') + '.xlsx';
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(Buffer.from(buffer));
});

router.get('/shipping-invoices', async (req, res) => {
  const result = await request().query(`SELECT s.id,s.number,s.invoiceId,i.number AS invoiceNumber,i.orderId,o.number AS orderNumber,
  o.customerId,o.customerName,o.customerAddress,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,o.preparedByName,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,CONVERT(varchar(10),s.shippingDate,23) AS shippingDate,
  s.carrier,s.trackingNumber,s.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount,d.number AS deliveryNumber FROM dbo.ShippingInvoices s
  JOIN dbo.SalesInvoices i ON i.id=s.invoiceId
  JOIN dbo.SalesOrders o ON o.id=i.orderId
  LEFT JOIN dbo.DeliveryReceipts d ON d.orderId=o.id ORDER BY s.id DESC`);
  res.json({
    records: result.recordset
  });
});
router.get('/shipping-invoices/:id', async (req, res) => {
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT s.id,s.number,s.invoiceId,i.number AS invoiceNumber,i.orderId,o.number AS orderNumber,
  o.customerId,o.customerName,o.customerAddress,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,o.preparedByName,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,CONVERT(varchar(10),s.shippingDate,23) AS shippingDate,
  s.carrier,s.trackingNumber,s.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount,d.number AS deliveryNumber FROM dbo.ShippingInvoices s
  JOIN dbo.SalesInvoices i ON i.id=s.invoiceId
  JOIN dbo.SalesOrders o ON o.id=i.orderId
  LEFT JOIN dbo.DeliveryReceipts d ON d.orderId=o.id WHERE s.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Shipping invoice could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).input('invoiceId', sql.Int, recordResult.recordset[0].invoiceId).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderItemId,@orderId AS orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount FROM dbo.SalesInvoiceItems WHERE invoiceId=@invoiceId ORDER BY id`);
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.json({
    record
  });
});
router.post('/sales-invoices', async (req, res) => {
  if (!req.is('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    const error = new Error('Send a valid JSON object.');
    error.status = 400;
    throw error;
  }
  const input = req.body;
  const user = res.locals.user;
  const parsedOrderId = Number(input.orderId);
  if (!Number.isSafeInteger(parsedOrderId) || parsedOrderId <= 0 || parsedOrderId > 2147483647) {
    const error = new Error(`Enter a valid ${'sales order'}.`);
    error.status = 400;
    throw error;
  }
  const orderId = parsedOrderId;
  const invoiceDate = typeof input.invoiceDate === 'string' ? input.invoiceDate.trim() : '';
  const dueDate = typeof input.dueDate === 'string' ? input.dueDate.trim() : '';
  if (dueDate < invoiceDate) {
    const error = new Error('Due date cannot be earlier than invoice date.');
    error.status = 400;
    throw error;
  }
  const notes = typeof input.notes === 'string' ? input.notes.trim() || null : null;
  const id = await transaction(async tx => {
    const orderResult = await request(tx).input('id', sql.Int, orderId).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked JOIN dbo.SalesOrderItems originalLine ON originalLine.id=linked.orderItemId WHERE originalLine.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
    if (!orderResult.recordset.length) {
      const error = new Error('Sales order could not be found.');
      error.status = 404;
      throw error;
    }
    const orderItems = await request(tx).input('id', sql.Int, orderId).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CAST(CASE WHEN
  EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems linked WHERE linked.orderItemId=oi.id)
  OR EXISTS(SELECT 1 FROM dbo.SalesInvoices legacy WHERE legacy.orderId=oi.orderId AND (
    NOT EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail WHERE detail.invoiceId=legacy.id)
    OR EXISTS(SELECT 1 FROM dbo.SalesInvoiceItems detail LEFT JOIN dbo.SalesOrderItems originalLine
      ON originalLine.id=detail.orderItemId AND originalLine.orderId=legacy.orderId
      WHERE detail.invoiceId=legacy.id AND originalLine.id IS NULL)))
  THEN 1 ELSE 0 END AS bit) AS hasInvoice,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
    const order = {
      ...orderResult.recordset[0],
      items: orderItems.recordset
    };
    if (order.status !== 'confirmed') {
      const error = new Error('Confirm the sales order before creating an invoice.');
      error.status = 400;
      throw error;
    }
    if (order.invoiced) {
      const error = new Error('This sales order already has an invoice.');
      error.status = 409;
      throw error;
    }
    if (order.delivered) { const error = new Error('This order already has a legacy delivery that reduced stock. Review that delivery before invoicing.'); error.status = 409; throw error; }
    const identityResult = await request(tx).input('buyerId', sql.Int, order.billToCustomerId ?? order.customerId).input('customerId', sql.Int, order.customerId).query(`SELECT buyer.tin AS buyerTin,buyer.businessStyle AS buyerBusinessStyle,customer.drName AS shipToName
      FROM dbo.Customers customer LEFT JOIN dbo.Customers buyer ON buyer.id=@buyerId WHERE customer.id=@customerId`);
    const identity = identityResult.recordset[0];
    const buyerTin = typeof identity?.buyerTin === 'string' ? identity.buyerTin.trim() || null : null;
    const buyerBusinessStyle = typeof identity?.buyerBusinessStyle === 'string' ? identity.buyerBusinessStyle.trim() || null : null;
    const shipToName = typeof identity?.shipToName === 'string' ? identity.shipToName.trim() || null : null;
    const preparedByName = typeof user.name === 'string' ? user.name.trim() || null : null;
    let vatClass = null;
    if (order.vatCode) {
      const vatResult = await request(tx).input('code', sql.NVarChar(sql.MAX), order.vatCode).query('SELECT [class] FROM dbo.ConfigVatCodes WHERE code=@code');
      const configuredClass = vatResult.recordset[0]?.class;
      if (['Vatable', 'Vat-Exempt', 'Zero Rated'].includes(configuredClass)) vatClass = configuredClass;
      if (['Vat-Exempt', 'Zero Rated'].includes(vatClass) && order.vatAmount != null && /[1-9]/.test(String(order.vatAmount))) vatClass = null;
    }
    const result = await request(tx).input('orderId', sql.Int, orderId).input('invoiceDate', sql.VarChar(sql.MAX), invoiceDate).input('dueDate', sql.VarChar(sql.MAX), dueDate).input('notes', sql.NVarChar(sql.MAX), notes).input('total', sql.VarChar(sql.MAX), String(order.total)).input('createdBy', sql.Int, user.id).input('grossAmount', sql.VarChar(sql.MAX), order.grossAmount == null ? null : String(order.grossAmount)).input('lineDiscountAmount', sql.VarChar(sql.MAX), order.lineDiscountAmount == null ? null : String(order.lineDiscountAmount)).input('headerDiscountAmount', sql.VarChar(sql.MAX), order.headerDiscountAmount == null ? null : String(order.headerDiscountAmount)).input('discountAmount', sql.VarChar(sql.MAX), order.discountAmount == null ? null : String(order.discountAmount)).input('netAmount', sql.VarChar(sql.MAX), order.netAmount == null ? null : String(order.netAmount)).input('vatAmount', sql.VarChar(sql.MAX), order.vatAmount == null ? null : String(order.vatAmount)).input('amount', sql.VarChar(sql.MAX), String(order.total))
      .input('buyerTin', sql.NVarChar(sql.MAX), buyerTin).input('buyerBusinessStyle', sql.NVarChar(sql.MAX), buyerBusinessStyle).input('shipToName', sql.NVarChar(sql.MAX), shipToName).input('vatClass', sql.NVarChar(sql.MAX), vatClass).input('preparedByName', sql.NVarChar(sql.MAX), preparedByName).query(`INSERT INTO dbo.SalesInvoices (orderId,invoiceDate,dueDate,notes,total,createdBy,paidAmount,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,buyerTin,buyerBusinessStyle,shipToName,vatClass,preparedByName,createdAt,updatedAt) OUTPUT INSERTED.id
        VALUES (@orderId,@invoiceDate,@dueDate,@notes,@total,@createdBy,0,@grossAmount,@lineDiscountAmount,@headerDiscountAmount,@discountAmount,@netAmount,@vatAmount,@amount,@buyerTin,@buyerBusinessStyle,@shipToName,@vatClass,@preparedByName,SYSUTCDATETIME(),SYSUTCDATETIME())`);
    const number = `SI-${String(result.recordset[0].id).padStart(8, '0')}`;
    await request(tx).input('id', sql.Int, result.recordset[0].id).input('number', sql.NVarChar(sql.MAX), number).query('UPDATE dbo.SalesInvoices SET number=@number WHERE id=@id');
    await request(tx).input('invoiceId', sql.Int, result.recordset[0].id).input('orderId', sql.Int, orderId).query(`INSERT INTO dbo.SalesInvoiceItems
      (invoiceId,orderItemId,productId,productName,description,sku,unit,refNumber,quotationNumber,currency,quantity,unitPrice,convertedUnitPrice,discountRate,deliveryDate,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,lineTotal)
      SELECT @invoiceId,id,productId,productName,description,sku,unit,refNumber,quotationNumber,currency,quantity,unitPrice,convertedUnitPrice,discountRate,deliveryDate,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@orderId`);
    const invoiceId = result.recordset[0].id;
    const stockItems = await request(tx).input('invoiceId', sql.Int, invoiceId).query(`SELECT id,productId,productName,unit,CONVERT(varchar(60),quantity) AS quantity
      FROM dbo.SalesInvoiceItems WHERE invoiceId=@invoiceId ORDER BY productId,id`);
    if (!stockItems.recordset.length) { const error = new Error('The invoice must contain saved product quantities.'); error.status = 409; throw error; }
    const stockKeys = stockItems.recordset.map(item => ({ itemId: item.id, key: 'SI:' + invoiceId + ':' + item.id })).sort((a, b) => a.key.localeCompare(b.key));
    for (const entry of stockKeys) {
      const previous = await request(tx).input('requestKey', sql.VarChar(sql.MAX), entry.key).input('invoiceItemId', sql.Int, entry.itemId).query(`SELECT id FROM dbo.ProductStockMovements WITH (UPDLOCK,HOLDLOCK)
        WHERE requestKey=CAST(@requestKey AS varchar(32)) OR invoiceItemId=@invoiceItemId`);
      if (previous.recordset.length) { const error = new Error('Stock is already recorded for this invoice item.'); error.status = 409; throw error; }
    }
    for (const item of stockItems.recordset) {
      const quantity = String(item.quantity ?? '');
      if (!/^\d+(?:\.\d{1,3})?$/.test(quantity)) { const error = new Error('Saved invoice quantities must use up to 3 decimal places.'); error.status = 409; throw error; }
      const [whole, fraction = ''] = quantity.split('.');
      const quantityUnits = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
      if (quantityUnits <= 0n || quantityUnits > 999999999999999999n) { const error = new Error('Saved invoice quantities must be positive and within the stock range.'); error.status = 409; throw error; }
      const stockResult = await request(tx).input('productId', sql.Int, item.productId).query(`SELECT id,unit,isActive,CONVERT(varchar(60),stock) AS stock
        FROM dbo.Products WITH (UPDLOCK,HOLDLOCK) WHERE id=@productId`);
      const product = stockResult.recordset[0];
      if (!product?.isActive) { const error = new Error('Invoice stock-out requires an active product: ' + item.productName + '.'); error.status = 409; throw error; }
      if (typeof item.unit !== 'string' || !item.unit.trim() || typeof product.unit !== 'string' || !product.unit.trim() || item.unit !== product.unit) { const error = new Error('Review the saved and current UOP for ' + item.productName + ' before invoicing.'); error.status = 409; throw error; }
      const stock = String(product.stock ?? '');
      if (!/^\d+(?:\.\d{1,3})?$/.test(stock)) { const error = new Error('Stock on hand is not set or is invalid for ' + item.productName + '.'); error.status = 409; throw error; }
      const [stockWhole, stockFraction = ''] = stock.split('.');
      const before = BigInt(stockWhole) * 1000n + BigInt(stockFraction.padEnd(3, '0'));
      if (before > 999999999999999999n || quantityUnits > before) { const error = new Error('Insufficient finished-product stock for ' + item.productName + '.'); error.status = 409; throw error; }
      const after = before - quantityUnits;
      const stockBefore = before / 1000n + '.' + (before % 1000n).toString().padStart(3, '0');
      const stockAfter = after / 1000n + '.' + (after % 1000n).toString().padStart(3, '0');
      await request(tx).input('productId', sql.Int, item.productId).input('stockAfter', sql.VarChar(sql.MAX), stockAfter).query('UPDATE dbo.Products SET stock=CAST(@stockAfter AS DECIMAL(18,3)),updatedAt=SYSUTCDATETIME() WHERE id=@productId');
      await request(tx).input('requestKey', sql.VarChar(sql.MAX), 'SI:' + invoiceId + ':' + item.id).input('productId', sql.Int, item.productId)
        .input('invoiceId', sql.Int, invoiceId).input('invoiceItemId', sql.Int, item.id).input('quantity', sql.VarChar(sql.MAX), quantity).input('unit', sql.NVarChar(sql.MAX), item.unit)
        .input('stockBefore', sql.VarChar(sql.MAX), stockBefore).input('stockAfter', sql.VarChar(sql.MAX), stockAfter).input('movementDate', sql.VarChar(sql.MAX), invoiceDate)
        .input('sourceDestination', sql.NVarChar(sql.MAX), shipToName ?? order.customerName).input('reference', sql.NVarChar(sql.MAX), number)
        .input('reason', sql.NVarChar(sql.MAX), notes ?? 'Sales invoice issued.').input('createdById', sql.Int, user.id).query(`INSERT INTO dbo.ProductStockMovements
        (requestKey,productId,invoiceId,invoiceItemId,direction,quantity,unit,stockBefore,stockAfter,movementDate,sourceDestination,reference,reason,createdById,createdAt)
        VALUES(@requestKey,@productId,@invoiceId,@invoiceItemId,N'out',@quantity,@unit,@stockBefore,@stockAfter,@movementDate,@sourceDestination,@reference,@reason,@createdById,SYSUTCDATETIME())`);
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'sales-invoices').input('action', sql.NVarChar(sql.MAX), 'create').input('recordId', sql.NVarChar(sql.MAX), String(result.recordset[0].id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return result.recordset[0].id;
  });
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT i.id,i.number,i.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,i.buyerTin,i.buyerBusinessStyle,i.shipToName,i.vatClass,COALESCE(i.preparedByName,invoiceCreator.name) AS preparedByName,o.preparedByName AS sourcePreparedByName,
  CAST(CASE WHEN linkedDelivery.id IS NULL THEN 0 ELSE 1 END AS bit) AS delivered,linkedDelivery.id AS deliveryReceiptId,linkedDelivery.number AS deliveryReceiptNumber,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId LEFT JOIN dbo.SalesUserLogin invoiceCreator ON invoiceCreator.id=i.createdBy LEFT JOIN dbo.DeliveryReceipts linkedDelivery ON linkedDelivery.invoiceId=i.id WHERE i.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Sales invoice could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).input('invoiceId', sql.Int, recordResult.recordset[0].id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderItemId,@orderId AS orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount FROM dbo.SalesInvoiceItems WHERE invoiceId=@invoiceId ORDER BY id`);
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.status(201).json({
    record
  });
});
router.patch('/sales-invoices/:id/payment', async (req, res) => {
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  if (!req.is('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    const error = new Error('Send a valid JSON object.');
    error.status = 400;
    throw error;
  }
  const input = req.body;
  const user = res.locals.user;
  if (!['string', 'number'].includes(typeof input.paidAmount) || !Number.isFinite(Number(input.paidAmount))) {
    const error = new Error('Payment must be a valid decimal number.');
    error.status = 400;
    throw error;
  }
  const paymentText = String(input.paidAmount).trim();
  if (!/^\d+(?:\.\d+)?$/.test(paymentText)) {
    const error = new Error('Payment must be zero or greater.');
    error.status = 400;
    throw error;
  }
  const [wholePayment, enteredPaymentFraction = ''] = paymentText.split('.');
  const paymentFraction = enteredPaymentFraction.replace(/0+$/, '');
  if (paymentFraction.length > 6) {
    const error = new Error('Payment supports at most 6 decimal places.');
    error.status = 400;
    throw error;
  }
  const paymentMillionths = BigInt(wholePayment) * 1000000n + BigInt(paymentFraction.padEnd(6, '0') || '0');
  if (paymentMillionths > 1000000000000000000n) {
    const error = new Error('Payment is too large.');
    error.status = 400;
    throw error;
  }
  const paidAmount = `${paymentMillionths / 1000000n}.${(paymentMillionths % 1000000n).toString().padStart(6, '0')}`;
  await transaction(async tx => {
    const result = await request(tx).input('id', sql.Int, id).input('paidAmount', sql.VarChar(sql.MAX), paidAmount).query('UPDATE dbo.SalesInvoices SET paidAmount=@paidAmount,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id AND total>=@paidAmount');
    if (!result.recordset.length) {
      const existing = await request(tx).input('id', sql.Int, id).query('SELECT id FROM dbo.SalesInvoices WHERE id=@id');
      if (!existing.recordset.length) {
        const error = new Error('Sales invoice could not be found.');
        error.status = 404;
        throw error;
      }
      {
        const error = new Error('Payment cannot exceed the invoice total.');
        error.status = 400;
        throw error;
      }
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'sales-invoices').input('action', sql.NVarChar(sql.MAX), 'payment').input('recordId', sql.NVarChar(sql.MAX), String(id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
  });
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT i.id,i.number,i.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,i.buyerTin,i.buyerBusinessStyle,i.shipToName,i.vatClass,COALESCE(i.preparedByName,invoiceCreator.name) AS preparedByName,o.preparedByName AS sourcePreparedByName,
  CAST(CASE WHEN linkedDelivery.id IS NULL THEN 0 ELSE 1 END AS bit) AS delivered,linkedDelivery.id AS deliveryReceiptId,linkedDelivery.number AS deliveryReceiptNumber,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId LEFT JOIN dbo.SalesUserLogin invoiceCreator ON invoiceCreator.id=i.createdBy LEFT JOIN dbo.DeliveryReceipts linkedDelivery ON linkedDelivery.invoiceId=i.id WHERE i.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Sales invoice could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).input('invoiceId', sql.Int, recordResult.recordset[0].id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderItemId,@orderId AS orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount FROM dbo.SalesInvoiceItems WHERE invoiceId=@invoiceId ORDER BY id`);
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.json({
    record
  });
});
router.post('/delivery-receipts', async (req, res) => {
  if (!req.is('application/json')) { const error = new Error('Send this request as JSON.'); error.status = 415; throw error; }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') { const error = new Error('Send a valid JSON object.'); error.status = 400; throw error; }
  const input = req.body;
  const user = res.locals.user;
  const invoiceId = Number(input.invoiceId);
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0 || invoiceId > 2147483647) { const error = new Error('Select a valid sales invoice.'); error.status = 400; throw error; }
  const deliveryDate = typeof input.deliveryDate === 'string' ? input.deliveryDate.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || deliveryDate.startsWith('0000') || !Number.isFinite(new Date(deliveryDate + 'T00:00:00Z').getTime()) || new Date(deliveryDate + 'T00:00:00Z').toISOString().slice(0, 10) !== deliveryDate) { const error = new Error('Enter a valid delivery date.'); error.status = 400; throw error; }
  const receivedBy = typeof input.receivedBy === 'string' ? input.receivedBy.trim() || null : null;
  const notes = typeof input.notes === 'string' ? input.notes.trim() || null : null;
  const id = await transaction(async tx => {
    const lookup = await request(tx).input('id', sql.Int, invoiceId).query('SELECT orderId FROM dbo.SalesInvoices WHERE id=@id');
    if (!lookup.recordset.length) { const error = new Error('Sales invoice could not be found.'); error.status = 404; throw error; }
    const orderId = lookup.recordset[0].orderId;
    await request(tx).input('orderId', sql.Int, orderId).query('SELECT id FROM dbo.SalesOrders WITH (UPDLOCK,HOLDLOCK) WHERE id=@orderId');
    const source = await request(tx).input('id', sql.Int, invoiceId).query(`SELECT i.id,i.orderId,i.number,CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,
      o.customerAddress,o.billToAddress,CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
      CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
      CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,CONVERT(varchar(60),i.total) AS total
      FROM dbo.SalesInvoices i WITH (UPDLOCK,HOLDLOCK) JOIN dbo.SalesOrders o ON o.id=i.orderId WHERE i.id=@id`);
    const invoice = source.recordset[0];
    if (!invoice) { const error = new Error('Sales invoice could not be found.'); error.status = 404; throw error; }
    if (deliveryDate < invoice.invoiceDate) { const error = new Error('Delivery date cannot be earlier than the invoice date.'); error.status = 400; throw error; }
    const existing = await request(tx).input('invoiceId', sql.Int, invoiceId).input('orderId', sql.Int, orderId).query('SELECT id FROM dbo.DeliveryReceipts WITH (UPDLOCK,HOLDLOCK) WHERE invoiceId=@invoiceId OR orderId=@orderId');
    if (existing.recordset.length) { const error = new Error('This sales invoice already has a delivery receipt.'); error.status = 409; throw error; }
    const sourceItems = await request(tx).input('invoiceId', sql.Int, invoiceId).query('SELECT id FROM dbo.SalesInvoiceItems WHERE invoiceId=@invoiceId ORDER BY id');
    if (!sourceItems.recordset.length) { const error = new Error('The invoice has no saved items to deliver.'); error.status = 409; throw error; }
    const address = Object.hasOwn(input, 'address') ? typeof input.address === 'string' ? input.address.trim() || null : null : invoice.billToAddress ?? invoice.customerAddress ?? null;
    if (typeof address !== 'string' || !address.trim()) { const error = new Error('Enter the delivery address.'); error.status = 400; throw error; }
    const req = request(tx).input('invoiceId', sql.Int, invoiceId).input('orderId', sql.Int, orderId).input('deliveryDate', sql.VarChar(sql.MAX), deliveryDate)
      .input('receivedBy', sql.NVarChar(sql.MAX), receivedBy).input('address', sql.NVarChar(sql.MAX), address).input('notes', sql.NVarChar(sql.MAX), notes)
      .input('createdBy', sql.Int, user.id).input('preparedByName', sql.NVarChar(sql.MAX), user.name).input('stockDeducted', sql.Bit, false);
    for (const field of ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount']) req.input(field, sql.VarChar(sql.MAX), invoice[field] == null ? null : String(invoice[field]));
    req.input('amount', sql.VarChar(sql.MAX), String(invoice.total));
    const result = await req.query(`INSERT INTO dbo.DeliveryReceipts (invoiceId,orderId,deliveryDate,receivedBy,address,notes,createdBy,preparedByName,stockDeducted,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,createdAt)
      OUTPUT INSERTED.id VALUES(@invoiceId,@orderId,@deliveryDate,@receivedBy,@address,@notes,@createdBy,@preparedByName,@stockDeducted,@grossAmount,@lineDiscountAmount,@headerDiscountAmount,@discountAmount,@netAmount,@vatAmount,@amount,SYSUTCDATETIME())`);
    const number = 'DR-' + String(result.recordset[0].id).padStart(8, '0');
    await request(tx).input('id', sql.Int, result.recordset[0].id).input('number', sql.NVarChar(sql.MAX), number).query('UPDATE dbo.DeliveryReceipts SET number=@number WHERE id=@id');
    await request(tx).input('deliveryReceiptId', sql.Int, result.recordset[0].id).input('invoiceId', sql.Int, invoiceId).query(`INSERT INTO dbo.DeliveryReceiptItems
      (deliveryReceiptId,orderItemId,productId,productName,description,sku,unit,refNumber,quotationNumber,currency,quantity,unitPrice,convertedUnitPrice,discountRate,deliveryDate,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,lineTotal)
      SELECT @deliveryReceiptId,orderItemId,productId,productName,description,sku,unit,refNumber,quotationNumber,currency,quantity,unitPrice,convertedUnitPrice,discountRate,deliveryDate,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,lineTotal FROM dbo.SalesInvoiceItems WHERE invoiceId=@invoiceId`);
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'delivery-receipts').input('action', sql.NVarChar(sql.MAX), 'create').input('recordId', sql.NVarChar(sql.MAX), String(result.recordset[0].id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return result.recordset[0].id;
  });
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT d.id,d.number,d.orderId,d.invoiceId,si.number AS invoiceNumber,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,
  o.billToName,o.billToAddress,si.shipToName,COALESCE(si.shipToName,o.billToName,o.customerName) AS deliveredTo,
  si.buyerTin,si.buyerBusinessStyle AS businessStyle,o.paymentTerm,CONVERT(varchar(10),si.invoiceDate,23) AS invoiceDate,
  CONVERT(varchar(10),d.deliveryDate,23) AS deliveryDate,d.receivedBy,d.address,d.notes,d.stockDeducted,
  COALESCE(d.preparedByName,creator.name) AS preparedByName,CAST(NULL AS nvarchar(max)) AS purchaseOrderNumber
  FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId LEFT JOIN dbo.SalesInvoices si ON si.id=d.invoiceId
  LEFT JOIN dbo.SalesUserLogin creator ON creator.id=d.createdBy WHERE d.id=@id`);
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).input('deliveryReceiptId', sql.Int, id).query(`SELECT id,orderItemId,@orderId AS orderId,productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,
  refNumber,quotationNumber,description,description AS productDescription,CONVERT(varchar(10),deliveryDate,23) AS deliveryDate
  FROM dbo.DeliveryReceiptItems WHERE deliveryReceiptId=@deliveryReceiptId ORDER BY id`);
  res.status(201).json({ record: { ...recordResult.recordset[0], items: recordItems.recordset } });
});
router.post('/shipping-invoices', async (req, res) => {
  if (!req.is('application/json')) {
    const error = new Error('Send this request as JSON.');
    error.status = 415;
    throw error;
  }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    const error = new Error('Send a valid JSON object.');
    error.status = 400;
    throw error;
  }
  const input = req.body;
  const user = res.locals.user;
  const parsedInvoiceId = Number(input.invoiceId);
  if (!Number.isSafeInteger(parsedInvoiceId) || parsedInvoiceId <= 0 || parsedInvoiceId > 2147483647) {
    const error = new Error(`Enter a valid ${'sales invoice'}.`);
    error.status = 400;
    throw error;
  }
  const invoiceId = parsedInvoiceId;
  const shippingDate = typeof input.shippingDate === 'string' ? input.shippingDate.trim() : '';
  const carrier = typeof input.carrier === 'string' ? input.carrier.trim() || null : null;
  const trackingNumber = typeof input.trackingNumber === 'string' ? input.trackingNumber.trim() || null : null;
  const notes = typeof input.notes === 'string' ? input.notes.trim() || null : null;
  const id = await transaction(async tx => {
    // Serialize requests for the same source invoice without changing its data.
    const invoice = await request(tx).input('id', sql.Int, invoiceId).query('SELECT CONVERT(varchar(10),invoiceDate,23) AS invoiceDate FROM dbo.SalesInvoices WITH (UPDLOCK,HOLDLOCK) WHERE id=@id');
    if (!invoice.recordset.length) {
      const error = new Error('Sales invoice could not be found.');
      error.status = 404;
      throw error;
    }
    if (shippingDate < invoice.recordset[0].invoiceDate) {
      const error = new Error('Shipping date cannot be earlier than invoice date.');
      error.status = 400;
      throw error;
    }
    const existing = await request(tx).input('invoiceId', sql.Int, invoiceId).query('SELECT id FROM dbo.ShippingInvoices WHERE invoiceId=@invoiceId');
    if (existing.recordset.length) {
      const error = new Error('This sales invoice already has a shipping invoice.');
      error.status = 409;
      throw error;
    }
    const result = await request(tx).input('invoiceId', sql.Int, invoiceId).input('shippingDate', sql.VarChar(sql.MAX), shippingDate).input('carrier', sql.NVarChar(sql.MAX), carrier).input('trackingNumber', sql.NVarChar(sql.MAX), trackingNumber).input('notes', sql.NVarChar(sql.MAX), notes).input('createdBy', sql.Int, user.id).query(`INSERT INTO dbo.ShippingInvoices (invoiceId,shippingDate,carrier,trackingNumber,notes,createdBy,createdAt)
        OUTPUT INSERTED.id VALUES (@invoiceId,@shippingDate,@carrier,@trackingNumber,@notes,@createdBy,SYSUTCDATETIME())`);
    const number = `SHI-${String(result.recordset[0].id).padStart(8, '0')}`;
    await request(tx).input('id', sql.Int, result.recordset[0].id).input('number', sql.NVarChar(sql.MAX), number).query('UPDATE dbo.ShippingInvoices SET number=@number WHERE id=@id');
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'shipping-invoices').input('action', sql.NVarChar(sql.MAX), 'create').input('recordId', sql.NVarChar(sql.MAX), String(result.recordset[0].id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return result.recordset[0].id;
  });
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT s.id,s.number,s.invoiceId,i.number AS invoiceNumber,i.orderId,o.number AS orderNumber,
  o.customerId,o.customerName,o.customerAddress,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,o.preparedByName,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,CONVERT(varchar(10),s.shippingDate,23) AS shippingDate,
  s.carrier,s.trackingNumber,s.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount,d.number AS deliveryNumber FROM dbo.ShippingInvoices s
  JOIN dbo.SalesInvoices i ON i.id=s.invoiceId
  JOIN dbo.SalesOrders o ON o.id=i.orderId
  LEFT JOIN dbo.DeliveryReceipts d ON d.orderId=o.id WHERE s.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Shipping invoice could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).input('invoiceId', sql.Int, recordResult.recordset[0].invoiceId).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderItemId,@orderId AS orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount FROM dbo.SalesInvoiceItems WHERE invoiceId=@invoiceId ORDER BY id`);
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.status(201).json({
    record
  });
});
for (const [path, methods] of [['/customer-options', ['GET']], ['/sales-order-options', ['GET']], ['/product-options', ['GET']], ['/customers', ['GET', 'POST']], ['/customers/:id', ['GET', 'PUT', 'DELETE']], ['/products', ['GET', 'POST']], ['/products/:id', ['GET', 'PUT', 'DELETE']], ['/products/:id/stock-movements', ['GET', 'POST']], ['/sales-orders', ['GET', 'POST']], ['/sales-orders/:id', ['GET', 'PUT', 'DELETE']], ['/sales-orders/:id/items', ['PATCH']], ['/sales-orders/:id/quantities', ['PATCH']], ['/sales-invoices', ['GET', 'POST']], ['/sales-invoices/:id', ['GET']], ['/sales-invoices/:id/excel', ['GET']], ['/sales-invoices/:id/payment', ['PATCH']], ['/delivery-receipts', ['GET', 'POST']], ['/delivery-receipts/:id', ['GET']], ['/delivery-receipts/:id/excel', ['GET']], ['/shipping-invoices', ['GET', 'POST']], ['/shipping-invoices/:id', ['GET']]]) router.all(path, (req, res) => res.set('Allow', methods.join(', ')).status(405).json({
  message: 'This HTTP method is not supported.'
}));
module.exports = router;
