import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { Icon } from '../../components/Icons.jsx';
import { ErrorNotice, Field, FormFooter, Modal } from '../../components/UI.jsx';
import { CATEGORY_LABELS, FILE_ACCEPT, STATUS_LABELS, SYSTEM_LABELS, fileSize, nextTicketStatuses, readTicketFile, ticketTime, validateTicketFiles } from './ticketing.mjs';
import './HelpDesk.css';

function Status({ value }) { return <span className={'helpdesk-status helpdesk-status-' + value}>{STATUS_LABELS[value] || value}</span>; }

function CreateTicket({ prefix, onClose, onSaved }) {
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestKey] = useState(() => crypto.randomUUID());
  const fileInput = useRef(null);
  function chooseFiles(event) {
    setError('');
    try { const next = [...files, ...Array.from(event.target.files || [])]; validateTicketFiles(next); setFiles(next); }
    catch (failure) { setError(failure.message); }
    event.target.value = '';
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!Object.hasOwn(CATEGORY_LABELS, category)) { setError('Choose Request or Support Request.'); event.currentTarget.elements.category?.focus(); return; }
    if (!note.trim()) { setError('Enter the initial note for this ticket.'); event.currentTarget.elements.note?.focus(); return; }
    setBusy(true);
    try {
      const attachments = category === 'support' ? await Promise.all(validateTicketFiles(files).map(readTicketFile)) : [];
      const result = await api(prefix, { method: 'POST', body: { requestKey, category, note: note.trim(), attachments } });
      onSaved(result.record);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title="New help desk ticket" subtitle="Send a request or describe a support concern to IT." onClose={onClose} busy={busy} className="helpdesk-create-modal">
    <form onSubmit={submit} noValidate><div className="modal-body"><ErrorNotice message={error} /><fieldset disabled={busy} className="helpdesk-form">
      <Field label="Category *"><select name="category" aria-label="Ticket category" required value={category} onChange={event => { setCategory(event.target.value); setFiles([]); setError(''); }}><option value="">Choose a category</option><option value="request">Request</option><option value="support">Support Request</option></select></Field>
      <p className="field-hint">{category === 'request' ? 'Request an item or service. IT will confirm when it can proceed.' : category === 'support' ? 'Describe the problem, what happened and the help you need.' : 'Choose the category that matches the help you need.'}</p>
      <Field label="Initial note *"><textarea name="note" aria-label="Initial note" rows={6} required maxLength={4000} value={note} onChange={event => setNote(event.target.value)} placeholder={category === 'request' ? 'Describe what you need and why…' : 'Describe the issue and the help you need…'} /></Field>
      {category === 'support' && <section className="helpdesk-upload"><h3>Attachments <span>Optional</span></h3><p>Up to 5 files, 10 MB each. PDF, images, Word, Excel or PowerPoint.</p><input ref={fileInput} type="file" multiple accept={FILE_ACCEPT} aria-label="Support attachments" onChange={chooseFiles} /><ul>{files.map((file, index) => <li key={file.name + index}><Icon name="file" size={16} /><span>{file.name}<small>{fileSize(file.size)}</small></span><button type="button" className="icon-button" aria-label={'Remove attachment ' + file.name} onClick={() => setFiles(current => current.filter((_, position) => position !== index))}><Icon name="x" size={16} /></button></li>)}</ul></section>}
    </fieldset></div><FormFooter busy={busy} onClose={onClose} label="Submit ticket" /></form>
  </Modal>;
}

