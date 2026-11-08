# Движки и платформы

Проверено на `rea-agents` 6.8.0, ноябрь 2026. Точный ответ для текущей версии даёт `rea doctor`.

| Движок | Windows | Linux | macOS | Цели | Получение |
|---|---|---|---|---|---|
| Ghidra 12.1.x + JDK 21 | только PE и raw 6502 | PE, ELF, Mach-O | заявлено, не проверялось | x86, x64, arm64 | `bootstrap.sh --ghidra` |
| Kuna | `unsupported_host` | ELF, thin Mach-O | заявлено, не проверялось | x64, arm64, arm; PE отклоняется | `bootstrap.sh --kuna` |
| Hopper (демо) | `unsupported_host` | Ubuntu 24.04+, Fedora, Arch; проверен ELF x64 | заявлено, не проверялось | коммерческий, есть демо | `rea setup --install-hopper` |
| IDA | не проверялась | не проверялась | не проверялась | нужна лицензия Hex-Rays | `REA_IDA_MCP_CONFIG` |
| без движка | `.NET`, манифест | то же | то же | `inspect-artifact` даёт лишь формат и SHA-256 | — |

Если `analyze` отвечает `provider_unavailable`, точная причина лежит в `details.rejections` по каждому движку.

## Сравнительное время

Одна команда на маленьком бинарнике, движки поднимаются заново:

| Движок | `analyze` | `decompile` |
|---|---|---|
| Kuna | 1,7–1,8 с | 1,8–2 с |
| Hopper | 4 с | 4 с |
| Ghidra, Linux | 10–15 с | 10–14 с |
| Ghidra, Windows | 18–30 с | 19–29 с |

В сессии MCP бинарник открывается один раз (`open_binary`), поэтому последующие вызовы быстрее.

## Контейнер Linux на Windows

Для ELF, Mach-O, Kuna и Hopper:

```bash
MSYS_NO_PATHCONV=1 docker run -d --name rea-test --memory 8g --cpus 6 \
  -v "<папка скилла>:/skill:ro" -v "<папка целей>:/in:ro" ubuntu:24.04 sleep 10800

docker exec rea-test bash -c 'apt-get update -qq && apt-get install -y -qq procps curl ca-certificates xz-utils unzip'
docker exec rea-test bash /skill/scripts/bootstrap.sh /opt/rea-w --ghidra --kuna
docker exec rea-test bash -c 'source /opt/rea-w/env.sh; rea doctor'
```

Команды `rea` в контейнере запускать только через `source /opt/rea-w/env.sh`. Когда работа закончена — `docker rm -f rea-test`.

`procps` обязателен: на Linux REA использует `ps`.

## Hopper в контейнере

- `rea setup --client claude_code --install-hopper --yes` тянет много пакетов Qt через `apt`. Закладывать 10–15 минут, короткий `timeout` оборвёт установку.
- Демо-режиму нужна системная библиотека Python: `apt-get install -y libpython3.12t64 python3`. `rea doctor --provider hopper` сообщает об этом точно.
- `setup` может вернуть `needs_human`, хотя пакет поставлен. Проверять итог через `doctor`.
- Xvfb не понадобился.

## Версии

- `doctor` 6.8.0 просит Ghidra 12.1.x. Более новую ветку проверять отдельно, а не считать ни подходящей, ни сломанной.
- `doctor` 6.8.0 называет проверенной Kuna 1.833, документация main — 1.990. На одних и тех же файлах обе дали одинаковые счётчики.
- Node: `^22.23.4 || ^24.22.1 || >=26.12.1`. На более старой версии CLI запускается с предупреждением, но `doctor` красный.
