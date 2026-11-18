const express = require('express');
const { createHash } = require('node:crypto');
const { request, sql, transaction } = require('../db');
const router = express.Router();
const OWNER_SYSTEMS = ['sales', 'purchasing', 'warehouse', 'configuration'];
const STATUSES = ['pending', 'in-progress', 'declined', 'ongoing', 'complete'];

router.use((req, res, next) => {
  const user = res.locals.user;
  if (!user?.isActive || !Number.isInteger(user.id) || user.id <= 0 || !(OWNER_SYSTEMS.includes(user.system) || user.system === 'itticket' && ['admin', 'it'].includes(user.role))) throw Object.assign(new Error('Sign in to your own system to use IT Help Desk.'), { status: 401 });
  next();
});

router.get('/tickets', async (req, res) => {
  const user = res.locals.user;
  const manager = user.system === 'itticket';
  const category = req.query.category || null;
  const status = req.query.status || null;
  const ownerSystem = manager ? req.query.ownerSystem || null : null;
  if (category !== null && !['request', 'support'].includes(category) || status !== null && !STATUSES.includes(status) || ownerSystem !== null && !OWNER_SYSTEMS.includes(ownerSystem)) throw Object.assign(new Error('Choose a valid ticket filter.'), { status: 400 });
  const result = await request().input('manager', sql.Bit, manager).input('ownerSystem', sql.NVarChar(sql.MAX), user.system).input('ownerId', sql.Int, user.id)
    .input('category', sql.NVarChar(sql.MAX), category).input('status', sql.NVarChar(sql.MAX), status).input('filterSystem', sql.NVarChar(sql.MAX), ownerSystem).query(`SELECT t.id,t.number,t.ownerSystem,t.ownerId,t.ownerName,t.category,t.note,t.status,t.version,
      CONVERT(varchar(33),t.createdAt,126)+'Z' AS createdAt,CONVERT(varchar(33),t.updatedAt,126)+'Z' AS updatedAt,
      (SELECT COUNT(*) FROM dbo.ITTicketAttachments a WHERE a.ticketId=t.id) AS attachmentCount
      FROM dbo.ITTickets t WHERE (@manager=1 OR (t.ownerSystem=@ownerSystem AND t.ownerId=@ownerId))
        AND (@category IS NULL OR t.category=@category) AND (@status IS NULL OR t.status=@status) AND (@filterSystem IS NULL OR t.ownerSystem=@filterSystem)
      ORDER BY t.id DESC`);
  res.json({ records: result.recordset });
});

router.get('/tickets/:id', async (req, res) => {
  const user = res.locals.user;
  const manager = user.system === 'itticket';
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw Object.assign(new Error('Choose a valid ticket.'), { status: 400 });
  const detailResult = await request().input('id', sql.Int, id).input('manager', sql.Bit, manager).input('ownerSystem', sql.NVarChar(sql.MAX), user.system).input('ownerId', sql.Int, user.id).query(`SELECT t.id,t.number,t.ownerSystem,t.ownerId,t.ownerName,t.category,t.note,t.status,t.version,
  CONVERT(varchar(33),t.createdAt,126)+'Z' AS createdAt,CONVERT(varchar(33),t.updatedAt,126)+'Z' AS updatedAt
  FROM dbo.ITTickets t WHERE t.id=@id AND (@manager=1 OR (t.ownerSystem=@ownerSystem AND t.ownerId=@ownerId))`);
  const record = detailResult.recordset[0];
  if (!record) throw Object.assign(new Error('The ticket could not be found.'), { status: 404 });
  const historyResult = await request().input('id', sql.Int, id).query(`SELECT h.id,h.ticketId,h.kind,h.status,h.note,COALESCE(correction.note,h.note) AS displayNote,h.targetHistoryId,
  h.actorSystem,h.actorId,h.actorName,CONVERT(varchar(33),h.createdAt,126)+'Z' AS createdAt,
  CONVERT(varchar(33),correction.createdAt,126)+'Z' AS noteEditedAt,correction.actorName AS noteEditedBy
  FROM dbo.ITTicketHistory h OUTER APPLY (SELECT TOP(1) changed.note,changed.createdAt,changed.actorName
    FROM dbo.ITTicketHistory changed WHERE changed.ticketId=h.ticketId AND changed.kind=N'note-edit' AND changed.targetHistoryId=h.id ORDER BY changed.id DESC) correction
  WHERE h.ticketId=@id ORDER BY h.id`);
  const attachmentResult = await request().input('id', sql.Int, id).query('SELECT id,ticketId,name,type,bytes FROM dbo.ITTicketAttachments WHERE ticketId=@id ORDER BY id');
  record.history = historyResult.recordset;
  record.attachments = attachmentResult.recordset.map(item => ({ ...item, downloadUrl: `/api/${user.system}${manager ? '' : '/helpdesk'}/tickets/${record.id}/attachments/${item.id}` }));

  res.json({ record });
});

