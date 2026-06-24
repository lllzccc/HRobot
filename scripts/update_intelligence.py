#!/usr/bin/env python3
"""Fetch daily intelligence for AIBP.

The script is intentionally stdlib-only so Codex automations can run it in a
fresh workspace without dependency setup. It collects web news and WeChat public
article leads, deduplicates them, optionally asks the configured AI model to
summarize/classify, and writes data/intelligence.json.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import datetime as dt
import email.utils
import html
import importlib.util
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "intelligence.json"
HISTORY_FILE = ROOT / "data" / "intelligence_history.json"
AI_CONFIG_FILE = ROOT / "data" / "ai_config.json"
AI_SECRETS_FILE = ROOT / "data" / "local_ai_secrets.json"
TIMEZONE = dt.timezone(dt.timedelta(hours=8))
WECHAT_ARTICLES_SKILL = Path.home() / ".workbuddy" / "skills" / "wechat-articles"

_AI_ENRICH_DISABLED_REASON: str | None = None
_BING_RSS_DISABLED_REASON: str | None = None
_MIKU_WECHAT_DISABLED_REASON: str | None = None

GAME_INDUSTRY_TERMS = (
    "\u6e38\u620f",
    "\u624b\u6e38",
    "\u7aef\u6e38",
    "\u7f51\u6e38",
    "\u7535\u7ade",
    "\u5de5\u4f5c\u5ba4",
    "\u5236\u4f5c\u4eba",
    "\u6e38\u620f\u7814\u53d1",
    "\u6e38\u620f\u53d1\u884c",
    "\u7248\u53f7",
    "\u817e\u8baf\u6e38\u620f",
    "\u7f51\u6613\u6e38\u620f",
    "\u7c73\u54c8\u6e38",
    "mihoyo",
    "hoyoverse",
)


CHANNELS = {
    "ai_hr": {
        "label": "AI × HR",
        "queries": {
            "tool": [
                "HR AI 工具 招聘 员工服务",
                "人力资源 AI Agent HR SaaS",
                "AI 面试 工具 招聘 自动化",
            ],
            "policy": [
                "AI 员工 隐私 政策 人力资源",
                "AI 招聘 算法 公平 合规",
                "员工侧 AI 应用 数据安全",
            ],
            "org_change": [
                "AI 组织变革 裁员 招聘 变化",
                "企业 AI 转型 人力资源 组织调整",
            ],
            "talent": [
                "AI 改变招聘 岗位 变化",
                "AI 人才 战略 HR 组织",
            ],
        },
    },
    "game_org": {
        "label": "中国游戏公司组织与人才变化",
        "queries": {
            "org_change": [
                "游戏公司 架构调整 组织调整",
                "游戏公司 裁员 项目 调整",
                "游戏工作室 新建 撤销 团队",
            ],
            "strategy": [
                "中国 游戏公司 战略调整 业务变化",
                "游戏公司 海外 业务 调整",
                "游戏公司 AI 算力 战略",
            ],
            "talent": [
                "游戏制作人 离职 入职",
                "游戏公司 高管 离职 任命",
                "游戏公司 制作人 人事变动",
            ],
            "ai_efficiency": [
                "游戏公司 AI 提效 AI 员工",
                "游戏研发 AIGC 提效 组织",
                "游戏公司 AI 算力 资源",
            ],
        },
    },
}


def now_iso() -> str:
    return dt.datetime.now(TIMEZONE).replace(microsecond=0).isoformat()


def yesterday() -> str:
    return (dt.datetime.now(TIMEZONE).date() - dt.timedelta(days=1)).isoformat()


def read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def clean_text(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def clean_url(value: str) -> str:
    value = (value or "").strip()
    value = value.replace("&amp;", "&")
    value = value.replace("&quot;", '"')
    value = re.sub(r"\s+", "", value)
    return value


def fetch_url(url: str, timeout: int = 15) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/124 Safari/537.36"
            ),
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        encoding = resp.headers.get_content_charset() or "utf-8"
    return raw.decode(encoding, errors="ignore")


def is_probably_html_document(value: str) -> bool:
    snippet = (value or "").lstrip().lower()
    return snippet.startswith("<!doctype html") or snippet.startswith("<html")


def parse_date(value: str) -> str:
    if not value:
        return ""
    try:
        parsed = email.utils.parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(TIMEZONE).date().isoformat()
    except Exception:
        pass
    match = re.search(r"(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})", value)
    if match:
        y, m, d = match.groups()
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    return ""


def date_from_epoch_seconds(seconds: int) -> str:
    try:
        return dt.datetime.fromtimestamp(int(seconds), tz=TIMEZONE).date().isoformat()
    except Exception:
        return ""


def resolve_wechat_publish_date(url: str) -> str:
    if "mp.weixin.qq.com" not in (url or ""):
        return ""
    try:
        page = fetch_url(url, timeout=15)
    except Exception as exc:
        print(f"[warn] wechat publish-date fetch failed: {url[:80]}: {exc}", file=sys.stderr)
        return ""

    patterns = [
        r'"publish_time"\\s*:\\s*(\\d{9,12})',
        r'"ct"\\s*:\\s*"(\\d{9,12})"',
        r'"ct"\\s*:\\s*(\\d{9,12})',
        r'\\bvar\\s+ct\\s*=\\s*"(\\d{9,12})"',
        r'\\bct\\s*=\\s*"(\\d{9,12})"',
        r'\\bcreateTime\\s*=\\s*"(\\d{9,12})"',
        r'"createTime"\\s*:\\s*"(\\d{9,12})"',
    ]
    for pattern in patterns:
        match = re.search(pattern, page)
        if not match:
            continue
        published = date_from_epoch_seconds(int(match.group(1)))
        if published:
            return published
    return ""


def parse_news_rss_text(xml_text: str, query: str, target_date: str, max_items: int, source_name: str) -> list[dict]:
    try:
        root = ET.fromstring(xml_text)
    except Exception as exc:
        print(f"[warn] {source_name} failed: {query}: {exc}", file=sys.stderr)
        return []

    items = []
    for node in root.findall(".//item"):
        published = parse_date(node.findtext("pubDate") or "")
        if published and published != target_date:
            continue
        item = {
            "title": clean_text(node.findtext("title") or ""),
            "summary": clean_text(node.findtext("description") or ""),
            "source": clean_text(
                node.findtext("{http://search.yahoo.com/mrss/}credit")
                or node.findtext("source")
                or source_name
            ),
            "source_url": clean_text(node.findtext("link") or ""),
            "published_at": published or target_date,
            "raw_source": source_name,
        }
        if item["title"]:
            items.append(item)
        if len(items) >= max_items:
            break
    return items


def parse_news_rss(url: str, query: str, target_date: str, max_items: int, source_name: str) -> list[dict]:
    try:
        xml_text = fetch_url(url)
    except Exception as exc:
        print(f"[warn] {source_name} failed: {query}: {exc}", file=sys.stderr)
        return []
    return parse_news_rss_text(xml_text, query, target_date, max_items, source_name)


def fetch_bing_news(query: str, target_date: str, max_items: int) -> list[dict]:
    global _BING_RSS_DISABLED_REASON
    params = urllib.parse.urlencode({
        "q": query,
        "format": "rss",
        "setlang": "zh-CN",
        "cc": "CN",
    })
    url = f"https://www.bing.com/news/search?{params}"
    items = []
    if not _BING_RSS_DISABLED_REASON:
        try:
            bing_text = fetch_url(url)
        except Exception as exc:
            print(f"[warn] bing_news failed: {query}: {exc}", file=sys.stderr)
        else:
            if is_probably_html_document(bing_text):
                _BING_RSS_DISABLED_REASON = "html_response"
            else:
                items = parse_news_rss_text(bing_text, query, target_date, max_items, "bing_news")
    if items:
        return items

    google_params = urllib.parse.urlencode({
        "q": query,
        "hl": "zh-CN",
        "gl": "CN",
        "ceid": "CN:zh-Hans",
    })
    google_url = f"https://news.google.com/rss/search?{google_params}"
    return parse_news_rss(google_url, query, target_date, max_items, "google_news")


def fetch_sogou_weixin(query: str, target_date: str, max_items: int, *, allow_unverified: bool = False) -> list[dict]:
    params = urllib.parse.urlencode({
        "type": "2",
        "query": query,
    })
    url = f"https://weixin.sogou.com/weixin?{params}"
    try:
        page = fetch_url(url)
    except Exception as exc:
        print(f"[warn] weixin failed: {query}: {exc}", file=sys.stderr)
        return []

    pattern = re.compile(
        r'<a[^>]+target="_blank"[^>]+href="(?P<link>[^"]+)"[^>]*>(?P<title>.*?)</a>.*?'
        r'<p class="txt-info"[^>]*>(?P<summary>.*?)</p>.*?'
        r'<a[^>]+class="account"[^>]*>(?P<source>.*?)</a>',
        re.S,
    )
    items = []
    for match in pattern.finditer(page):
        link = clean_url(match.group("link"))
        if link.startswith("/"):
            link = "https://weixin.sogou.com" + link
        resolved_url = link
        if "weixin.sogou.com/link" in resolved_url and "url=" in resolved_url:
            parsed = urllib.parse.urlparse(resolved_url)
            qs = urllib.parse.parse_qs(parsed.query)
            candidate = (qs.get("url") or [""])[0]
            candidate = urllib.parse.unquote(candidate)
            if candidate.startswith("http"):
                resolved_url = clean_url(candidate)
        published = resolve_wechat_publish_date(resolved_url) if "mp.weixin.qq.com" in resolved_url else ""
        if published:
            if published != target_date:
                continue
        elif not allow_unverified:
            continue
        item = {
            "title": clean_text(match.group("title")),
            "summary": clean_text(match.group("summary")),
            "source": clean_text(match.group("source")) or "微信公众号",
            "source_url": resolved_url,
            "published_at": published or (target_date if allow_unverified else ""),
            "raw_source": "sogou_weixin",
        }
        if item["title"]:
            items.append(item)
        if len(items) >= max_items:
            break
    return items


async def search_miku_weixin_async(query: str, max_items: int) -> list[dict]:
    try:
        from miku_ai.spider import MikuSpider
    except Exception as exc:
        print(f"[warn] miku_wechat unavailable: {exc}", file=sys.stderr)
        return []

    try:
        spider = MikuSpider()
        results = await spider.get_wexin_article(query, top_num=max_items)
    except Exception as exc:
        print(f"[warn] miku_wechat failed: {query}: {exc}", file=sys.stderr)
        return []
    return results if isinstance(results, list) else []


def search_miku_weixin(query: str, max_items: int) -> list[dict]:
    try:
        return asyncio.run(search_miku_weixin_async(query, max_items))
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(search_miku_weixin_async(query, max_items))
        finally:
            loop.close()


def run_miku_weixin_search(searcher, query: str, max_items: int) -> list[dict]:
    global _MIKU_WECHAT_DISABLED_REASON
    if _MIKU_WECHAT_DISABLED_REASON:
        return []

    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    try:
        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            results = searcher(query, max_items)
    except Exception as exc:
        print(f"[warn] miku_wechat failed: {query}: {exc}", file=sys.stderr)
        return []

    captured_stdout = stdout_buffer.getvalue().strip()
    captured_stderr = stderr_buffer.getvalue().strip()
    if captured_stdout:
        print(captured_stdout, file=sys.stderr)
    if captured_stderr:
        print(captured_stderr, file=sys.stderr)

    combined_logs = "\n".join(part for part in [captured_stdout, captured_stderr] if part)
    if combined_logs and (
        "proxy error with status 302" in combined_logs
        or "Attempt " in combined_logs and "Error:" in combined_logs
    ):
        _MIKU_WECHAT_DISABLED_REASON = "proxy_failure"
        print(
            f"[warn] miku_wechat disabled for remaining queries after unstable proxy response: {query}",
            file=sys.stderr,
        )
        return []

    return results if isinstance(results, list) else []


def load_wechat_reader():
    script = WECHAT_ARTICLES_SKILL / "scripts" / "read.py"
    if not script.exists():
        return None
    try:
        spec = importlib.util.spec_from_file_location("workbuddy_wechat_reader", script)
        if not spec or not spec.loader:
            return None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.read_article
    except Exception as exc:
        print(f"[warn] wechat reader unavailable: {exc}", file=sys.stderr)
        return None


def summarize_wechat_fulltext(url: str, read_func=None) -> str:
    if "mp.weixin.qq.com" not in url:
        return ""
    reader = read_func or load_wechat_reader()
    if not reader:
        return ""
    try:
        article = reader(url, mode="simple")
    except TypeError:
        article = reader(url)
    except Exception as exc:
        try:
            article = reader(url, mode="playwright")
        except Exception as exc2:
            print(f"[warn] wechat fulltext failed: {url[:80]}: {exc2}", file=sys.stderr)
            return ""

    digest = clean_text(article.get("digest", "") if isinstance(article, dict) else "")
    if digest:
        return digest
    paragraphs = article.get("paragraphs", []) if isinstance(article, dict) else []
    if not isinstance(paragraphs, list):
        return ""
    summary = clean_text(" ".join(str(p) for p in paragraphs[:3]))
    return summary[:600]


def normalize_miku_article(article: dict, target_date: str) -> dict | None:
    title = clean_text(article.get("title", ""))
    if not title:
        return None
    url = clean_url(article.get("url", ""))
    published = parse_date(str(article.get("datetime", "") or article.get("post_date", "")))
    if not published and url:
        published = resolve_wechat_publish_date(url)
    return {
        "title": title,
        "summary": clean_text(article.get("summary", "") or article.get("digest", "")),
        "source": clean_text(article.get("source", "") or article.get("wechat_name", "")) or "微信公众号",
        "source_url": url,
        "published_at": published,
        "raw_source": "miku_wechat",
    }


def fetch_miku_weixin(
    query: str,
    target_date: str,
    max_items: int,
    search_func=None,
    read_func=None,
    fulltext_limit: int = 1,
    allow_unverified: bool = False,
) -> list[dict]:
    searcher = search_func or search_miku_weixin
    fetch_limit = max(max_items * 8, max_items)
    fetch_limit = min(fetch_limit, 30)
    articles = run_miku_weixin_search(searcher, query, fetch_limit)
    if not articles:
        return []

    items = []
    fulltext_used = 0
    for article in articles:
        if not isinstance(article, dict):
            continue
        item = normalize_miku_article(article, target_date)
        if not item:
            continue
        if item.get("published_at"):
            if item["published_at"] != target_date:
                continue
        elif not allow_unverified:
            continue
        else:
            item["published_at"] = target_date
            item["raw_source"] = "miku_wechat_unverified"
        if fulltext_used < fulltext_limit and not item["summary"]:
            fulltext = summarize_wechat_fulltext(item["source_url"], read_func=read_func)
            if fulltext:
                item["summary"] = fulltext
                item["raw_source"] = "miku_wechat_fulltext" if item["raw_source"] == "miku_wechat" else "miku_wechat_fulltext_unverified"
                fulltext_used += 1
        items.append(item)
        if len(items) >= max_items:
            break
    return items


def fetch_wechat_articles(
    query: str,
    target_date: str,
    max_items: int,
    miku_fetcher=fetch_miku_weixin,
    sogou_fetcher=fetch_sogou_weixin,
    fulltext_limit: int = 1,
    allow_unverified: bool = False,
) -> list[dict]:
    items = miku_fetcher(
        query,
        target_date,
        max_items,
        fulltext_limit=fulltext_limit,
        allow_unverified=allow_unverified,
    ) or []
    if len(items) >= max_items:
        return items[:max_items]

    try:
        fallback = sogou_fetcher(query, target_date, max_items, allow_unverified=allow_unverified) or []
    except TypeError:
        fallback = sogou_fetcher(query, target_date, max_items) or []
    if not items:
        if allow_unverified:
            return fallback[:max_items]
        verified = [item for item in fallback if item.get("published_at") == target_date]
        return verified[:max_items]

    seen = set()
    merged = []
    for candidate in items + fallback:
        url_key = (candidate.get("source_url") or "").strip().lower()
        title_key = (candidate.get("title") or "").strip().lower()
        key = url_key or title_key
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(candidate)
        if len(merged) >= max_items:
            break
    return merged


def load_ai_config() -> tuple[str, str, str]:
    cfg = read_json(AI_CONFIG_FILE, {})
    secrets = read_json(AI_SECRETS_FILE, {}) if AI_SECRETS_FILE.exists() else {}
    multimodal = cfg.get("multimodal", {}) if isinstance(cfg.get("multimodal", {}), dict) else {}
    multimodal_secret = secrets.get("multimodal", {}) if isinstance(secrets.get("multimodal", {}), dict) else {}
    return (
        os.environ.get("HROBOT_AI_API_KEY") or multimodal_secret.get("apiKey", "") or secrets.get("apiKey", "") or multimodal.get("apiKey", "") or cfg.get("apiKey", ""),
        multimodal.get("baseUrl", "") or cfg.get("baseUrl", "https://api.openai.com/v1"),
        multimodal.get("model", "") or cfg.get("model", "gpt-4o-mini"),
    )


def call_ai_enricher(api_key: str, api_base: str, model: str, item: dict, channel: str, category: str) -> dict | None:
    global _AI_ENRICH_DISABLED_REASON
    if _AI_ENRICH_DISABLED_REASON:
        return None
    if not api_key:
        return None
    body = {
        "model": model or "gpt-4o-mini",
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是 AIBP 情报中心编辑。请根据新闻标题、摘要和频道，输出 JSON："
                    "summary, hrbp_takeaway, keywords, importance, confidence。"
                    "importance 为 1-5；confidence 使用 confirmed/high-confidence/lead。"
                    "不要编造未提供的事实。"
                ),
            },
            {
                "role": "user",
                "content": json.dumps({
                    "channel": channel,
                    "category": category,
                    "title": item.get("title", ""),
                    "summary": item.get("summary", ""),
                    "source": item.get("source", ""),
                }, ensure_ascii=False),
            },
        ],
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        f"{api_base.rstrip('/')}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        content = result["choices"][0]["message"]["content"]
        return json.loads(content)
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            _AI_ENRICH_DISABLED_REASON = f"HTTP {exc.code}"
            print(f"[warn] ai enrich disabled after auth error: {_AI_ENRICH_DISABLED_REASON}", file=sys.stderr)
            return None
        print(f"[warn] ai enrich failed: {exc}", file=sys.stderr)
        return None
    except Exception as exc:
        print(f"[warn] ai enrich failed: {exc}", file=sys.stderr)
        return None


def heuristic_enrich(item: dict, channel: str, category: str) -> dict:
    text = f"{item.get('title', '')} {item.get('summary', '')}"
    keywords = []
    for kw in [
        "AI", "HR", "招聘", "员工", "政策", "合规", "裁员", "组织调整",
        "游戏", "制作人", "架构", "出海", "AIGC", "算力", "提效",
    ]:
        if kw.lower() in text.lower() and kw not in keywords:
            keywords.append(kw)
    if not keywords:
        keywords = ["AI × HR" if channel == "ai_hr" else "游戏公司"]
    takeaway = (
        "建议关注该动态对 HR 流程、员工体验和组织治理的影响。"
        if channel == "ai_hr"
        else "建议结合招聘岗位、产品项目和管理层信息继续交叉验证。"
    )
    importance = 4 if any(k in text for k in ["裁员", "政策", "人事", "架构", "战略"]) else 3
    return {
        "summary": item.get("summary") or item.get("title", ""),
        "hrbp_takeaway": takeaway,
        "keywords": keywords[:5],
        "importance": importance,
        "confidence": "lead",
    }


def make_id(channel: str, target_date: str, title: str) -> str:
    slug = re.sub(r"\W+", "", title.lower())[:18] or str(int(time.time()))
    return f"{channel}-{target_date.replace('-', '')}-{slug}"


def title_core(title: str) -> str:
    title = clean_text(title).lower()
    title = re.sub(r"\s+[-|_]\s+.+$", "", title)
    title = re.sub(r"\W+", "", title)
    return title[:40]


def normalize_item(raw: dict, channel: str, category: str, target_date: str, api_key: str, api_base: str, model: str) -> dict:
    enriched = call_ai_enricher(api_key, api_base, model, raw, channel, category)
    if not enriched:
        enriched = heuristic_enrich(raw, channel, category)
    return {
        "id": make_id(channel, target_date, raw.get("title", "")),
        "channel": channel,
        "category": category,
        "title": raw.get("title", ""),
        "summary": clean_text(enriched.get("summary") or raw.get("summary", "")),
        "hrbp_takeaway": clean_text(enriched.get("hrbp_takeaway") or ""),
        "source": raw.get("source", ""),
        "source_url": raw.get("source_url", ""),
        "published_at": raw.get("published_at") or target_date,
        "collected_at": now_iso(),
        "keywords": enriched.get("keywords") or [],
        "importance": int(enriched.get("importance") or 3),
        "confidence": enriched.get("confidence") or "lead",
        "status": "new",
        "raw_source": raw.get("raw_source", ""),
    }


def is_relevant_raw_item(raw: dict, channel: str, category: str) -> bool:
    if channel != "game_org":
        return True
    text = clean_text(
        " ".join([
            str(raw.get("title", "")),
            str(raw.get("summary", "")),
            str(raw.get("source", "")),
        ])
    ).lower()
    return any(term.lower() in text for term in GAME_INDUSTRY_TERMS)


def filter_relevant_items(items: list[dict]) -> list[dict]:
    return [
        item
        for item in items
        if isinstance(item, dict)
        and is_relevant_raw_item(item, item.get("channel", ""), item.get("category", ""))
    ]


def dedupe(items: list[dict]) -> list[dict]:
    seen = set()
    output = []
    for item in items:
        url_key = (item.get("source_url") or "").strip().lower()
        title_key = f"{item.get('channel', '')}:{title_core(item.get('title', ''))}"
        key = url_key or title_key
        if not key or key in seen or title_key in seen:
            continue
        seen.add(key)
        seen.add(title_key)
        output.append(item)
    return output


def sort_items(items: list[dict], limit: int | None = 300) -> list[dict]:
    ordered = sorted(
        items,
        key=lambda item: (item.get("published_at", ""), item.get("importance", 0), item.get("collected_at", "")),
        reverse=True,
    )
    if limit is None:
        return ordered
    return ordered[:limit]


def repair_wechat_published_dates(items: list[dict], *, target_date: str) -> tuple[list[dict], int]:
    repaired = 0
    output = []
    for item in items:
        if not isinstance(item, dict):
            continue
        url = (item.get("source_url") or "").strip()
        if "mp.weixin.qq.com" not in url:
            output.append(item)
            continue
        current = (item.get("published_at") or "").strip()
        if current != target_date:
            output.append(item)
            continue
        resolved = resolve_wechat_publish_date(url)
        if resolved and resolved != current:
            item = dict(item)
            item["published_at"] = resolved
            repaired += 1
        elif not resolved:
            item = dict(item)
            item["published_at"] = ""
            item["status"] = item.get("status") or "needs_review"
            repaired += 1
        output.append(item)
    return output, repaired


def collect(args) -> list[dict]:
    api_key, api_base, model = load_ai_config()
    items = []
    channels = [args.channel] if args.channel != "all" else list(CHANNELS.keys())
    source_modes = ["bing", "wechat"] if args.source == "all" else [args.source]

    for channel in channels:
        for category, queries in CHANNELS[channel]["queries"].items():
            for query in queries:
                raw_items = []
                if "bing" in source_modes:
                    raw_items.extend(fetch_bing_news(query, args.date, args.max_per_query))
                if "wechat" in source_modes:
                    raw_items.extend(fetch_wechat_articles(
                        query,
                        args.date,
                        args.max_per_query,
                        fulltext_limit=getattr(args, "wechat_fulltext_limit", 1),
                        allow_unverified=getattr(args, "allow_unverified_wechat", False),
                    ))
                for raw in raw_items:
                    if not is_relevant_raw_item(raw, channel, category):
                        continue
                    items.append(normalize_item(raw, channel, category, args.date, api_key, api_base, model))
    return dedupe(items)


def main() -> int:
    parser = argparse.ArgumentParser(description="Update AIBP intelligence data.")
    parser.add_argument("--date", default=yesterday(), help="Target publish date, default: yesterday in Asia/Shanghai.")
    parser.add_argument("--channel", choices=["all", "ai_hr", "game_org"], default="all")
    parser.add_argument("--source", choices=["all", "bing", "wechat"], default="all")
    parser.add_argument("--max-per-query", type=int, default=3)
    parser.add_argument("--wechat-fulltext-limit", type=int, default=1, help="Max WeChat articles per query to read in full text.")
    parser.add_argument("--allow-unverified-wechat", action="store_true", help="Keep WeChat leads when publish date cannot be verified.")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    existing = read_json(DATA_FILE, {"updated_at": "", "items": []})
    history_existing = read_json(HISTORY_FILE, {"updated_at": "", "items": []})
    history_items = history_existing.get("items", []) or existing.get("items", [])
    history_items, repaired = repair_wechat_published_dates(history_items, target_date=args.date)
    history_items = filter_relevant_items(history_items)
    new_items = collect(args)
    current_items = sort_items(new_items, limit=300)
    history_payload = {
        "updated_at": now_iso(),
        "items": sort_items(dedupe(new_items + history_items), limit=None),
    }
    payload = {
        "updated_at": now_iso(),
        "items": current_items,
    }

    if args.dry_run:
        print(json.dumps({
            "new_items": new_items[:10],
            "new_count": len(new_items),
            "current_count": len(current_items),
            "history_count": len(history_payload["items"]),
        }, ensure_ascii=False, indent=2))
        return 0

    write_json(HISTORY_FILE, history_payload)
    write_json(DATA_FILE, payload)
    if repaired:
        print(f"repaired {repaired} wechat published_at dates in history")
    print(f"updated {DATA_FILE} with {len(new_items)} new leads, current {len(current_items)} items, history {len(history_payload['items'])} items")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
