#!/bin/bash
# 健康检查脚本 - 验证三个服务是否联通
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check() {
    local name=$1
    local url=$2
    local expected=$3
    local resp
    resp=$(curl -s -m 3 "$url" 2>/dev/null || echo "FAILED")
    if echo "$resp" | grep -q "$expected"; then
        echo -e "  ${GREEN}✓${NC} $name  $url"
        return 0
    else
        echo -e "  ${RED}✗${NC} $name  $url"
        echo -e "     响应: $(echo "$resp" | head -c 100)"
        return 1
    fi
}

echo -e "${YELLOW}===== RAP 服务健康检查 =====${NC}"
echo ""

FAIL=0

check "LLM 服务  " "http://localhost:8000/health" '"ok"' || FAIL=1
check "后端服务  " "http://localhost:3001/health" '"ok"' || FAIL=1
check "前端服务  " "http://localhost:5173"         "<!doctype" || FAIL=1

echo ""

# 联调验证
echo -e "${YELLOW}===== 联调验证 =====${NC}"
echo ""

# 后端 → LLM 代理
RESP=$(curl -s -m 5 http://localhost:3001/api/llm/models 2>/dev/null || echo "FAILED")
if echo "$RESP" | grep -q "data"; then
    echo -e "  ${GREEN}✓${NC} 后端 → LLM 代理通畅 (/api/llm/models)"
else
    echo -e "  ${RED}✗${NC} 后端 → LLM 代理失败"
    echo -e "     $RESP" | head -c 200
    FAIL=1
fi

# 后端项目接口（需要登录，不能把 401 的 {"code":-1} 误判为正常）
LOGIN=$(curl -s -m 5 \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL:-admin@rap.dev}\",\"password\":\"${ADMIN_PASSWORD:-admin123}\"}" \
    http://localhost:3001/api/auth/login 2>/dev/null || echo "FAILED")
TOKEN=$(echo "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
RESP=$(curl -s -m 5 -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/projects 2>/dev/null || echo "FAILED")
if echo "$RESP" | grep -q '"code":0'; then
    echo -e "  ${GREEN}✓${NC} 后端项目接口 (/api/projects)"
else
    echo -e "  ${RED}✗${NC} 后端项目接口失败"
    echo -e "     $RESP" | head -c 200
    FAIL=1
fi

echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ 全部服务正常${NC}"
    exit 0
else
    echo -e "${RED}❌ 部分服务异常，请检查${NC}"
    exit 1
fi