router.post('/tickets', async (req, res) => {
  const user = res.locals.user;
  const manager = user.system === 'itticket';
  if (manager) throw Object.assign(new Error('Create requests from your business system Help Desk.'), { status: 403 });
  if (!req.is('application/json')) throw Object.assign(new Error('Send this request as JSON.'), { status: 415 });
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['requestKey', 'category', 'note', 'attachments'].includes(key))) throw Object.assign(new Error('Send a valid ticket request.'), { status: 400 });
  const requestKey = typeof input.requestKey === 'string' ? input.requestKey.replaceAll('-', '').toLowerCase() : '';
  if (!/^[a-f0-9]{32}$/.test(requestKey)) throw Object.assign(new Error('A valid ticket request key is required.'), { status: 400 });
  const category = input.category;
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!['request', 'support'].includes(category) || !note) throw Object.assign(new Error('Select Request or Support and enter a note.'), { status: 400 });
  const submittedFiles = input.attachments === undefined ? [] : input.attachments;
  if (!Array.isArray(submittedFiles) || submittedFiles.length > 5 || category === 'request' && submittedFiles.length) throw Object.assign(new Error('Only Support tickets may include up to five attachments.'), { status: 400 });
  const allowedTypes = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };
  const files = submittedFiles.map(file => {
    if (!file || typeof file !== 'object' || Array.isArray(file) || Object.keys(file).some(key => !['name', 'type', 'data'].includes(key))) throw Object.assign(new Error('Send a valid attachment.'), { status: 400 });
    const name = typeof file.name === 'string' ? file.name.trim() : '';
    const type = typeof file.type === 'string' ? file.type.trim().toLowerCase() : '';
    const extension = name.split('.').at(-1)?.toLowerCase();
    if (!name || name.length > 255 || /[\\/\x00-\x1f\x7f]/.test(name) || !Object.hasOwn(allowedTypes, extension) || allowedTypes[extension] !== type) throw Object.assign(new Error('Use PDF, supported images, or Word, Excel and PowerPoint documents with their matching file type.'), { status: 400 });
    if (typeof file.data !== 'string' || file.data.length > 13981016 || file.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw Object.assign(new Error('Send valid base64 attachment data, at most 10 MiB per file.'), { status: 400 });
    const data = Buffer.from(file.data, 'base64');
    if (!data.length || data.length > 10485760 || data.toString('base64') !== file.data) throw Object.assign(new Error('Each attachment must contain valid data and be at most 10 MiB.'), { status: 400 });
    const prefix = data.subarray(0, 12);
    const signatureValid = extension === 'pdf' ? prefix.subarray(0, 5).toString('ascii') === '%PDF-'
      : extension === 'png' ? prefix.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : ['jpg', 'jpeg'].includes(extension) ? prefix.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
      : extension === 'gif' ? ['GIF87a', 'GIF89a'].includes(prefix.subarray(0, 6).toString('ascii'))
      : extension === 'webp' ? prefix.subarray(0, 4).toString('ascii') === 'RIFF' && prefix.subarray(8, 12).toString('ascii') === 'WEBP'
      : ['docx', 'xlsx', 'pptx'].includes(extension) ? prefix.subarray(0, 4).equals(Buffer.from('504b0304', 'hex'))
      : prefix.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
    if (!signatureValid) throw Object.assign(new Error('The attachment contents do not match its file type.'), { status: 400 });
    return { name, type, data, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  });
  const requestHash = createHash('sha256').update(JSON.stringify({ category, note, files: files.map(({ name, type, bytes, sha256 }) => ({ name, type, bytes, sha256 })) })).digest('hex');
  const saved = await transaction(async tx => {
    const previous = await request(tx).input('ownerSystem', sql.NVarChar(sql.MAX), user.system).input('ownerId', sql.Int, user.id).input('requestKey', sql.VarChar(sql.MAX), requestKey).query(`SELECT id,requestHash FROM dbo.ITTickets WITH (UPDLOCK,HOLDLOCK)
      WHERE ownerSystem=@ownerSystem AND ownerId=@ownerId AND requestKey=CAST(@requestKey AS char(32))`);
    if (previous.recordset.length) {
      if (previous.recordset[0].requestHash !== requestHash) throw Object.assign(new Error('This request key was already used for another ticket.'), { status: 409 });
      return { id: previous.recordset[0].id, replayed: true };
    }
    const inserted = await request(tx).input('ownerSystem', sql.NVarChar(sql.MAX), user.system).input('ownerId', sql.Int, user.id).input('ownerName', sql.NVarChar(sql.MAX), user.name || user.username)
      .input('requestKey', sql.VarChar(sql.MAX), requestKey).input('requestHash', sql.VarChar(sql.MAX), requestHash).input('category', sql.NVarChar(sql.MAX), category).input('note', sql.NVarChar(sql.MAX), note).query(`INSERT INTO dbo.ITTickets
      (ownerSystem,ownerId,ownerName,requestKey,requestHash,category,note,status,version,createdAt,updatedAt) OUTPUT INSERTED.id
      VALUES(@ownerSystem,@ownerId,@ownerName,@requestKey,@requestHash,@category,@note,N'pending',1,SYSUTCDATETIME(),SYSUTCDATETIME())`);
    const id = inserted.recordset[0].id;
    await request(tx).input('id', sql.Int, id).input('number', sql.VarChar(sql.MAX), 'IT-' + String(id).padStart(8, '0')).query('UPDATE dbo.ITTickets SET number=@number WHERE id=@id');
    await request(tx).input('id', sql.Int, id).input('note', sql.NVarChar(sql.MAX), note).input('actorSystem', sql.NVarChar(sql.MAX), user.system).input('actorId', sql.Int, user.id).input('actorName', sql.NVarChar(sql.MAX), user.name || user.username).query(`INSERT INTO dbo.ITTicketHistory
      (ticketId,kind,status,note,targetHistoryId,actorSystem,actorId,actorName,createdAt) VALUES(@id,N'created',N'pending',@note,NULL,@actorSystem,@actorId,@actorName,SYSUTCDATETIME())`);
    for (const file of files) await request(tx).input('id', sql.Int, id).input('name', sql.NVarChar(sql.MAX), file.name).input('type', sql.NVarChar(sql.MAX), file.type).input('bytes', sql.Int, file.bytes).input('data', sql.VarBinary(sql.MAX), file.data).input('sha256', sql.VarChar(sql.MAX), file.sha256).query(`INSERT INTO dbo.ITTicketAttachments
      (ticketId,name,type,bytes,data,sha256,createdAt) VALUES(@id,@name,@type,@bytes,@data,@sha256,SYSUTCDATETIME())`);
    await request(tx).input('actorId', sql.Int, user.id).input('actorName', sql.NVarChar(sql.MAX), user.name || user.username).input('system', sql.NVarChar(sql.MAX), user.system).input('id', sql.NVarChar(sql.MAX), String(id)).query("INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@actorId,@actorName,@system,'helpdesk','create',@id,SYSUTCDATETIME())");
    return { id, replayed: false };
  });
  const detailResult = await request().input('id', sql.Int, saved.id).input('manager', sql.Bit, manager).input('ownerSystem', sql.NVarChar(sql.MAX), user.system).input('ownerId', sql.Int, user.id).query(`SELECT t.id,t.number,t.ownerSystem,t.ownerId,t.ownerName,t.category,t.note,t.status,t.version,
  CONVERT(varchar(33),t.createdAt,126)+'Z' AS createdAt,CONVERT(varchar(33),t.updatedAt,126)+'Z' AS updatedAt
  FROM dbo.ITTickets t WHERE t.id=@id AND (@manager=1 OR (t.ownerSystem=@ownerSystem AND t.ownerId=@ownerId))`);
  const record = detailResult.recordset[0];
  if (!record) throw Object.assign(new Error('The ticket could not be found.'), { status: 404 });
  const historyResult = await request().input('id', sql.Int, saved.id).query(`SELECT h.id,h.ticketId,h.kind,h.status,h.note,COALESCE(correction.note,h.note) AS displayNote,h.targetHistoryId,
  h.actorSystem,h.actorId,h.actorName,CONVERT(varchar(33),h.createdAt,126)+'Z' AS createdAt,
  CONVERT(varchar(33),correction.createdAt,126)+'Z' AS noteEditedAt,correction.actorName AS noteEditedBy
  FROM dbo.ITTicketHistory h OUTER APPLY (SELECT TOP(1) changed.note,changed.createdAt,changed.actorName
    FROM dbo.ITTicketHistory changed WHERE changed.ticketId=h.ticketId AND changed.kind=N'note-edit' AND changed.targetHistoryId=h.id ORDER BY changed.id DESC) correction
  WHERE h.ticketId=@id ORDER BY h.id`);
  const attachmentResult = await request().input('id', sql.Int, saved.id).query('SELECT id,ticketId,name,type,bytes FROM dbo.ITTicketAttachments WHERE ticketId=@id ORDER BY id');
  record.history = historyResult.recordset;
  record.attachments = attachmentResult.recordset.map(item => ({ ...item, downloadUrl: `/api/${user.system}${manager ? '' : '/helpdesk'}/tickets/${record.id}/attachments/${item.id}` }));

  res.status(saved.replayed ? 200 : 201).json({ record, replayed: saved.replayed });
});

