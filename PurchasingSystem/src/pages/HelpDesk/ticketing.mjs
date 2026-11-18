export const STATUS_LABELS = { pending: 'Pending', 'in-progress': 'In progress', declined: 'Declined', ongoing: 'On going', complete: 'Complete' };
export const CATEGORY_LABELS = { request: 'Request', support: 'Support Request' };
export const SYSTEM_LABELS = { sales: 'Sales', purchasing: 'Purchasing', warehouse: 'Warehouse', configuration: 'Configuration', itticket: 'IT Support' };
export const FILE_TYPES = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
export const FILE_ACCEPT = Object.keys(FILE_TYPES).map(extension => '.' + extension).join(',');
export function ticketTime(value) {
  if (!value) return '—';
  const text = String(value);
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(text) ? text : text + 'Z');
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(date) + ' PHT';
}
export function fileSize(bytes) { return bytes < 1024 * 1024 ? Math.ceil(bytes / 1024) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB'; }
export function validateTicketFiles(files) {
  if (files.length > 5) throw new Error('Attach at most 5 files.');
  return files.map(file => {
    const extension = file.name.split('.').pop().toLowerCase();
    const type = FILE_TYPES[extension];
    if (!type || file.type && file.type !== type) throw new Error('Choose PDF, PNG, JPG, GIF, WebP, Word, Excel or PowerPoint files.');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Each attachment must be nonempty and no larger than 10 MB.');
    return { file, type };
  });
}
export function readTicketFile({ file, type }) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type, data: String(reader.result).split(',')[1] });
    reader.onerror = () => reject(new Error('An attachment could not be read. Choose the file again.'));
    reader.readAsDataURL(file);
  });
}
export function nextTicketStatuses(record) {
  if (record.category === 'request') return { pending: ['ongoing', 'declined'], ongoing: ['complete', 'declined'] }[record.status] || [];
  return { pending: ['in-progress', 'ongoing', 'declined'], 'in-progress': ['ongoing', 'complete', 'declined'], ongoing: ['complete', 'declined'] }[record.status] || [];
}
