import { chromium as engine } from 'playwright-core';

export async function controlledPage(page, { mockKey = false } = {}) {
  // Font-only dependency isolation. Application scripts/errors remain observable.
  await page.route(/https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com)\//, route => {
    const url = route.request().url();
    const fontStyle = route.request().resourceType() === 'stylesheet' && (/\/npm\/misans@/.test(url) || url.startsWith('https://fonts.googleapis.com/'));
    return fontStyle ? route.fulfill({ status: 200, contentType: 'text/css', body: '/* offline test: use existing system fallback */' }) : route.continue();
  });
  await page.route('**/api/**', route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 503, json: { ok: false, error: { code: 'UNMOCKED_TEST_REQUEST', message: '测试禁止未模拟的上游调用' } } });
    return route.continue();
  });
  if (mockKey) await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      import('/src/lib/credentials.js').then(m => m.setUserKey('offline-browser-fixture'));
    }, { once: true });
  });
  return page;
}

// Existing browser suites use only synthetic credentials and their own route mocks.
export const chromium = {
  async launch(options) {
    const browser = await engine.launch(options);
    const original = browser.newPage.bind(browser);
    browser.newPage = async options => controlledPage(await original(options), { mockKey: true });
    return browser;
  },
};
