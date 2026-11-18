import { useEffect, useRef } from 'react';
export function useRealtimeRefresh(callback) { const ref = useRef(callback); ref.current = callback; useEffect(() => { const update = () => ref.current(); window.addEventListener('tti:itticket:data-changed', update); return () => window.removeEventListener('tti:itticket:data-changed', update); }, []); }
