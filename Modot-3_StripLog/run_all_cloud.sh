#!/bin/bash
# Modot-3 (XV-020181) — T1..T4 багануудыг багцаар гаргах (cloud)
# Ашиглалт: bash run_all.sh [ЦООНОГ ...]   (аргументгүй = бүх ажил)
SP="$(cd "$(dirname "$0")" && pwd)"
GEN=/home/user/Jargal/Modot-3_StripLog/20_make_striplog_MT_A3L_cloud.py
MAP="$SP/hole_template_map_cloud.csv"
cd "$SP" || exit 1
ONLY=" $* "
ok=0; fail=0
while IFS=, read -r hole t1 t2 rest; do
  [ "$hole" = "Hole_ID" ] && continue
  [ -z "$hole" ] && continue
  if [ "$ONLY" != "  " ] && [[ "$ONLY" != *" $hole "* ]]; then continue; fi
  for tag in "$t1" "$t2"; do
    [ -z "$tag" ] && continue
    t="${tag%%_*}"                       # T1_Zn-Ag -> T1
    if python3 -u "$GEN" "$hole" "$t" --db drive/MT_Drilling_Database.xlsx \
         --photos photos --out Out_Target --qc Out_Target/QC_PNG 2>&1 | grep -v -e Deprecation -e "page.images"; then
      ok=$((ok+1))
    else
      echo "!! АЛДАА: $hole $t"; fail=$((fail+1))
    fi
  done
done < "$MAP"
echo "=== дууссан: $ok амжилттай, $fail алдаа"
