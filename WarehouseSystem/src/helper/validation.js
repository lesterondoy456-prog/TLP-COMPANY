export function validateAccountForm(input, { create = false } = {}) {
  if ((create || Object.hasOwn(input, 'role')) && !['admin', 'warehouse'].includes(input.role)) throw new Error('Choose Administrator or Warehouse.');
  for (const [key, label, max, required] of [
    ['name', 'Full name', 150, true], ['username', 'Username', 80, create],
    ['cpnumber', 'Mobile number', 30, false], ['email', 'Email', 254, false],
  ]) {
    const value = String(input[key] ?? '').trim();
    if (required && !value) throw new Error(`${label} is required.`);
    if (value.length > max || value.includes('\0')) throw new Error(`${label} must contain at most ${max} characters.`);
  }
  if (create && !/^[a-z0-9._-]{3,80}$/i.test(String(input.username || '').trim())) throw new Error('Username must contain 3–80 letters, numbers, dots, underscores or hyphens.');
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) throw new Error('Enter a valid email address.');
  if ((create || input.password) && (typeof input.password !== 'string' || input.password.length < 6 || input.password.length > 128)) throw new Error('Password must contain 6-128 characters.');
  if (input.photo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(input.photo)) {
    let imageUrl;
    try { imageUrl = new URL(input.photo); } catch { throw new Error('Choose a valid profile photo.'); }
    if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password) throw new Error('Choose a valid profile photo.');
  }
}

export function validateLoginForm(input) {
  if (!input.username?.trim() || !input.password) throw new Error('Enter your username and password.');
  if (input.username.trim().length > 80 || input.password.length > 128) throw new Error('Check your username and password.');
}

export function validatePhotoFile(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 250 * 1024) throw new Error('Choose a photo smaller than 250 KB.');
}
