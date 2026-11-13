const express = require('express');
const router = express.Router();
const { randomBytes, scrypt, timingSafeEqual, createHmac, randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const { request, sql, transaction } = require('../db');

const AUTH_SYSTEMS = {
  sales: {
    table: 'SalesUserLogin',
    roles: ["admin", "saleshead", "sales"],
    cookie: 'tti_sales_session',
    path: '/api/sales',
    audience: 'tti-company-sales'
  },
  purchasing: {
    table: 'PurchasingUserLogin',
    roles: ["admin", "purchasing"],
    cookie: 'tti_purchasing_session',
    path: '/api/purchasing',
    audience: 'tti-company-purchasing'
  },
  warehouse: {
    table: 'WarehouseUserLogin',
    roles: ["admin", "warehouse"],
    cookie: 'tti_warehouse_session',
    path: '/api/warehouse',
    audience: 'tti-company-warehouse'
  },
  configuration: {
    table: 'ConfigurationUserLogin',
    roles: ["admin", "configuration"],
    cookie: 'tti_configuration_session',
    path: '/api/configuration',
    audience: 'tti-company-configuration'
  }
};
const HEADER = Buffer.from(JSON.stringify({
  alg: 'HS256',
  typ: 'JWT'
})).toString('base64url');

const attempts = new Map();

router.post('/:system/auth/login', async (req, res) => {
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
  const system = req.params.system;
  if (!Object.hasOwn(AUTH_SYSTEMS, system)) {
    const error = new Error('This system API was not found.');
    error.status = 404;
    throw error;
  }
  const definition = AUTH_SYSTEMS[system];
  if (typeof input.username !== 'string' || typeof input.password !== 'string' || input.password.length > 128 || input.remember !== undefined && typeof input.remember !== 'boolean') {
    const error = new Error('Enter a valid username and password.');
    error.status = 400;
    throw error;
  }
  const username = input.username.trim().toLowerCase();
  if (!username || !input.password) {
    const error = new Error('Enter your username and password.');
    error.status = 400;
    throw error;
  }
  const now = Date.now();
  const key = `${system}:${req.socket?.remoteAddress || 'local'}:${username}`;
  for (const [storedKey, entry] of attempts) if (entry.expires <= now) attempts.delete(storedKey);
  const entry = attempts.get(key) || {
    count: 0,
    expires: now + 15 * 60 * 1000
  };
  if (entry.count >= 8) {
    const error = new Error('Too many unsuccessful sign-in attempts. Please try again in 15 minutes.');
    error.status = 429;
    throw error;
  }
  const result = await request().input('username', sql.NVarChar(sql.MAX), username).query(`SELECT id, name, username, cpnumber, email, photo, role, isActive,passwordHash FROM dbo.${definition.table} WHERE username=@username`);
  const row = result.recordset[0];
  const [kind, salt, encoded] = (row?.passwordHash || '').split('$');
  const storedHashValid = kind === 'scrypt' && /^[a-f0-9]{32}$/.test(salt || '') && /^[a-f0-9]{128}$/.test(encoded || '');
  const actualHash = await promisify(scrypt)(input.password, storedHashValid ? salt : 'tti-missing-user-constant-salt', 64);
  const expectedHash = storedHashValid ? Buffer.from(encoded, 'hex') : Buffer.alloc(64);
  const correct = storedHashValid && actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
  if (!row?.isActive || !correct || !definition.roles.includes(row.role)) {
    entry.count++;
    if (attempts.size < 10000) attempts.set(key, entry);
    {
      const error = new Error('Username or password is incorrect.');
      error.status = 401;
      throw error;
    }
  }
  attempts.delete(key);
  const {
    passwordHash,
    ...user
  } = row;
  const account = {
    ...user,
    system
  };
  const secret = req.app.locals.env.SESSION_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    const error = new Error('The server session secret is not configured.');
    error.status = 503;
    throw error;
  }
  if (!Number.isInteger(user.id) || user.id <= 0 || user.id > 2147483647) {
    const error = new Error('The account cannot start a session.');
    error.status = 401;
    throw error;
  }
  const issued = Math.floor(Date.now() / 1000);
  const lifetime = input.remember === true ? 7 * 86400 : 8 * 3600;
  const payload = Buffer.from(JSON.stringify({ sub: user.id, system, aud: definition.audience, iat: issued, exp: issued + lifetime, jti: randomUUID() })).toString('base64url');
  const value = `${HEADER}.${payload}`;
  const signingKey = createHmac('sha256', secret).update(`tti-session:${system}`).digest();
  const signature = createHmac('sha256', signingKey).update(value).digest('base64url');
  const token = `${value}.${signature}`;
  res.setHeader('Set-Cookie', `${definition.cookie}=${token}; Path=${definition.path}; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}${input.remember === true ? `; Max-Age=${lifetime}` : ''}`);
  res.json({
    user: account
  });
});
router.all('/:system/auth/login', (req, res) => res.set('Allow', 'POST').status(405).json({ message: 'This request method is not supported.' }));
router.post('/:system/auth/logout', (req, res) => {
  const system = req.params.system;
  if (!Object.hasOwn(AUTH_SYSTEMS, system)) {
    const error = new Error('This system API was not found.');
    error.status = 404;
    throw error;
  }
  const definition = AUTH_SYSTEMS[system];
  res.setHeader('Set-Cookie', `${definition.cookie}=; Path=${definition.path}; HttpOnly; SameSite=Lax; Max-Age=0${req.secure ? '; Secure' : ''}`);
  res.json({
    success: true
  });
});
router.all('/:system/auth/logout', (req, res) => res.set('Allow', 'POST').status(405).json({ message: 'This request method is not supported.' }));
router.use('/:system', async (req, res, next) => {
  const system = req.params.system;
  if (!Object.hasOwn(AUTH_SYSTEMS, system)) return res.status(404).json({ message: 'This system API was not found.' });
  const definition = AUTH_SYSTEMS[system];
  const token = String(req.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${definition.cookie}=`))?.slice(definition.cookie.length + 1);
  const secret = req.app.locals.env.SESSION_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) {
    const error = new Error('The server session secret is not configured.');
    error.status = 503;
    throw error;
  }
  const signingKey = createHmac('sha256', secret).update(`tti-session:${system}`).digest();
  let payload;
  try {
    if (typeof token !== 'string' || token.length > 2048) throw new Error();
    const [header, body, signature, extra] = token.split('.');
    if (header !== HEADER || !body || !signature || extra !== undefined) throw new Error();
    const actual = Buffer.from(signature, 'base64url');
    const expected = createHmac('sha256', signingKey).update(`${header}.${body}`).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const seconds = Math.floor(Date.now() / 1000);
    if (payload.system !== system || payload.aud !== definition.audience || !Number.isInteger(payload.sub) || payload.sub <= 0 || payload.sub > 2147483647 || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat) || payload.exp <= seconds || payload.iat > seconds + 60 || payload.exp <= payload.iat) throw new Error();
  } catch {
    {
      const error = new Error('Please sign in to this system to continue.');
      error.status = 401;
      throw error;
    }
  }
  const result = await request().input('id', sql.Int, payload.sub).query(`SELECT id, name, username, cpnumber, email, photo, role, isActive FROM dbo.${definition.table} WHERE id=@id AND isActive=1`);
  const user = result.recordset[0];
  if (!user || !definition.roles.includes(user.role)) {
    const error = new Error('Your account is inactive or your session has ended.');
    error.status = 401;
    throw error;
  }
  res.locals.user = {
    ...user,
    system
  };
  res.locals.sessionExpiresAt = payload.exp * 1000;
  req[system + 'User'] = res.locals.user;
  next();
});
router.get('/:system/auth/session', (req, res) => res.json({
  user: res.locals.user
}));
router.get('/:system/users', async (req, res) => {
  const system = req.params.system;
  if (!Object.hasOwn(AUTH_SYSTEMS, system)) {
    const error = new Error('This system API was not found.');
    error.status = 404;
    throw error;
  }
  const definition = AUTH_SYSTEMS[system];
  if (res.locals.user?.system !== system || !definition.roles.includes(res.locals.user.role) || !(res.locals.user.role === 'admin' || system === 'sales' && res.locals.user.role === 'saleshead')) {
    const error = new Error('This account cannot manage users in this system.');
    error.status = 403;
    throw error;
  }
  const result = await request().query(`SELECT id, name, username, cpnumber, email, photo, role, isActive FROM dbo.${definition.table} ${res.locals.user.role === 'saleshead' ? "WHERE role='sales'" : ''} ORDER BY id`);
  res.json({
    records: result.recordset.map(user => ({
      ...user,
      system
    }))
  });
});
router.get('/:system/users/:id', async (req, res) => {
  const system = req.params.system;
  if (!Object.hasOwn(AUTH_SYSTEMS, system)) {
    const error = new Error('This system API was not found.');
    error.status = 404;
    throw error;
  }
  const definition = AUTH_SYSTEMS[system];
  if (res.locals.user?.system !== system || !definition.roles.includes(res.locals.user.role) || !(res.locals.user.role === 'admin' || system === 'sales' && res.locals.user.role === 'saleshead')) {
    const error = new Error('This account cannot manage users in this system.');
    error.status = 403;
    throw error;
  }
  const result = await request().input('id', sql.Int, Number(req.params.id)).query(`SELECT id, name, username, cpnumber, email, photo, role, isActive FROM dbo.${definition.table} WHERE id=@id`);
  if (!result.recordset.length) {
    const error = new Error('The system account could not be found.');
    error.status = 404;
    throw error;
  }
  if ((res.locals.user.role !== 'admin' && result.recordset[0].role !== 'sales')) {
    const error = new Error('This account cannot view that user.');
    error.status = 403;
    throw error;
  }
  res.json({
    record: {
      ...result.recordset[0],
      system
    }
  });
});
router.post('/:system/users', async (req, res) => {
  const system = req.params.system;
  if (!Object.hasOwn(AUTH_SYSTEMS, system)) {
    const error = new Error('This system API was not found.');
    error.status = 404;
    throw error;
  }
  const definition = AUTH_SYSTEMS[system];
  const actor = res.locals.user;
  if (actor?.system !== system || !definition.roles.includes(actor.role) || !(actor.role === 'admin' || system === 'sales' && actor.role === 'saleshead')) {
    const error = new Error('This account cannot manage users in this system.');
    error.status = 403;
    throw error;
  }
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
  if ((!definition.roles.includes(input.role) || (actor.role !== 'admin' && input.role !== 'sales'))) {
    const error = new Error('This account cannot assign that role.');
    error.status = 403;
    throw error;
  }
  if (typeof input.password !== 'string' || !input.password || input.password.length > 128) {
    const error = new Error('Invalid account password.');
    error.status = 400;
    throw error;
  }
  const salt = randomBytes(16).toString('hex');
  const hash = await promisify(scrypt)(input.password, salt, 64);
  const passwordHash = `scrypt$${salt}$${hash.toString('hex')}`;
  const savedId = await transaction(async scope => {
    const stored = await request(scope).input('id', sql.Int, actor.id).query(`SELECT id, name, username, cpnumber, email, photo, role, isActive FROM dbo.${definition.table} WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`);
    const storedActor = {
      ...stored.recordset[0],
      system
    };
    if (!storedActor.isActive) {
      const error = new Error('Your account is inactive.');
      error.status = 401;
      throw error;
    }
    if (storedActor?.system !== system || !definition.roles.includes(storedActor.role) || !(storedActor.role === 'admin' || system === 'sales' && storedActor.role === 'saleshead')) {
      const error = new Error('This account cannot manage users in this system.');
      error.status = 403;
      throw error;
    }
    if ((!definition.roles.includes(input.role) || (storedActor.role !== 'admin' && input.role !== 'sales'))) {
      const error = new Error('This account cannot assign that role.');
      error.status = 403;
      throw error;
    }
    const role = input.role;
    const isActive = true;
    const query = request(scope).input('name', sql.NVarChar(sql.MAX), String(input.name ?? '').trim()).input('username', sql.NVarChar(sql.MAX), String(input.username ?? '').trim().toLowerCase()).input('cpnumber', sql.NVarChar(sql.MAX), typeof input.cpnumber === 'string' ? input.cpnumber.trim() || null : null).input('email', sql.NVarChar(sql.MAX), typeof input.email === 'string' ? input.email.trim() || null : null).input('photo', sql.NVarChar(sql.MAX), typeof input.photo === 'string' ? input.photo.trim() || null : null).input('role', sql.NVarChar(sql.MAX), role).input('isActive', sql.Bit, isActive);
    query.input('passwordHash', sql.VarChar(sql.MAX), passwordHash);
    const inserted = await query.query(`INSERT INTO dbo.${definition.table}(name,username,cpnumber,email,photo,role,isActive,passwordHash,createdAt,updatedAt) OUTPUT INSERTED.id VALUES(@name,@username,@cpnumber,@email,@photo,@role,@isActive,@passwordHash,SYSUTCDATETIME(),SYSUTCDATETIME())`);
    const id = inserted.recordset[0].id;
    await request(scope).input('userId', sql.Int, actor.id).input('userName', sql.NVarChar(sql.MAX), storedActor.name).input('recordId', sql.NVarChar(sql.MAX), String(id)).input('system', sql.NVarChar(sql.MAX), system).query("INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,'users','create',@recordId,SYSUTCDATETIME())");
    return id;
  });
  const result = await request().input('id', sql.Int, savedId).query(`SELECT id, name, username, cpnumber, email, photo, role, isActive FROM dbo.${definition.table} WHERE id=@id`);
  res.status(201).json({
    record: {
      ...result.recordset[0],
      system
    }
  });
});
router.put('/:system/users/:id', async (req, res) => {
  const system = req.params.system;
  if (!Object.hasOwn(AUTH_SYSTEMS, system)) {
    const error = new Error('This system API was not found.');
    error.status = 404;
    throw error;
  }
  const definition = AUTH_SYSTEMS[system];
  const actor = res.locals.user;
  if (actor?.system !== system || actor.role !== 'admin') {
    const error = new Error('Only administrators can manage accounts.');
    error.status = 403;
    throw error;
  }
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
  const id = Number(req.params.id);
  if ((!definition.roles.includes(input.role) || (actor.role !== 'admin' && input.role !== 'sales'))) {
    const error = new Error('This account cannot assign that role.');
    error.status = 403;
    throw error;
  }
  let passwordHash;
  if (input.password) {
    if (typeof input.password !== 'string' || input.password.length > 128) {
      const error = new Error('Invalid account password.');
      error.status = 400;
      throw error;
    }
    const salt = randomBytes(16).toString('hex');
    const hash = await promisify(scrypt)(input.password, salt, 64);
    passwordHash = `scrypt$${salt}$${hash.toString('hex')}`;
  }
  const savedId = await transaction(async scope => {
    const stored = await request(scope).input('id', sql.Int, actor.id).query(`SELECT id, name, username, cpnumber, email, photo, role, isActive FROM dbo.${definition.table} WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`);
    const storedActor = {
      ...stored.recordset[0],
      system
    };
    if (!storedActor.isActive) {
      const error = new Error('Your account is inactive.');
      error.status = 401;
      throw error;
    }
    if (storedActor?.system !== system || storedActor.role !== 'admin') {
      const error = new Error('Only administrators can manage accounts.');
      error.status = 403;
      throw error;
    }
    const role = input.role;
    const isActive = input.isActive ?? true;
    const currentResult = await request(scope).input('id', sql.Int, id).query(`SELECT id, name, username, cpnumber, email, photo, role, isActive FROM dbo.${definition.table} WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`);
    const current = currentResult.recordset[0];
    if (!current) {
      const error = new Error('The system account could not be found.');
      error.status = 404;
      throw error;
    }
    if (id === storedActor.id && (!isActive || role !== 'admin')) {
      const error = new Error('Keep your own administrator account active with the admin role.');
      error.status = 400;
      throw error;
    }
    if (current.role === 'admin' && current.isActive && (role !== 'admin' || !isActive)) {
      const admins = await request(scope).query(`SELECT COUNT(*) AS total FROM dbo.${definition.table} WITH (UPDLOCK,HOLDLOCK) WHERE role='admin' AND isActive=1`);
      if (admins.recordset[0].total <= 1) {
        const error = new Error('At least one active administrator is required in this system.');
        error.status = 409;
        throw error;
      }
    }
    const query = request(scope).input('name', sql.NVarChar(sql.MAX), String(input.name ?? '').trim()).input('username', sql.NVarChar(sql.MAX), String(input.username ?? '').trim().toLowerCase()).input('cpnumber', sql.NVarChar(sql.MAX), typeof input.cpnumber === 'string' ? input.cpnumber.trim() || null : null).input('email', sql.NVarChar(sql.MAX), typeof input.email === 'string' ? input.email.trim() || null : null).input('photo', sql.NVarChar(sql.MAX), typeof input.photo === 'string' ? input.photo.trim() || null : null).input('role', sql.NVarChar(sql.MAX), role).input('isActive', sql.Bit, isActive);
    if (passwordHash) query.input('passwordHash', sql.VarChar(sql.MAX), passwordHash);
    await query.input('id', sql.Int, id).query(`UPDATE dbo.${definition.table} SET name=@name,username=@username,cpnumber=@cpnumber,email=@email,photo=@photo,role=@role,isActive=@isActive,updatedAt=SYSUTCDATETIME()${passwordHash ? ',passwordHash=@passwordHash' : ''} WHERE id=@id`);
    await request(scope).input('userId', sql.Int, actor.id).input('userName', sql.NVarChar(sql.MAX), storedActor.name).input('recordId', sql.NVarChar(sql.MAX), String(id)).input('system', sql.NVarChar(sql.MAX), system).query("INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,'users','update',@recordId,SYSUTCDATETIME())");
    return id;
  });
  const result = await request().input('id', sql.Int, savedId).query(`SELECT id, name, username, cpnumber, email, photo, role, isActive FROM dbo.${definition.table} WHERE id=@id`);
  res.json({
    record: {
      ...result.recordset[0],
      system
    }
  });
});
router.put('/:system/auth/profile', async (req, res) => {
  const system = req.params.system;
  if (!Object.hasOwn(AUTH_SYSTEMS, system)) {
    const error = new Error('This system API was not found.');
    error.status = 404;
    throw error;
  }
  const definition = AUTH_SYSTEMS[system];
  const actor = res.locals.user;
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
  const id = actor.id;
  const savedId = await transaction(async scope => {
    const stored = await request(scope).input('id', sql.Int, actor.id).query(`SELECT id, name, username, cpnumber, email, photo, role, isActive FROM dbo.${definition.table} WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`);
    const storedActor = {
      ...stored.recordset[0],
      system
    };
    if (!storedActor.isActive) {
      const error = new Error('Your account is inactive.');
      error.status = 401;
      throw error;
    }
    const role = storedActor.role;
    const isActive = storedActor.isActive;
    const query = request(scope).input('name', sql.NVarChar(sql.MAX), String(input.name ?? '').trim()).input('username', sql.NVarChar(sql.MAX), String(input.username ?? '').trim().toLowerCase()).input('cpnumber', sql.NVarChar(sql.MAX), typeof input.cpnumber === 'string' ? input.cpnumber.trim() || null : null).input('email', sql.NVarChar(sql.MAX), typeof input.email === 'string' ? input.email.trim() || null : null).input('photo', sql.NVarChar(sql.MAX), typeof input.photo === 'string' ? input.photo.trim() || null : null).input('role', sql.NVarChar(sql.MAX), role).input('isActive', sql.Bit, isActive);
    await query.input('id', sql.Int, id).query(`UPDATE dbo.${definition.table} SET name=@name,username=@username,cpnumber=@cpnumber,email=@email,photo=@photo,role=@role,isActive=@isActive,updatedAt=SYSUTCDATETIME() WHERE id=@id`);
    await request(scope).input('userId', sql.Int, actor.id).input('userName', sql.NVarChar(sql.MAX), storedActor.name).input('recordId', sql.NVarChar(sql.MAX), String(id)).input('system', sql.NVarChar(sql.MAX), system).query("INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@userId,@userName,@system,'users','profile',@recordId,SYSUTCDATETIME())");
    return id;
  });
  const result = await request().input('id', sql.Int, savedId).query(`SELECT id, name, username, cpnumber, email, photo, role, isActive FROM dbo.${definition.table} WHERE id=@id`);
  res.json({
    user: {
      ...result.recordset[0],
      system
    }
  });
});
router.all('/:system/auth/session', (req, res) => res.set('Allow', 'GET').status(405).json({ message: 'This request method is not supported.' }));
router.all('/:system/auth/profile', (req, res) => res.set('Allow', 'PUT').status(405).json({ message: 'This request method is not supported.' }));
router.all('/:system/users', (req, res) => res.set('Allow', 'GET, POST').status(405).json({ message: 'This request method is not supported.' }));
router.all('/:system/users/:id', (req, res) => res.set('Allow', 'GET, PUT').status(405).json({ message: 'This request method is not supported.' }));

module.exports = router;