router.patch('/tickets/:id/status', async (req, res) => {
  const user = res.locals.user;
  const manager = user.system === 'itticket';
  if (!manager || !['admin', 'it'].includes(user.role)) throw Object.assign(new Error('Only the separate IT team can change ticket status.'), { status: 403 });
  if (!req.is('application/json')) throw Object.assign(new Error('Send this request as JSON.'), { status: 415 });
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['version', 'status', 'note'].includes(key))) throw Object.assign(new Error('Send a valid status update.'), { status: 400 });
  const id = Number(req.params.id);
  const version = input.version;
  const status = input.status;
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647 || !Number.isInteger(version) || version <= 0 || version >= 2147483647 || !STATUSES.includes(status) || status !== 'ongoing' && !note) throw Object.assign(new Error('Choose a valid status and enter its note. Reload the ticket if needed.'), { status: 400 });
  await transaction(async tx => {
    const currentResult = await request(tx).input('id', sql.Int, id).query('SELECT id,ownerSystem,ownerId,category,status,version FROM dbo.ITTickets WITH (UPDLOCK,HOLDLOCK) WHERE id=@id');
    const current = currentResult.recordset[0];
    if (!current) throw Object.assign(new Error('The ticket could not be found.'), { status: 404 });
    if (current.version !== version) throw Object.assign(new Error('This ticket was updated. Reload it before saving.'), { status: 409 });
    const transitions = current.category === 'request' ? { pending: ['ongoing', 'declined'], ongoing: ['complete', 'declined'] } : { pending: ['in-progress', 'ongoing', 'declined'], 'in-progress': ['ongoing', 'complete', 'declined'], ongoing: ['complete', 'declined'] };
    if (!transitions[current.status]?.includes(status)) throw Object.assign(new Error('This status transition is not allowed for this ticket.'), { status: 409 });
    const updated = await request(tx).input('id', sql.Int, id).input('version', sql.Int, version).input('status', sql.NVarChar(sql.MAX), status).query('UPDATE dbo.ITTickets SET status=@status,version=version+1,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.version WHERE id=@id AND version=@version');
    if (!updated.recordset.length) throw Object.assign(new Error('This ticket was updated. Reload it before saving.'), { status: 409 });
    await request(tx).input('id', sql.Int, id).input('status', sql.NVarChar(sql.MAX), status).input('note', sql.NVarChar(sql.MAX), note).input('actorSystem', sql.NVarChar(sql.MAX), user.system).input('actorId', sql.Int, user.id).input('actorName', sql.NVarChar(sql.MAX), user.name || user.username).query(`INSERT INTO dbo.ITTicketHistory
      (ticketId,kind,status,note,targetHistoryId,actorSystem,actorId,actorName,createdAt) VALUES(@id,N'status',@status,@note,NULL,@actorSystem,@actorId,@actorName,SYSUTCDATETIME())`);
    await request(tx).input('actorId', sql.Int, user.id).input('actorName', sql.NVarChar(sql.MAX), user.name || user.username).input('id', sql.NVarChar(sql.MAX), String(id)).query("INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@actorId,@actorName,'itticket','tickets','status',@id,SYSUTCDATETIME())");
    res.locals.ticketOwner = { system: current.ownerSystem, id: current.ownerId };
  });
  const detailResult = await request().input('id', sql.Int, id).input('manager', sql.Bit, manager).input('ownerSystem', sql.NVarChar(sql.MAX), user.system).input('ownerId', sql.Int, user.id).query(`SELECT t.id,t.number,t.ownerSystem,t.ownerId,t.ownerName,t.category,t.note,t.status,t.version,
  CONVERT(varchar(33),t.createdAt,126)+'Z' AS createdAt,CONVERT(varchar(33),t.updatedAt,126)+'Z' AS updatedAt
  FROM dbo.ITTickets t WHERE t.id=@id AND (@manager=1 OR (t.ownerSystem=@ownerSystem AND t.ownerId=@ownerId))`);
  const record = detailResult.recordset[0];
  if (!record) throw Object.assign(new Error('The ticket could not be found.'), { status: 404 });
  const historyResult = await request().input('id', sql.Int, id).query(`SELECT h.id,h.ticketId,h.kind,h.status,h.note,COALESCE(correction.note,h.note) AS displayNote,h.targetHistoryId,
  h.actorSystem,h.actorId,h.actorName,CONVERT(varchar(33),h.createdAt,126)+'Z' AS createdAt,
  CONVERT(varchar(33),correction.createdAt,126)+'Z' AS noteEditedAt,correction.actorName AS noteEditedBy
  FROM dbo.ITTicketHistory h OUTER APPLY (SELECT TOP(1) changed.note,changed.createdAt,changed.actorName
    FROM dbo.ITTicketHistory changed WHERE changed.ticketId=h.ticketId AND changed.kind=N'note-edit' AND changed.targetHistoryId=h.id ORDER BY changed.id DESC) correction
  WHERE h.ticketId=@id ORDER BY h.id`);
  const attachmentResult = await request().input('id', sql.Int, id).query('SELECT id,ticketId,name,type,bytes FROM dbo.ITTicketAttachments WHERE ticketId=@id ORDER BY id');
  record.history = historyResult.recordset;
  record.attachments = attachmentResult.recordset.map(item => ({ ...item, downloadUrl: `/api/${user.system}${manager ? '' : '/helpdesk'}/tickets/${record.id}/attachments/${item.id}` }));

  res.json({ record });
});

