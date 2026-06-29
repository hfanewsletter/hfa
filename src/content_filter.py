"""
Deterministic term normalization applied to article titles, summaries, and body
content before saving. Keeps loaded/biased phrasing (e.g. "the Zionist entity")
off the website and email by replacing it with the neutral standard term.

This runs regardless of what the LLM produced, so it is a hard guarantee — not a
best-effort prompt instruction. Replacements are configured in
config.yaml -> content_filters.replacements.
"""
import re
from typing import List, Tuple, Optional

# Fallback if config.yaml has no content_filters.replacements. Replacement is always
# the neutral standard name. Longer phrases are applied first (see _get_patterns).
DEFAULT_REPLACEMENTS: List[Tuple[str, str]] = [
    ("the zionist entity", "Israel"),
    ("zionist entity", "Israel"),
    ("the zionist regime", "Israel"),
    ("zionist regime", "Israel"),
    ("zionist state", "Israel"),
]

_CACHE: dict = {}


def _get_patterns(replacements: List[Tuple[str, str]]):
    key = tuple(tuple(p) for p in replacements)
    if key not in _CACHE:
        # Longest phrase first so e.g. "the zionist entity" wins over "zionist entity".
        ordered = sorted(replacements, key=lambda p: len(p[0]), reverse=True)
        _CACHE[key] = [
            (re.compile(r"\b" + re.escape(phrase) + r"\b", re.IGNORECASE), repl)
            for phrase, repl in ordered
        ]
    return _CACHE[key]


def apply_replacements(
    text: Optional[str], replacements: List[Tuple[str, str]] = None
) -> Optional[str]:
    """Case-insensitively replace each configured phrase. Returns text unchanged
    if it's empty or there are no replacements."""
    if not text:
        return text
    if replacements is None:
        replacements = DEFAULT_REPLACEMENTS
    if not replacements:
        return text
    for pattern, repl in _get_patterns(replacements):
        text = pattern.sub(repl, text)
    return text
