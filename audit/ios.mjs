// Real iPhone Simulator + Safari test (Appium XCUITest): taps fields natively and checks the
// software keyboard really stays open, typing lands, and iOS does not auto-fill passwords/emails.
import { remote } from 'webdriverio';
const BASE = process.env.BASE || 'http://localhost:8093/';
const out = [], bad = [];
const note = (ok, what) => { (ok ? out : bad).push(what); console.log(ok ? '  ✓' : '  ✗', what); };
const d = await remote({
  hostname: '127.0.0.1', port: 4723, logLevel: 'error',
  capabilities: { platformName: 'iOS', browserName: 'Safari', 'appium:automationName': 'XCUITest', 'appium:deviceName': process.env.DEVICE || 'iPhone 16',
    'appium:platformVersion': process.env.IOSVER || undefined, 'appium:nativeWebTap': true, 'appium:connectHardwareKeyboard': false,
    'appium:safariInitialUrl': BASE, 'appium:newCommandTimeout': 600, 'appium:wdaLaunchTimeout': 600000, 'appium:wdaConnectionTimeout': 600000 }
});
const js = (f, ...a) => d.execute(f, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function field(where, sel, text) {
  const el = await d.$(sel); if (!(await el.isExisting())) { note(false, `${where} ${sel}: not found`); return; }
  await el.click(); await sleep(1500);
  const kb = await d.isKeyboardShown().catch(() => null);
  const focus = await js(s => document.activeElement === document.querySelector(s), sel);
  const pre = await js(s => document.querySelector(s).value, sel);
  note(kb && focus, `${where} ${sel}: keyboard ${kb ? 'open' : 'CLOSED'} after tap, focus ${focus ? 'kept' : 'LOST'}`);
  note(!pre, `${where} ${sel}: no auto-filled value (${pre ? 'FILLED: ' + pre.replace(/./g, '•') : 'empty'})`);
  await d.keys(text.split('')); await sleep(1500);
  const v = await js(s => { const e = document.querySelector(s); return { v: e && e.value, f: document.activeElement === e }; }, sel);
  const kb2 = await d.isKeyboardShown().catch(() => null);
  note(v.v === text && v.f && kb2, `${where} ${sel}: typed "${text}" → "${v.v}", keyboard ${kb2 ? 'still open' : 'CLOSED'}`);
  await js(s => { const e = document.querySelector(s); e.value = ''; e.blur(); }, sel); await sleep(800);
}
try {
  await d.url(BASE); await sleep(4000);
  await js(() => { document.querySelector('[data-act=demo]') && document.querySelector('[data-act=demo]').click(); }); await sleep(1500);
  // search on home
  await js(() => document.querySelector('[data-act=search]').click()); await sleep(800);
  await field('Home search', '#q', 'kad');
  // new account sheet
  await js(() => document.querySelector('[data-act=new-account]').click()); await sleep(1000);
  await field('New account', '#a-name', 'Murugan');
  await js(() => window.closeLedgerPanel()); await sleep(800);
  // details: password vault creation (iOS strong-password trap)
  await js(() => { location.hash = 'details'; }); await sleep(1200);
  await js(() => document.querySelector('[data-act=vault-create][data-mode=password]').click()); await sleep(1000);
  await field('Details new password', '#p1', 'abc123');
  await field('Details repeat', '#p2', 'abc123');
  await js(() => window.closeLedgerPanel()); await sleep(800);
  // online sign in form
  await js(() => { location.hash = 'online'; }); await sleep(1500);
  await field('Sign in', '#ol-id', 'me@x.in');
  await field('Sign in', '#ol-pw', 'pass1234');
  const shot = await d.takeScreenshot(); (await import('fs')).writeFileSync('ios-last.png', Buffer.from(shot, 'base64'));
} catch (e) { note(false, 'CRASH ' + e.message.split('\n')[0]); }
await d.deleteSession().catch(() => { });
console.log(`iOS Safari: ${out.length} ok, ${bad.length} problems`);
for (const b of bad.slice(0, 3)) console.log('::notice title=iOS problem ' + (BASE.includes('8094') ? 'OLD' : 'NEW') + '::' + b);
console.log(`::notice title=iOS summary ${BASE.includes('8094') ? 'OLD' : 'NEW'}::${out.length} ok, ${bad.length} problems`);
process.exit(bad.length ? 1 : 0);
