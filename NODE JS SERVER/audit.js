import { request, sql } from './database.js';

export async function recordAudit(scope, user, module, action, recordId) {
  await request(scope)
    .input('userId', sql.Int, user.id)
    .input('userName', sql.NVarChar(150), user.name)
    .input('module', sql.NVarChar(100), module)
    .input('action', sql.NVarChar(50), action)
    .input('recordId', sql.NVarChar(100), String(recordId))
    .query('INSERT INTO dbo.AuditTrail(userId,userName,module,action,recordId) VALUES(@userId,@userName,@module,@action,@recordId)');
}
