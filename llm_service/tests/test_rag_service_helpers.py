"""RAG service 辅助函数单元测试。

测试 src.rag.service 的：
- _apply_filters：对 BM25 结果按 metadata 过滤
- _merge_dedupe：按 doc_id 合并去重，分数取较高者
"""

from __future__ import annotations

from src.rag.service import _apply_filters, _merge_dedupe


# ============================================================================
# _apply_filters 测试
# ============================================================================


def _doc(doc_id: str, source: str = "arxiv", year: int = 2024) -> dict:
    return {
        "doc_id": doc_id,
        "content": f"content of {doc_id}",
        "score": 1.0,
        "metadata": {"source": source, "year": year},
    }


class TestApplyFilters:
    """_apply_filters：按 metadata 过滤。"""

    def test_empty_filters_returns_original(self):
        # 空 filters → 返回原 docs
        docs = [_doc("1"), _doc("2")]
        assert _apply_filters(docs, {}) == docs

    def test_single_key_filter(self):
        # 单键 filters → 仅保留匹配项
        docs = [_doc("1", source="arxiv"), _doc("2", source="openalex")]
        result = _apply_filters(docs, {"source": "arxiv"})
        assert len(result) == 1
        assert result[0]["doc_id"] == "1"

    def test_multi_key_filter(self):
        # 多键 filters → 同时满足
        docs = [
            _doc("1", source="arxiv", year=2024),
            _doc("2", source="arxiv", year=2023),
            _doc("3", source="openalex", year=2024),
        ]
        result = _apply_filters(docs, {"source": "arxiv", "year": 2024})
        assert len(result) == 1
        assert result[0]["doc_id"] == "1"

    def test_missing_metadata_key_no_match(self):
        # docs 中 metadata 缺失某键 → 该 doc 不匹配
        docs = [
            {"doc_id": "1", "metadata": {"source": "arxiv"}},  # 缺 year
            {"doc_id": "2", "metadata": {"source": "arxiv", "year": 2024}},
        ]
        result = _apply_filters(docs, {"source": "arxiv", "year": 2024})
        assert len(result) == 1
        assert result[0]["doc_id"] == "2"

    def test_empty_docs_returns_empty(self):
        # 空 docs → 返回 []
        assert _apply_filters([], {"source": "arxiv"}) == []

    def test_none_metadata_treated_as_empty(self):
        # metadata 为 None → 视为空 dict，不匹配
        docs = [{"doc_id": "1", "metadata": None}]
        result = _apply_filters(docs, {"source": "arxiv"})
        assert result == []

    def test_filter_value_type_matters(self):
        # 过滤值类型敏感：year=2024(int) 不匹配 "2024"(str)
        docs = [_doc("1", year=2024)]
        result = _apply_filters(docs, {"year": "2024"})
        assert result == []


# ============================================================================
# _merge_dedupe 测试
# ============================================================================


class TestMergeDedupe:
    """_merge_dedupe：按 doc_id 合并去重。"""

    def test_same_doc_id_keeps_higher_score(self):
        # 两边都有同 doc_id 的项 → 保留 score 较高的
        vec = [{"doc_id": "1", "content": "a", "score": 0.5, "metadata": {}}]
        bm = [{"doc_id": "1", "content": "a", "score": 0.9, "metadata": {}}]
        merged = _merge_dedupe(vec, bm)
        assert len(merged) == 1
        # 分数应取较高者 0.9
        assert float(merged[0]["score"]) == 0.9

    def test_no_doc_id_skipped(self):
        # 无 doc_id 的项 → 被跳过
        vec = [{"content": "no id", "score": 1.0}]
        bm = [{"doc_id": "1", "content": "has id", "score": 0.5}]
        merged = _merge_dedupe(vec, bm)
        assert len(merged) == 1
        assert merged[0]["doc_id"] == "1"

    def test_vec_empty_returns_bm(self):
        # 一边为空 → 返回另一边
        bm = [{"doc_id": "1", "content": "a", "score": 0.5}]
        merged = _merge_dedupe([], bm)
        assert len(merged) == 1
        assert merged[0]["doc_id"] == "1"

    def test_bm_empty_returns_vec(self):
        vec = [{"doc_id": "1", "content": "a", "score": 0.5}]
        merged = _merge_dedupe(vec, [])
        assert len(merged) == 1
        assert merged[0]["doc_id"] == "1"

    def test_both_empty_returns_empty(self):
        # 都为空 → 返回 []
        assert _merge_dedupe([], []) == []

    def test_different_doc_ids_all_kept(self):
        # 不同 doc_id → 全部保留
        vec = [{"doc_id": "1", "content": "a", "score": 0.5}]
        bm = [{"doc_id": "2", "content": "b", "score": 0.6}]
        merged = _merge_dedupe(vec, bm)
        assert len(merged) == 2
        ids = {m["doc_id"] for m in merged}
        assert ids == {"1", "2"}

    def test_vec_priority_for_same_score(self):
        # 同分时向量结果优先（先入 merged）
        vec = [{"doc_id": "1", "content": "from vec", "score": 0.5}]
        bm = [{"doc_id": "1", "content": "from bm", "score": 0.5}]
        merged = _merge_dedupe(vec, bm)
        assert len(merged) == 1
        # 同分时不覆盖，保留向量结果
        assert merged[0]["content"] == "from vec"
