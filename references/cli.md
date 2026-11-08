# Грабли CLI

Проверено на `rea-agents` 6.8.0.

## Размер вывода

`--json` без `--detail summary` возвращает полный `semantic_graph`: около 40 МБ для файла на 70 КБ. Использовать:

```bash
--detail summary --evidence_output <новый файл> --view '<JSON>' --format json
```

`--detail summary` требует `--view`, а в справке указано лишь обратное. Без него: `invalid_request`, `path: ["view"]`. `--evidence_output` не перезаписывает файл, путь должен быть новым.

Минимальный `view`:

```json
{"kind":"javascript-routes","collection":"routes","fields":["path","confidence"],"limit":60}
```

## Запросы к сохранённому Evidence

```bash
rea inspect-analysis-view view.json --evidence-bundle <файл Evidence> --format json
```

```json
{
  "source": {"kind": "retained-evidence", "evidence_id": "<parent_evidence_id из summary>"},
  "view": {"kind": "javascript-routes", "collection": "sources", "offset": 0, "limit": 80}
}
```

Коллекции: `routes`, `occurrences`, `sources`, `unknowns`, `summary`. У `summary` поля `limit` нет. Постранично: `coverage.next_offset`.

## Где лежат эндпоинты

Не в представлении маршрутов. Пустые `routes` и `occurrences` ещё не значат, что адресов нет. Смотреть в файле Evidence:

```text
records[0].normalized_result.observations.endpoints   — value, mechanism, location{script_key,line,column}
records[0].normalized_result.observations.chunks.nodes — script_key, url, bytes
records[0].normalized_result.capture                   — target_url, scripts_observed
records[0].normalized_result.completeness              — parsed_scripts, status
```

Это разбирает `scripts/evidence_report.mjs`.

## Веб-анализ

`analyze-web-bundle` браузер не запускает: нужен `endpoint` и `targetId`. Цель можно получить через `rea list-browser-targets http://127.0.0.1:9333`.

`--virtual-time-budget` в headless Chrome для скриншотов страниц с большим числом стилей даёт поехавшую вёрстку. Снимать через CDP с реальным ожиданием.

## Таймаут

`--analysis-timeout-ms` по умолчанию 300 000 на файл. Сработавший лимит даёт `provider_timeout` и частичные данные в `details.partial_observation`. Внешний `timeout` короче этого лимита выглядит как зависание, хотя REA ещё работает.

## Нативные команды

- Команды `list-procedures` в CLI нет. Для списка функций удобнее MCP (`list_procedures`) либо `decompile-all`.
- `decompile <файл> <имя или адрес>`. Ответ — строка в `normalized_result`.
- `analyze` с несколькими настроенными движками: указывать `--provider ghidra|kuna|hopper`.
- `evidence_id` зависит от написания пути (`\` или `/`). Сравнивать результаты по `graph_id`, а не по нему.
