const express = require('express');
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
  const result = await request().input('productId', sql.Int, productId).query(`SELECT 'manual:' + CONVERT(varchar(20),m.id) AS id,m.id AS movementId,
    CASE WHEN m.direction='in' THEN 'manual-in' ELSE 'manual-out' END AS type,m.direction,
    CONVERT(varchar(60),m.quantity) AS quantity,m.unit,CONVERT(varchar(60),m.stockBefore) AS stockBefore,CONVERT(varchar(60),m.stockAfter) AS stockAfter,
    CONVERT(varchar(10),m.movementDate,23) AS movementDate,m.sourceDestination,m.reference,m.reason,u.username AS createdByUsername,u.name AS createdByName,
    CONVERT(varchar(33),m.createdAt,126)+'Z' AS createdAt,CAST(NULL AS int) AS deliveryReceiptId,CAST(NULL AS nvarchar(max)) AS deliveryReceiptNumber,
    CAST(NULL AS int) AS orderId,CAST(NULL AS nvarchar(max)) AS orderNumber,CAST(NULL AS int) AS invoiceId,CAST(NULL AS nvarchar(max)) AS invoiceNumber,
    CAST(NULL AS nvarchar(max)) AS customerName,CAST(NULL AS nvarchar(max)) AS address,CAST(NULL AS nvarchar(max)) AS receivedBy
    FROM dbo.ProductStockMovements m JOIN dbo.SalesUserLogin u ON u.id=m.createdById WHERE m.productId=@productId
    UNION ALL
    SELECT 'delivery:' + CONVERT(varchar(20),d.id) + ':' + CONVERT(varchar(20),i.id) AS id,CAST(NULL AS int) AS movementId,
    'delivery-out' AS type,'out' AS direction,CONVERT(varchar(60),i.quantity) AS quantity,i.unit,
    CAST(NULL AS varchar(60)) AS stockBefore,CAST(NULL AS varchar(60)) AS stockAfter,CONVERT(varchar(10),d.deliveryDate,23) AS movementDate,
    o.customerName AS sourceDestination,d.number AS reference,d.notes AS reason,u.username AS createdByUsername,u.name AS createdByName,
    CONVERT(varchar(33),d.createdAt,126)+'Z' AS createdAt,d.id AS deliveryReceiptId,d.number AS deliveryReceiptNumber,
    o.id AS orderId,o.number AS orderNumber,si.id AS invoiceId,si.number AS invoiceNumber,o.customerName,d.address,d.receivedBy
    FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId JOIN dbo.DeliveryReceiptItems i ON i.deliveryReceiptId=d.id
    JOIN dbo.SalesUserLogin u ON u.id=d.createdBy LEFT JOIN dbo.SalesInvoices si ON si.orderId=o.id
    WHERE i.productId=@productId ORDER BY movementDate DESC,createdAt DESC,id DESC`);
  res.json({ product: productResult.recordset[0], records: result.recordset });
});