function StatusChange({ prefix, record, status, onClose, onSaved }) {
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const proceed = record.category === 'request' && status === 'ongoing';
  const returned = record.category === 'request' && status === 'complete';
  const required = status !== 'ongoing';
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (required && !note.trim()) { setError('Enter a note for this status change.'); event.currentTarget.elements.note?.focus(); return; }
    if (returned && !confirmed) { setError('Confirm the verbal item return before completing this request.'); return; }
    setBusy(true);
    try { const result = await api(prefix + '/' + record.id + '/status', { method: 'PATCH', body: { version: record.version, status, note: note.trim() } }); onSaved(result.record); }
    catch (failure) { setError(failure.status === 409 ? failure.message + ' Your note is kept. Close this window and refresh the ticket before trying again.' : failure.message); }
    finally { setBusy(false); }
  }
  const title = proceed ? 'Proceed with this request?' : returned ? 'Confirm returned item' : 'Mark ticket ' + STATUS_LABELS[status].toLowerCase();
  return <Modal title={title} subtitle={record.number} onClose={onClose} busy={busy} className="helpdesk-status-modal"><form onSubmit={submit} noValidate><div className="modal-body"><ErrorNotice message={error} /><fieldset disabled={busy} className="helpdesk-form">
    <div className="helpdesk-transition"><Status value={record.status} /><Icon name="arrowRight" size={17} /><Status value={status} /></div>
    {proceed && <p className="helpdesk-explanation">Confirm that IT will proceed with this request. The requester will see it as On going.</p>}
    {returned && <><p className="helpdesk-explanation">Complete this request after the item has been returned and the return has been verbally confirmed.</p><label className="checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required />The item return was verbally confirmed.</label></>}
    <Field label={required ? 'Status note *' : 'Status note (optional)'}><textarea name="note" aria-label="Status note" rows={5} maxLength={4000} required={required} value={note} onChange={event => setNote(event.target.value)} placeholder={status === 'declined' ? 'Explain why this ticket is declined…' : status === 'complete' ? 'Record the resolution or confirmed return…' : 'Add an update for the requester…'} /></Field>
    <p className="field-hint">The requester can see this note, your name and the date and time of the change.</p>
  </fieldset></div><FormFooter busy={busy} onClose={onClose} label={proceed ? 'Confirm Proceed' : returned ? 'Confirm complete' : 'Save status'} /></form></Modal>;
}

function EditNote({ prefix, record, entry, onClose, onSaved }) {
  const [note, setNote] = useState(entry.displayNote ?? entry.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!note.trim() && entry.status !== 'ongoing') { setError('Enter a status note.'); event.currentTarget.elements.note?.focus(); return; }
    setBusy(true);
    try { const result = await api(prefix + '/' + record.id + '/history/' + entry.id + '/note', { method: 'PATCH', body: { version: record.version, note: note.trim() } }); onSaved(result.record); }
    catch (failure) { setError(failure.status === 409 ? failure.message + ' Your note is kept. Reopen the note after refreshing this ticket.' : failure.message); }
    finally { setBusy(false); }
  }
  return <Modal title="Edit status note" subtitle={record.number + ' · ' + ticketTime(entry.createdAt)} onClose={onClose} busy={busy}><form onSubmit={submit} noValidate><div className="modal-body"><ErrorNotice message={error} /><fieldset disabled={busy} className="helpdesk-form"><p className="helpdesk-explanation">This correction adds an audit event. The original note, author and time remain in the timeline.</p><Field label={entry.status === 'ongoing' ? 'Status note (optional)' : 'Status note *'}><textarea name="note" aria-label="Corrected status note" rows={5} maxLength={4000} value={note} onChange={event => setNote(event.target.value)} /></Field></fieldset></div><FormFooter busy={busy} onClose={onClose} label="Save note correction" /></form></Modal>;
}

