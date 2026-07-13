#!/bin/bash
# 停止所有 RAP 服务
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${RED}停止 RAP 服务...${NC}"

for name in llm backend frontend; do
    PID_FILE="/tmp/rap_${name}.pid"
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            echo -e "  ${GREEN}✓${NC} 已停止 $name (PID: $PID)"
        fi
        rm -f "$PID_FILE"
    fi
done

# 兜底：按端口杀
for port in 5173 3001 8000; do
    PIDS=$(lsof -ti :$port 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "$PIDS" | xargs kill 2>/dev/null || true
        echo -e "  ${GREEN}✓${NC} 已释放端口 $port"
    fi
done

echo -e "${GREEN}完成${NC}"
