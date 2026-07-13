"""BM25 检索封装单元测试。

测试 src.rag.bm25 的：
- tokenize：中英文分词（中文按单字、英文按词小写）
- BM25Store：fit / query / add / clear / all_docs
"""

from __future__ import annotations

from src.rag.bm25 import BM25Store, tokenize


# ============================================================================
# tokenize 测试
# ============================================================================


class TestTokenize:
    """tokenize：中英文分词。"""

    def test_pure_english_lowercase(self):
        # 纯英文 → 按词切分并小写
        assert tokenize("hello world") == ["hello", "world"]

    def test_pure_chinese_by_char(self):
        # 纯中文 → 按单字切分
        assert tokenize("自然语言处理") == ["自", "然", "语", "言", "处", "理"]

    def test_mixed_chinese_english(self):
        # 中英混合 → 英文按词、中文按字
        assert tokenize("hello 世界") == ["hello", "世", "界"]

    def test_with_digits(self):
        # 含数字 → 数字作为词的一部分
        assert tokenize("test123 456") == ["test123", "456"]

    def test_empty_string(self):
        # 空字符串 → 空列表
        assert tokenize("") == []

    def test_pure_punctuation(self):
        # 纯标点 → 空列表
        assert tokenize("!!？？") == []

    def test_mixed_case(self):
        # 大小写混合 → 全部小写
        assert tokenize("Hello WORLD") == ["hello", "world"]

    def test_none_returns_empty(self):
        # None 输入 → 空列表（函数内 `if not text` 兜底）
        assert tokenize(None) == []  # type: ignore[arg-type]


# ============================================================================
# BM25Store 测试（用真实 BM25Okapi，轻量无需 mock）
# ============================================================================


def _make_doc(doc_id: str, content: str, source: str = "test") -> dict:
    return {"doc_id": doc_id, "content": content, "metadata": {"source": source}}


class TestBM25Store:
    """BM25Store：内存文档索引。"""

    def test_fit_sets_size(self):
        # fit 后 size 正确
        store = BM25Store()
        store.fit([_make_doc("1", "hello world"), _make_doc("2", "foo bar")])
        assert store.size == 2

    def test_query_returns_top_k(self):
        # query 返回最多 top_k 条
        store = BM25Store()
        store.fit(
            [
                _make_doc("1", "machine learning algorithm"),
                _make_doc("2", "deep learning model"),
                _make_doc("3", "natural language processing"),
            ]
        )
        results = store.query("learning", top_k=2)
        assert len(results) <= 2
        # 所有结果应有 doc_id / content / score / metadata
        for r in results:
            assert "doc_id" in r
            assert "content" in r
            assert "score" in r
            assert "metadata" in r

    def test_query_empty_store_returns_empty(self):
        # 空索引查询 → 空列表
        store = BM25Store()
        assert store.query("anything") == []

    def test_query_empty_string_returns_empty(self):
        # 空查询 → 空列表
        store = BM25Store()
        store.fit([_make_doc("1", "hello")])
        assert store.query("") == []

    def test_add_incremental(self):
        # add 增量添加
        store = BM25Store()
        store.fit([_make_doc("1", "hello")])
        assert store.size == 1
        store.add([_make_doc("2", "world"), _make_doc("3", "foo")])
        assert store.size == 3

    def test_clear_resets_size(self):
        # clear 后 size=0
        store = BM25Store()
        store.fit([_make_doc("1", "hello"), _make_doc("2", "world")])
        store.clear()
        assert store.size == 0
        # 清空后查询应返回空
        assert store.query("hello") == []

    def test_all_docs_returns_all(self):
        # all_docs 返回所有文档
        docs = [_make_doc("1", "hello"), _make_doc("2", "world")]
        store = BM25Store()
        store.fit(docs)
        all_d = store.all_docs()
        assert len(all_d) == 2
        # all_docs 返回的是副本，修改不影响内部
        all_d.clear()
        assert store.size == 2

    def test_fit_replaces_existing(self):
        # fit 替换已有文档（而非追加）
        store = BM25Store()
        store.fit([_make_doc("1", "hello"), _make_doc("2", "world")])
        store.fit([_make_doc("3", "foo")])
        assert store.size == 1
        assert store.all_docs()[0]["doc_id"] == "3"

    def test_query_relevance(self):
        # 相关性：查询词命中的文档应排在前面
        store = BM25Store()
        store.fit(
            [
                _make_doc("1", "machine learning is fun"),
                _make_doc("2", "cooking recipe pasta"),
                _make_doc("3", "learning algorithm deep"),
            ]
        )
        results = store.query("learning", top_k=3)
        # 至少返回 2 条含 learning 的文档
        assert len(results) >= 2
        # 排名第一的应含 learning
        assert "learning" in results[0]["content"]
