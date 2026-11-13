import { request, sql } from './database.js';
import { systemDefinition } from './components/auth-scope.js';

export async function recordAudit(scope, user, module, action, recordId) {
  systemDefinition(user.system);
  await request(scope)
    .input('userId', sql.Int, user.id)
    .input('userName', sql.NVarChar(150), user.name)
    .input('system', sql.NVarChar(20), user.system)
    .input('module', sql.NVarChar(100), module)
    .input('action', sql.NVarChar(50), action)
    .input('recordId', sql.NVarChar(100), String(recordId))
    .query('INSERT INTO dbo.AuditTrail(userId,userName,system,module,action,recordId) VALUES(@userId,@userName,@system,@module,@action,@recordId)');
}
