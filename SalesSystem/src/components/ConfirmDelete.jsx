import React from 'react';
import { Modal, ErrorNotice } from './UI.jsx';
import useSave from '../hooks/useSave.js';

export default function ConfirmDelete({ record, onDelete, onClose, onSaved }) {
  const { busy, error, save } = useSave(onSaved);
  return <Modal title="Delete this record?" subtitle={record.name || record.number} onClose={onClose} busy={busy}><div className="modal-body"><ErrorNotice message={error} /><p className="delete-description">This permanently removes the record. Records used in sales documents cannot be deleted.</p></div><div className="modal-footer"><button className="button secondary" disabled={busy} onClick={onClose}>Keep record</button><button className="button danger" disabled={busy} onClick={() => save(onDelete)}>{busy ? 'Deleting…' : 'Delete record'}</button></div></Modal>;
}
