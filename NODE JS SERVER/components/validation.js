import { ApiError } from './errors.js';

export function text(input, key, max, required = false) {
  const value = input[key] ?? '';
  if (typeof value !== 'string' || value.trim().length > max || /\x00/.test(value)) throw new ApiError(400, `${key} must be text with at most ${max} characters.`);
  const result = value.trim();
  if (required && !result) throw new ApiError(400, `${key} is required.`);
  return result;
}

export function email(input) {
  const result = text(input, 'email', 254);
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new ApiError(400, 'Enter a valid email address.');
  return result;
}

export function bool(input, key, fallback = true) {
  if (input[key] === undefined) return fallback;
  if (typeof input[key] !== 'boolean') throw new ApiError(400, `${key} must be true or false.`);
  return input[key];
}

export function numeric(input, key, { min = 0, max = 1e9, places = 2 } = {}) {
  const value = input[key];
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) throw new ApiError(400, `${key} must be a valid number.`);
  const number = Number(value);
  if (number < min || number > max || Math.abs(number * 10 ** places - Math.round(number * 10 ** places)) > 1e-5) {
    throw new ApiError(400, `${key} must be between ${min} and ${max}, with at most ${places} decimal places.`);
  }
  return number;
}

export function idValue(value, label = 'id') {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0 || result > 2147483647) throw new ApiError(400, `Enter a valid ${label}.`);
  return result;
}

export function date(input, key) {
  const value = text(input, key, 10, true);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '1900-01-01') {
    throw new ApiError(400, `${key} must be a valid date in YYYY-MM-DD format.`);
  }
  return value;
}

export function photo(input) {
  const value = text(input, 'photo', 750000);
  if (!value) return '';
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
  try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return value; } catch { /* Invalid URL below. */ }
  throw new ApiError(400, 'Photo must be a PNG, JPEG or WebP upload, or an HTTPS image URL.');
}

export function password(input, required = true) {
  if (!required && (input.password === undefined || input.password === '')) return undefined;
  if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) throw new ApiError(400, 'Password must contain 12–128 characters.');
  return input.password;
}

export function username(input) {
  const value = text(input, 'username', 80, true).toLowerCase();
  if (!/^[a-z0-9._-]{3,80}$/.test(value)) throw new ApiError(400, 'Username must contain 3–80 letters, numbers, dots, underscores or hyphens.');
  return value;
}
