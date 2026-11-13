import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api.js';

const SYSTEM = 'configuration';
const CHANGE_EVENT = 'tti:configuration:data-changed';

// One connection belongs to one signed-in app identity. Events only invalidate
// HTTP data; they never replace form values or contain business records.
export default function useRealtime({ user, onUser, onChange }) {
  const callbacks = useRef({ onUser, onChange });
  callbacks.current = { onUser, onChange };
  const userId = user?.id;
  const system = user?.system;

  useEffect(() => {
    if (!userId || system !== SYSTEM) return;
    let disposed = false;
    let socket = null;
    let retryTimer = null;
    let changeTimer = null;
    let ticketRequest = null;
    let sessionRequest = null;
    let sessionSequence = 0;
    let connecting = false;
    let attempts = 0;
    let changedAt = '';
    const resources = new Set();

    function closeSocket() {
      const previous = socket;
      socket = null;
      previous?.removeAllListeners();
      previous?.disconnect();
    }

    async function refreshOwnSession() {
      if (!callbacks.current.onUser) return;
      const request = ++sessionSequence;
      sessionRequest?.abort();
      const controller = new AbortController();
      sessionRequest = controller;
      try {
        const result = await api('/api/configuration/auth/session', { signal: controller.signal });
        if (!disposed && request === sessionSequence && result.user?.id === userId && result.user.system === SYSTEM) callbacks.current.onUser?.(result.user);
      } catch (error) {
        if (!disposed && request === sessionSequence && error.status === 401) window.dispatchEvent(new Event('session-expired'));
      } finally {
        if (sessionRequest === controller) sessionRequest = null;
      }
    }

    function invalidate(change) {
      if (disposed || change?.system !== SYSTEM) return;
      const incoming = Array.isArray(change.resources) ? change.resources.filter(resource => typeof resource === 'string' && resource) : ['*'];
      if (!incoming.length) return;
      for (const resource of incoming) resources.add(resource);
      changedAt = typeof change.changedAt === 'string' ? change.changedAt : new Date().toISOString();
      if (changeTimer !== null) window.clearTimeout(changeTimer);
      changeTimer = window.setTimeout(() => {
        changeTimer = null;
        if (disposed) return;
        const changed = resources.has('*') ? ['*'] : [...resources];
        resources.clear();
        const payload = { system: SYSTEM, resources: changed, changedAt };
        if (changed.includes('*') || changed.includes('users')) refreshOwnSession();
        callbacks.current.onChange?.(payload);
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: payload }));
      }, 120);
    }

    function retry() {
      if (disposed || retryTimer !== null) return;
      const delay = Math.min(1000 * 2 ** Math.min(4, Math.max(0, attempts - 1)), 15000);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
    }

    async function connect() {
      if (disposed || connecting || socket?.connected) return;
      connecting = true;
      attempts = Math.min(attempts + 1, 5);
      const controller = new AbortController();
      ticketRequest = controller;
      try {
        const result = await api('/api/configuration/realtime-ticket', { signal: controller.signal });
        if (disposed) return;
        if (typeof result.ticket !== 'string' || !result.ticket) throw new Error('A realtime ticket was not returned.');
        closeSocket();
        const next = io({
          path: '/socket.io',
          autoConnect: false,
          reconnection: false,
          forceNew: true,
          withCredentials: true,
          timeout: 10000,
          auth: { ticket: result.ticket },
        });
        socket = next;
        next.on('connect', () => {
          if (disposed || socket !== next) return;
          connecting = false;
          attempts = 0;
          invalidate({ system: SYSTEM, resources: ['*'], changedAt: new Date().toISOString() });
        });
        next.on('data:changed', invalidate);
        next.on('connect_error', () => {
          if (disposed || socket !== next) return;
          connecting = false;
          closeSocket();
          retry();
        });
        next.on('disconnect', () => {
          if (disposed || socket !== next) return;
          connecting = false;
          closeSocket();
          retry();
        });
        next.connect();
      } catch (error) {
        connecting = false;
        if (!disposed) {
          closeSocket();
          if (![401, 403].includes(error.status)) retry();
        }
      } finally {
        if (ticketRequest === controller) ticketRequest = null;
      }
    }

    function resume() {
      if (disposed) return;
      if (socket?.connected) {
        invalidate({ system: SYSTEM, resources: ['*'], changedAt: new Date().toISOString() });
        return;
      }
      if (connecting) return;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = null;
      attempts = 0;
      connect();
    }

    window.addEventListener('online', resume);
    window.addEventListener('focus', resume);
    connect();
    return () => {
      disposed = true;
      sessionSequence++;
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (changeTimer !== null) window.clearTimeout(changeTimer);
      ticketRequest?.abort();
      sessionRequest?.abort();
      closeSocket();
    };
  }, [userId, system]);
}

// Pages with their own HTTP loader can subscribe without opening another socket.
export function useRealtimeRefresh(callback) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    const refresh = event => {
      if (event.detail?.system === SYSTEM) latest.current?.(event.detail);
    };
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => window.removeEventListener(CHANGE_EVENT, refresh);
  }, []);
}