router.post('/products/:id/stock-movements', async (req, res) => {
  const user = res.locals.user;
  if (user?.system !== 'sales' || !user.isActive || !['admin', 'saleshead', 'sales'].includes(user.role)) { const error = new Error('Sign in to Sales to record stock transactions.'); error.status = 403; throw error; }
  if (!req.is('application/json')) { const error = new Error('Send this request as JSON.'); error.status = 415; throw error; }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') { const error = new Error('Send a valid JSON object.'); error.status = 400; throw error; }
  const productId = Number(req.params.id);
  if (!Number.isSafeInteger(productId) || productId <= 0 || productId > 2147483647) { const error = new Error('Select a valid product.'); error.status = 400; throw error; }
  const input = req.body;
  const requestKey = typeof input.requestKey === 'string' ? input.requestKey.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{32}$/.test(requestKey)) { const error = new Error('A valid stock transaction request key is required.'); error.status = 400; throw error; }
  const direction = input.direction;
  if (!['in', 'out'].includes(direction)) { const error = new Error('Choose Stock in or Stock out.'); error.status = 400; throw error; }
  const quantityInput = typeof input.quantity === 'string' ? input.quantity.trim() : '';
  if (!/^\d+(?:\.\d{1,3})?$/.test(quantityInput)) { const error = new Error('Enter a positive quantity with up to 3 decimal places.'); error.status = 400; throw error; }
  const [quantityWhole, quantityFraction = ''] = quantityInput.split('.');
  const quantityUnits = BigInt(quantityWhole) * 1000n + BigInt(quantityFraction.padEnd(3, '0'));
  if (quantityUnits <= 0n || quantityUnits > 999999999999999999n) { const error = new Error('Quantity must be greater than zero and cannot exceed 999999999999999.999.'); error.status = 400; throw error; }
  const quantity = `${quantityUnits / 1000n}.${(quantityUnits % 1000n).toString().padStart(3, '0')}`;
  const movementDate = typeof input.movementDate === 'string' ? input.movementDate.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate) || movementDate.slice(0, 4) === '0000' || !Number.isFinite(new Date(movementDate + 'T00:00:00Z').getTime()) || new Date(movementDate + 'T00:00:00Z').toISOString().slice(0, 10) !== movementDate) { const error = new Error('Enter a valid movement date.'); error.status = 400; throw error; }
  const sourceDestination = typeof input.sourceDestination === 'string' ? input.sourceDestination.trim() : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  const reference = typeof input.reference === 'string' ? input.reference.trim() || null : null;
  if (!sourceDestination || !reason) { const error = new Error('Enter the stock source or destination and the reason.'); error.status = 400; throw error; }
  const saved = await transaction(async tx => {
    const previous = await request(tx).input('requestKey', sql.VarChar(sql.MAX), requestKey).query(`SELECT id,productId,direction,CONVERT(varchar(60),quantity) AS quantity,
      CONVERT(varchar(10),movementDate,23) AS movementDate,sourceDestination,reason,reference,createdById
      FROM dbo.ProductStockMovements WITH (UPDLOCK,HOLDLOCK) WHERE requestKey=CAST(@requestKey AS varchar(32))`);
    const actorResult = await request(tx).input('createdById', sql.Int, user.id).query('SELECT id,username,name,role,isActive FROM dbo.SalesUserLogin WITH (UPDLOCK,HOLDLOCK) WHERE id=@createdById');
    const actor = actorResult.recordset[0];
    if (!actor?.isActive || !['admin', 'saleshead', 'sales'].includes(actor.role)) { const error = new Error('Your Sales account is inactive or no longer has access.'); error.status = 403; throw error; }
    if (previous.recordset.length) {
      const current = previous.recordset[0];
      if (current.productId !== productId || current.direction !== direction || current.quantity !== quantity || current.movementDate !== movementDate || current.sourceDestination !== sourceDestination || current.reason !== reason || current.reference !== reference || current.createdById !== actor.id) { const error = new Error('This request key is already used by a different stock transaction.'); error.status = 409; throw error; }
      return { id: current.id, replayed: true };
    }
    const productResult = await request(tx).input('productId', sql.Int, productId).query('SELECT id,sku,name,description,unit,CONVERT(varchar(60),stock) AS stock,isActive FROM dbo.Products WITH (UPDLOCK,HOLDLOCK) WHERE id=@productId');
    const product = productResult.recordset[0];
    if (!product) { const error = new Error('The product could not be found.'); error.status = 404; throw error; }
    if (!product.isActive) { const error = new Error('Stock transactions require an active product.'); error.status = 409; throw error; }
    const unit = typeof product.unit === 'string' ? product.unit.trim() : '';
    if (!unit) { const error = new Error('Set the product UOP before recording stock transactions.'); error.status = 409; throw error; }
    const stockInput = typeof product.stock === 'string' ? product.stock.trim() : '';
    if (!/^\d+(?:\.\d{1,3})?$/.test(stockInput)) { const error = new Error('Stock on hand is not set or is invalid. Review the product before recording a stock transaction.'); error.status = 409; throw error; }
    const [stockWhole, stockFraction = ''] = stockInput.split('.');
    const stockUnits = BigInt(stockWhole) * 1000n + BigInt(stockFraction.padEnd(3, '0'));
    const nextUnits = direction === 'in' ? stockUnits + quantityUnits : stockUnits - quantityUnits;
    if (nextUnits < 0n) { const error = new Error('Insufficient finished-product stock for this stock out.'); error.status = 409; throw error; }
    if (stockUnits > 999999999999999999n || nextUnits > 999999999999999999n) { const error = new Error('This stock transaction exceeds the product stock limit.'); error.status = 409; throw error; }
    const stockBefore = `${stockUnits / 1000n}.${(stockUnits % 1000n).toString().padStart(3, '0')}`;
    const stockAfter = `${nextUnits / 1000n}.${(nextUnits % 1000n).toString().padStart(3, '0')}`;
    await request(tx).input('productId', sql.Int, productId).input('stockAfter', sql.VarChar(sql.MAX), stockAfter).query('UPDATE dbo.Products SET stock=CAST(@stockAfter AS DECIMAL(18,3)),updatedAt=SYSUTCDATETIME() WHERE id=@productId');
    const result = await request(tx).input('requestKey', sql.VarChar(sql.MAX), requestKey).input('productId', sql.Int, productId).input('direction', sql.NVarChar(sql.MAX), direction)
      .input('quantity', sql.VarChar(sql.MAX), quantity).input('unit', sql.NVarChar(sql.MAX), unit).input('stockBefore', sql.VarChar(sql.MAX), stockBefore).input('stockAfter', sql.VarChar(sql.MAX), stockAfter)
      .input('movementDate', sql.VarChar(sql.MAX), movementDate).input('sourceDestination', sql.NVarChar(sql.MAX), sourceDestination).input('reason', sql.NVarChar(sql.MAX), reason)
      .input('reference', sql.NVarChar(sql.MAX), reference).input('createdById', sql.Int, actor.id).query(`INSERT INTO dbo.ProductStockMovements
      (requestKey,productId,direction,quantity,unit,stockBefore,stockAfter,movementDate,sourceDestination,reason,reference,createdById,createdAt)
      OUTPUT INSERTED.id VALUES(@requestKey,@productId,@direction,@quantity,@unit,@stockBefore,@stockAfter,@movementDate,@sourceDestination,@reason,@reference,@createdById,SYSUTCDATETIME())`);
    await request(tx).input('userId', sql.Int, actor.id).input('userName', sql.NVarChar(sql.MAX), actor.name).input('system', sql.NVarChar(sql.MAX), 'sales').input('module', sql.NVarChar(sql.MAX), 'inventory').input('action', sql.NVarChar(sql.MAX), 'manual-' + direction).input('recordId', sql.NVarChar(sql.MAX), String(result.recordset[0].id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return { id: result.recordset[0].id, replayed: false };
  });
  const productResult = await request().input('productId', sql.Int, productId).query('SELECT id,sku,name,description,unit,CONVERT(varchar(60),stock) AS stock,isActive FROM dbo.Products WHERE id=@productId');
  const result = await request().input('movementId', sql.Int, saved.id).query(`SELECT 'manual:' + CONVERT(varchar(20),m.id) AS id,m.id AS movementId,
    CASE WHEN m.direction='in' THEN 'manual-in' ELSE 'manual-out' END AS type,m.direction,
    CONVERT(varchar(60),m.quantity) AS quantity,m.unit,CONVERT(varchar(60),m.stockBefore) AS stockBefore,CONVERT(varchar(60),m.stockAfter) AS stockAfter,
    CONVERT(varchar(10),m.movementDate,23) AS movementDate,m.sourceDestination,m.reference,m.reason,u.username AS createdByUsername,u.name AS createdByName,
    CONVERT(varchar(33),m.createdAt,126)+'Z' AS createdAt,CAST(NULL AS int) AS deliveryReceiptId,CAST(NULL AS nvarchar(max)) AS deliveryReceiptNumber,
    CAST(NULL AS int) AS orderId,CAST(NULL AS nvarchar(max)) AS orderNumber,CAST(NULL AS int) AS invoiceId,CAST(NULL AS nvarchar(max)) AS invoiceNumber,
    CAST(NULL AS nvarchar(max)) AS customerName,CAST(NULL AS nvarchar(max)) AS address,CAST(NULL AS nvarchar(max)) AS receivedBy
    FROM dbo.ProductStockMovements m JOIN dbo.SalesUserLogin u ON u.id=m.createdById WHERE m.id=@movementId`);
  res.status(saved.replayed ? 200 : 201).json({ record: result.recordset[0], product: productResult.recordset[0], replayed: saved.replayed });
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
      if (!Array.isArray(input.customerApprovals) || input.customerApprovals.length > 100) {
        const error = new Error('The submitted collection exceeds the supported size.');
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
      if (!Array.isArray(input.customerApprovals) || input.customerApprovals.length > 100) {
        const error = new Error('The submitted collection exceeds the supported size.');
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
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy ORDER BY o.id DESC`);
  const itemResult = await request().query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
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
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
  if (!recordResult.recordset.length) { const error = new Error('Sales order could not be found.'); error.status = 404; throw error; }
  const recordItems = await request().input('id', sql.Int, id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
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
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
      if (!currentResult.recordset.length) { const error = new Error('Sales order could not be found.'); error.status = 404; throw error; }
      const currentItems = await request(tx).input('id', sql.Int, id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
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
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
  if (!recordResult.recordset.length) { const error = new Error('Sales order could not be found.'); error.status = 404; throw error; }
  const recordItems = await request().input('id', sql.Int, savedId).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
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
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
      if (!currentResult.recordset.length) { const error = new Error('Sales order could not be found.'); error.status = 404; throw error; }
      const currentItems = await request(tx).input('id', sql.Int, id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
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
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
  if (!recordResult.recordset.length) { const error = new Error('Sales order could not be found.'); error.status = 404; throw error; }
  const recordItems = await request().input('id', sql.Int, savedId).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
  res.status(200).json({ record: { ...recordResult.recordset[0], items: recordItems.recordset } });
});
router.patch('/sales-orders/:id/quantities', async (req, res) => {
  const user = res.locals.user;
  if (user?.system !== 'sales' || !user.isActive || !['admin', 'saleshead', 'sales'].includes(user.role)) { const error = new Error('Sign in to Sales to update order quantities.'); error.status = 403; throw error; }
  if (!req.is('application/json')) { const error = new Error('Send this request as JSON.'); error.status = 415; throw error; }
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') { const error = new Error('Send a valid JSON object.'); error.status = 400; throw error; }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) { const error = new Error('Select a valid sales order.'); error.status = 400; throw error; }
  const input = req.body;
  if (Object.keys(input).some(key => key !== 'items') || !Array.isArray(input.items) || !input.items.length || input.items.length > 100) { const error = new Error('Only existing order item quantities can be changed after invoicing.'); error.status = 400; throw error; }
  const requested = input.items.map(item => {
    if (!item || Array.isArray(item) || typeof item !== 'object' || Object.keys(item).some(key => !['id', 'quantity'].includes(key))) { const error = new Error('Only item id and quantity can be changed after invoicing.'); error.status = 400; throw error; }
    const itemId = Number(item.id);
    if (!Number.isSafeInteger(itemId) || itemId <= 0 || itemId > 2147483647 || typeof item.quantity !== 'string' || !/^\d+(?:\.\d{1,3})?$/.test(item.quantity.trim())) { const error = new Error('Enter a valid existing item and quantity with up to 3 decimal places.'); error.status = 400; throw error; }
    const [whole, fraction = ''] = item.quantity.trim().split('.');
    const units = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
    if (units <= 0n || units > 1000000000n) { const error = new Error('Order quantities must be greater than zero and at most 1,000,000.'); error.status = 400; throw error; }
    return { id: itemId, quantity: `${units / 1000n}.${(units % 1000n).toString().padStart(3, '0')}`, units };
  });
  if (new Set(requested.map(item => item.id)).size !== requested.length) { const error = new Error('Each existing order item must appear exactly once.'); error.status = 400; throw error; }
  await transaction(async tx => {
    const result = await request(tx).input('id', sql.Int, id).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
    const order = result.recordset[0];
    if (!order) { const error = new Error('Sales order could not be found.'); error.status = 404; throw error; }
    if (!order.invoiced) { const error = new Error('Use the regular sales order form until an invoice exists.'); error.status = 409; throw error; }
    const lineResult = await request(tx).input('id', sql.Int, id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi WITH (UPDLOCK,HOLDLOCK)
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
    const currentItems = lineResult.recordset;
    if (requested.length !== currentItems.length || currentItems.some(item => !requested.some(row => row.id === item.id))) { const error = new Error('Existing order items cannot be added, removed or replaced after invoicing.'); error.status = 409; throw error; }
    const items = currentItems.map(item => {
      const requestedItem = requested.find(row => row.id === item.id);
      for (const field of ['invoicedQuantity', 'deliveredQuantity']) {
        const value = String(item[field] ?? '0').trim();
        if (!/^\d+(?:\.\d{1,3})?$/.test(value)) { const error = new Error('Recorded invoice or delivery quantities are invalid.'); error.status = 409; throw error; }
        const [whole, fraction = ''] = value.split('.');
        const recorded = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
        if (requestedItem.units < recorded) { const error = new Error('Quantity for ' + (item.sku || item.productName) + ' cannot be lower than its already invoiced or delivered quantity.'); error.status = 409; throw error; }
      }
      const parsed = {};
      for (const [key, source] of [['unitPrice', item.unitPrice], ['discountRate', item.discountRate ?? '0']]) {
        const value = String(source ?? '').trim();
        if (!/^\d+(?:\.\d+)?$/.test(value)) { const error = new Error('The saved order pricing is invalid.'); error.status = 409; throw error; }
        const [whole, rawFraction = ''] = value.split('.');
        const fraction = rawFraction.replace(/0+$/, '');
        if (fraction.length > 6) { const error = new Error('The saved order pricing precision is invalid.'); error.status = 409; throw error; }
        parsed[key] = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
      }
      if (parsed.unitPrice > 100000000000000n || parsed.discountRate > 100000000n) { const error = new Error('The saved order pricing exceeds its supported range.'); error.status = 409; throw error; }
      return { ...item, quantity: requestedItem.quantity, quantityThousandths: requestedItem.units, priceMillionths: parsed.unitPrice, discountMillionths: parsed.discountRate };
    });
    const pricing = {};
    for (const [key, source] of [['rate', order.rate ?? '1'], ['vatRate', order.vatRate ?? '0'], ['discount', order.discount ?? '0']]) {
      const value = String(source).trim();
      if (!/^\d+(?:\.\d+)?$/.test(value)) { const error = new Error('The saved order pricing is invalid.'); error.status = 409; throw error; }
      const [whole, rawFraction = ''] = value.split('.');
      const fraction = rawFraction.replace(/0+$/, '');
      if (fraction.length > 6) { const error = new Error('The saved order pricing precision is invalid.'); error.status = 409; throw error; }
      pricing[key] = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0') || '0');
    }
    const rateMillionths = pricing.rate;
    const vatMillionths = pricing.vatRate;
    const enteredDiscount = pricing.discount;
    if (rateMillionths <= 0n || rateMillionths > 1000000000000n || vatMillionths > 100000000n || order.discountType === 'percent' && enteredDiscount > 100000000n || order.discountType != null && !['percent', 'amount'].includes(order.discountType)) { const error = new Error('The saved order pricing is invalid.'); error.status = 409; throw error; }
    order.decimalInTotalPrice = order.decimalInTotalPrice ?? 2;
    if (!Number.isInteger(order.decimalInTotalPrice) || order.decimalInTotalPrice < 0 || order.decimalInTotalPrice > 6) { const error = new Error('The saved order precision is invalid.'); error.status = 409; throw error; }
    const places = order.decimalInTotalPrice;
    const moneyScale = 10n ** BigInt(places);
    const moneyDivisor = 10n ** BigInt(9 - places);
    const percent = 100000000n;
    const calculated = items.map(item => {
      const snapshot = item;
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
    const totalsRequest = request(tx).input('id', sql.Int, id);
    for (const key of ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'total']) totalsRequest.input(key, sql.VarChar(sql.MAX), order[key]);
    await totalsRequest.query(`UPDATE dbo.SalesOrders SET grossAmount=@grossAmount,lineDiscountAmount=@lineDiscountAmount,headerDiscountAmount=@headerDiscountAmount,
      discountAmount=@discountAmount,netAmount=@netAmount,vatAmount=@vatAmount,amount=@amount,total=@total,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    for (const item of savedItems) {
      const req = request(tx).input('id', sql.Int, item.id).input('orderId', sql.Int, id).input('quantity', sql.VarChar(sql.MAX), item.quantity);
      for (const key of ['grossAmount', 'lineDiscountAmount', 'headerDiscountAmount', 'discountAmount', 'netAmount', 'vatAmount', 'amount', 'lineTotal']) req.input(key, sql.VarChar(sql.MAX), item[key]);
      await req.query(`UPDATE dbo.SalesOrderItems SET quantity=CAST(@quantity AS DECIMAL(18,3)),grossAmount=@grossAmount,lineDiscountAmount=@lineDiscountAmount,
        headerDiscountAmount=@headerDiscountAmount,discountAmount=@discountAmount,netAmount=@netAmount,vatAmount=@vatAmount,amount=@amount,lineTotal=@lineTotal WHERE id=@id AND orderId=@orderId`);
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), 'sales').input('module', sql.NVarChar(sql.MAX), 'sales-orders').input('action', sql.NVarChar(sql.MAX), 'quantity-update').input('recordId', sql.NVarChar(sql.MAX), String(id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
  });
  const result = await request().input('id', sql.Int, id).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o LEFT JOIN dbo.SalesUserLogin creator ON creator.id=o.createdBy WHERE o.id=@id`);
  const lines = await request().input('id', sql.Int, id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
    CONVERT(varchar(60),COALESCE(shipped.deliveredQuantity,0)) AS deliveredQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(billed.invoicedQuantity,0)) AS remainingInvoiceQuantity,
    CONVERT(varchar(60),oi.quantity-COALESCE(shipped.deliveredQuantity,0)) AS remainingDeliveryQuantity FROM dbo.SalesOrderItems oi
    OUTER APPLY (SELECT CAST(SUM(s.quantity) AS DECIMAL(18,3)) AS invoicedQuantity FROM dbo.SalesInvoiceItems s WHERE s.orderItemId=oi.id) billed
    OUTER APPLY (SELECT CAST(SUM(d.quantity) AS DECIMAL(18,3)) AS deliveredQuantity FROM dbo.DeliveryReceiptItems d WHERE d.orderItemId=oi.id) shipped WHERE orderId=@id ORDER BY id`);
  res.json({ record: { ...result.recordset[0], items: lines.recordset } });
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
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
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
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
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
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,invoiceCreator.name AS preparedByName,o.preparedByName AS sourcePreparedByName,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId LEFT JOIN dbo.SalesUserLogin invoiceCreator ON invoiceCreator.id=i.createdBy ORDER BY i.id DESC`);
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
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,invoiceCreator.name AS preparedByName,o.preparedByName AS sourcePreparedByName,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId LEFT JOIN dbo.SalesUserLogin invoiceCreator ON invoiceCreator.id=i.createdBy WHERE i.id=@id`);
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
router.get('/delivery-receipts', async (req, res) => {
  const result = await request().query(`SELECT d.id,d.number,d.orderId,o.number AS orderNumber,o.customerId,o.customerName,CONVERT(varchar(60),d.amount) AS total,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,o.preparedByName,
  CONVERT(varchar(60),d.grossAmount) AS grossAmount,CONVERT(varchar(60),d.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),d.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),d.discountAmount) AS discountAmount,
  CONVERT(varchar(60),d.netAmount) AS netAmount,CONVERT(varchar(60),d.vatAmount) AS vatAmount,CONVERT(varchar(60),d.amount) AS amount,
  CONVERT(varchar(10),d.deliveryDate,23) AS deliveryDate,d.receivedBy,d.address,d.notes FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId ORDER BY d.id DESC`);
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
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT d.id,d.number,d.orderId,o.number AS orderNumber,o.customerId,o.customerName,CONVERT(varchar(60),d.amount) AS total,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,o.preparedByName,
  CONVERT(varchar(60),d.grossAmount) AS grossAmount,CONVERT(varchar(60),d.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),d.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),d.discountAmount) AS discountAmount,
  CONVERT(varchar(60),d.netAmount) AS netAmount,CONVERT(varchar(60),d.vatAmount) AS vatAmount,CONVERT(varchar(60),d.amount) AS amount,
  CONVERT(varchar(10),d.deliveryDate,23) AS deliveryDate,d.receivedBy,d.address,d.notes FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId WHERE d.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Delivery receipt could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).input('deliveryReceiptId', sql.Int, recordResult.recordset[0].id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderItemId,@orderId AS orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount FROM dbo.DeliveryReceiptItems WHERE deliveryReceiptId=@deliveryReceiptId ORDER BY id`);
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.json({
    record
  });
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
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
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
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
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
    const result = await request(tx).input('orderId', sql.Int, orderId).input('invoiceDate', sql.VarChar(sql.MAX), invoiceDate).input('dueDate', sql.VarChar(sql.MAX), dueDate).input('notes', sql.NVarChar(sql.MAX), notes).input('total', sql.VarChar(sql.MAX), String(order.total)).input('createdBy', sql.Int, user.id).input('grossAmount', sql.VarChar(sql.MAX), order.grossAmount == null ? null : String(order.grossAmount)).input('lineDiscountAmount', sql.VarChar(sql.MAX), order.lineDiscountAmount == null ? null : String(order.lineDiscountAmount)).input('headerDiscountAmount', sql.VarChar(sql.MAX), order.headerDiscountAmount == null ? null : String(order.headerDiscountAmount)).input('discountAmount', sql.VarChar(sql.MAX), order.discountAmount == null ? null : String(order.discountAmount)).input('netAmount', sql.VarChar(sql.MAX), order.netAmount == null ? null : String(order.netAmount)).input('vatAmount', sql.VarChar(sql.MAX), order.vatAmount == null ? null : String(order.vatAmount)).input('amount', sql.VarChar(sql.MAX), String(order.total)).query(`INSERT INTO dbo.SalesInvoices (orderId,invoiceDate,dueDate,notes,total,createdBy,paidAmount,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,createdAt,updatedAt) OUTPUT INSERTED.id
        VALUES (@orderId,@invoiceDate,@dueDate,@notes,@total,@createdBy,0,@grossAmount,@lineDiscountAmount,@headerDiscountAmount,@discountAmount,@netAmount,@vatAmount,@amount,SYSUTCDATETIME(),SYSUTCDATETIME())`);
    const number = `SI-${String(result.recordset[0].id).padStart(8, '0')}`;
    await request(tx).input('id', sql.Int, result.recordset[0].id).input('number', sql.NVarChar(sql.MAX), number).query('UPDATE dbo.SalesInvoices SET number=@number WHERE id=@id');
    await request(tx).input('invoiceId', sql.Int, result.recordset[0].id).input('orderId', sql.Int, orderId).query(`INSERT INTO dbo.SalesInvoiceItems
      (invoiceId,orderItemId,productId,productName,description,sku,unit,refNumber,quotationNumber,currency,quantity,unitPrice,convertedUnitPrice,discountRate,deliveryDate,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,lineTotal)
      SELECT @invoiceId,id,productId,productName,description,sku,unit,refNumber,quotationNumber,currency,quantity,unitPrice,convertedUnitPrice,discountRate,deliveryDate,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@orderId`);
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'sales-invoices').input('action', sql.NVarChar(sql.MAX), 'create').input('recordId', sql.NVarChar(sql.MAX), String(result.recordset[0].id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return result.recordset[0].id;
  });
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT i.id,i.number,i.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,invoiceCreator.name AS preparedByName,o.preparedByName AS sourcePreparedByName,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId LEFT JOIN dbo.SalesUserLogin invoiceCreator ON invoiceCreator.id=i.createdBy WHERE i.id=@id`);
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
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,invoiceCreator.name AS preparedByName,o.preparedByName AS sourcePreparedByName,
  CONVERT(varchar(60),i.grossAmount) AS grossAmount,CONVERT(varchar(60),i.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),i.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),i.discountAmount) AS discountAmount,
  CONVERT(varchar(60),i.netAmount) AS netAmount,CONVERT(varchar(60),i.vatAmount) AS vatAmount,CONVERT(varchar(60),i.amount) AS amount,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,CONVERT(varchar(60),i.total) AS total,CONVERT(varchar(60),i.paidAmount) AS paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId LEFT JOIN dbo.SalesUserLogin invoiceCreator ON invoiceCreator.id=i.createdBy WHERE i.id=@id`);
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
  const deliveryDate = typeof input.deliveryDate === 'string' ? input.deliveryDate.trim() : '';
  const receivedBy = typeof input.receivedBy === 'string' ? input.receivedBy.trim() : '';
  const notes = typeof input.notes === 'string' ? input.notes.trim() || null : null;
  const address = typeof input.address === 'string' ? input.address.trim() : '';
  const id = await transaction(async tx => {
    const orderResult = await request(tx).input('id', sql.Int, orderId).query(`SELECT o.id,o.number,o.customerId,o.customerName,o.customerAddress,o.billToCustomerId,o.billToName,o.billToAddress,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.currency,o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,
  CONVERT(varchar(60),o.vatRate) AS vatRate,o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,
  CONVERT(varchar(60),o.grossAmount) AS grossAmount,CONVERT(varchar(60),o.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),o.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),o.discountAmount) AS discountAmount,
  CONVERT(varchar(60),o.netAmount) AS netAmount,CONVERT(varchar(60),o.vatAmount) AS vatAmount,CONVERT(varchar(60),o.amount) AS amount,
  CONVERT(varchar(60),o.total) AS total,o.notes,o.status,o.createdBy,COALESCE(o.preparedByName,creator.name) AS preparedByName,
  CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
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
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount,CONVERT(varchar(60),COALESCE(billed.invoicedQuantity,0)) AS invoicedQuantity,
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
      const error = new Error('Confirm the sales order before creating a delivery receipt.');
      error.status = 400;
      throw error;
    }
    if (order.delivered) {
      const error = new Error('This sales order already has a delivery receipt.');
      error.status = 409;
      throw error;
    }
    for (const item of [...order.items].sort((a, b) => a.productId - b.productId)) {
      const result = await request(tx).input('productId', sql.Int, item.productId).input('quantity', sql.Decimal(18, 3), item.quantity).query('UPDATE dbo.Products SET stock=stock-@quantity,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@productId AND stock>=@quantity');
      if (!result.recordset.length) {
        const error = new Error(`Insufficient finished-product stock for ${item.productName}.`);
        error.status = 409;
        throw error;
      }
    }
    const result = await request(tx).input('orderId', sql.Int, orderId).input('deliveryDate', sql.VarChar(sql.MAX), deliveryDate).input('receivedBy', sql.NVarChar(sql.MAX), receivedBy).input('address', sql.NVarChar(sql.MAX), address || order.customerAddress).input('notes', sql.NVarChar(sql.MAX), notes).input('createdBy', sql.Int, user.id).input('grossAmount', sql.VarChar(sql.MAX), order.grossAmount == null ? null : String(order.grossAmount)).input('lineDiscountAmount', sql.VarChar(sql.MAX), order.lineDiscountAmount == null ? null : String(order.lineDiscountAmount)).input('headerDiscountAmount', sql.VarChar(sql.MAX), order.headerDiscountAmount == null ? null : String(order.headerDiscountAmount)).input('discountAmount', sql.VarChar(sql.MAX), order.discountAmount == null ? null : String(order.discountAmount)).input('netAmount', sql.VarChar(sql.MAX), order.netAmount == null ? null : String(order.netAmount)).input('vatAmount', sql.VarChar(sql.MAX), order.vatAmount == null ? null : String(order.vatAmount)).input('amount', sql.VarChar(sql.MAX), String(order.total)).query(`INSERT INTO dbo.DeliveryReceipts (orderId,deliveryDate,receivedBy,address,notes,createdBy,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,createdAt) OUTPUT INSERTED.id
        VALUES (@orderId,@deliveryDate,@receivedBy,@address,@notes,@createdBy,@grossAmount,@lineDiscountAmount,@headerDiscountAmount,@discountAmount,@netAmount,@vatAmount,@amount,SYSUTCDATETIME())`);
    const number = `DR-${String(result.recordset[0].id).padStart(8, '0')}`;
    await request(tx).input('id', sql.Int, result.recordset[0].id).input('number', sql.NVarChar(sql.MAX), number).query('UPDATE dbo.DeliveryReceipts SET number=@number WHERE id=@id');
    await request(tx).input('deliveryReceiptId', sql.Int, result.recordset[0].id).input('orderId', sql.Int, orderId).query(`INSERT INTO dbo.DeliveryReceiptItems
      (deliveryReceiptId,orderItemId,productId,productName,description,sku,unit,refNumber,quotationNumber,currency,quantity,unitPrice,convertedUnitPrice,discountRate,deliveryDate,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,lineTotal)
      SELECT @deliveryReceiptId,id,productId,productName,description,sku,unit,refNumber,quotationNumber,currency,quantity,unitPrice,convertedUnitPrice,discountRate,deliveryDate,grossAmount,lineDiscountAmount,headerDiscountAmount,discountAmount,netAmount,vatAmount,amount,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@orderId`);
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'delivery-receipts').input('action', sql.NVarChar(sql.MAX), 'create').input('recordId', sql.NVarChar(sql.MAX), String(result.recordset[0].id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return result.recordset[0].id;
  });
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT d.id,d.number,d.orderId,o.number AS orderNumber,o.customerId,o.customerName,CONVERT(varchar(60),d.amount) AS total,o.currency,o.billToCustomerId,o.billToName,o.billToAddress,CONVERT(varchar(10),o.expectedDeliveryDate,23) AS expectedDeliveryDate,
  o.sourceCurrency,CONVERT(varchar(60),o.rate) AS rate,o.paymentTerm,o.shipment,o.countryOfOrigin,o.vatCode,CONVERT(varchar(60),o.vatRate) AS vatRate,
  o.vatInclusive,o.discountType,CONVERT(varchar(60),o.discount) AS discount,o.decimalInPrice,o.decimalInTotalPrice,o.preparedByName,
  CONVERT(varchar(60),d.grossAmount) AS grossAmount,CONVERT(varchar(60),d.lineDiscountAmount) AS lineDiscountAmount,
  CONVERT(varchar(60),d.headerDiscountAmount) AS headerDiscountAmount,CONVERT(varchar(60),d.discountAmount) AS discountAmount,
  CONVERT(varchar(60),d.netAmount) AS netAmount,CONVERT(varchar(60),d.vatAmount) AS vatAmount,CONVERT(varchar(60),d.amount) AS amount,
  CONVERT(varchar(10),d.deliveryDate,23) AS deliveryDate,d.receivedBy,d.address,d.notes FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId WHERE d.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Delivery receipt could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).input('deliveryReceiptId', sql.Int, recordResult.recordset[0].id).query(`SELECT productId,productName,sku,unit,CONVERT(varchar(60),quantity) AS quantity,CONVERT(varchar(60),unitPrice) AS unitPrice,CONVERT(varchar(60),lineTotal) AS lineTotal,
  id,orderItemId,@orderId AS orderId,refNumber,quotationNumber,description,description AS productDescription,currency,currency AS sourceCurrency,
  CONVERT(varchar(60),convertedUnitPrice) AS convertedUnitPrice,CONVERT(varchar(60),discountRate) AS discountRate,
  CONVERT(varchar(10),deliveryDate,23) AS deliveryDate,CONVERT(varchar(60),grossAmount) AS grossAmount,
  CONVERT(varchar(60),lineDiscountAmount) AS lineDiscountAmount,CONVERT(varchar(60),headerDiscountAmount) AS headerDiscountAmount,
  CONVERT(varchar(60),discountAmount) AS discountAmount,CONVERT(varchar(60),netAmount) AS netAmount,
  CONVERT(varchar(60),vatAmount) AS vatAmount,CONVERT(varchar(60),COALESCE(amount,lineTotal)) AS amount FROM dbo.DeliveryReceiptItems WHERE deliveryReceiptId=@deliveryReceiptId ORDER BY id`);
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.status(201).json({
    record
  });
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
for (const [path, methods] of [['/customer-options', ['GET']], ['/sales-order-options', ['GET']], ['/product-options', ['GET']], ['/customers', ['GET', 'POST']], ['/customers/:id', ['GET', 'PUT', 'DELETE']], ['/products', ['GET', 'POST']], ['/products/:id', ['GET', 'PUT', 'DELETE']], ['/products/:id/stock-movements', ['GET', 'POST']], ['/sales-orders', ['GET', 'POST']], ['/sales-orders/:id', ['GET', 'PUT', 'DELETE']], ['/sales-orders/:id/quantities', ['PATCH']], ['/sales-invoices', ['GET', 'POST']], ['/sales-invoices/:id', ['GET']], ['/sales-invoices/:id/payment', ['PATCH']], ['/delivery-receipts', ['GET', 'POST']], ['/delivery-receipts/:id', ['GET']], ['/shipping-invoices', ['GET', 'POST']], ['/shipping-invoices/:id', ['GET']]]) router.all(path, (req, res) => res.set('Allow', methods.join(', ')).status(405).json({
  message: 'This HTTP method is not supported.'
}));
module.exports = router;
