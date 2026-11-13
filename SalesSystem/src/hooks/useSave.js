import { useState } from 'react';

export default function useSave(onSaved) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(action) {
    setBusy(true); setError('');
    try { const result = await action(); onSaved(result); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return { busy, error, save };
}