router.patch('/tickets/:id/history/:historyId/note', async (req, res) => {
  const user = res.locals.user;
  const manager = user.system === 'itticket';
  if (!manager || !['admin', 'it'].includes(user.role)) throw Object.assign(new Error('Only the separate IT team can correct history notes.'), { status: 403 });
  if (!req.is('application/json')) throw Object.assign(new Error('Send this request as JSON.'), { status: 415 });
  const input = req.body;
  const id = Number(req.params.id);
  const historyId = Number(req.params.historyId);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['version', 'note'].includes(key))) throw Object.assign(new Error('Send a valid history note correction.'), { status: 400 });
  const version = input.version;
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (![id, historyId].every(value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647) || !Number.isInteger(version) || version <= 0 || version >= 2147483647) throw Object.assign(new Error('Enter a history note and use the current ticket version.'), { status: 400 });
  await transaction(async tx => {
    const currentResult = await request(tx).input('id', sql.Int, id).query('SELECT id,ownerSystem,ownerId,category,status,version FROM dbo.ITTickets WITH (UPDLOCK,HOLDLOCK) WHERE id=@id');
    const current = currentResult.recordset[0];
    if (!current) throw Object.assign(new Error('The ticket could not be found.'), { status: 404 });
    if (current.version !== version) throw Object.assign(new Error('This ticket was updated. Reload it before saving.'), { status: 409 });
    const original = await request(tx).input('id', sql.Int, id).input('historyId', sql.Int, historyId).query('SELECT id,kind,status FROM dbo.ITTicketHistory WITH (UPDLOCK,HOLDLOCK) WHERE id=@historyId AND ticketId=@id');
    if (!original.recordset.length || original.recordset[0].kind === 'note-edit') throw Object.assign(new Error('Choose an original event from this ticket history.'), { status: 404 });
    if (original.recordset[0].status !== 'ongoing' && !note) throw Object.assign(new Error('Enter a note for this history event.'), { status: 400 });
    const updated = await request(tx).input('id', sql.Int, id).input('version', sql.Int, version).query('UPDATE dbo.ITTickets SET version=version+1,updatedAt=SYSUTCDATETIME() OUTPUT INSERTED.version WHERE id=@id AND version=@version');
    if (!updated.recordset.length) throw Object.assign(new Error('This ticket was updated. Reload it before saving.'), { status: 409 });
    await request(tx).input('id', sql.Int, id).input('historyId', sql.Int, historyId).input('status', sql.NVarChar(sql.MAX), original.recordset[0].status).input('note', sql.NVarChar(sql.MAX), note).input('actorSystem', sql.NVarChar(sql.MAX), user.system).input('actorId', sql.Int, user.id).input('actorName', sql.NVarChar(sql.MAX), user.name || user.username).query(`INSERT INTO dbo.ITTicketHistory
      (ticketId,kind,status,note,targetHistoryId,actorSystem,actorId,actorName,createdAt) VALUES(@id,N'note-edit',@status,@note,@historyId,@actorSystem,@actorId,@actorName,SYSUTCDATETIME())`);
    await request(tx).input('actorId', sql.Int, user.id).input('actorName', sql.NVarChar(sql.MAX), user.name || user.username).input('id', sql.NVarChar(sql.MAX), String(id)).query("INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId,createdAt) VALUES(@actorId,@actorName,'itticket','tickets','note-edit',@id,SYSUTCDATETIME())");
    res.locals.ticketOwner = { system: current.ownerSystem, id: current.ownerId };
  });
  const detailResult = await request().input('id', sql.Int, id).input('manager', sql.Bit, manager).input('ownerSystem', sql.NVarChar(sql.MAX), user.system).input('ownerId', sql.Int, user.id).query(`SELECT t.id,t.number,t.ownerSystem,t.ownerId,t.ownerName,t.category,t.note,t.status,t.version,
  CONVERT(varchar(33),t.createdAt,126)+'Z' AS createdAt,CONVERT(varchar(33),t.updatedAt,126)+'Z' AS updatedAt
  FROM dbo.ITTickets t WHERE t.id=@id AND (@manager=1 OR (t.ownerSystem=@ownerSystem AND t.ownerId=@ownerId))`);
  const record = detailResult.recordset[0];
  if (!record) throw Object.assign(new Error('The ticket could not be found.'), { status: 404 });
  const historyResult = await request().input('id', sql.Int, id).query(`SELECT h.id,h.ticketId,h.kind,h.status,h.note,COALESCE(correction.note,h.note) AS displayNote,h.targetHistoryId,
  h.actorSystem,h.actorId,h.actorName,CONVERT(varchar(33),h.createdAt,126)+'Z' AS createdAt,
  CONVERT(varchar(33),correction.createdAt,126)+'Z' AS noteEditedAt,correction.actorName AS noteEditedBy
  FROM dbo.ITTicketHistory h OUTER APPLY (SELECT TOP(1) changed.note,changed.createdAt,changed.actorName
    FROM dbo.ITTicketHistory changed WHERE changed.ticketId=h.ticketId AND changed.kind=N'note-edit' AND changed.targetHistoryId=h.id ORDER BY changed.id DESC) correction
  WHERE h.ticketId=@id ORDER BY h.id`);
  const attachmentResult = await request().input('id', sql.Int, id).query('SELECT id,ticketId,name,type,bytes FROM dbo.ITTicketAttachments WHERE ticketId=@id ORDER BY id');
  record.history = historyResult.recordset;
  record.attachments = attachmentResult.recordset.map(item => ({ ...item, downloadUrl: `/api/${user.system}${manager ? '' : '/helpdesk'}/tickets/${record.id}/attachments/${item.id}` }));

  res.json({ record });
});

