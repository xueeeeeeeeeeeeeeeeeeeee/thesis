"""arXiv 工具 _parse 函数单元测试。

测试 src.tools.arxiv._parse 对 Atom XML 的解析：
- 有效 XML → 解析出 list of dict
- 空 feed → 返回 []
- 非法 XML → 返回 []（不抛错）
- 多个 entry → 返回多条
- entry 缺 doi → 该字段为 None
"""

from __future__ import annotations

from src.tools.arxiv import _parse


# 有效 Atom XML 命名空间
ATOM_NS = "http://www.w3.org/2005/Atom"
ARXIV_NS = "http://arxiv.org/schemas/atom"


def _make_entry(
    title: str = "Test Paper",
    abstract: str = "An abstract.",
    published: str = "2024-01-15T00:00:00Z",
    entry_id: str = "http://arxiv.org/abs/2401.00001v1",
    authors: list[str] | None = None,
    doi: str | None = None,
) -> str:
    """构造单个 entry 的 XML 字符串。"""
    authors = authors or ["Author A", "Author B"]
    author_xml = "".join(
        f"<author><name>{a}</name></author>" for a in authors
    )
    doi_xml = f"<arxiv:doi xmlns:arxiv=\"{ARXIV_NS}\">{doi}</arxiv:doi>" if doi else ""
    return f"""<entry>
        <title>{title}</title>
        <summary>{abstract}</summary>
        <published>{published}</published>
        <id>{entry_id}</id>
        {author_xml}
        {doi_xml}
    </entry>"""


def _make_feed(entries: str) -> str:
    """构造完整 Atom feed。"""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="{ATOM_NS}">
    {entries}
</feed>"""


class TestArxivParse:
    """_parse：Atom XML 解析。"""

    def test_valid_xml_returns_list_of_dict(self):
        # 构造有效 Atom XML（含 entry/title/authors/published/doi）→ 解析出 list of dict
        xml = _make_feed(_make_entry(
            title="Deep Learning Survey",
            abstract="A survey on deep learning.",
            published="2024-03-20T12:00:00Z",
            entry_id="http://arxiv.org/abs/2403.00001v1",
            authors=["Alice", "Bob"],
            doi="10.48550/arXiv.2403.00001",
        ))
        results = _parse(xml)
        assert isinstance(results, list)
        assert len(results) == 1
        item = results[0]
        # 每个 dict 含 title/authors/year/doi 等字段
        assert item["title"] == "Deep Learning Survey"
        assert item["abstract"] == "A survey on deep learning."
        assert item["authors"] == ["Alice", "Bob"]
        assert item["year"] == 2024
        assert item["doi"] == "10.48550/arXiv.2403.00001"
        assert item["url"] == "http://arxiv.org/abs/2403.00001v1"
        assert item["source"] == "arxiv"

    def test_empty_feed_returns_empty(self):
        # 空 feed → 返回 []
        xml = _make_feed("")
        results = _parse(xml)
        assert results == []

    def test_invalid_xml_returns_empty(self):
        # 非法 XML → 返回 []（不抛错）
        results = _parse("this is not xml <<<")
        assert results == []

    def test_multiple_entries(self):
        # 多个 entry → 返回多条
        entries = _make_entry(title="Paper One", doi="10.1/x") + _make_entry(title="Paper Two", doi="10.2/y")
        xml = _make_feed(entries)
        results = _parse(xml)
        assert len(results) == 2
        assert results[0]["title"] == "Paper One"
        assert results[1]["title"] == "Paper Two"

    def test_entry_missing_doi(self):
        # entry 缺 doi → 该字段为 None
        entry = _make_entry(doi=None)
        xml = _make_feed(entry)
        results = _parse(xml)
        assert len(results) == 1
        assert results[0]["doi"] is None

    def test_entry_missing_published(self):
        # entry 缺 published → year 为 None
        entry = """<entry>
            <title>No Date</title>
            <summary>abstract</summary>
            <id>http://arxiv.org/abs/0000</id>
            <author><name>Someone</name></author>
        </entry>"""
        xml = _make_feed(entry)
        results = _parse(xml)
        assert len(results) == 1
        assert results[0]["year"] is None

    def test_entry_missing_title(self):
        # entry 缺 title → title 为空字符串
        entry = """<entry>
            <summary>abstract</summary>
            <published>2024-01-01T00:00:00Z</published>
            <id>http://arxiv.org/abs/0000</id>
        </entry>"""
        xml = _make_feed(entry)
        results = _parse(xml)
        assert len(results) == 1
        assert results[0]["title"] == ""

    def test_metadata_contains_source(self):
        # metadata 含 source: arxiv
        xml = _make_feed(_make_entry())
        results = _parse(xml)
        assert results[0]["metadata"]["source"] == "arxiv"

    def test_empty_string_returns_empty(self):
        # 空字符串 → 返回 []（非法 XML）
        assert _parse("") == []
