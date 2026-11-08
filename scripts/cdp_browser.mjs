#!/usr/bin/env node
// Отдельный Chrome с пустым профилем и CDP только на loopback.
// start --dir <папка> [--url U] [--port 9333] [--headless]
// list  --dir <папка>
// stop  --dir <папка>   закрывает браузер и удаляет профиль (в нём сессия пользователя)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [cmd, ...rest] = process.argv.slice(2);
const opt = {}; for (let i = 0; i < rest.length; i++) { if (rest[i] === '--headless') opt.headless = true; else if (rest[i].startsWith('--')) opt[rest[i].slice(2)] = rest[++i]; }
if (!cmd || !opt.dir) { console.error('использование: start|list|stop --dir <папка> [--url U] [--port N] [--headless]'); process.exit(2); }
const dir = path.resolve(opt.dir); const profile = path.join(dir, 'profile'); const state = path.join(dir, 'state.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readPort = () => JSON.parse(fs.readFileSync(state, 'utf8')).port;
const api = async (port, p, init) => (await fetch(`http://127.0.0.1:${port}${p}`, init)).json();

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const c = { win32: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'], darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'], linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'] }[process.platform] || [];
  const f = c.find(x => fs.existsSync(x)); if (!f) throw new Error('Chrome не найден, задайте CHROME_PATH'); return f;
}

if (cmd === 'start') {
  const port = +(opt.port || 9333);
  if (await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false)) { console.error(`порт ${port} занят: возможно, это чужой браузер`); process.exit(1); }
  if (fs.existsSync(profile)) fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  const args = [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions'];
  if (opt.headless) args.push('--headless=new', '--disable-gpu');
  args.push(opt.url || 'about:blank');
  spawn(findChrome(), args, { detached: true, stdio: 'ignore' }).unref();
  fs.writeFileSync(state, JSON.stringify({ port }));
  for (let i = 0; i < 40; i++) { try { const v = await api(port, '/json/version'); console.log(`готово: ${v.Browser}, http://127.0.0.1:${port}`); process.exit(0); } catch { await sleep(250); } }
  console.error('CDP не поднялся'); process.exit(1);
}
if (cmd === 'list') {
  for (const t of (await api(readPort(), '/json/list')).filter(t => t.type === 'page')) console.log(`${t.id}  ${t.url}`);
  process.exit(0);
}
if (cmd === 'stop') {
  let closed = false;
  try {
    const { webSocketDebuggerUrl: u } = await api(readPort(), '/json/version');
    const ws = new WebSocket(u); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' })); closed = true; await sleep(1500);
  } catch (e) { console.error('браузер не отвечает:', e.message); }
  let ok = false; for (let i = 0; i < 20 && !ok; i++) { try { fs.rmSync(profile, { recursive: true, force: true }); ok = !fs.existsSync(profile); } catch { await sleep(500); } if (!ok) await sleep(500); }
  fs.rmSync(state, { force: true });
  console.log(`браузер закрыт: ${closed}; профиль удалён: ${ok}`);
  process.exit(ok ? 0 : 1);
}
console.error('неизвестная команда'); process.exit(2);
