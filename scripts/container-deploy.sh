#!/usr/bin/env bash
# 《一刀999》容器内静态部署与公网隧道恢复脚本（0.8.39 起固化）。
#
# 背景：容器（CodeArts 云电脑）没有持久盘——实测 /opt 下的仓库、8080 进程、
# 隧道日志、甚至 /opt/cloud 之外的 npm 全局包都会在某次会话中被清空重建。
# 唯一事实源是远端仓库，所以把「重建部署」固化成脚本，容器重置后一条命令回到可玩状态。
#
# 用法：
#   bash scripts/container-deploy.sh                     # 默认 /opt/oneknife999 + 8080 + localhost.run 隧道
#   DEST=/opt/knife PORT=9000 bash scripts/container-deploy.sh
#   TUNNEL=none bash scripts/container-deploy.sh         # 只起本地服务，不开免费隧道
#
# 约定：
#   - game/ 原样托管，不打包、不压缩、不改文件名（素材按中文名相对路径按需加载）。
#   - 令牌/密钥一律从环境变量或交互输入获取，本脚本不读写任何凭据文件。
#   - 免费隧道（localhost.run）有 burst 限速，只作本容器的应急入口；
#     稳定公网入口以 instabox 实例为准（见 docs/20261118-2350-容器部署与接手手册-DeepSeek-V4.1-Flash.md）。

set -euo pipefail

REPO_URL=${REPO_URL:-https://atomgit.com/laotongtian/oneknife999.git}
BRANCH=${BRANCH:-main}
DEST=${DEST:-/opt/oneknife999}
PORT=${PORT:-8080}
TUNNEL=${TUNNEL:-localhost.run}
INSTABOX_URL=${INSTABOX_URL:-https://8080-agqxoy6u363jxgfufg2onqxbm4.instabox.tech}

if [ -d "$DEST/.git" ]; then
  if [ -n "$(git -C "$DEST" status --porcelain)" ] && [ "${FORCE:-0}" != "1" ]; then
    echo "[1/4] 中止：$DEST 有未提交改动，下一步的 reset --hard 会丢弃它们。"
    echo "      提交或确认无用后再跑；确实要丢弃请加 FORCE=1。"
    exit 2
  fi
  echo "[1/4] 复用已有仓库并硬对齐 $BRANCH"
  git -C "$DEST" fetch "$REPO_URL" "$BRANCH" --depth 1
  git -C "$DEST" reset --hard FETCH_HEAD
  git -C "$DEST" clean -fdq game/
else
  echo "[1/4] 克隆 $REPO_URL -> $DEST"
  rm -rf "$DEST"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$DEST"
fi
VERSION=$(cat "$DEST/VERSION")
echo "      VERSION=$VERSION  commit=$(git -C "$DEST" rev-parse --short HEAD)"

if ! ss -lnt 2>/dev/null | grep -q ":$PORT "; then
  echo "[2/4] 启动静态服务 $PORT -> $DEST/game"
  nohup python3 -m http.server "$PORT" --directory "$DEST/game" >>/var/log/oneknife.log 2>&1 &
  sleep 2
else
  echo "[2/4] 静态服务已在 $PORT 监听"
fi

BASE="http://127.0.0.1:$PORT"
code() { curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$1"; }
CODE_INDEX=$(code "$BASE/")
CODE_JS=$(code "$BASE/src/main.js")
MIME_JS=$(curl -sI --max-time 20 "$BASE/src/main.js" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')
CODE_CN=$(code "$BASE/assets/monster-full-%E5%86%A5%E6%B2%B3%E5%B7%A8%E9%B3%84-idle.png")
MD5_LOCAL=$(md5sum "$DEST/game/index.html" | awk '{print $1}')
MD5_SERVED=$(curl -s --max-time 20 "$BASE/" | md5sum | awk '{print $1}')

if [ "$CODE_INDEX" != "200" ] || [ "$CODE_JS" != "200" ] || [ "$CODE_CN" != "200" ] || [ "$MD5_LOCAL" != "$MD5_SERVED" ]; then
  echo "[3/4] 验证失败：index=$CODE_INDEX js=$CODE_JS mime=$MIME_JS 中文素材=$CODE_CN md5=$MD5_SERVED/仓库=$MD5_LOCAL"
  echo "      JS MIME 若不是 */javascript 会白屏；中文素材 404 先查文件名是否在克隆时丢字节。"
  exit 1
fi
echo "[3/4] 本地四项通过：index=200  js=200 ($MIME_JS)  中文素材=200  md5=$MD5_SERVED"

case "$TUNNEL" in
  localhost.run)
    if ! pgrep -f "ssh .*localhost.run" >/dev/null 2>&1; then
      echo "[4/4] 启动免费隧道 localhost.run（限速）"
      nohup ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes \
        -R 80:localhost:"$PORT" nokey@localhost.run >>/var/log/tunnel.log 2>&1 &
      sleep 10
    else
      echo "[4/4] 隧道进程已存在"
    fi
    URL=$(grep -oE 'https://[a-z0-9]+\.app\.lhr\.life' /var/log/tunnel.log 2>/dev/null | tail -1 || true)
    if [ -n "$URL" ]; then
      echo "      容器隧道：$URL"
      curl -s -o /dev/null -w "      公网首页 HTTP %{http_code}\n" --max-time 30 "$URL/"
    else
      echo "      隧道地址未生成，检查 /var/log/tunnel.log"
      exit 1
    fi
    ;;
  *)
    echo "[4/4] 按 TUNNEL=$TUNNEL 跳过隧道"
    ;;
esac

echo "稳定公网入口（instabox 实例）：$INSTABOX_URL"