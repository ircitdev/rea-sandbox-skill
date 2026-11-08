#!/usr/bin/env bash
# Изолированная установка REA и движков в одну папку. Системных изменений нет.
# bootstrap.sh <папка> [--ghidra] [--kuna]
# Версии: REA_VERSION=6.8.0 GHIDRA_SERIES=12.1 KUNA_VERSION=1.990 NODE_MAJOR=24
set -euo pipefail

W="${1:?укажите папку}"; shift
WANT_GHIDRA=0; WANT_KUNA=0
for a in "$@"; do case "$a" in --ghidra) WANT_GHIDRA=1;; --kuna) WANT_KUNA=1;; *) echo "неизвестный аргумент: $a"; exit 2;; esac; done
REA_VERSION="${REA_VERSION:-6.8.0}"; GHIDRA_SERIES="${GHIDRA_SERIES:-12.1}"; KUNA_VERSION="${KUNA_VERSION:-1.990}"; NODE_MAJOR="${NODE_MAJOR:-24}"

mkdir -p "$W/dl"; W="$(cd "$W" && pwd)"
path_out() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) OS=win;; Linux) OS=linux;; Darwin) OS=mac;; *) echo "неизвестная ОС"; exit 1;;
esac
case "$(uname -m)" in x86_64|amd64) ARCH=x64;; aarch64|arm64) ARCH=arm64;; *) echo "неизвестная архитектура"; exit 1;; esac

need_hash() { # файл ожидаемый_sha256
  local act; act="$(sha256sum "$1" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$1" | cut -d' ' -f1)"
  [ "$act" = "$2" ] || { echo "SHA-256 НЕ СОВПАЛ: $1"; rm -f "$1"; exit 1; }
  echo "  sha256 ок: $(basename "$1")"
}
fetch() { # url файл
  [ -s "$2" ] && { echo "  уже скачан: $(basename "$2")"; return; }
  curl -fsSL --retry 3 -o "$2" "$1"
}
unpack() { # архив папка
  mkdir -p "$2"
  case "$1" in *.zip) unzip -qo "$1" -d "$2";; *.tar.xz) tar -xJf "$1" -C "$2";; *.tar.gz|*.tgz) tar -xzf "$1" -C "$2";; esac
}

echo "== Node $NODE_MAJOR"
case "$OS" in win) P="win-$ARCH"; EXT=zip;; linux) P="linux-$ARCH"; EXT=tar.xz;; mac) P="darwin-$ARCH"; EXT=tar.gz;; esac
NV="$(curl -fsSL https://nodejs.org/dist/index.json | grep -o "\"version\":\"v$NODE_MAJOR\.[0-9.]*\"" | head -1 | cut -d'"' -f4)"
[ -n "$NV" ] || { echo "не найдена версия Node"; exit 1; }
F="node-$NV-$P.$EXT"; fetch "https://nodejs.org/dist/$NV/$F" "$W/dl/node.$EXT"
need_hash "$W/dl/node.$EXT" "$(curl -fsSL "https://nodejs.org/dist/$NV/SHASUMS256.txt" | grep " $F\$" | cut -d' ' -f1)"
rm -rf "$W/node"; unpack "$W/dl/node.$EXT" "$W/node"
ND="$W/node/node-$NV-$P"; [ "$OS" = win ] && NODE_BIN="$ND" || NODE_BIN="$ND/bin"
export PATH="$NODE_BIN:$PATH"; "$NODE_BIN/node" -v

json() { # файл выражение над j
  "$NODE_BIN/node" -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const r=eval(process.argv[2]);if(r==null)process.exit(3);console.log(r)' "$(path_out "$1")" "$2"
}

echo "== REA $REA_VERSION"
mkdir -p "$W/rea"; ( cd "$W/rea"; [ -f package.json ] || npm init -y >/dev/null; npm i "rea-agents@$REA_VERSION" --ignore-scripts --omit=optional --no-audit --no-fund 2>&1 | tail -1 )
REA_ENTRY="$W/rea/node_modules/rea-agents/scripts/rea.mjs"

