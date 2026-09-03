#!/bin/bash
# tool-result файлуудаас керний фотоны JPG-үүдийг задалж photos/<HOLE>/ руу хийнэ.
# Нэр: MTDH-13_41.00-48.70_Box 9-10.JPG → гүнээр эрэмбэлж <HOLE>_NNN.jpg болгоно.
TR=/root/.claude/projects/-home-user-Jargal/30431c80-020b-5781-a833-16fcbec0b171/tool-results
SP="$(cd "$(dirname "$0")" && pwd)"
cd "$SP" || exit 1
mkdir -p photos_jpg
for f in $TR/mcp-Google_Drive-download_file_content-*.txt; do
  t=$(jq -r '.mimeType + "\t" + (.title // "")' "$f" 2>/dev/null)
  mt=${t%%$'\t'*}; ti=${t#*$'\t'}
  [ "$mt" = "image/jpeg" ] || continue
  case "$ti" in MTDH-*) ;; *) continue ;; esac
  hole=$(echo "$ti" | grep -oE '^MTDH-[0-9]{2}')
  mkdir -p "photos_jpg/$hole"
  out="photos_jpg/$hole/$ti"
  [ -s "$out" ] || { jq -r '.content' "$f" | base64 -d > "$out"; }
done
# гүнээр эрэмбэлж photos/<HOLE>/<HOLE>_NNN.jpg болгох
python3 - <<'PY'
import os, re, shutil
src, dst = "photos_jpg", "photos"
for hole in sorted(os.listdir(src)):
    d = os.path.join(src, hole)
    if not os.path.isdir(d): continue
    files = []
    for fn in os.listdir(d):
        m = re.match(r"MTDH-\d{2}_(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)_", fn)
        if m: files.append((float(m.group(1)), fn))
    if not files: continue
    files.sort()
    od = os.path.join(dst, hole); os.makedirs(od, exist_ok=True)
    for i, (_, fn) in enumerate(files, 1):
        shutil.copy2(os.path.join(d, fn), os.path.join(od, "%s_%03d.jpg" % (hole, i)))
    print("%-9s %d зураг" % (hole, len(files)))
PY
