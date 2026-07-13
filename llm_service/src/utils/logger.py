"""日志工具模块。

配置 logging，彩色输出，INFO 级别，提供 get_logger(name)。
"""

from __future__ import annotations

import logging
import sys
from typing import Optional

# ANSI 颜色码
_COLORS = {
    "DEBUG": "\033[36m",      # 青色
    "INFO": "\033[32m",       # 绿色
    "WARNING": "\033[33m",    # 黄色
    "ERROR": "\033[31m",      # 红色
    "CRITICAL": "\033[35m",   # 熟色
}
_RESET = "\033[0m"

# 简化的日志格式
_FORMAT = "%(asctime)s | %(name)s | %(levelname)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_configured = False


class ColorFormatter(logging.Formatter):
    """彩色日志格式化器。"""

    def format(self, record: logging.LogRecord) -> str:
        # 仅对 tty 输出着色，避免重定向到文件时混入颜色码
        color = _COLORS.get(record.levelname, "")
        if color and sys.stderr.isatty():
            levelname = f"{color}{record.levelname:<8}{_RESET}"
            record.levelname = levelname
        return super().format(record)


def configure_logging(level: str = "INFO") -> None:
    """全局配置根 logger（幂等）。"""
    global _configured
    if _configured:
        return

    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(ColorFormatter(_FORMAT, datefmt=_DATE_FORMAT))

    root = logging.getLogger()
    # 清理已有 handler，避免重复输出
    for h in list(root.handlers):
        root.removeHandler(h)
    root.addHandler(handler)
    root.setLevel(level.upper())
    _configured = True


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """获取 logger 实例，自动确保全局配置已就绪。"""
    if not _configured:
        configure_logging("INFO")
    return logging.getLogger(name if name else "rap")
