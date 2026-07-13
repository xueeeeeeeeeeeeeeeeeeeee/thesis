#!/bin/bash
# 一键启动三个服务（开发模式，不使用 Docker）
# 用法：./start.sh [all|frontend|backend|llm]
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="${1:-all}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN} Research Auto-Pilot 启动脚本${NC}"
echo -e "${CYAN}========================================${NC}"

start_llm() {
    echo -e "${YELLOW}[1/3] 启动 LLM 服务 (Python, :8000)...${NC}"
    cd "$ROOT_DIR/llm_service"
    if [ ! -d "venv" ]; then
        echo -e "${YELLOW}    创建虚拟环境...${NC}"
        python3 -m venv venv
    fi
    source venv/bin/activate
    pip install -q -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ 2>/dev/null || true
    uvicorn src.main:app --reload --port 8000 &
    echo $! > /tmp/rap_llm.pid
    cd "$ROOT_DIR"
}

start_backend() {
    echo -e "${YELLOW}[2/3] 启动后端 (Node.js, :3001)...${NC}"
    cd "$ROOT_DIR/backend"
    [ ! -d "node_modules" ] && npm install
    npm run dev &
    echo $! > /tmp/rap_backend.pid
    cd "$ROOT_DIR"
}

start_frontend() {
    echo -e "${YELLOW}[3/3] 启动前端 (React, :5173)...${NC}"
    cd "$ROOT_DIR/frontend"
    [ ! -d "node_modules" ] && npm install
    npm run dev &
    echo $! > /tmp/rap_frontend.pid
    cd "$ROOT_DIR"
}

case "$TARGET" in
    llm) start_llm ;;
    backend) start_backend ;;
    frontend) start_frontend ;;
    all)
        start_llm
        sleep 3
        start_backend
        sleep 2
        start_frontend
        ;;
    *)
        echo "用法: $0 [all|frontend|backend|llm]"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} 启动完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "  前端:   http://localhost:5173"
echo -e "  后端:   http://localhost:3001"
echo -e "  LLM:    http://localhost:8000"
echo ""
echo -e "停止所有服务: ${CYAN}./stop.sh${NC}"
echo ""

if [ "$TARGET" = "all" ]; then
    echo -e "${YELLOW}按 Ctrl+C 停止所有服务...${NC}"
    wait
fi