function TicketDetail({ prefix, id, manager, onClose, onUpdated }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState(null);
  const request = useRef(null);
  const current = useRef(null);
  async function load(quiet = false) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    if (!quiet) { setLoading(true); setError(''); }
    try {
      const result = await api(prefix + '/' + id, { signal: controller.signal });
      if (!controller.signal.aborted) { setRecord(result.record); current.current = result.record; setError(''); }
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { load(); const timer = setInterval(() => { if (!document.hidden) load(true); }, 15000); return () => { request.current?.abort(); clearInterval(timer); }; }, [prefix, id]);
  function saved(updated) { setRecord(updated); current.current = updated; setAction(null); onUpdated(updated); }
  const history = [...(record?.history || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || Number(a.id) - Number(b.id));
  return <><Modal wide className="helpdesk-detail-modal" title={record?.number || 'Ticket details'} subtitle={record ? CATEGORY_LABELS[record.category] + ' · ' + SYSTEM_LABELS[record.ownerSystem] : 'Loading the saved ticket…'} onClose={onClose} busy={Boolean(action)}><div className="modal-body"><ErrorNotice message={error} />
    {loading && !record ? <p className="helpdesk-loading" role="status">Loading ticket history…</p> : record && <>
      <div className="helpdesk-detail-top"><div><span className="eyebrow">CURRENT STATUS</span><Status value={record.status} /></div><button className="button secondary small" onClick={() => load()} disabled={loading || Boolean(action)}><Icon name="refresh" size={15} />Refresh ticket</button></div>
      <dl className="helpdesk-properties"><div><dt>Requested by</dt><dd>{record.ownerName}</dd></div><div><dt>Department</dt><dd>{SYSTEM_LABELS[record.ownerSystem] || record.ownerSystem}</dd></div><div><dt>Submitted</dt><dd>{ticketTime(record.createdAt)}</dd></div><div><dt>Last updated</dt><dd>{ticketTime(record.updatedAt)}</dd></div></dl>
      <section className="helpdesk-detail-section"><h3>Initial note</h3><p className="helpdesk-note">{record.note || '—'}</p></section>
      <section className="helpdesk-detail-section"><h3>Attachments <span>{record.attachments?.length || 0}</span></h3>{record.attachments?.length ? <ul className="helpdesk-attachments">{record.attachments.map(file => <li key={file.id}><Icon name="file" size={18} /><span><strong>{file.name}</strong><small>{fileSize(file.bytes)}</small></span><a className="button secondary small" href={prefix + '/' + record.id + '/attachments/' + file.id} download={file.name}><Icon name="download" size={15} />Download<span className="sr-only"> {file.name}</span></a></li>)}</ul> : <p className="field-hint">No attachments.</p>}</section>
      <section className="helpdesk-detail-section"><h3>Activity timeline <span>{history.length}</span></h3><p className="field-hint">All dates and times are shown in Philippine time (Asia/Manila).</p><ol className="helpdesk-timeline">{history.map(entry => {
        const edited = (entry.displayNote ?? entry.note ?? '') !== (entry.note ?? '');
        return <li key={entry.id} className={entry.kind === 'note-edit' ? 'helpdesk-note-correction' : ''}><span className="helpdesk-timeline-dot"><Icon name={entry.kind === 'note-edit' ? 'file' : entry.status === 'complete' ? 'check' : 'bell'} size={15} /></span><div className="helpdesk-event"><div className="helpdesk-event-heading"><strong>{entry.kind === 'note-edit' ? 'Status note corrected' : entry.kind === 'created' || entry.kind === 'submitted' ? 'Ticket submitted' : STATUS_LABELS[entry.status] || 'Ticket update'}</strong>{entry.status && <Status value={entry.status} />}</div><p className="helpdesk-event-meta">{entry.actorName || 'System'} · {SYSTEM_LABELS[entry.actorSystem] || entry.actorSystem}<time dateTime={entry.createdAt}>{ticketTime(entry.createdAt)}</time></p>{entry.kind === 'note-edit' && <p className="field-hint">Correction to activity #{entry.targetHistoryId}. The original activity remains below.</p>}<p className="helpdesk-note">{entry.displayNote ?? entry.note ?? 'No note added.'}</p>{edited && <details className="helpdesk-original-note"><summary>View original note</summary><p className="helpdesk-note">{entry.note || 'No note added.'}</p></details>}{manager && entry.kind !== 'note-edit' && entry.actorSystem === 'itticket' && <button className="text-button" onClick={() => setAction({ type: 'note', record, entry })}>Edit status note<span className="sr-only"> for activity {entry.id}</span></button>}</div></li>;
      })}</ol>{!history.length && <p className="field-hint">No activity recorded.</p>}</section>
      {manager && <section className="helpdesk-detail-section helpdesk-next-step"><h3>Next step</h3>{nextTicketStatuses(record).length ? <div className="helpdesk-status-actions">{nextTicketStatuses(record).map(status => <button key={status} className={'button ' + (status === 'declined' ? 'secondary danger-text' : 'primary')} onClick={() => setAction({ type: 'status', record, status })}>{record.category === 'request' && status === 'ongoing' ? 'Proceed' : status === 'complete' ? 'Complete' : status === 'declined' ? 'Decline' : 'Mark ' + STATUS_LABELS[status].toLowerCase()}</button>)}</div> : <p className="field-hint">This ticket is {STATUS_LABELS[record.status]?.toLowerCase()}. Its status is final; note corrections remain available in the timeline.</p>}</section>}
    </>}
  </div><div className="modal-footer"><button className="button secondary" disabled={Boolean(action)} onClick={onClose}>Close</button></div></Modal>
    {action?.type === 'status' && <StatusChange prefix={prefix} record={action.record} status={action.status} onClose={() => setAction(null)} onSaved={saved} />}
    {action?.type === 'note' && <EditNote prefix={prefix} record={action.record} entry={action.entry} onClose={() => setAction(null)} onSaved={saved} />}
  </>;
}

export default function HelpDesk({ manager = false, onNotice }) {
  const prefix = '/api/purchasing/helpdesk/tickets';
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const request = useRef(null);
  async function load(quiet = false) {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    if (quiet !== true) { setLoading(true); setError(''); }
    try { const result = await api(prefix, { signal: controller.signal }); if (!controller.signal.aborted) { setRecords(result.records || []); setLoaded(true); setError(''); } }
    catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  useEffect(() => { load(); const timer = setInterval(() => { if (!document.hidden) load(true); }, 20000); return () => { request.current?.abort(); clearInterval(timer); }; }, [prefix]);
  function updated(record) { setRecords(current => current.some(row => row.id === record.id) ? current.map(row => row.id === record.id ? { ...row, ...record } : row) : [record, ...current]); }
  function created(record) { setCreateOpen(false); updated(record); setSelectedId(record.id); onNotice?.('Ticket submitted to IT.'); load(true); }
  const filtered = records.filter(record => (!category || record.category === category) && (!status || record.status === status) && (!department || record.ownerSystem === department) && [record.number, record.note, CATEGORY_LABELS[record.category], STATUS_LABELS[record.status], record.ownerName, SYSTEM_LABELS[record.ownerSystem]].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const stats = [['Total tickets', records.length, 'file'], ['Pending', records.filter(row => row.status === 'pending').length, 'bell'], ['Active', records.filter(row => ['in-progress', 'ongoing'].includes(row.status)).length, 'settings'], ['Complete', records.filter(row => row.status === 'complete').length, 'check']];
  function filter(setter, value) { setter(value); setPage(1); }
  return <section className="helpdesk-workspace"><div className="page-heading"><div><span className="eyebrow">{manager ? 'IT SUPPORT WORKSPACE' : 'YOUR COMPANY SUPPORT'}</span><h1>{manager ? 'IT Ticket Monitoring' : 'Help Desk'}</h1><p>{manager ? 'Track requests, resolve support concerns and keep every update visible to its requester.' : 'Submit a request or support concern and follow its progress. Only your own tickets appear here.'}</p></div>{!manager && <button className="button primary" onClick={() => setCreateOpen(true)}><span className="plus" aria-hidden="true">+</span>New ticket</button>}</div>
    <div className="helpdesk-stats">{stats.map(([label, count, icon]) => <div key={label}><span className="helpdesk-stat-icon"><Icon name={icon} size={19} /></span><div><span>{label}</span><strong>{loaded ? count : '—'}</strong></div></div>)}</div><ErrorNotice message={error} />
    <section className="records-card helpdesk-records" aria-label={manager ? 'IT ticket monitor' : 'My tickets'}><div className="records-toolbar"><div className="records-title"><h2>{manager ? 'Ticket monitor' : 'My tickets'}</h2><span>{filtered.length}</span></div><div className="records-tools"><label className="search-input"><Icon name="search" size={17} /><input type="search" aria-label="Search tickets" placeholder="Search tickets…" value={query} onChange={event => filter(setQuery, event.target.value)} /></label><button className="icon-button refresh-button" aria-label="Refresh tickets" onClick={() => load()} disabled={loading}><Icon name="refresh" size={17} /></button></div></div>
      <div className="helpdesk-filters"><label>Category<select aria-label="Filter ticket category" value={category} onChange={event => filter(setCategory, event.target.value)}><option value="">All categories</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Status<select aria-label="Filter ticket status" value={status} onChange={event => filter(setStatus, event.target.value)}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{manager && <label>Department<select aria-label="Filter ticket department" value={department} onChange={event => filter(setDepartment, event.target.value)}><option value="">All departments</option>{Object.entries(SYSTEM_LABELS).filter(([value]) => value !== 'itticket').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}{(query || category || status || department) && <button className="text-button" onClick={() => { setQuery(''); setCategory(''); setStatus(''); setDepartment(''); setPage(1); }}>Clear filters</button>}</div>
      {loading && !loaded ? <p className="helpdesk-loading" role="status">Loading tickets…</p> : <><div className="helpdesk-table-scroll"><table className="records-table helpdesk-table"><thead><tr><th>Ticket</th><th>Category</th>{manager && <th>Requester</th>}<th>Status</th><th>Submitted</th><th>Last updated</th><th className="actions-heading">Actions</th></tr></thead><tbody>{visible.map(record => <tr key={record.id}><td><strong className="document-number">{record.number}</strong>{manager && <small>{SYSTEM_LABELS[record.ownerSystem]}</small>}</td><td>{CATEGORY_LABELS[record.category]}</td>{manager && <td>{record.ownerName}</td>}<td><Status value={record.status} /></td><td><time dateTime={record.createdAt}>{ticketTime(record.createdAt)}</time></td><td><time dateTime={record.updatedAt}>{ticketTime(record.updatedAt)}</time></td><td><button className="text-button" aria-label={'View ticket ' + record.number} onClick={() => setSelectedId(record.id)}>View details</button></td></tr>)}</tbody></table></div>
      <div className="helpdesk-mobile-cards">{visible.map(record => <article key={record.id}><header><strong>{record.number}</strong><Status value={record.status} /></header><p>{CATEGORY_LABELS[record.category]}{manager && ' · ' + SYSTEM_LABELS[record.ownerSystem]}</p>{manager && <p>{record.ownerName}</p>}<dl><div><dt>Submitted</dt><dd>{ticketTime(record.createdAt)}</dd></div><div><dt>Updated</dt><dd>{ticketTime(record.updatedAt)}</dd></div></dl><button className="button secondary small" aria-label={'Open ticket ' + record.number} onClick={() => setSelectedId(record.id)}>View details<Icon name="arrowRight" size={15} /></button></article>)}</div>
      {!visible.length && <div className="helpdesk-empty"><Icon name="file" size={29} /><strong>{records.length ? 'No tickets match these filters.' : manager ? 'No tickets have been submitted yet.' : 'Your tickets will appear here.'}</strong><p>{records.length ? 'Try another status, category or search.' : manager ? 'Department requests and support concerns will be shown here.' : 'Create a ticket to ask IT for help.'}</p></div>}</>}
      <div className="table-footer"><span>{filtered.length} {filtered.length === 1 ? 'ticket' : 'tickets'}</span><div><button className="icon-button" aria-label="Previous ticket page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><Icon name="chevronLeft" size={16} /></button><span>Page {currentPage} of {pages}</span><button className="icon-button" aria-label="Next ticket page" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}><Icon name="chevronRight" size={16} /></button></div></div>
    </section>
    {createOpen && <CreateTicket prefix={prefix} onClose={() => setCreateOpen(false)} onSaved={created} />}
    {selectedId != null && <TicketDetail prefix={prefix} id={selectedId} manager={manager} onClose={() => setSelectedId(null)} onUpdated={updated} />}
  </section>;
}
