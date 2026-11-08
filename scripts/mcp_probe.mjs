#!/usr/bin/env node
// Проверка MCP-сервера REA по stdio без регистрации в агенте.
// mcp_probe.mjs <папка установки> [--call <инструмент> '<JSON аргументов>']
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [, , w, flag, tool, args] = process.argv;
if (!w) { console.error('укажите папку из bootstrap.sh'); process.exit(2); }
const entry = process.env.REA_ENTRY || path.join(path.resolve(w), 'rea/node_modules/rea-agents/scripts/rea.mjs');
if (!fs.existsSync(entry)) { console.error(`нет ${entry}`); process.exit(1); }

const run = (env) => new Promise((resolve) => {
  const c = spawn(process.execPath, [entry, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  let buf = '', id = 0; const wait = new Map();
  c.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!l) continue; try { const m = JSON.parse(l); if (m.id != null && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } } catch { /* не JSON */ } } });
  const rpc = (method, params, ms = 120000) => new Promise((res, rej) => { const n = ++id; const t = setTimeout(() => rej(new Error(`таймаут ${method}`)), ms); wait.set(n, m => { clearTimeout(t); res(m); }); c.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
  (async () => {
    const out = {}; try {
      const t0 = Date.now();
      const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'rea-sandbox', version: '1' } });
      out.server = init.result?.serverInfo; out.initMs = Date.now() - t0;
      c.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
      const list = await rpc('tools/list', {});
      out.tools = list.result?.tools?.length ?? 0; out.bytes = JSON.stringify(list).length;
      if (env.CALL) { const t1 = Date.now(); const r = await rpc('tools/call', { name: env.CALL, arguments: JSON.parse(env.CALL_ARGS || '{}') }, 600000); out.call = { ms: Date.now() - t1, isError: !!r.result?.isError, preview: JSON.stringify(r.result?.structuredContent ?? r.result?.content?.[0]?.text ?? r.error).slice(0, 500) }; }
    } catch (e) { out.fatal = String(e); }
    c.kill(); resolve(out);
  })();
});

const a = await run({});
console.log(`сервер: ${a.server?.name} ${a.server?.version}; initialize ${a.initMs} мс; инструментов ${a.tools}`);
console.log(`tools/list по умолчанию: ${Math.round(a.bytes / 1024)} КБ`);
const b = await run({ REA_MCP_OUTPUT_SCHEMA_PROFILE: 'off' });
console.log(`tools/list с REA_MCP_OUTPUT_SCHEMA_PROFILE=off: ${Math.round(b.bytes / 1024)} КБ`);
if (a.fatal || b.fatal) { console.error(a.fatal || b.fatal); process.exit(1); }
if (flag === '--call') { const c = await run({ CALL: tool, CALL_ARGS: args || '{}' }); console.log(`${tool}: ${c.call?.ms} мс, ошибка: ${c.call?.isError}\n${c.call?.preview}`); }
