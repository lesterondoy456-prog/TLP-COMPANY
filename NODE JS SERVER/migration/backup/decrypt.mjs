import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDecipheriv, createHash } from 'node:crypto';

// Usage: node decrypt.mjs <unlock-key-file> <empty-output-folder>
const [keyFile, destination] = process.argv.slice(2);
if (!keyFile || !destination) {
  console.error('Usage: node decrypt.mjs <unlock-key-file> <output-folder>');
  process.exit(1);
}
const folder = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(destination);
const archive = path.join(output, 'TTICompany-transfer.tar.gz');
const partial = archive + '.partial';
let createdPartial = false;
let outputHandle;
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
  const savedKey = JSON.parse(fs.readFileSync(path.resolve(keyFile), 'utf8').replace(/^\uFEFF/, ''));
  const key = Buffer.from(savedKey.key || '', 'base64');
  if (savedKey.format !== 'TTICompany-transfer-key-v1' || key.length !== 32) throw new Error('Invalid unlock key file.');
  if (manifest.format !== 'TTICompany-transfer-v1' || manifest.cipher !== 'aes-256-gcm' || !Array.isArray(manifest.parts) || !manifest.parts.length) throw new Error('Invalid transfer manifest.');
  if (createHash('sha256').update(key).digest('hex') !== manifest.keyFingerprint) throw new Error('This key belongs to a different transfer package.');
  if (fs.existsSync(archive) || fs.existsSync(partial)) throw new Error('The output archive already exists. Choose another output folder.');
  fs.mkdirSync(output, { recursive: true });
  outputHandle = fs.openSync(partial, 'wx');
  createdPartial = true;
  const archiveHash = createHash('sha256');
  let archiveBytes = 0;
  for (const [index, part] of manifest.parts.entries()) {
    if (!/^TTICompany-transfer-\d{8}\.part\d{3}\.enc$/.test(part.file) || part.number !== index + 1) throw new Error('Invalid part name or order.');
    const encrypted = fs.readFileSync(path.join(folder, part.file));
    if (encrypted.length !== part.encryptedBytes || createHash('sha256').update(encrypted).digest('hex') !== part.sha256) throw new Error('Damaged or incomplete part: ' + part.file);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(part.iv, 'base64'));
    decipher.setAAD(Buffer.from('TTICompany-transfer-v1:' + part.number + ':' + manifest.parts.length));
    decipher.setAuthTag(Buffer.from(part.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    if (plain.length !== part.plaintextBytes) throw new Error('Invalid decoded part length.');
    fs.writeFileSync(outputHandle, plain);
    archiveHash.update(plain);
    archiveBytes += plain.length;
    console.log('Unlocked part ' + part.number + '/' + manifest.parts.length);
  }
  if (archiveBytes !== manifest.archiveBytes || archiveHash.digest('hex') !== manifest.archiveSha256) throw new Error('Archive verification failed.');
  fs.closeSync(outputHandle);
  outputHandle = undefined;
  fs.renameSync(partial, archive);
  createdPartial = false;
  console.log('Verified archive: ' + archive);
  console.log('Extract into an empty folder: tar -xzf "' + archive + '" -C "<destination>"');
} catch (error) {
  if (outputHandle !== undefined) fs.closeSync(outputHandle);
  if (createdPartial) fs.unlinkSync(partial);
  console.error('Unable to unlock transfer: ' + error.message);
  process.exitCode = 1;
}
