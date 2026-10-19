import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../config/env';
import { AUTH_TOKEN_KEY } from './api';
export type RealtimeEvent = { type: string; [key: string]: any };
export type RealtimeEventType = RealtimeEvent;
type Listener = (evt: RealtimeEvent) => void;
type FilteredListener = (evt: any) => void;
function getWsUrl(): string {
  let base = ENV.API_BASE_URL;
  if (base.startsWith('https://')) base = base.replace('https://', 'wss://');
  else if (base.startsWith('http://')) base = base.replace('http://', 'ws://');
  if (base.endsWith('/api')) base = base.slice(0, -4);
  return base + '/api/ws';
}
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;
  private listeners = new Set<Listener>();
  private retry = 0; private maxRetry = 10; private backoff = 1000; private stopped = false; private urlWithToken: string | null = null;
  private _connected = false;
  on(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  off(listener: Listener) { this.listeners.delete(listener); }
  subscribe(typeOrListener: string | Listener, maybeListener?: FilteredListener) {
    if (typeof typeOrListener === 'string' && maybeListener) {
      const l = (evt: RealtimeEvent) => { if (evt && evt.type === typeOrListener) { try { maybeListener(evt); } catch {} } };
      this.listeners.add(l as any); return () => this.listeners.delete(l as any);
    }
    if (typeof typeOrListener === 'function') { this.listeners.add(typeOrListener as any); return () => this.listeners.delete(typeOrListener as any); }
    return () => {};
  }
  get connected(): boolean { return this._connected; }
  emit(evt: RealtimeEvent | string) {
    const e: RealtimeEvent = typeof evt === 'string' ? { type: evt } : evt;
    this.listeners.forEach((l) => { try { (l as any)(e); } catch {} });
  }
  async getAuthToken(): Promise<string | null> {
    try { const t = await AsyncStorage.getItem(AUTH_TOKEN_KEY); if (t) return t; } catch {}
    try { const t = await AsyncStorage.getItem('authToken'); if (t) return t; } catch {}
    try { const t2 = await AsyncStorage.getItem('token'); if (t2) return t2; } catch {}
    return null;
  }
  async start() {
    if (this.stopped) return;
    try { (console as any).warn('[RT] start()'); } catch {}

    const token = await this.getAuthToken();
    try { (console as any).warn('[RT] token?', !!token); } catch {}
    const base = getWsUrl();
    try { (console as any).warn('[RT] base=', base); } catch {}
    if (!token) { this.scheduleReconnect(2000); return; }
    this.urlWithToken = base + '?token=' + encodeURIComponent(token);
    this.open();
  }
  stop() {
    this.stopped = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) { try { this.ws.close(); } catch {}; this.ws = null; }
    this._connected = false;
  }
  private open() {
    if (this.stopped || !this.urlWithToken) return;
    try {
      try { (console as any).warn('[RT] new WebSocket'); } catch {}
      this.ws = new WebSocket(this.urlWithToken);
    } catch (e) { this.scheduleReconnect(this.backoff); return; }
    this.ws.onopen = () => { this.retry = 0; this.backoff = 1000; this._connected = true; this.emit({ type: 'connected' }); };
    this.ws.onmessage = (ev) => { try { const d = JSON.parse((ev as any).data as string); this.emit(d as RealtimeEvent); } catch {} };
    this.ws.onclose = (ev) => { this.ws = null; this._connected = false; this.emit({ type: 'disconnected', code: (ev as any).code, reason: (ev as any).reason }); this.scheduleReconnect(this.backoff); };
    this.ws.onerror = () => {};
  }
  private scheduleReconnect(delay: number) {
    if (this.stopped) return;
    this.retry = Math.min(this.retry + 1, this.maxRetry + 5);
    if (this.retry > this.maxRetry) delay = Math.min(delay * 2, 30000); else delay = Math.min(delay * 1.5, 5000);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.start(), delay);
  }
}
export const realtimeClient = new RealtimeClient();