ENV="$W/env.sh"
{
  echo "export PATH=\"$NODE_BIN:\$PATH\""
  echo "export REA_ENTRY=\"$(path_out "$REA_ENTRY")\""
  echo 'rea() { node "$REA_ENTRY" "$@"; }'
} > "$ENV"

if [ "$WANT_GHIDRA" = 1 ]; then
  echo "== JDK 21"
  case "$OS" in win) JO=windows; JE=zip;; linux) JO=linux; JE=tar.gz;; mac) JO=mac; JE=tar.gz;; esac
  [ "$ARCH" = x64 ] && JA=x64 || JA=aarch64
  curl -fsSL "https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=$JA&image_type=jdk&os=$JO&vendor=eclipse" -o "$W/dl/jdk.json"
  fetch "$(json "$W/dl/jdk.json" 'j[0].binary.package.link')" "$W/dl/jdk.$JE"
  need_hash "$W/dl/jdk.$JE" "$(json "$W/dl/jdk.json" 'j[0].binary.package.checksum')"
  rm -rf "$W/jdk"; unpack "$W/dl/jdk.$JE" "$W/jdk"
  JH="$(find "$W/jdk" -mindepth 1 -maxdepth 1 -type d | head -1)"; [ "$OS" = mac ] && JH="$JH/Contents/Home"

  echo "== Ghidra $GHIDRA_SERIES.x"
  curl -fsSL "https://api.github.com/repos/NationalSecurityAgency/ghidra/releases?per_page=30" -o "$W/dl/ghidra.json"
  EXPR="(()=>{const s=process.env.GHIDRA_SERIES||'$GHIDRA_SERIES';const v=t=>t.replace(/^Ghidra_|_build\$/g,'');const r=j.filter(x=>v(x.tag_name)===s||v(x.tag_name).startsWith(s+'.'))[0];const a=r.assets.find(y=>y.name.endsWith('.zip'));return a.browser_download_url+' '+a.digest.replace('sha256:','')})()"
  read -r GURL GSHA <<< "$(json "$W/dl/ghidra.json" "$EXPR")"
  fetch "$GURL" "$W/dl/ghidra.zip"; need_hash "$W/dl/ghidra.zip" "$GSHA"
  rm -rf "$W/ghidra"; unpack "$W/dl/ghidra.zip" "$W/ghidra"
  GH="$(find "$W/ghidra" -mindepth 1 -maxdepth 1 -type d | head -1)"
  {
    echo "export JAVA_HOME=\"$(path_out "$JH")\""
    echo "export GHIDRA_INSTALL_DIR=\"$(path_out "$GH")\""
    echo "export PATH=\"$JH/bin:\$PATH\""
  } >> "$ENV"
fi

if [ "$WANT_KUNA" = 1 ]; then
  [ "$OS" != win ] || { echo "Kuna: REA не поддерживает этот провайдер на Windows, используйте контейнер Linux"; exit 1; }
  echo "== Kuna $KUNA_VERSION"
  case "$OS-$ARCH" in linux-x64) KP=linux-x86_64;; linux-arm64) KP=linux-arm64;; mac-x64) KP=macos-x86_64;; mac-arm64) KP=macos-arm64;; esac
  KA="kuna-v$KUNA_VERSION-$KP.tar.gz"
  curl -fsSL "https://api.github.com/repos/Noelo-Lab/kuna/releases/tags/v$KUNA_VERSION" -o "$W/dl/kuna.json"
  KE="j.assets.find(a=>a.name==='$KA')"
  fetch "$(json "$W/dl/kuna.json" "$KE.browser_download_url")" "$W/dl/$KA"
  need_hash "$W/dl/$KA" "$(json "$W/dl/kuna.json" "$KE.digest.replace('sha256:','')")"
  rm -rf "$W/kuna"; unpack "$W/dl/$KA" "$W/kuna"
  KB="$(find "$W/kuna" -type f -name kuna | head -1)"; chmod +x "$KB"
  echo "export REA_KUNA_COMMAND=\"$KB\"" >> "$ENV"
fi

echo "готово: source \"$ENV\", затем rea doctor"
