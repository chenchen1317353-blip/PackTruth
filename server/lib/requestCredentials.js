import { AsyncLocalStorage } from 'node:async_hooks';

// Only request-scoped state contains a key. Never put this store in a cache.
export const credentialScope = new AsyncLocalStorage();
export const currentCredentials = () => credentialScope.getStore();
export const deepseekKey = (localKey = '') => {
  const scope = currentCredentials();
  return scope ? scope.key : process.env.NODE_ENV === 'production' ? '' : localKey; // local CLI only
};
export function scrubCredential(value) {
  const key = currentCredentials()?.key;
  return typeof value === 'string' && key ? value.split(key).join('[REDACTED]') : value;
}
