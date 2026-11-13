import React, { useEffect, useRef } from 'react';
import { Icon } from './Icons.jsx';
import { validatePhotoFile } from '../helper/validation.js';

export const roleLabel = role => ({ admin: 'Administrator', warehouse: 'Warehouse' })[role] || role;

export function focusModalControl(control) {
  if (!control) return;
  control.focus({ preventScroll: true });
  const body = control.closest('.modal-body');
  if (!body) return;
  const field = control.getBoundingClientRect();
  const viewport = body.getBoundingClientRect();
  if (field.top < viewport.top + 12 || field.bottom > viewport.bottom - 12) {
    body.scrollTop = Math.max(0, body.scrollTop + field.top - viewport.top - 24);
  }
}

export function Avatar({ user, large = false }) {
  const initials = (user?.name || user?.username || 'U').split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  return <span className={'avatar ' + (large ? 'large' : '')}><span>{initials}</span>{user?.photo && <img src={user.photo} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />}</span>;
}
export function Badge({ children, value = children }) { return <span className={'badge badge-' + String(value).toLowerCase()}>{children}</span>; }
export function RequiredLabel({ children, required = false }) {
  const marked = typeof children === 'string' && /\*\s*$/.test(children);
  const label = marked ? children.replace(/\s*\*\s*$/, '') : children;
  return <>{label}{(required || marked) && <span className="required-mark"> *</span>}</>;
}
export function Field({ label, children, wide = false, hint }) { return <label className={'field ' + (wide ? 'span-2' : '')}><span><RequiredLabel>{label}</RequiredLabel></span>{children}{hint && <small>{hint}</small>}</label>; }
export function Modal({ title, subtitle, children, onClose, busy, wide = false, className = '' }) {
  const ref = useRef(null);
  const titleId = React.useId();
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => { if (dialog.open) dialog.close(); }; }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className={'modal ' + (wide ? 'modal-wide ' : '') + className} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="modal-heading"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><Icon name="x" /></button></div>{children}
  </dialog>;
}
export function FormFooter({ onClose, busy, disabled = false, label = 'Save record' }) { return <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button primary" disabled={busy || disabled}>{busy ? 'Saving…' : label}<Icon name="check" size={17} /></button></div>; }
export function Empty({ icon = 'file', title, detail }) { return <div className="empty-state"><div><Icon name={icon} size={28} /></div><h3>{title}</h3><p>{detail}</p></div>; }
export function ErrorNotice({ message }) { return message ? <div className="notice error" role="alert">{message}</div> : null; }
export function PhotoField({ value, onChange, name }) {
  const [error, setError] = React.useState('');
  const fileRef = useRef(null);
  function load(event) {
    const file = event.target.files?.[0]; setError('');
    if (!file) return;
    try { validatePhotoFile(file); } catch (error) { setError(error.message); event.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.onerror = () => setError('This photo could not be read. Please choose another image.');
    reader.readAsDataURL(file);
  }
  return <div className="photo-field span-2"><Avatar large user={{ name, photo: value }} /><div><strong>Profile photo</strong><p>JPG, PNG, or WebP · up to 250 KB</p><div className="photo-actions"><button type="button" className="button secondary small" onClick={() => fileRef.current.click()}>Choose photo</button>{value && <button type="button" className="text-button" onClick={() => { onChange(''); if (fileRef.current) fileRef.current.value = ''; }}>Remove</button>}</div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Profile photo" className="sr-only" onChange={load} />{error && <small className="error-text" role="alert">{error}</small>}</div></div>;
}

export function LoadingSkeleton({ label = 'Loading records', rows = 5 }) {
  return <div className="loading-skeleton" role="status" aria-live="polite">
    <span className="sr-only">{label}</span>
    <div className="skeleton-heading" aria-hidden="true"><span className="skeleton-bar" /><span className="skeleton-bar" /></div>
    {Array.from({ length: rows }, (_, row) => <div className="skeleton-row" aria-hidden="true" key={row}>{Array.from({ length: 4 }, (_, cell) => <span className="skeleton-bar" key={cell} />)}</div>)}
  </div>;
}
