#!/bin/bash
# 分段跑完 100 关（每段 3 关，段间重启浏览器，规避云主机内存上限）
set -u
LOG=/home/user/land/pt-full.log
SAVE=/home/user/land/save-w.json
: > "$LOG"
for i in $(seq 1 45); do
  echo "===== 段 $i 开始 $(date +%H:%M:%S) =====" >> "$LOG"
  ONEKNIFE_CHROMIUM_PATH=/usr/local/bin/chromium ONEKNIFE_CLASS=warrior \
    ONEKNIFE_MAPS_PER_SEG=3 ONEKNIFE_SAVE_IN=$SAVE ONEKNIFE_SAVE_OUT=$SAVE.tmp \
    ONEKNIFE_OUT=/home/user/land/pt-seg-$i.json ONEKNIFE_SHOTS=/home/user/land/shots \
    timeout 600 node tools/playthrough.cjs >> "$LOG" 2>&1
  [ -s "$SAVE.tmp" ] && mv "$SAVE.tmp" "$SAVE"
  DONE=$(python3 -c "
import json
try: d=json.load(open('/home/user/land/save-w.json'))
except Exception: print(0); raise SystemExit
print(1 if d.get('currentMapId')=='stage_100' and d.get('progress',{}).get('stage_100',{}).get('completed') else 0)
")
  if [ "$DONE" = "1" ]; then echo "ALLDONE $(date +%H:%M:%S)" >> "$LOG"; break; fi
done
