// Page-memory only. No storage, cookies, URL parameters or analytics.
let key = '';
let revision = 0;
let controller = new AbortController();
const listeners = new Set();
export const credentialRevision = () => revision;
export const hasUserKey = () => Boolean(key);
export const subscribeCredentials = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function setUserKey(value) {
  controller.abort();
  controller = new AbortController();
  key = String(value || '').trim();
  revision++;
  for (const fn of listeners) fn();
}
export function requestCredential() {
  return { header: key ? `Bearer ${key}` : null, signal: controller.signal };
}
