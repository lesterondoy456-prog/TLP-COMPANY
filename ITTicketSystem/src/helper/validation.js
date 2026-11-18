const invalid = (field, message) => { const error = new Error(message); error.field = field; throw error; };

export function validateAccountForm(input, { existing = false, profile = false } = {}) {
  const body = {};
  for (const [key, label, max] of [['name', 'Full name', 150], ['cpnumber', 'Mobile number', 30], ['email', 'Email', 254]]) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.trim().length > max || value.includes('\0')) invalid(key, `${label} must contain at most ${max} characters.`);
    body[key] = key === 'name' ? value.trim() : value.trim() || null;
  }
  const photoValue = input.photo ?? '';
  if (typeof photoValue !== 'string' || photoValue.includes('\0')) invalid('photo', 'Photo must be an image upload or an HTTPS image URL.');
  body.photo = photoValue.trim() || null;
  if (!body.name) invalid('name', 'Full name is required.');
  if (!existing && !profile) {
    if (typeof input.username !== 'string') invalid('username', 'Username is required.');
    body.username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,80}$/.test(body.username)) invalid('username', 'Username must contain 3-80 letters, numbers, dots, underscores or hyphens.');
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) invalid('email', 'Enter a valid email address.');
  if (body.photo && !isPhotoDataUrl(body.photo)) {
    let url;
    try { url = new URL(body.photo); } catch { invalid('photo', 'Photo must be an image upload or an HTTPS image URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) invalid('photo', 'Photo must be an image upload or an HTTPS image URL.');
  }
  if (!profile) {
    if (!['admin', 'it'].includes(input.role)) invalid('role', 'Choose Administrator or IT Support.');
    if (typeof input.isActive !== 'boolean') invalid('isActive', 'Account state must be true or false.');
    body.role = input.role;
    body.isActive = input.isActive;
    if (!existing || input.password) {
      if (typeof input.password !== 'string' || input.password.length < 6 || input.password.length > 128) invalid('password', 'Password must contain 6-128 characters.');
      body.password = input.password;
    }
  }
  return body;
}

export function validateLoginForm(input) {
  const username = String(input.username || '').trim();
  if (!username || username.length > 80) invalid('username', 'Enter your username.');
  if (typeof input.password !== 'string' || !input.password || input.password.length > 128) invalid('password', 'Enter your password.');
  return { username, password: input.password, remember: input.remember === true };
}

export function validatePhotoFile(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) invalid('photo', 'Choose a JPG, PNG, or WebP image.');
  return file;
}

function isPhotoDataUrl(value) {
  if (typeof value !== 'string') return false;
  const separator = value.indexOf(',');
  if (separator < 0 || !['data:image/png;base64', 'data:image/jpeg;base64', 'data:image/webp;base64'].includes(value.slice(0, separator))) return false;
  const content = value.slice(separator + 1).replace(/={1,2}$/, '');
  return content.length > 0 && !/[^A-Za-z0-9+/]/.test(content);
}
