"""外部学术 API 工具包。

每个工具异步调用对应学术 API，统一返回文献字典列表：
{title, abstract, authors, year, doi, url, source, metadata}
"""

from src.tools.arxiv import search as search_arxiv
from src.tools.openalex import search as search_openalex
from src.tools.pubmed import search as search_pubmed
from src.tools.semantic_scholar import search as search_s2

__all__ = [
    "search_arxiv",
    "search_s2",
    "search_openalex",
    "search_pubmed",
]
