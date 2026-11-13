const express = require('express');
const router = express.Router();
const {
  request,
  sql,
  transaction
} = require('../db');
const defaults = {
  code: '', name: '', shortName: '', businessStyle: '', address: '', salesName: '', drName: '', vatCode: '',
  contactPerson: null, cpnumber: null, email: null, salesInCharge: null, tin: null, faxNo: null,
  countryOfOrigin: null, country: null, category: null, remarks: null, paymentTerm: null, taxCode: null,
  isActive: true, decimalInPrice: 2, decimalInTotalPrice: 2,
  salesAddressType: null, drAddressType: null, discount: null, discountType: null,
  includePoInInvoice: null, vatInclusive: null, deliveryAddresses: [], salesInChargeId: null
};
const PRODUCT_QUANTITIES = ['quantityPerSecondaryUnit', 'moq', 'spq', 'unitCost', 'divisor', 'thickness', 'weight'];
router.use((req, res, next) => {
  if (res.locals.user?.system !== 'sales') {
    const error = new Error('Sign in to Sales to continue.');
    error.status = 401;
    throw error;
  }
  next();
});

router.get('/customers', async (req, res) => {
  const result = await request().query(`SELECT c.[id],c.[code],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId] FROM dbo.Customers c LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId ORDER BY c.id DESC`);
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
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT c.[id],c.[code],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId] FROM dbo.Customers c LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId WHERE c.id=@id`);
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
      const currentResult = await request(tx).input('id', sql.Int, id).query(`SELECT c.[id],c.[code],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId],c.salesInCharge AS _salesInChargeSnapshot FROM dbo.Customers c WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId WHERE c.id=@id`);
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
    for (const key of ["code", "name", "contactPerson", "cpnumber", "email", "address", "shortName", "businessStyle", "salesInCharge", "tin", "faxNo", "countryOfOrigin", "country", "category", "remarks", "salesName", "drName", "paymentTerm", "vatCode", "taxCode"]) if (Object.hasOwn(input, key) && input[key] !== undefined) customer[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
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
    if (current && !customer.code) customer.code = current.code;
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
    if (!customer.code) {
      // Hold the customer table while reading its next identity, so generated codes
      // remain tied to Company Id even when multiple customers are saved together.
      await request(tx).query('SELECT COUNT_BIG(*) AS total FROM dbo.Customers WITH (TABLOCKX,HOLDLOCK)');
      const result = await request(tx).query(`SELECT COALESCE(CONVERT(bigint,last_value)+CONVERT(bigint,increment_value),CONVERT(bigint,seed_value)) AS nextId
    FROM sys.identity_columns WHERE object_id=OBJECT_ID(N'dbo.Customers') AND name=N'id'`);
      const id = Number(result.recordset[0]?.nextId);
      if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
        const error = new Error('A customer identifier could not be allocated.');
        error.status = 409;
        throw error;
      }
      const base = `C-${String(id).padStart(8, '0')}`;
      let code = base;
      let suffix = 0;
      while ((await request(tx).input('code', sql.NVarChar(sql.MAX), code).query('SELECT id FROM dbo.Customers WHERE code=@code')).recordset.length) {
        code = `${base}-${++suffix}`;
      }
      customer.code = code;
    }
    const req = request(tx);
    for (const fieldName of ["code", "name", "contactPerson", "cpnumber", "email", "address", "shortName", "businessStyle", "salesInCharge", "tin", "faxNo", "countryOfOrigin", "country", "category", "remarks", "salesName", "drName", "paymentTerm", "vatCode", "taxCode"]) req.input(fieldName, sql.NVarChar(sql.MAX), customer[fieldName]);
    for (const fieldName of ['isActive', 'includePoInInvoice', 'vatInclusive']) req.input(fieldName, sql.Bit, customer[fieldName]);
    for (const fieldName of ['decimalInPrice', 'decimalInTotalPrice']) req.input(fieldName, sql.Int, customer[fieldName]);
    for (const fieldName of ['salesAddressType', 'drAddressType', 'discountType']) req.input(fieldName, sql.NVarChar(sql.MAX), customer[fieldName]);
    req.input('discount', sql.Decimal(18, 6), customer.discount);
    req.input('salesInChargeId', sql.Int, customer.salesInChargeId);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Customers SET [code]=@code,[name]=@name,[contactPerson]=@contactPerson,[cpnumber]=@cpnumber,[email]=@email,[address]=@address,[shortName]=@shortName,[businessStyle]=@businessStyle,[salesInCharge]=@salesInCharge,[tin]=@tin,[faxNo]=@faxNo,[countryOfOrigin]=@countryOfOrigin,[country]=@country,[category]=@category,[remarks]=@remarks,[salesName]=@salesName,[drName]=@drName,[paymentTerm]=@paymentTerm,[vatCode]=@vatCode,[taxCode]=@taxCode,[isActive]=@isActive,[decimalInPrice]=@decimalInPrice,[decimalInTotalPrice]=@decimalInTotalPrice,[salesAddressType]=@salesAddressType,[drAddressType]=@drAddressType,[discount]=@discount,[discountType]=@discountType,[includePoInInvoice]=@includePoInInvoice,[vatInclusive]=@vatInclusive,[salesInChargeId]=@salesInChargeId,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Customers ([code],[name],[contactPerson],[cpnumber],[email],[address],[shortName],[businessStyle],[salesInCharge],[tin],[faxNo],[countryOfOrigin],[country],[category],[remarks],[salesName],[drName],[paymentTerm],[vatCode],[taxCode],[isActive],[decimalInPrice],[decimalInTotalPrice],[salesAddressType],[drAddressType],[discount],[discountType],[includePoInInvoice],[vatInclusive],[salesInChargeId],createdAt,updatedAt) OUTPUT INSERTED.id VALUES (@code,@name,@contactPerson,@cpnumber,@email,@address,@shortName,@businessStyle,@salesInCharge,@tin,@faxNo,@countryOfOrigin,@country,@category,@remarks,@salesName,@drName,@paymentTerm,@vatCode,@taxCode,@isActive,@decimalInPrice,@decimalInTotalPrice,@salesAddressType,@drAddressType,@discount,@discountType,@includePoInInvoice,@vatInclusive,@salesInChargeId,SYSUTCDATETIME(),SYSUTCDATETIME())`);
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
  const recordResult = await request().input('id', sql.Int, savedId).query(`SELECT c.[id],c.[code],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId] FROM dbo.Customers c LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId WHERE c.id=@id`);
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
      const currentResult = await request(tx).input('id', sql.Int, id).query(`SELECT c.[id],c.[code],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId],c.salesInCharge AS _salesInChargeSnapshot FROM dbo.Customers c WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId WHERE c.id=@id`);
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
    for (const key of ["code", "name", "contactPerson", "cpnumber", "email", "address", "shortName", "businessStyle", "salesInCharge", "tin", "faxNo", "countryOfOrigin", "country", "category", "remarks", "salesName", "drName", "paymentTerm", "vatCode", "taxCode"]) if (Object.hasOwn(input, key) && input[key] !== undefined) customer[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
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
    if (current && !customer.code) customer.code = current.code;
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
    if (!customer.code) {
      // Hold the customer table while reading its next identity, so generated codes
      // remain tied to Company Id even when multiple customers are saved together.
      await request(tx).query('SELECT COUNT_BIG(*) AS total FROM dbo.Customers WITH (TABLOCKX,HOLDLOCK)');
      const result = await request(tx).query(`SELECT COALESCE(CONVERT(bigint,last_value)+CONVERT(bigint,increment_value),CONVERT(bigint,seed_value)) AS nextId
    FROM sys.identity_columns WHERE object_id=OBJECT_ID(N'dbo.Customers') AND name=N'id'`);
      const id = Number(result.recordset[0]?.nextId);
      if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
        const error = new Error('A customer identifier could not be allocated.');
        error.status = 409;
        throw error;
      }
      const base = `C-${String(id).padStart(8, '0')}`;
      let code = base;
      let suffix = 0;
      while ((await request(tx).input('code', sql.NVarChar(sql.MAX), code).query('SELECT id FROM dbo.Customers WHERE code=@code')).recordset.length) {
        code = `${base}-${++suffix}`;
      }
      customer.code = code;
    }
    const req = request(tx);
    for (const fieldName of ["code", "name", "contactPerson", "cpnumber", "email", "address", "shortName", "businessStyle", "salesInCharge", "tin", "faxNo", "countryOfOrigin", "country", "category", "remarks", "salesName", "drName", "paymentTerm", "vatCode", "taxCode"]) req.input(fieldName, sql.NVarChar(sql.MAX), customer[fieldName]);
    for (const fieldName of ['isActive', 'includePoInInvoice', 'vatInclusive']) req.input(fieldName, sql.Bit, customer[fieldName]);
    for (const fieldName of ['decimalInPrice', 'decimalInTotalPrice']) req.input(fieldName, sql.Int, customer[fieldName]);
    for (const fieldName of ['salesAddressType', 'drAddressType', 'discountType']) req.input(fieldName, sql.NVarChar(sql.MAX), customer[fieldName]);
    req.input('discount', sql.Decimal(18, 6), customer.discount);
    req.input('salesInChargeId', sql.Int, customer.salesInChargeId);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Customers SET [code]=@code,[name]=@name,[contactPerson]=@contactPerson,[cpnumber]=@cpnumber,[email]=@email,[address]=@address,[shortName]=@shortName,[businessStyle]=@businessStyle,[salesInCharge]=@salesInCharge,[tin]=@tin,[faxNo]=@faxNo,[countryOfOrigin]=@countryOfOrigin,[country]=@country,[category]=@category,[remarks]=@remarks,[salesName]=@salesName,[drName]=@drName,[paymentTerm]=@paymentTerm,[vatCode]=@vatCode,[taxCode]=@taxCode,[isActive]=@isActive,[decimalInPrice]=@decimalInPrice,[decimalInTotalPrice]=@decimalInTotalPrice,[salesAddressType]=@salesAddressType,[drAddressType]=@drAddressType,[discount]=@discount,[discountType]=@discountType,[includePoInInvoice]=@includePoInInvoice,[vatInclusive]=@vatInclusive,[salesInChargeId]=@salesInChargeId,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Customers ([code],[name],[contactPerson],[cpnumber],[email],[address],[shortName],[businessStyle],[salesInCharge],[tin],[faxNo],[countryOfOrigin],[country],[category],[remarks],[salesName],[drName],[paymentTerm],[vatCode],[taxCode],[isActive],[decimalInPrice],[decimalInTotalPrice],[salesAddressType],[drAddressType],[discount],[discountType],[includePoInInvoice],[vatInclusive],[salesInChargeId],createdAt,updatedAt) OUTPUT INSERTED.id VALUES (@code,@name,@contactPerson,@cpnumber,@email,@address,@shortName,@businessStyle,@salesInCharge,@tin,@faxNo,@countryOfOrigin,@country,@category,@remarks,@salesName,@drName,@paymentTerm,@vatCode,@taxCode,@isActive,@decimalInPrice,@decimalInTotalPrice,@salesAddressType,@drAddressType,@discount,@discountType,@includePoInInvoice,@vatInclusive,@salesInChargeId,SYSUTCDATETIME(),SYSUTCDATETIME())`);
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
  const recordResult = await request().input('id', sql.Int, savedId).query(`SELECT c.[id],c.[code],c.[name],c.[contactPerson],c.[cpnumber],c.[email],c.[address],c.[shortName],c.[businessStyle],COALESCE(u.name,c.salesInCharge) AS salesInCharge,c.[tin],c.[faxNo],c.[countryOfOrigin],c.[country],c.[category],c.[remarks],c.[salesName],c.[drName],c.[paymentTerm],c.[vatCode],c.[taxCode],c.[isActive],c.[decimalInPrice],c.[decimalInTotalPrice],c.[salesAddressType],c.[drAddressType],c.[discount],c.[discountType],c.[includePoInInvoice],c.[vatInclusive],c.[salesInChargeId] FROM dbo.Customers c LEFT JOIN dbo.SalesUserLogin u ON u.id=c.salesInChargeId WHERE c.id=@id`);
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

// Product master with customer approvals, inventory setup and linked supplies.
router.get('/products', async (req, res) => {
  const recordsQuery = request();
  const recordsResult = await recordsQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[planType],p.[color],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[thickness],p.[weight],CONVERT(varchar(60),p.price) AS price,p.[stock],p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId  ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses  ORDER BY productId,position;
SELECT productId,name FROM dbo.ProductOffices  ORDER BY productId,position;
SELECT productId,customerId,CONVERT(varchar(10),approvalDate,23) AS approvalDate,CONVERT(varchar(10),eolDate,23) AS eolDate,approvalRemarks,eolRemarks FROM dbo.ProductCustomerApprovals  ORDER BY productId,position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId  ORDER BY l.productId,l.position;`);
  const productsById = new Map(recordsResult.recordsets[0].map(productRow => [productRow.id, {
    ...productRow,
    processes: [],
    offices: [],
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
  } of recordsResult.recordsets[2]) productsById.get(linkedProductId)?.["offices"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordsResult.recordsets[3]) productsById.get(linkedProductId)?.["customerApprovals"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordsResult.recordsets[4]) productsById.get(linkedProductId)?.linkedSupplies.push(productRow);
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
  const recordResult = await recordQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[planType],p.[color],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[thickness],p.[weight],CONVERT(varchar(60),p.price) AS price,p.[stock],p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId WHERE p.id=@id ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses WHERE productId=@id ORDER BY productId,position;
SELECT productId,name FROM dbo.ProductOffices WHERE productId=@id ORDER BY productId,position;
SELECT productId,customerId,CONVERT(varchar(10),approvalDate,23) AS approvalDate,CONVERT(varchar(10),eolDate,23) AS eolDate,approvalRemarks,eolRemarks FROM dbo.ProductCustomerApprovals WHERE productId=@id ORDER BY productId,position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId WHERE l.productId=@id ORDER BY l.productId,l.position;`);
  const productsById = new Map(recordResult.recordsets[0].map(productRow => [productRow.id, {
    ...productRow,
    processes: [],
    offices: [],
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
  } of recordResult.recordsets[2]) productsById.get(linkedProductId)?.["offices"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[3]) productsById.get(linkedProductId)?.["customerApprovals"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[4]) productsById.get(linkedProductId)?.linkedSupplies.push(productRow);
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
    SELECT id,code,name FROM dbo.Customers WHERE isActive=1 ORDER BY name;
    SELECT DISTINCT name FROM dbo.ProductProcesses ORDER BY name;
    SELECT DISTINCT name FROM dbo.ProductOffices ORDER BY name;`);
  res.json({
    units: result.recordsets[0],
    currencies: result.recordsets[1],
    categories: result.recordsets[2],
    headers: result.recordsets[3],
    supplies: result.recordsets[4],
    customers: result.recordsets[5],
    processes: result.recordsets[6].map(row => row.name),
    offices: [...new Set([process.env.COMPANY_NAME || 'TLP COMPANY', ...result.recordsets[7].map(row => row.name)])]
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
      const currentResult = await currentQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[planType],p.[color],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[thickness],p.[weight],CONVERT(varchar(60),p.price) AS price,p.[stock],p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p WITH (UPDLOCK,HOLDLOCK)
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId WHERE p.id=@id ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses WHERE productId=@id ORDER BY productId,position;
SELECT productId,name FROM dbo.ProductOffices WHERE productId=@id ORDER BY productId,position;
SELECT productId,customerId,CONVERT(varchar(10),approvalDate,23) AS approvalDate,CONVERT(varchar(10),eolDate,23) AS eolDate,approvalRemarks,eolRemarks FROM dbo.ProductCustomerApprovals WHERE productId=@id ORDER BY productId,position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId WHERE l.productId=@id ORDER BY l.productId,l.position;`);
      const productsById2 = new Map(currentResult.recordsets[0].map(productRow => [productRow.id, {
        ...productRow,
        processes: [],
        offices: [],
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
      } of currentResult.recordsets[2]) productsById2.get(linkedProductId)?.["offices"].push(productRow);
      for (const {
        productId: linkedProductId,
        ...productRow
      } of currentResult.recordsets[3]) productsById2.get(linkedProductId)?.["customerApprovals"].push(productRow);
      for (const {
        productId: linkedProductId,
        ...productRow
      } of currentResult.recordsets[4]) productsById2.get(linkedProductId)?.linkedSupplies.push(productRow);
      const currentRows = [...productsById2.values()];
      if (!currentRows.length) {
        const error = new Error('The product could not be found.');
        error.status = 404;
        throw error;
      }
      current = currentRows[0];
    }
    const product = {
      ...Object.fromEntries(["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "planType", "color", "remarks", "tagColor"].map(key => [key, null])),
      ...Object.fromEntries(PRODUCT_QUANTITIES.map(key => [key, null])),
      revision: null,
      vatMode: null,
      productHeaderId: null,
      price: null,
      stock: 0,
      isActive: true,
      processes: [],
      offices: [],
      customerApprovals: [],
      linkedSupplies: [],
      inventorySetup: null,
      ...(current || {})
    };
    for (const key of ["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "planType", "color", "remarks", "tagColor"]) if (Object.hasOwn(input, key) && input[key] !== undefined) product[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
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
    for (const [key, limit] of [['processes', 100], ['offices', 50]]) {
      if (Object.hasOwn(input, key) && input[key] !== undefined) {
        if (!Array.isArray(input[key]) || input[key].length > limit) {
          const error = new Error('The submitted collection exceeds the supported size.');
          error.status = 400;
          throw error;
        }
        product[key] = input[key].map(row => {
          return {
            name: typeof row.name === 'string' ? row.name.trim() : ''
          };
        });
      }
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
        if (row.approvalDate && row.eolDate && new Date(row.eolDate).getTime() < new Date(row.approvalDate).getTime()) {
          const error = new Error('Product EOL date cannot be earlier than its approval date.');
          error.status = 400;
          throw error;
        }
        return {
          customerId: parsedCustomerId,
          approvalDate: row.approvalDate || null,
          eolDate: row.eolDate || null,
          approvalRemarks: typeof row.approvalRemarks === 'string' ? row.approvalRemarks.trim() || null : null,
          eolRemarks: typeof row.eolRemarks === 'string' ? row.eolRemarks.trim() || null : null
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
      const result = await request(scope).input('id', sql.Int, current.id).query('SELECT TOP(1) id FROM dbo.SalesOrderItems WHERE productId=@id');
      if (Number(current.stock) > 0 || result.recordset.length) {
        const error = new Error('UOP cannot change after finished-product stock or sales history exists.');
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
    for (const fieldName of ["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "planType", "color", "remarks", "tagColor"]) req.input(fieldName, sql.NVarChar(sql.MAX), product[fieldName]);
    for (const fieldName of PRODUCT_QUANTITIES) req.input(fieldName, sql.Decimal(18, 6), product[fieldName]);
    req.input('price', sql.VarChar(sql.MAX), product.price === null ? null : String(product.price)).input('stock', sql.Decimal(18, 3), product.stock).input('isActive', sql.Bit, product.isActive).input('vatMode', sql.NVarChar(sql.MAX), product.vatMode).input('productHeaderId', sql.Int, product.productHeaderId).input('inventorySetup', sql.NVarChar(sql.MAX), product.inventorySetup);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Products SET [sku]=@sku,[name]=@name,[description]=@description,[unit]=@unit,[revision]=@revision,[secondaryUnit]=@secondaryUnit,[currency]=@currency,[model]=@model,[category]=@category,[planType]=@planType,[color]=@color,[remarks]=@remarks,[tagColor]=@tagColor,[quantityPerSecondaryUnit]=@quantityPerSecondaryUnit,[moq]=@moq,[spq]=@spq,[unitCost]=@unitCost,[divisor]=@divisor,[thickness]=@thickness,[weight]=@weight,[price]=@price,[stock]=@stock,[isActive]=@isActive,[vatMode]=@vatMode,[productHeaderId]=@productHeaderId,[inventorySetup]=@inventorySetup,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Products([sku],[name],[description],[unit],[revision],[secondaryUnit],[currency],[model],[category],[planType],[color],[remarks],[tagColor],[quantityPerSecondaryUnit],[moq],[spq],[unitCost],[divisor],[thickness],[weight],[price],[stock],[isActive],[vatMode],[productHeaderId],[inventorySetup],createdAt,updatedAt) OUTPUT INSERTED.id VALUES(@sku,@name,@description,@unit,@revision,@secondaryUnit,@currency,@model,@category,@planType,@color,@remarks,@tagColor,@quantityPerSecondaryUnit,@moq,@spq,@unitCost,@divisor,@thickness,@weight,@price,@stock,@isActive,@vatMode,@productHeaderId,@inventorySetup,SYSUTCDATETIME(),SYSUTCDATETIME())`);
      saved = result.recordset[0].id;
    }
    if (!current || Object.hasOwn(input, 'processes') && input.processes !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductProcesses WHERE productId=@id');
      for (const [position, row] of product.processes.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('name', sql.NVarChar(sql.MAX), row.name).query('INSERT INTO dbo.ProductProcesses(productId,position,name) VALUES(@id,@position,@name)');
      }
    }
    if (!current || Object.hasOwn(input, 'offices') && input.offices !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductOffices WHERE productId=@id');
      for (const [position, row] of product.offices.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('name', sql.NVarChar(sql.MAX), row.name).query('INSERT INTO dbo.ProductOffices(productId,position,name) VALUES(@id,@position,@name)');
      }
    }
    if (!current || Object.hasOwn(input, 'customerApprovals') && input.customerApprovals !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductCustomerApprovals WHERE productId=@id');
      for (const [position, row] of product.customerApprovals.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('customerId', sql.Int, row.customerId).input('approvalDate', sql.VarChar(sql.MAX), row.approvalDate).input('eolDate', sql.VarChar(sql.MAX), row.eolDate).input('approvalRemarks', sql.NVarChar(sql.MAX), row.approvalRemarks).input('eolRemarks', sql.NVarChar(sql.MAX), row.eolRemarks).query('INSERT INTO dbo.ProductCustomerApprovals(productId,position,customerId,approvalDate,eolDate,approvalRemarks,eolRemarks) VALUES(@id,@position,@customerId,@approvalDate,@eolDate,@approvalRemarks,@eolRemarks)');
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
  const recordResult = await recordQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[planType],p.[color],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[thickness],p.[weight],CONVERT(varchar(60),p.price) AS price,p.[stock],p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId WHERE p.id=@id ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses WHERE productId=@id ORDER BY productId,position;
SELECT productId,name FROM dbo.ProductOffices WHERE productId=@id ORDER BY productId,position;
SELECT productId,customerId,CONVERT(varchar(10),approvalDate,23) AS approvalDate,CONVERT(varchar(10),eolDate,23) AS eolDate,approvalRemarks,eolRemarks FROM dbo.ProductCustomerApprovals WHERE productId=@id ORDER BY productId,position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId WHERE l.productId=@id ORDER BY l.productId,l.position;`);
  const productsById = new Map(recordResult.recordsets[0].map(productRow => [productRow.id, {
    ...productRow,
    processes: [],
    offices: [],
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
  } of recordResult.recordsets[2]) productsById.get(linkedProductId)?.["offices"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[3]) productsById.get(linkedProductId)?.["customerApprovals"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[4]) productsById.get(linkedProductId)?.linkedSupplies.push(productRow);
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
      const currentResult = await currentQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[planType],p.[color],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[thickness],p.[weight],CONVERT(varchar(60),p.price) AS price,p.[stock],p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p WITH (UPDLOCK,HOLDLOCK)
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId WHERE p.id=@id ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses WHERE productId=@id ORDER BY productId,position;
SELECT productId,name FROM dbo.ProductOffices WHERE productId=@id ORDER BY productId,position;
SELECT productId,customerId,CONVERT(varchar(10),approvalDate,23) AS approvalDate,CONVERT(varchar(10),eolDate,23) AS eolDate,approvalRemarks,eolRemarks FROM dbo.ProductCustomerApprovals WHERE productId=@id ORDER BY productId,position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId WHERE l.productId=@id ORDER BY l.productId,l.position;`);
      const productsById2 = new Map(currentResult.recordsets[0].map(productRow => [productRow.id, {
        ...productRow,
        processes: [],
        offices: [],
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
      } of currentResult.recordsets[2]) productsById2.get(linkedProductId)?.["offices"].push(productRow);
      for (const {
        productId: linkedProductId,
        ...productRow
      } of currentResult.recordsets[3]) productsById2.get(linkedProductId)?.["customerApprovals"].push(productRow);
      for (const {
        productId: linkedProductId,
        ...productRow
      } of currentResult.recordsets[4]) productsById2.get(linkedProductId)?.linkedSupplies.push(productRow);
      const currentRows = [...productsById2.values()];
      if (!currentRows.length) {
        const error = new Error('The product could not be found.');
        error.status = 404;
        throw error;
      }
      current = currentRows[0];
    }
    const product = {
      ...Object.fromEntries(["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "planType", "color", "remarks", "tagColor"].map(key => [key, null])),
      ...Object.fromEntries(PRODUCT_QUANTITIES.map(key => [key, null])),
      revision: null,
      vatMode: null,
      productHeaderId: null,
      price: null,
      stock: 0,
      isActive: true,
      processes: [],
      offices: [],
      customerApprovals: [],
      linkedSupplies: [],
      inventorySetup: null,
      ...(current || {})
    };
    for (const key of ["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "planType", "color", "remarks", "tagColor"]) if (Object.hasOwn(input, key) && input[key] !== undefined) product[key] = typeof input[key] === 'string' ? input[key].trim() || null : null;
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
    for (const [key, limit] of [['processes', 100], ['offices', 50]]) {
      if (Object.hasOwn(input, key) && input[key] !== undefined) {
        if (!Array.isArray(input[key]) || input[key].length > limit) {
          const error = new Error('The submitted collection exceeds the supported size.');
          error.status = 400;
          throw error;
        }
        product[key] = input[key].map(row => {
          return {
            name: typeof row.name === 'string' ? row.name.trim() : ''
          };
        });
      }
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
        if (row.approvalDate && row.eolDate && new Date(row.eolDate).getTime() < new Date(row.approvalDate).getTime()) {
          const error = new Error('Product EOL date cannot be earlier than its approval date.');
          error.status = 400;
          throw error;
        }
        return {
          customerId: parsedCustomerId,
          approvalDate: row.approvalDate || null,
          eolDate: row.eolDate || null,
          approvalRemarks: typeof row.approvalRemarks === 'string' ? row.approvalRemarks.trim() || null : null,
          eolRemarks: typeof row.eolRemarks === 'string' ? row.eolRemarks.trim() || null : null
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
      const result = await request(scope).input('id', sql.Int, current.id).query('SELECT TOP(1) id FROM dbo.SalesOrderItems WHERE productId=@id');
      if (Number(current.stock) > 0 || result.recordset.length) {
        const error = new Error('UOP cannot change after finished-product stock or sales history exists.');
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
    for (const fieldName of ["sku", "name", "description", "unit", "revision", "secondaryUnit", "currency", "model", "category", "planType", "color", "remarks", "tagColor"]) req.input(fieldName, sql.NVarChar(sql.MAX), product[fieldName]);
    for (const fieldName of PRODUCT_QUANTITIES) req.input(fieldName, sql.Decimal(18, 6), product[fieldName]);
    req.input('price', sql.VarChar(sql.MAX), product.price === null ? null : String(product.price)).input('stock', sql.Decimal(18, 3), product.stock).input('isActive', sql.Bit, product.isActive).input('vatMode', sql.NVarChar(sql.MAX), product.vatMode).input('productHeaderId', sql.Int, product.productHeaderId).input('inventorySetup', sql.NVarChar(sql.MAX), product.inventorySetup);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.Products SET [sku]=@sku,[name]=@name,[description]=@description,[unit]=@unit,[revision]=@revision,[secondaryUnit]=@secondaryUnit,[currency]=@currency,[model]=@model,[category]=@category,[planType]=@planType,[color]=@color,[remarks]=@remarks,[tagColor]=@tagColor,[quantityPerSecondaryUnit]=@quantityPerSecondaryUnit,[moq]=@moq,[spq]=@spq,[unitCost]=@unitCost,[divisor]=@divisor,[thickness]=@thickness,[weight]=@weight,[price]=@price,[stock]=@stock,[isActive]=@isActive,[vatMode]=@vatMode,[productHeaderId]=@productHeaderId,[inventorySetup]=@inventorySetup,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    } else {
      const result = await req.query(`INSERT INTO dbo.Products([sku],[name],[description],[unit],[revision],[secondaryUnit],[currency],[model],[category],[planType],[color],[remarks],[tagColor],[quantityPerSecondaryUnit],[moq],[spq],[unitCost],[divisor],[thickness],[weight],[price],[stock],[isActive],[vatMode],[productHeaderId],[inventorySetup],createdAt,updatedAt) OUTPUT INSERTED.id VALUES(@sku,@name,@description,@unit,@revision,@secondaryUnit,@currency,@model,@category,@planType,@color,@remarks,@tagColor,@quantityPerSecondaryUnit,@moq,@spq,@unitCost,@divisor,@thickness,@weight,@price,@stock,@isActive,@vatMode,@productHeaderId,@inventorySetup,SYSUTCDATETIME(),SYSUTCDATETIME())`);
      saved = result.recordset[0].id;
    }
    if (!current || Object.hasOwn(input, 'processes') && input.processes !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductProcesses WHERE productId=@id');
      for (const [position, row] of product.processes.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('name', sql.NVarChar(sql.MAX), row.name).query('INSERT INTO dbo.ProductProcesses(productId,position,name) VALUES(@id,@position,@name)');
      }
    }
    if (!current || Object.hasOwn(input, 'offices') && input.offices !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductOffices WHERE productId=@id');
      for (const [position, row] of product.offices.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('name', sql.NVarChar(sql.MAX), row.name).query('INSERT INTO dbo.ProductOffices(productId,position,name) VALUES(@id,@position,@name)');
      }
    }
    if (!current || Object.hasOwn(input, 'customerApprovals') && input.customerApprovals !== undefined) {
      await request(scope).input('id', sql.Int, saved).query('DELETE FROM dbo.ProductCustomerApprovals WHERE productId=@id');
      for (const [position, row] of product.customerApprovals.entries()) {
        await request(scope).input('id', sql.Int, saved).input('position', sql.Int, position).input('customerId', sql.Int, row.customerId).input('approvalDate', sql.VarChar(sql.MAX), row.approvalDate).input('eolDate', sql.VarChar(sql.MAX), row.eolDate).input('approvalRemarks', sql.NVarChar(sql.MAX), row.approvalRemarks).input('eolRemarks', sql.NVarChar(sql.MAX), row.eolRemarks).query('INSERT INTO dbo.ProductCustomerApprovals(productId,position,customerId,approvalDate,eolDate,approvalRemarks,eolRemarks) VALUES(@id,@position,@customerId,@approvalDate,@eolDate,@approvalRemarks,@eolRemarks)');
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
  const recordResult = await recordQuery.query(`SELECT p.id,p.[sku],p.[name],p.[description],p.[unit],p.[revision],p.[secondaryUnit],p.[currency],p.[model],p.[category],p.[planType],p.[color],p.[remarks],p.[tagColor],p.[quantityPerSecondaryUnit],p.[moq],p.[spq],p.[unitCost],p.[divisor],p.[thickness],p.[weight],CONVERT(varchar(60),p.price) AS price,p.[stock],p.[isActive],p.[vatMode],p.[productHeaderId],p.[inventorySetup],h.sku AS productHeaderCode,h.name AS productHeaderName
    FROM dbo.Products p
    LEFT JOIN dbo.Products h ON h.id=p.productHeaderId WHERE p.id=@id ORDER BY p.id DESC;
    SELECT productId,name FROM dbo.ProductProcesses WHERE productId=@id ORDER BY productId,position;
SELECT productId,name FROM dbo.ProductOffices WHERE productId=@id ORDER BY productId,position;
SELECT productId,customerId,CONVERT(varchar(10),approvalDate,23) AS approvalDate,CONVERT(varchar(10),eolDate,23) AS eolDate,approvalRemarks,eolRemarks FROM dbo.ProductCustomerApprovals WHERE productId=@id ORDER BY productId,position;
    SELECT l.productId,l.suppliesId,s.code,s.name,s.description,l.quantity,l.unit
    FROM dbo.ProductSupplies l JOIN dbo.Supplies s ON s.id=l.suppliesId WHERE l.productId=@id ORDER BY l.productId,l.position;`);
  const productsById = new Map(recordResult.recordsets[0].map(productRow => [productRow.id, {
    ...productRow,
    processes: [],
    offices: [],
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
  } of recordResult.recordsets[2]) productsById.get(linkedProductId)?.["offices"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[3]) productsById.get(linkedProductId)?.["customerApprovals"].push(productRow);
  for (const {
    productId: linkedProductId,
    ...productRow
  } of recordResult.recordsets[4]) productsById.get(linkedProductId)?.linkedSupplies.push(productRow);
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
router.get('/sales-orders', async (req, res) => {
  const result = await request().query(`SELECT o.id, o.number, o.customerId, o.customerName, o.customerAddress,o.currency,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate, o.notes, o.status, o.total,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o ORDER BY o.id DESC`);
  res.json({
    records: result.recordset
  });
});
router.get('/sales-orders/:id', async (req, res) => {
  const parsedId = Number(req.params.id);
  if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || parsedId > 2147483647) {
    const error = new Error(`Enter a valid ${'id'}.`);
    error.status = 400;
    throw error;
  }
  const id = parsedId;
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT o.id, o.number, o.customerId, o.customerName, o.customerAddress,o.currency,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate, o.notes, o.status, o.total,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WHERE o.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Sales order could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('id', sql.Int, id).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@id ORDER BY id');
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.json({
    record
  });
});
router.post('/sales-orders', async (req, res) => {
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
  if (!Array.isArray(input.items) || input.items.length > 100) {
    const error = new Error('The submitted collection exceeds the supported size.');
    error.status = 400;
    throw error;
  }
  let totalCents = 0n;
  const items = input.items.map(item => {
    if (!['string', 'number'].includes(typeof item.quantity) || !Number.isFinite(Number(item.quantity))) {
      const error = new Error('Quantity must be a valid decimal number.');
      error.status = 400;
      throw error;
    }
    const quantityText = String(item.quantity).trim();
    if (!/^\d+(?:\.\d+)?$/.test(quantityText)) {
      const error = new Error('Quantity must be zero or greater.');
      error.status = 400;
      throw error;
    }
    const [wholeQuantity, enteredQuantityFraction = ''] = quantityText.split('.');
    const quantityFraction = enteredQuantityFraction.replace(/0+$/, '');
    if (quantityFraction.length > 3) {
      const error = new Error('Quantity supports at most 3 decimal places.');
      error.status = 400;
      throw error;
    }
    const quantityThousandths = BigInt(wholeQuantity) * 1000n + BigInt(quantityFraction.padEnd(3, '0') || '0');
    if (quantityThousandths <= 0n || quantityThousandths > 1000000000n) {
      const error = new Error('Order quantities must be positive and at most 1,000,000.');
      error.status = 400;
      throw error;
    }
    if (!['string', 'number'].includes(typeof item.unitPrice) || !Number.isFinite(Number(item.unitPrice))) {
      const error = new Error('Unit price must be a valid decimal number.');
      error.status = 400;
      throw error;
    }
    const priceText = String(item.unitPrice).trim();
    if (!/^\d+(?:\.\d+)?$/.test(priceText)) {
      const error = new Error('Unit price must be zero or greater.');
      error.status = 400;
      throw error;
    }
    const [wholePrice, enteredPriceFraction = ''] = priceText.split('.');
    const priceFraction = enteredPriceFraction.replace(/0+$/, '');
    if (priceFraction.length > 6) {
      const error = new Error('Unit price supports at most 6 decimal places.');
      error.status = 400;
      throw error;
    }
    const priceMillionths = BigInt(wholePrice) * 1000000n + BigInt(priceFraction.padEnd(6, '0') || '0');
    if (priceMillionths > 100000000000000n) {
      const error = new Error('Unit price is too large.');
      error.status = 400;
      throw error;
    }
    const productId = Number(item.productId);
    if (!Number.isSafeInteger(productId) || productId <= 0 || productId > 2147483647) {
      const error = new Error('Enter a valid product.');
      error.status = 400;
      throw error;
    }
    // Quantity has scale 3 and price scale 6. Round each line HALF-UP to cents.
    const lineCents = (quantityThousandths * priceMillionths * 100n + 500000000n) / 1000000000n;
    totalCents += lineCents;
    if (totalCents > 100000000000000n) {
      const error = new Error('The document total exceeds the supported amount.');
      error.status = 400;
      throw error;
    }
    return {
      productId,
      quantity: Number(quantityThousandths) / 1000,
      unitPrice: Number(priceMillionths) / 1000000,
      lineTotal: Number(lineCents) / 100
    };
  });
  if (!items.length || new Set(items.map(item => item.productId)).size !== items.length) {
    const error = new Error('Orders need distinct product lines.');
    error.status = 400;
    throw error;
  }
  const customerId = Number(input.customerId);
  if (!Number.isSafeInteger(customerId) || customerId <= 0 || customerId > 2147483647) {
    const error = new Error('Enter a valid customer.');
    error.status = 400;
    throw error;
  }
  const order = {
    customerId,
    orderDate: typeof input.orderDate === 'string' ? input.orderDate.trim() : '',
    notes: typeof input.notes === 'string' ? input.notes.trim() || null : null,
    status: input.status || 'draft',
    items,
    total: Number(totalCents) / 100
  };
  if (!['draft', 'confirmed'].includes(order.status)) {
    const error = new Error('The order state is invalid.');
    error.status = 400;
    throw error;
  }
  const savedId = await transaction(async tx => {
    if (id) {
      const currentResult = await request(tx).input('id', sql.Int, id).query(`SELECT o.id, o.number, o.customerId, o.customerName, o.customerAddress,o.currency,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate, o.notes, o.status, o.total,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) WHERE o.id=@id`);
      if (!currentResult.recordset.length) {
        const error = new Error('Sales order could not be found.');
        error.status = 404;
        throw error;
      }
      const currentItems = await request(tx).input('id', sql.Int, id).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@id ORDER BY id');
      const current = {
        ...currentResult.recordset[0],
        items: currentItems.recordset
      };
      if (current.invoiced || current.delivered) {
        const error = new Error('This order is already linked to an invoice or delivery receipt and cannot be edited.');
        error.status = 409;
        throw error;
      }
    }
    const customerResult = await request(tx).input('id', sql.Int, order.customerId).query('SELECT id,name,address,isActive FROM dbo.Customers WHERE id=@id');
    if (!customerResult.recordset.length) {
      const error = new Error('The customer could not be found.');
      error.status = 404;
      throw error;
    }
    const customer = customerResult.recordset[0];
    if (!customer.isActive) {
      const error = new Error('Select an active customer.');
      error.status = 400;
      throw error;
    }
    const snapshots = [];
    for (const item of [...order.items].sort((a, b) => a.productId - b.productId)) {
      const productResult = await request(tx).input('id', sql.Int, item.productId).query('SELECT id,name,sku,unit,currency,isActive FROM dbo.Products WHERE id=@id');
      if (!productResult.recordset.length) {
        const error = new Error('The product could not be found.');
        error.status = 404;
        throw error;
      }
      const product = productResult.recordset[0];
      if (!product.isActive) {
        const error = new Error(`${product.name} is inactive.`);
        error.status = 400;
        throw error;
      }
      snapshots.push({
        ...item,
        productName: product.name,
        sku: product.sku,
        unit: product.unit,
        currency: product.currency
      });
    }
    const productCurrencies = new Set(snapshots.map(productSnapshot => String(productSnapshot.currency || 'PHP').trim().toUpperCase() || 'PHP'));
    if (productCurrencies.size !== 1) {
      const error = new Error('Use products with the same currency in one sales order.');
      error.status = 400;
      throw error;
    }
    const currency = [...productCurrencies][0];
    if (input.currency !== undefined && (typeof input.currency === 'string' ? input.currency.trim() : '').toUpperCase() !== currency) {
      const error = new Error('Order currency must match the selected product prices.');
      error.status = 400;
      throw error;
    }
    const req = request(tx).input('customerId', sql.Int, order.customerId).input('customerName', sql.NVarChar(sql.MAX), customer.name).input('customerAddress', sql.NVarChar(sql.MAX), customer.address).input('orderDate', sql.VarChar(sql.MAX), order.orderDate).input('notes', sql.NVarChar(sql.MAX), order.notes).input('status', sql.NVarChar(sql.MAX), order.status).input('total', sql.Decimal(18, 2), order.total).input('currency', sql.NVarChar(sql.MAX), currency);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.SalesOrders SET customerId=@customerId,customerName=@customerName,customerAddress=@customerAddress,
        orderDate=@orderDate,notes=@notes,status=@status,total=@total,currency=@currency,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
      await request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.SalesOrderItems WHERE orderId=@id');
    } else {
      const result = await req.input('createdBy', sql.Int, user.id).query(`INSERT INTO dbo.SalesOrders
        (customerId,customerName,customerAddress,orderDate,notes,status,total,currency,createdBy,createdAt,updatedAt) OUTPUT INSERTED.id
        VALUES (@customerId,@customerName,@customerAddress,@orderDate,@notes,@status,@total,@currency,@createdBy,SYSUTCDATETIME(),SYSUTCDATETIME())`);
      saved = result.recordset[0].id;
      const number = `SO-${String(saved).padStart(8, '0')}`;
      await request(tx).input('id', sql.Int, saved).input('number', sql.NVarChar(sql.MAX), number).query('UPDATE dbo.SalesOrders SET number=@number WHERE id=@id');
    }
    for (const item of snapshots) {
      await request(tx).input('orderId', sql.Int, saved).input('productId', sql.Int, item.productId).input('productName', sql.NVarChar(sql.MAX), item.productName).input('sku', sql.NVarChar(sql.MAX), item.sku).input('unit', sql.NVarChar(sql.MAX), item.unit).input('quantity', sql.Decimal(18, 3), item.quantity).input('unitPrice', sql.Decimal(18, 6), item.unitPrice).input('lineTotal', sql.Decimal(18, 2), item.lineTotal).query(`INSERT INTO dbo.SalesOrderItems (orderId,productId,productName,sku,unit,quantity,unitPrice,lineTotal)
          VALUES (@orderId,@productId,@productName,@sku,@unit,@quantity,@unitPrice,@lineTotal)`);
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'sales-orders').input('action', sql.NVarChar(sql.MAX), id ? 'update' : 'create').input('recordId', sql.NVarChar(sql.MAX), String(saved)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return saved;
  });
  const recordResult = await request().input('id', sql.Int, savedId).query(`SELECT o.id, o.number, o.customerId, o.customerName, o.customerAddress,o.currency,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate, o.notes, o.status, o.total,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WHERE o.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Sales order could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('id', sql.Int, savedId).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@id ORDER BY id');
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.status(201).json({
    record
  });
});
router.put('/sales-orders/:id', async (req, res) => {
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
  if (!Array.isArray(input.items) || input.items.length > 100) {
    const error = new Error('The submitted collection exceeds the supported size.');
    error.status = 400;
    throw error;
  }
  let totalCents = 0n;
  const items = input.items.map(item => {
    if (!['string', 'number'].includes(typeof item.quantity) || !Number.isFinite(Number(item.quantity))) {
      const error = new Error('Quantity must be a valid decimal number.');
      error.status = 400;
      throw error;
    }
    const quantityText = String(item.quantity).trim();
    if (!/^\d+(?:\.\d+)?$/.test(quantityText)) {
      const error = new Error('Quantity must be zero or greater.');
      error.status = 400;
      throw error;
    }
    const [wholeQuantity, enteredQuantityFraction = ''] = quantityText.split('.');
    const quantityFraction = enteredQuantityFraction.replace(/0+$/, '');
    if (quantityFraction.length > 3) {
      const error = new Error('Quantity supports at most 3 decimal places.');
      error.status = 400;
      throw error;
    }
    const quantityThousandths = BigInt(wholeQuantity) * 1000n + BigInt(quantityFraction.padEnd(3, '0') || '0');
    if (quantityThousandths <= 0n || quantityThousandths > 1000000000n) {
      const error = new Error('Order quantities must be positive and at most 1,000,000.');
      error.status = 400;
      throw error;
    }
    if (!['string', 'number'].includes(typeof item.unitPrice) || !Number.isFinite(Number(item.unitPrice))) {
      const error = new Error('Unit price must be a valid decimal number.');
      error.status = 400;
      throw error;
    }
    const priceText = String(item.unitPrice).trim();
    if (!/^\d+(?:\.\d+)?$/.test(priceText)) {
      const error = new Error('Unit price must be zero or greater.');
      error.status = 400;
      throw error;
    }
    const [wholePrice, enteredPriceFraction = ''] = priceText.split('.');
    const priceFraction = enteredPriceFraction.replace(/0+$/, '');
    if (priceFraction.length > 6) {
      const error = new Error('Unit price supports at most 6 decimal places.');
      error.status = 400;
      throw error;
    }
    const priceMillionths = BigInt(wholePrice) * 1000000n + BigInt(priceFraction.padEnd(6, '0') || '0');
    if (priceMillionths > 100000000000000n) {
      const error = new Error('Unit price is too large.');
      error.status = 400;
      throw error;
    }
    const productId = Number(item.productId);
    if (!Number.isSafeInteger(productId) || productId <= 0 || productId > 2147483647) {
      const error = new Error('Enter a valid product.');
      error.status = 400;
      throw error;
    }
    // Quantity has scale 3 and price scale 6. Round each line HALF-UP to cents.
    const lineCents = (quantityThousandths * priceMillionths * 100n + 500000000n) / 1000000000n;
    totalCents += lineCents;
    if (totalCents > 100000000000000n) {
      const error = new Error('The document total exceeds the supported amount.');
      error.status = 400;
      throw error;
    }
    return {
      productId,
      quantity: Number(quantityThousandths) / 1000,
      unitPrice: Number(priceMillionths) / 1000000,
      lineTotal: Number(lineCents) / 100
    };
  });
  if (!items.length || new Set(items.map(item => item.productId)).size !== items.length) {
    const error = new Error('Orders need distinct product lines.');
    error.status = 400;
    throw error;
  }
  const customerId = Number(input.customerId);
  if (!Number.isSafeInteger(customerId) || customerId <= 0 || customerId > 2147483647) {
    const error = new Error('Enter a valid customer.');
    error.status = 400;
    throw error;
  }
  const order = {
    customerId,
    orderDate: typeof input.orderDate === 'string' ? input.orderDate.trim() : '',
    notes: typeof input.notes === 'string' ? input.notes.trim() || null : null,
    status: input.status || 'draft',
    items,
    total: Number(totalCents) / 100
  };
  if (!['draft', 'confirmed'].includes(order.status)) {
    const error = new Error('The order state is invalid.');
    error.status = 400;
    throw error;
  }
  const savedId = await transaction(async tx => {
    if (id) {
      const currentResult = await request(tx).input('id', sql.Int, id).query(`SELECT o.id, o.number, o.customerId, o.customerName, o.customerAddress,o.currency,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate, o.notes, o.status, o.total,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) WHERE o.id=@id`);
      if (!currentResult.recordset.length) {
        const error = new Error('Sales order could not be found.');
        error.status = 404;
        throw error;
      }
      const currentItems = await request(tx).input('id', sql.Int, id).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@id ORDER BY id');
      const current = {
        ...currentResult.recordset[0],
        items: currentItems.recordset
      };
      if (current.invoiced || current.delivered) {
        const error = new Error('This order is already linked to an invoice or delivery receipt and cannot be edited.');
        error.status = 409;
        throw error;
      }
    }
    const customerResult = await request(tx).input('id', sql.Int, order.customerId).query('SELECT id,name,address,isActive FROM dbo.Customers WHERE id=@id');
    if (!customerResult.recordset.length) {
      const error = new Error('The customer could not be found.');
      error.status = 404;
      throw error;
    }
    const customer = customerResult.recordset[0];
    if (!customer.isActive) {
      const error = new Error('Select an active customer.');
      error.status = 400;
      throw error;
    }
    const snapshots = [];
    for (const item of [...order.items].sort((a, b) => a.productId - b.productId)) {
      const productResult = await request(tx).input('id', sql.Int, item.productId).query('SELECT id,name,sku,unit,currency,isActive FROM dbo.Products WHERE id=@id');
      if (!productResult.recordset.length) {
        const error = new Error('The product could not be found.');
        error.status = 404;
        throw error;
      }
      const product = productResult.recordset[0];
      if (!product.isActive) {
        const error = new Error(`${product.name} is inactive.`);
        error.status = 400;
        throw error;
      }
      snapshots.push({
        ...item,
        productName: product.name,
        sku: product.sku,
        unit: product.unit,
        currency: product.currency
      });
    }
    const productCurrencies = new Set(snapshots.map(productSnapshot => String(productSnapshot.currency || 'PHP').trim().toUpperCase() || 'PHP'));
    if (productCurrencies.size !== 1) {
      const error = new Error('Use products with the same currency in one sales order.');
      error.status = 400;
      throw error;
    }
    const currency = [...productCurrencies][0];
    if (input.currency !== undefined && (typeof input.currency === 'string' ? input.currency.trim() : '').toUpperCase() !== currency) {
      const error = new Error('Order currency must match the selected product prices.');
      error.status = 400;
      throw error;
    }
    const req = request(tx).input('customerId', sql.Int, order.customerId).input('customerName', sql.NVarChar(sql.MAX), customer.name).input('customerAddress', sql.NVarChar(sql.MAX), customer.address).input('orderDate', sql.VarChar(sql.MAX), order.orderDate).input('notes', sql.NVarChar(sql.MAX), order.notes).input('status', sql.NVarChar(sql.MAX), order.status).input('total', sql.Decimal(18, 2), order.total).input('currency', sql.NVarChar(sql.MAX), currency);
    let saved = id;
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.SalesOrders SET customerId=@customerId,customerName=@customerName,customerAddress=@customerAddress,
        orderDate=@orderDate,notes=@notes,status=@status,total=@total,currency=@currency,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
      await request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.SalesOrderItems WHERE orderId=@id');
    } else {
      const result = await req.input('createdBy', sql.Int, user.id).query(`INSERT INTO dbo.SalesOrders
        (customerId,customerName,customerAddress,orderDate,notes,status,total,currency,createdBy,createdAt,updatedAt) OUTPUT INSERTED.id
        VALUES (@customerId,@customerName,@customerAddress,@orderDate,@notes,@status,@total,@currency,@createdBy,SYSUTCDATETIME(),SYSUTCDATETIME())`);
      saved = result.recordset[0].id;
      const number = `SO-${String(saved).padStart(8, '0')}`;
      await request(tx).input('id', sql.Int, saved).input('number', sql.NVarChar(sql.MAX), number).query('UPDATE dbo.SalesOrders SET number=@number WHERE id=@id');
    }
    for (const item of snapshots) {
      await request(tx).input('orderId', sql.Int, saved).input('productId', sql.Int, item.productId).input('productName', sql.NVarChar(sql.MAX), item.productName).input('sku', sql.NVarChar(sql.MAX), item.sku).input('unit', sql.NVarChar(sql.MAX), item.unit).input('quantity', sql.Decimal(18, 3), item.quantity).input('unitPrice', sql.Decimal(18, 6), item.unitPrice).input('lineTotal', sql.Decimal(18, 2), item.lineTotal).query(`INSERT INTO dbo.SalesOrderItems (orderId,productId,productName,sku,unit,quantity,unitPrice,lineTotal)
          VALUES (@orderId,@productId,@productName,@sku,@unit,@quantity,@unitPrice,@lineTotal)`);
    }
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'sales-orders').input('action', sql.NVarChar(sql.MAX), id ? 'update' : 'create').input('recordId', sql.NVarChar(sql.MAX), String(saved)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return saved;
  });
  const recordResult = await request().input('id', sql.Int, savedId).query(`SELECT o.id, o.number, o.customerId, o.customerName, o.customerAddress,o.currency,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate, o.notes, o.status, o.total,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WHERE o.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Sales order could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('id', sql.Int, savedId).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@id ORDER BY id');
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.json({
    record
  });
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
    const orderResult = await request(tx).input('id', sql.Int, id).query(`SELECT o.id, o.number, o.customerId, o.customerName, o.customerAddress,o.currency,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate, o.notes, o.status, o.total,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) WHERE o.id=@id`);
    if (!orderResult.recordset.length) {
      const error = new Error('Sales order could not be found.');
      error.status = 404;
      throw error;
    }
    const orderItems = await request(tx).input('id', sql.Int, id).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@id ORDER BY id');
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
  const result = await request().query(`SELECT i.id,i.number,i.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,o.currency,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,i.total,i.paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId ORDER BY i.id DESC`);
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
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT i.id,i.number,i.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,o.currency,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,i.total,i.paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId WHERE i.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Sales invoice could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@orderId ORDER BY id');
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.json({
    record
  });
});
router.get('/delivery-receipts', async (req, res) => {
  const result = await request().query(`SELECT d.id,d.number,d.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.total,o.currency,
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
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT d.id,d.number,d.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.total,o.currency,
  CONVERT(varchar(10),d.deliveryDate,23) AS deliveryDate,d.receivedBy,d.address,d.notes FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId WHERE d.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Delivery receipt could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@orderId ORDER BY id');
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
  o.customerId,o.customerName,o.customerAddress,o.currency,CONVERT(varchar(10),s.shippingDate,23) AS shippingDate,
  s.carrier,s.trackingNumber,s.notes,i.total,i.paidAmount,d.number AS deliveryNumber FROM dbo.ShippingInvoices s
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
  o.customerId,o.customerName,o.customerAddress,o.currency,CONVERT(varchar(10),s.shippingDate,23) AS shippingDate,
  s.carrier,s.trackingNumber,s.notes,i.total,i.paidAmount,d.number AS deliveryNumber FROM dbo.ShippingInvoices s
  JOIN dbo.SalesInvoices i ON i.id=s.invoiceId
  JOIN dbo.SalesOrders o ON o.id=i.orderId
  LEFT JOIN dbo.DeliveryReceipts d ON d.orderId=o.id WHERE s.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Shipping invoice could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@orderId ORDER BY id');
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
    const orderResult = await request(tx).input('id', sql.Int, orderId).query(`SELECT o.id, o.number, o.customerId, o.customerName, o.customerAddress,o.currency,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate, o.notes, o.status, o.total,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) WHERE o.id=@id`);
    if (!orderResult.recordset.length) {
      const error = new Error('Sales order could not be found.');
      error.status = 404;
      throw error;
    }
    const orderItems = await request(tx).input('id', sql.Int, orderId).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@id ORDER BY id');
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
    const result = await request(tx).input('orderId', sql.Int, orderId).input('invoiceDate', sql.VarChar(sql.MAX), invoiceDate).input('dueDate', sql.VarChar(sql.MAX), dueDate).input('notes', sql.NVarChar(sql.MAX), notes).input('total', sql.Decimal(18, 2), order.total).input('createdBy', sql.Int, user.id).query(`INSERT INTO dbo.SalesInvoices (orderId,invoiceDate,dueDate,notes,total,createdBy,paidAmount,createdAt,updatedAt) OUTPUT INSERTED.id
        VALUES (@orderId,@invoiceDate,@dueDate,@notes,@total,@createdBy,0,SYSUTCDATETIME(),SYSUTCDATETIME())`);
    const number = `SI-${String(result.recordset[0].id).padStart(8, '0')}`;
    await request(tx).input('id', sql.Int, result.recordset[0].id).input('number', sql.NVarChar(sql.MAX), number).query('UPDATE dbo.SalesInvoices SET number=@number WHERE id=@id');
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'sales-invoices').input('action', sql.NVarChar(sql.MAX), 'create').input('recordId', sql.NVarChar(sql.MAX), String(result.recordset[0].id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return result.recordset[0].id;
  });
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT i.id,i.number,i.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,o.currency,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,i.total,i.paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId WHERE i.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Sales invoice could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@orderId ORDER BY id');
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
  if (paymentFraction.length > 2) {
    const error = new Error('Payment supports at most 2 decimal places.');
    error.status = 400;
    throw error;
  }
  const paymentCents = BigInt(wholePayment) * 100n + BigInt(paymentFraction.padEnd(2, '0') || '0');
  if (paymentCents > 100000000000000n) {
    const error = new Error('Payment is too large.');
    error.status = 400;
    throw error;
  }
  const paidAmount = Number(paymentCents) / 100;
  await transaction(async tx => {
    const result = await request(tx).input('id', sql.Int, id).input('paidAmount', sql.Decimal(18, 2), paidAmount).query('UPDATE dbo.SalesInvoices SET paidAmount=@paidAmount,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id AND total>=@paidAmount');
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
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT i.id,i.number,i.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.customerAddress,o.currency,
  CONVERT(varchar(10),i.invoiceDate,23) AS invoiceDate,CONVERT(varchar(10),i.dueDate,23) AS dueDate,
  i.notes,i.total,i.paidAmount, CASE WHEN i.paidAmount>=i.total THEN 'paid' WHEN i.paidAmount>0 THEN 'partial' ELSE 'unpaid' END AS status FROM dbo.SalesInvoices i JOIN dbo.SalesOrders o ON o.id=i.orderId WHERE i.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Sales invoice could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@orderId ORDER BY id');
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
    const orderResult = await request(tx).input('id', sql.Int, orderId).query(`SELECT o.id, o.number, o.customerId, o.customerName, o.customerAddress,o.currency,
  CONVERT(varchar(10),o.orderDate,23) AS orderDate, o.notes, o.status, o.total,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.SalesInvoices i WHERE i.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS invoiced,
  CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.DeliveryReceipts d WHERE d.orderId=o.id) THEN 1 ELSE 0 END AS bit) AS delivered FROM dbo.SalesOrders o WITH (UPDLOCK,HOLDLOCK) WHERE o.id=@id`);
    if (!orderResult.recordset.length) {
      const error = new Error('Sales order could not be found.');
      error.status = 404;
      throw error;
    }
    const orderItems = await request(tx).input('id', sql.Int, orderId).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@id ORDER BY id');
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
    const result = await request(tx).input('orderId', sql.Int, orderId).input('deliveryDate', sql.VarChar(sql.MAX), deliveryDate).input('receivedBy', sql.NVarChar(sql.MAX), receivedBy).input('address', sql.NVarChar(sql.MAX), address || order.customerAddress).input('notes', sql.NVarChar(sql.MAX), notes).input('createdBy', sql.Int, user.id).query(`INSERT INTO dbo.DeliveryReceipts (orderId,deliveryDate,receivedBy,address,notes,createdBy,createdAt) OUTPUT INSERTED.id
        VALUES (@orderId,@deliveryDate,@receivedBy,@address,@notes,@createdBy,SYSUTCDATETIME())`);
    const number = `DR-${String(result.recordset[0].id).padStart(8, '0')}`;
    await request(tx).input('id', sql.Int, result.recordset[0].id).input('number', sql.NVarChar(sql.MAX), number).query('UPDATE dbo.DeliveryReceipts SET number=@number WHERE id=@id');
    await request(tx).input('userId', sql.Int, user.id).input('userName', sql.NVarChar(sql.MAX), user.name).input('system', sql.NVarChar(sql.MAX), user.system).input('module', sql.NVarChar(sql.MAX), 'delivery-receipts').input('action', sql.NVarChar(sql.MAX), 'create').input('recordId', sql.NVarChar(sql.MAX), String(result.recordset[0].id)).query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,@module,@action,@recordId,SYSUTCDATETIME())');
    return result.recordset[0].id;
  });
  const recordResult = await request().input('id', sql.Int, id).query(`SELECT d.id,d.number,d.orderId,o.number AS orderNumber,o.customerId,o.customerName,o.total,o.currency,
  CONVERT(varchar(10),d.deliveryDate,23) AS deliveryDate,d.receivedBy,d.address,d.notes FROM dbo.DeliveryReceipts d JOIN dbo.SalesOrders o ON o.id=d.orderId WHERE d.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Delivery receipt could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@orderId ORDER BY id');
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
  o.customerId,o.customerName,o.customerAddress,o.currency,CONVERT(varchar(10),s.shippingDate,23) AS shippingDate,
  s.carrier,s.trackingNumber,s.notes,i.total,i.paidAmount,d.number AS deliveryNumber FROM dbo.ShippingInvoices s
  JOIN dbo.SalesInvoices i ON i.id=s.invoiceId
  JOIN dbo.SalesOrders o ON o.id=i.orderId
  LEFT JOIN dbo.DeliveryReceipts d ON d.orderId=o.id WHERE s.id=@id`);
  if (!recordResult.recordset.length) {
    const error = new Error('Shipping invoice could not be found.');
    error.status = 404;
    throw error;
  }
  const recordItems = await request().input('orderId', sql.Int, recordResult.recordset[0].orderId).query('SELECT productId,productName,sku,unit,quantity,unitPrice,lineTotal FROM dbo.SalesOrderItems WHERE orderId=@orderId ORDER BY id');
  const record = {
    ...recordResult.recordset[0],
    items: recordItems.recordset
  };
  res.status(201).json({
    record
  });
});
for (const [path, methods] of [['/customer-options', ['GET']], ['/product-options', ['GET']], ['/customers', ['GET', 'POST']], ['/customers/:id', ['GET', 'PUT', 'DELETE']], ['/products', ['GET', 'POST']], ['/products/:id', ['GET', 'PUT', 'DELETE']], ['/sales-orders', ['GET', 'POST']], ['/sales-orders/:id', ['GET', 'PUT', 'DELETE']], ['/sales-invoices', ['GET', 'POST']], ['/sales-invoices/:id', ['GET']], ['/sales-invoices/:id/payment', ['PATCH']], ['/delivery-receipts', ['GET', 'POST']], ['/delivery-receipts/:id', ['GET']], ['/shipping-invoices', ['GET', 'POST']], ['/shipping-invoices/:id', ['GET']]]) router.all(path, (req, res) => res.set('Allow', methods.join(', ')).status(405).json({
  message: 'This HTTP method is not supported.'
}));
module.exports = router;
