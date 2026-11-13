import { request, sql, transaction } from './database.js';
import { ApiError, USER_COLUMNS, hashPassword, requireAccountManager } from './components/auth.js';
import { systemDefinition, canReadSystemAccount, canCreateSystemAccount, canEditSystemAccount } from './components/auth-scope.js';
import { ownProfilePrivileges } from './components/roles.js';
import * as v from './components/validation.js';
import { recordAudit } from './audit.js';

async function accountRecord(id, system, scope, lock = false) {
  const { table } = systemDefinition(system);
  const result = await request(scope).input('id', sql.Int, id).query(`SELECT ${USER_COLUMNS} FROM dbo.${table} ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} WHERE id=@id`);
  if (!result.recordset.length) throw new ApiError(404, 'The system account could not be found.');
  return { ...result.recordset[0], system };
}

export async function listUsers(actor) {
  requireAccountManager(actor);
  const { table } = systemDefinition(actor.system);
  const result = await request().query(`SELECT ${USER_COLUMNS} FROM dbo.${table} ${actor.role === 'saleshead' ? "WHERE role='sales'" : ''} ORDER BY id`);
  return result.recordset.map(user => ({ ...user, system: actor.system }));
}

export async function getUser(id, actor) {
  requireAccountManager(actor);
  const target = await accountRecord(id, actor.system);
  if (!canReadSystemAccount(actor, target)) throw new ApiError(403, 'This account cannot view that user.');
  return target;
}

export async function saveUser(input, actor, id, ownProfile = false) {
  const definition = systemDefinition(actor.system);
  if (ownProfile) {
    if (id !== actor.id) throw new ApiError(403, 'You can only update your own profile.');
  } else {
    requireAccountManager(actor);
    if (id && !canEditSystemAccount(actor)) throw new ApiError(403, 'Only administrators can edit system accounts.');
    if (!id && actor.role === 'saleshead' && !canCreateSystemAccount(actor, input.role)) throw new ApiError(403, 'Sales heads can only create Sales accounts.');
  }
  const name = v.text(input, 'name', 150, true);
  const username = v.username(input);
  const cpnumber = v.text(input, 'cpnumber', 30);
  const email = v.email(input);
  const photo = v.photo(input);
  let { role, isActive } = ownProfile ? ownProfilePrivileges(actor) : { role: input.role, isActive: v.bool(input, 'isActive') };
  if (!definition.roles.includes(role)) throw new ApiError(400, `Role must be ${definition.roles.join(', ')} for this system.`);
  if (!id && !ownProfile && !canCreateSystemAccount(actor, role)) throw new ApiError(403, 'This account cannot create that role.');
  const password = ownProfile ? undefined : v.password(input, !id);
  const passwordHash = password ? await hashPassword(password) : undefined;
  const savedId = await transaction(async scope => {
    const storedActor = await accountRecord(actor.id, actor.system, scope, true);
    if (!storedActor.isActive) throw new ApiError(401, 'Your account is inactive.');
    if (ownProfile) {
      ({ role, isActive } = ownProfilePrivileges(storedActor));
    } else {
      requireAccountManager(storedActor);
      if (id && !canEditSystemAccount(storedActor)) throw new ApiError(403, 'Only administrators can edit system accounts.');
      if (!id && !canCreateSystemAccount(storedActor, role)) throw new ApiError(403, 'This account cannot create that role.');
    }
    if (id) {
      const current = id === storedActor.id ? storedActor : await accountRecord(id, actor.system, scope, true);
      if (!ownProfile && id === storedActor.id && storedActor.role === 'admin' && (!isActive || role !== 'admin')) throw new ApiError(400, 'Keep your own administrator account active with the admin role.');
      if (current.role === 'admin' && current.isActive && (role !== 'admin' || !isActive)) {
        const count = await request(scope).query(`SELECT COUNT(*) AS total FROM dbo.${definition.table} WITH (UPDLOCK,HOLDLOCK) WHERE role='admin' AND isActive=1`);
        if (count.recordset[0].total <= 1) throw new ApiError(409, 'At least one active administrator is required in this system.');
      }
    }
    const req = request(scope).input('name', sql.NVarChar(150), name).input('username', sql.NVarChar(80), username)
      .input('cpnumber', sql.NVarChar(30), cpnumber).input('email', sql.NVarChar(254), email).input('photo', sql.NVarChar(sql.MAX), photo)
      .input('role', sql.NVarChar(20), role).input('isActive', sql.Bit, isActive);
    if (passwordHash) req.input('passwordHash', sql.VarChar(300), passwordHash);
    if (id) {
      await req.input('id', sql.Int, id).query(`UPDATE dbo.${definition.table} SET name=@name,username=@username,cpnumber=@cpnumber,email=@email,
        photo=@photo,role=@role,isActive=@isActive,updatedAt=SYSUTCDATETIME()${passwordHash ? ',passwordHash=@passwordHash' : ''} WHERE id=@id`);
      await recordAudit(scope, storedActor, 'users', ownProfile ? 'profile' : 'update', id);
      return id;
    }
    const result = await req.query(`INSERT INTO dbo.${definition.table}(name,username,cpnumber,email,photo,role,isActive,passwordHash)
      OUTPUT INSERTED.id VALUES(@name,@username,@cpnumber,@email,@photo,@role,@isActive,@passwordHash)`);
    await recordAudit(scope, storedActor, 'users', 'create', result.recordset[0].id);
    return result.recordset[0].id;
  });
  return accountRecord(savedId, actor.system);
}
