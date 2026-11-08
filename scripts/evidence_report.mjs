#!/usr/bin/env node
// Сводка по файлу Evidence из analyze-web-bundle: скрипты, эндпоинты, неизвестные.
// Значения секретов не выводятся, только число маркеров.
// evidence_report.mjs <файл Evidence> [--top N]
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('укажите файл Evidence'); process.exit(2); }
const top = process.argv.includes('--top') ? +process.argv[process.argv.indexOf('--top') + 1] : 8;
const raw = fs.readFileSync(file, 'utf8'); const j = JSON.parse(raw);
const rec = j.records.find(r => r.operation === 'analyze_web_bundle');
if (!rec) { console.error('в файле нет записи analyze_web_bundle'); process.exit(1); }
const n = rec.normalized_result; const o = n.observations;
const origin = n.capture.target_origin;
const short = u => { if (!u) return '?'; return u.startsWith(origin) ? u.slice(origin.length).replace(/\?v=[\w.-]+$/, '') : u; };
const urlOf = Object.fromEntries((o.chunks?.nodes || []).map(x => [x.script_key, x.url]));

console.log(`Страница: ${n.capture.target_url}`);
console.log(`Скриптов: ${n.capture.scripts_observed} (разобрано ${n.completeness.parsed_scripts}, ошибок разбора ${n.completeness.parse_failures}, статус ${n.completeness.status})`);
console.log(`Узлов AST: ${n.completeness.visited_ast_nodes}`);

const nodes = o.chunks?.nodes || [];
const total = nodes.reduce((s, x) => s + (x.bytes || 0), 0);
console.log(`Объём кода: ${(total / 1048576).toFixed(2)} МБ без сжатия`);
const origins = {}; for (const x of nodes) { try { const u = new URL(x.url).origin; origins[u] = (origins[u] || 0) + 1; } catch { origins['?'] = (origins['?'] || 0) + 1; } }
console.log(`Источники: ${Object.entries(origins).map(([k, v]) => `${k} (${v})`).join(', ')}`);

console.log(`\nСамые большие скрипты:`);
for (const x of [...nodes].sort((a, b) => b.bytes - a.bytes).slice(0, top)) console.log(`  ${String(Math.round(x.bytes / 1024)).padStart(6)} КБ  ${short(x.url)}`);

const by = new Map();
for (const e of o.endpoints || []) { const k = e.value; if (!by.has(k)) by.set(k, { m: new Set(), at: [] }); by.get(k).m.add(e.mechanism); by.get(k).at.push(`${short(urlOf[e.location?.script_key])}:${e.location?.line}`); }
console.log(`\nЭндпоинты: ${by.size} уникальных, ${(o.endpoints || []).length} мест. Список неполный: константы через переменную и jQuery могут не попасть.`);
for (const [k, v] of [...by].sort()) console.log(`  ${k}  [${[...v.m].join(',')}]  ← ${v.at.slice(0, 4).join(', ')}${v.at.length > 4 ? ' …' : ''}`);

console.log(`\nМаршрутов: ${(o.routes || []).length}. Для серверного приложения 0 — норма.`);
const un = n.route_inventory?.unknowns;
const list = Array.isArray(un) ? un : (un?.items || []);
console.log(`Неизвестных в инвентаре: ${list.length}`);
for (const u of list.slice(0, top)) console.log(`  [${u.kind}] ${String(u.reason).slice(0, 110)}`);

console.log('\nМаркеры секретов в файле (только количество):');
for (const k of ['csrfmiddlewaretoken', 'csrftoken', 'sessionid', 'Bearer ', 'api_key', 'password']) console.log(`  ${k.padEnd(22)} ${raw.split(k).length - 1}`);