router.get('/tickets/:id/attachments/:attachmentId', async (req, res) => {
  const user = res.locals.user;
  const manager = user.system === 'itticket';
  const id = Number(req.params.id);
  const attachmentId = Number(req.params.attachmentId);
  if (![id, attachmentId].every(value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647)) throw Object.assign(new Error('Choose a valid attachment.'), { status: 400 });
  const result = await request().input('id', sql.Int, id).input('attachmentId', sql.Int, attachmentId).input('manager', sql.Bit, manager).input('ownerSystem', sql.NVarChar(sql.MAX), user.system).input('ownerId', sql.Int, user.id).query(`SELECT a.id,a.name,a.type,a.bytes,a.data FROM dbo.ITTicketAttachments a JOIN dbo.ITTickets t ON t.id=a.ticketId
    WHERE a.id=@attachmentId AND a.ticketId=@id AND (@manager=1 OR (t.ownerSystem=@ownerSystem AND t.ownerId=@ownerId))`);
  const attachment = result.recordset[0];
  if (!attachment) throw Object.assign(new Error('The attachment could not be found.'), { status: 404 });
  const safeName = attachment.name.replace(/[^A-Za-z0-9._ -]/g, '_');
  const encodedName = encodeURIComponent(attachment.name).replace(/['()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
  res.set('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);
  res.set('Content-Type', attachment.type);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'no-store');
  res.send(attachment.data);
});

for (const [path, methods] of [['/tickets', ['GET', 'POST']], ['/tickets/:id', ['GET']], ['/tickets/:id/status', ['PATCH']], ['/tickets/:id/history/:historyId/note', ['PATCH']], ['/tickets/:id/attachments/:attachmentId', ['GET']]]) router.all(path, (req, res) => res.set('Allow', methods.join(', ')).status(405).json({ message: 'This request method is not supported.' }));
module.exports = router;
