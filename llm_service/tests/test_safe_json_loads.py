"""safe_json_loads 单元测试。

测试 src.agents.safe_json_loads 对各种 LLM 输出文本的解析能力：
- 标准 JSON / JSON 数组
- ```json 代码块 / 无语言标签代码块
- 文本混杂的 JSON
- 无法解析的纯文本
- default 参数行为
- 嵌套 JSON
"""

from __future__ import annotations

from src.agents import safe_json_loads


# ============================================================================
# 空输入与 default 行为
# ============================================================================


class TestSafeJsonLoadsDefault:
    """空输入与 default 返回行为。"""

    def test_empty_string_returns_default_none(self):
        # 空字符串应返回默认值 None
        assert safe_json_loads("") is None

    def test_none_returns_default_none(self):
        # None 输入应返回默认值 None
        assert safe_json_loads(None) is None  # type: ignore[arg-type]

    def test_empty_string_with_explicit_default(self):
        # 空字符串 + 指定 default → 返回该 default
        assert safe_json_loads("", default={"fallback": True}) == {"fallback": True}

    def test_unparseable_returns_default_none(self):
        # 完全无法解析的纯文本 → 返回 default（None）
        assert safe_json_loads("这只是一段纯文字，没有 JSON") is None

    def test_unparseable_with_explicit_default(self):
        # 无法解析 + 指定 default → 返回该 default
        assert safe_json_loads("纯文字", default=[]) == []


# ============================================================================
# 标准 JSON
# ============================================================================


class TestSafeJsonLoadsStandard:
    """标准 JSON 解析。"""

    def test_standard_json_object(self):
        # 标准 JSON 对象 → 返回 dict
        assert safe_json_loads('{"a": 1}') == {"a": 1}

    def test_standard_json_array(self):
        # 标准 JSON 数组 → 返回 list
        assert safe_json_loads("[1, 2, 3]") == [1, 2, 3]

    def test_nested_json(self):
        # 嵌套 JSON
        text = '{"a": {"b": [1, 2]}}'
        assert safe_json_loads(text) == {"a": {"b": [1, 2]}}

    def test_json_with_whitespace(self):
        # 前后带空白的 JSON 仍可解析
        assert safe_json_loads('  {"a": 1}  ') == {"a": 1}


# ============================================================================
# 代码块
# ============================================================================


class TestSafeJsonLoadsCodeBlock:
    """```json 代码块解析。"""

    def test_json_code_block_with_language_tag(self):
        # ```json 代码块 → 解析出 dict
        text = "```json\n{\"a\": 1}\n```"
        assert safe_json_loads(text) == {"a": 1}

    def test_code_block_without_language_tag(self):
        # 不带语言标签的代码块 → 解析出 dict
        text = "```\n{\"a\": 1}\n```"
        assert safe_json_loads(text) == {"a": 1}

    def test_code_block_with_surrounding_text(self):
        # 代码块前后有文字 → 仍能解析出 JSON
        text = "前文说明\n```json\n{\"a\": 1}\n```\n后文说明"
        assert safe_json_loads(text) == {"a": 1}


# ============================================================================
# 文本混杂 JSON
# ============================================================================


class TestSafeJsonLoadsEmbedded:
    """文本中混杂的 JSON 解析。"""

    def test_json_with_leading_text(self):
        # JSON 前有文字 → 解析出 dict
        text = '前置文字 {"a": 1}'
        assert safe_json_loads(text) == {"a": 1}

    def test_json_with_trailing_text(self):
        # JSON 后有文字 → 解析出 dict
        text = '{"a": 1} 后置文字'
        assert safe_json_loads(text) == {"a": 1}

    def test_json_surrounded_by_text(self):
        # JSON 前后混杂文字 → 解析出 dict
        text = '前置文字 {"a": 1} 后置文字'
        assert safe_json_loads(text) == {"a": 1}

    def test_array_with_surrounding_text(self):
        # 含中括号，文字混杂 → 解析出 list
        text = "文字 [1, 2] 文字"
        assert safe_json_loads(text) == [1, 2]
