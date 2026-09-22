#!/usr/bin/env bash
set -Eeuo pipefail

ROOT='/var/lib/sikhadenge-funnel-golden-lock'
SITE='/etc/nginx/sites-enabled/sikhadenge.in-ssl'
AI_SNIP='/etc/nginx/snippets/sikhadenge-ai-video-3940.conf'
CL_ASSETS='/etc/nginx/snippets/sikhadenge-claude-31aug6pm-assets-final.conf'
AI_URL='https://sikhadenge.in/masterclass/ai-video'
CL_URL='https://sikhadenge.in/masterclass/claude/free'
AI_PORT='3940'
CL_PORT='3940'
AI_APP='sikhadenge-ai-video-golden-faq-3940-20260904-130510'
CL_APP='sikhadenge-ai-video-golden-faq-3940-20260904-130510'
AI_CWD='/var/www/sikhadenge.in/releases/production-ai-video-golden-faq-final-20260904-130510'
CL_CWD='/var/www/sikhadenge.in/releases/production-ai-video-golden-faq-final-20260904-130510'
TS="$(date +%Y%m%d-%H%M%S)"
TMP="$ROOT/.seal-$TS-$$"

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'seal-current must run as root' >&2; exit 1; }
for f in "$SITE" "$AI_SNIP" "$CL_ASSETS"; do [[ -s "$f" ]] || { echo "missing required file: $f" >&2; exit 1; }; done
for d in "$AI_CWD" "$CL_CWD"; do [[ -d "$d" ]] || { echo "missing app cwd: $d" >&2; exit 1; }; done
nginx -t >/dev/null

mkdir -p "$ROOT" "$TMP/public" "$TMP/upstream" "$TMP/config" "$TMP/assets" "$TMP/source-root"
chmod 0700 "$ROOT" "$TMP"

fetch200(){ local url="$1" out="$2" code; code=$(curl -L -sS --connect-timeout 5 --max-time 35 -o "$out" -w '%{http_code}' "$url" || true); [[ "$code" == 200 ]] || { echo "HTTP $code: $url" >&2; return 1; }; }

fetch200 "$AI_URL?seal=$TS" "$TMP/public/ai.html"
fetch200 "$CL_URL?seal=$TS" "$TMP/public/claude.html"
fetch200 "http://127.0.0.1:$AI_PORT/masterclass/ai-video" "$TMP/upstream/ai.html"
fetch200 "http://127.0.0.1:$CL_PORT/masterclass/claude/free" "$TMP/upstream/claude.html"

for m in 'Create cinematic AI videos' 'Six blocks' 'Understand the tools' 'Questions before you'; do grep -Fqi "$m" "$TMP/public/ai.html" || { echo "AI marker missing: $m" >&2; exit 1; }; done
for m in 'AI tools' 'better results'; do grep -Fqi "$m" "$TMP/public/claude.html" || { echo "Claude marker missing: $m" >&2; exit 1; }; done

# Every linked CSS/JS must be healthy before a new Golden state can be sealed.
python3 - "$TMP/public/ai.html" "$TMP/public/claude.html" <<'PY' > "$TMP/linked-urls.txt"
import html,re,sys
seen=set()
for page,file in [('AI',sys.argv[1]),('CLAUDE',sys.argv[2])]:
    s=open(file,errors='ignore').read()
    for kind,pat in [('CSS',r'<link[^>]+href=["\']([^"\']+\.css[^"\']*)'),('JS',r'<script[^>]+src=["\']([^"\']+\.js[^"\']*)')]:
        for u in re.findall(pat,s,re.I):
            u=html.unescape(u)
            if u.startswith('/') and (page,kind,u) not in seen:
                seen.add((page,kind,u)); print('\t'.join((page,kind,u)))
PY

: > "$TMP/assets.tsv"
idx=0
while IFS=$'\t' read -r page kind url; do
  idx=$((idx+1)); out="$TMP/assets/$idx.bin"
  fetch200 "https://sikhadenge.in$url" "$out"
  sha=$(sha256sum "$out" | awk '{print $1}')
  bytes=$(wc -c < "$out")
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$page" "$kind" "$url" "$sha" "$bytes" "assets/$idx.bin" >> "$TMP/assets.tsv"
done < "$TMP/linked-urls.txt"

cp -a "$AI_SNIP" "$TMP/config/ai-snippet.conf"
cp -a "$CL_ASSETS" "$TMP/config/claude-assets.conf"

# Capture only the exact Claude route block, not the whole website config.
python3 - "$SITE" "$TMP/config/claude-route.conf" <<'PY'
from pathlib import Path
import sys
src,dst=map(Path,sys.argv[1:]); s=src.read_text(errors='ignore'); needle='location = /masterclass/claude/free {'
start=s.find(needle)
if start < 0: raise SystemExit('Claude exact route not found')
brace=s.find('{',start); depth=0; quote=None; esc=False; end=None
for i in range(brace,len(s)):
    ch=s[i]
    if esc: esc=False; continue
    if ch=='\\': esc=True; continue
    if quote:
        if ch==quote: quote=None
        continue
    if ch in ('"',"'"): quote=ch; continue
    if ch=='{': depth+=1
    elif ch=='}':
        depth-=1
        if depth==0: end=i+1; break
if end is None: raise SystemExit('Claude route closing brace not found')
dst.write_text(s[start:end]+'\n')
PY

