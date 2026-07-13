#!/bin/bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUTDIR="/Users/xuee/Desktop/xuee/myproject/thesis/docs/ui_screenshots"
BASE="http://localhost:57095/ui_prototype.html"

# 用 JS 切换页面后截图
for page in dashboard workspace hil literature experiment editor version config logs; do
  echo "Capturing $page..."
  $CHROME --headless --disable-gpu \
    --screenshot="$OUTDIR/${page}.png" \
    --window-size=1440,900 \
    --virtual-time-budget=2000 \
    "$BASE#$page" 2>/dev/null
done
echo "Done!"
