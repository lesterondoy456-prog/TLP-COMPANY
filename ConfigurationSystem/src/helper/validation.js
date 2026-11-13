export const CONFIGURATION_FIELD_LENGTHS = {
  "atc": {
    "code": 40,
    "description": 500,
    "accountCode": 100
  },
  "countries": {
    "name": 100
  },
  "customer-categories": {
    "name": 100
  },
  "product-categories": {
    "name": 100
  },
  "supplies-categories": {
    "name": 100
  },
  "warehouses": {
    "code": 40,
    "description": 500
  },
  "locations": {
    "code": 40,
    "description": 500
  },
  "payment-terms": {
    "description": 100
  },
  "units": {
    "description": 150,
    "shortName": 30
  },
  "currencies": {
    "name": 150,
    "shortName": 30,
    "checkName": 150,
    "symbol": 20
  },
  "banks": {
    "name": 200,
    "shortName": 80,
    "accountNo": 100,
    "accountName": 150,
    "swiftCode": 50,
    "branchName": 150,
    "address": 500,
    "accountType": 80,
    "currency": 30,
    "account": 100
  },
  "vat-codes": {
    "code": 40,
    "description": 500,
    "type": 80,
    "class": 80,
    "accountCode": 100
  },
  "audit-trail": {
    "createdAt": 150,
    "system": 150,
    "userName": 150,
    "module": 150,
    "action": 150,
    "recordId": 150
  }
};

export function withConfigurationValidation(metadata) {
  if (!metadata) return metadata;
  const lengths = CONFIGURATION_FIELD_LENGTHS[metadata.kind] || {};
  return { ...metadata, fields: metadata.fields.map(field => {
    const { maxLength: backendLength, ...definition } = field;
    return { ...definition, ...(lengths[field.key] === undefined ? {} : { maxLength: lengths[field.key] }) };
  }) };
}

const invalid = (field, message) => {
  const error = new Error(message);
  error.field = field;
  throw error;
};

export function validateConfiguration(metadata, input, current) {
  metadata = withConfigurationValidation(metadata);
  if (!metadata || metadata.readOnly) invalid('', 'This configuration module is read-only.');
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('', 'Check the configuration fields before saving.');
  const result = {};
  for (const field of [...metadata.fields, { key: 'isActive', label: 'Active', type: 'boolean', default: true }]) {
    const value = input[field.key] !== undefined ? input[field.key] : current?.[field.key] !== undefined ? current[field.key]
      : field.type === 'boolean' || field.required ? field.default : null;
    if (!field.required && field.type !== 'boolean' && (value == null || (typeof value === 'string' && !value.trim()))) {
      result[field.key] = null;
      continue;
    }
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') invalid(field.key, `${field.label} must be true or false.`);
      result[field.key] = value;
    } else if (field.type === 'number') {
      if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) invalid(field.key, `${field.label} must be a number.`);
      const numeric = Number(value);
      if (numeric < field.min || numeric > field.max || (field.integer && !Number.isInteger(numeric)) || (!field.integer && Math.abs(numeric * 10 ** field.precision - Math.round(numeric * 10 ** field.precision)) > 1e-5)) invalid(field.key, `${field.label} is outside its supported range or decimal precision.`);
      result[field.key] = numeric;
    } else {
      if (typeof value !== 'string' || value.trim().length > field.maxLength || value.includes('\0')) invalid(field.key, `${field.label} must contain at most ${field.maxLength} characters.`);
      const clean = value.trim();
      if (field.required && !clean) invalid(field.key, `${field.label} is required.`);
      if (field.options && !field.options.includes(clean)) invalid(field.key, `Choose a supported ${field.label}.`);
      result[field.key] = clean;
    }
  }
  return result;
}

export function validateAccountForm(input, { existing = false, profile = false } = {}) {
  const body = {};
  for (const [key, label, max] of [['name', 'Full name', 150], ['username', 'Username', 80], ['cpnumber', 'Mobile number', 30], ['email', 'Email', 254], ['photo', 'Photo', 750000]]) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.trim().length > max || value.includes('\0')) invalid(key, `${label} must contain at most ${max} characters.`);
    body[key] = ['name', 'username'].includes(key) ? value.trim() : value.trim() || null;
  }
  if (!body.name) invalid('name', 'Full name is required.');
  body.username = body.username.toLowerCase();
  if (!/^[a-z0-9._-]{3,80}$/.test(body.username)) invalid('username', 'Username must contain 3-80 letters, numbers, dots, underscores or hyphens.');
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) invalid('email', 'Enter a valid email address.');
  if (body.photo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(body.photo)) {
    let url;
    try { url = new URL(body.photo); } catch { invalid('photo', 'Photo must be an image upload or an HTTPS image URL.'); }
    if (url.protocol !== 'https:' || url.username || url.password) invalid('photo', 'Photo must be an image upload or an HTTPS image URL.');
  }
  if (!profile) {
    if (!['admin', 'configuration'].includes(input.role)) invalid('role', 'Choose Administrator or Configuration.');
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
  if (file.size > 250 * 1024) invalid('photo', 'Choose a photo smaller than 250 KB.');
  return file;
}