# Capture files that directly make these two Next.js pages render. This allows source-level self-heal.
python3 - "$AI_CWD" "$CL_CWD" "$TMP/linked-urls.txt" <<'PY' > "$TMP/source-candidates.txt"
from pathlib import Path
from urllib.parse import urlsplit
import sys
ai,cl=map(Path,sys.argv[1:3]); rows=Path(sys.argv[3]).read_text().splitlines(); out=[]
for cwd,page_html in [(ai,'masterclass/ai-video.html'),(cl,'masterclass/claude/free.html')]:
    p=cwd/'.next/server/pages'/page_html
    if p.is_file(): out.append(str(p))
for row in rows:
    page,kind,url=row.split('\t',2); cwd=ai if page=='AI' else cl; path=urlsplit(url).path
    if path.startswith('/_next/'):
        p=cwd/'.next'/path[len('/_next/'):]
    else:
        p=cwd/'public'/path.lstrip('/')
    if p.is_file(): out.append(str(p))
for p in dict.fromkeys(out): print(p)
PY

# Also protect file aliases owned by the two dedicated funnel snippets.
python3 - "$AI_SNIP" "$CL_ASSETS" <<'PY' >> "$TMP/source-candidates.txt"
import re,sys,os
for f in sys.argv[1:]:
    s=open(f,errors='ignore').read()
    for p in re.findall(r'\balias\s+([^;]+);',s):
        p=p.strip().strip('"').strip("'")
        if os.path.isfile(p): print(p)
PY

sort -u "$TMP/source-candidates.txt" -o "$TMP/source-candidates.txt"
: > "$TMP/source-files.tsv"
idx=0
while IFS= read -r src; do
  [[ -f "$src" ]] || continue
  idx=$((idx+1)); rel="source-root/${src#/}"; mkdir -p "$TMP/$(dirname "$rel")"; cp -a "$src" "$TMP/$rel"
  sha=$(sha256sum "$src" | awk '{print $1}')
  printf '%s\t%s\t%s\n' "$sha" "$src" "$rel" >> "$TMP/source-files.tsv"
done < "$TMP/source-candidates.txt"

AI_PUBLIC_SHA=$(sha256sum "$TMP/public/ai.html"|awk '{print $1}')
CL_PUBLIC_SHA=$(sha256sum "$TMP/public/claude.html"|awk '{print $1}')
AI_UPSTREAM_SHA=$(sha256sum "$TMP/upstream/ai.html"|awk '{print $1}')
CL_UPSTREAM_SHA=$(sha256sum "$TMP/upstream/claude.html"|awk '{print $1}')
AI_SNIP_SHA=$(sha256sum "$TMP/config/ai-snippet.conf"|awk '{print $1}')
CL_ASSETS_SHA=$(sha256sum "$TMP/config/claude-assets.conf"|awk '{print $1}')
CL_ROUTE_SHA=$(sha256sum "$TMP/config/claude-route.conf"|awk '{print $1}')

cat > "$TMP/state.env" <<EOF
LOCK_VERSION=1
SEALED_AT=$TS
AI_PUBLIC_SHA=$AI_PUBLIC_SHA
CLAUDE_PUBLIC_SHA=$CL_PUBLIC_SHA
AI_UPSTREAM_SHA=$AI_UPSTREAM_SHA
CLAUDE_UPSTREAM_SHA=$CL_UPSTREAM_SHA
AI_SNIP_SHA=$AI_SNIP_SHA
CLAUDE_ASSETS_SHA=$CL_ASSETS_SHA
CLAUDE_ROUTE_SHA=$CL_ROUTE_SHA
AI_APP=$AI_APP
CLAUDE_APP=$CL_APP
AI_CWD=$AI_CWD
CLAUDE_CWD=$CL_CWD
AI_PORT=$AI_PORT
CLAUDE_PORT=$CL_PORT
EOF

chmod -R go-rwx "$TMP"
# Read-only Golden payload. The directory itself remains root-controlled for intentional reseal.
find "$TMP" -type f -exec chmod 0400 {} +
find "$TMP" -type d -exec chmod 0700 {} +

OLD=''
[[ -L "$ROOT/current" ]] && OLD=$(readlink -f "$ROOT/current" || true)
FINAL="$ROOT/seal-$TS"
mv "$TMP" "$FINAL"
ln -sfn "$FINAL" "$ROOT/current.new"
mv -Tf "$ROOT/current.new" "$ROOT/current"
[[ -n "$OLD" ]] && echo "$OLD" > "$ROOT/previous-seal.path" || true

printf '%s\n' \
  '============================================================' \
  'SIKHADENGE TWO-FUNNEL GOLDEN SEAL COMPLETE' \
  "SEAL=$FINAL" \
  "AI_PUBLIC_SHA=$AI_PUBLIC_SHA" \
  "CLAUDE_PUBLIC_SHA=$CL_PUBLIC_SHA" \
  "AI_UPSTREAM_SHA=$AI_UPSTREAM_SHA" \
  "CLAUDE_UPSTREAM_SHA=$CL_UPSTREAM_SHA" \
  "LINKED_ASSETS=$(wc -l < "$FINAL/assets.tsv")" \
  "PROTECTED_SOURCE_FILES=$(wc -l < "$FINAL/source-files.tsv")" \
  '============================================================'
