"""OpenAlex 工具 _invert_abstract 函数单元测试。

测试 src.tools.openalex._invert_abstract：把倒排索引还原为文本。
"""

from __future__ import annotations

from src.tools.openalex import _invert_abstract


class TestInvertAbstract:
    """_invert_abstract：倒排索引还原。"""

    def test_empty_index_returns_empty(self):
        # 空 index {} → 返回空字符串
        assert _invert_abstract({}) == ""

    def test_none_returns_empty(self):
        # None → 返回空字符串
        assert _invert_abstract(None) == ""  # type: ignore[arg-type]

    def test_normal_index(self):
        # 正常 index {"0": ["Hello"], "1": ["world"]} → 返回 "Hello world"
        index = {"Hello": [0], "world": [1]}
        assert _invert_abstract(index) == "Hello world"

    def test_single_word_multiple_positions(self):
        # 单字多位置 {"the": [0, 1, 2]} → 返回 "the the the"
        index = {"the": [0, 1, 2]}
        assert _invert_abstract(index) == "the the the"

    def test_unordered_index_sorted_by_position(self):
        # 无序 index → 按 position 数字排序还原
        index = {"world": [1], "Hello": [0]}
        assert _invert_abstract(index) == "Hello world"

    def test_word_at_multiple_positions_interleaved(self):
        # 多个词交错位置
        index = {"A": [0, 2], "B": [1, 3]}
        assert _invert_abstract(index) == "A B A B"

    def test_single_word_single_position(self):
        index = {"solo": [0]}
        assert _invert_abstract(index) == "solo"

    def test_large_position_numbers(self):
        # 大位置编号也能正确排序（数字排序而非字符串排序）
        index = {"ten": [10], "two": [2], "one": [1]}
        assert _invert_abstract(index) == "one two ten"

    def test_empty_position_list(self):
        # 某词位置列表为空 → 该词不出现
        index = {"Hello": [0], "missing": [], "world": [1]}
        assert _invert_abstract(index) == "Hello world"
