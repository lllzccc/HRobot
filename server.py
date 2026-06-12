from __future__ import annotations

import argparse
import base64
import contextlib
import html as html_lib
import importlib.util
import json
import os
import subprocess
import re
import shutil
import socket
import sys
import threading
import time
import uuid
from datetime import datetime, timezone, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zipfile import ZipFile

from app.modules.talent_review import TalentReviewStoreMixin

if getattr(sys, "frozen", False):
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")


def app_root():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


ROOT = app_root()
DATA_DIR = ROOT / "data"
LOCAL_TZ = timezone(timedelta(hours=8))
INTELLIGENCE_UPDATE_LOCK = threading.Lock()
SERVER_STARTED_AT = datetime.now(LOCAL_TZ)
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8767
SERVER_ALLOW_REMOTE_CLIENTS = False

REPORT_PRESETS = {
    "360": {
        "name": "360报告",
        "description": "围绕多方反馈、关键行为、协作影响和发展建议生成个人或团队 360 反馈报告。",
        "keywords": ["360", "360报告", "360反馈", "multi-rater", "feedback"],
        "settingFile": "360报告设定说明.md",
        "prompt": (
            "请按 360 报告口径生成：正文必须严格使用导入的 360 报告 skill 架构，"
            "不得自行新增 skill 之外的章节、表格、说明块或模板字段；"
            "重点呈现优势行为、待发展行为、典型证据、风险提醒和行动建议。"
        ),
    },
    "org-diagnosis": {
        "name": "组织诊断报告",
        "description": "聚焦组织结构、角色分工、关键流程、协作效率、风险和改进路径。",
        "keywords": ["组织诊断", "org-diagnosis", "diagnosis", "organization", "组织分析"],
        "settingFile": "组织诊断报告设定说明.md",
        "prompt": (
            "请按组织诊断报告口径生成：覆盖组织现状、关键问题、根因判断、影响范围、"
            "优先级和可执行改进方案；结论要区分数据事实、访谈/材料线索和推断。"
        ),
    },
    "talent-review": {
        "name": "人才盘点报告",
        "description": "基于九宫格、绩效、潜力、职级、序列和校准记录生成盘点分析。",
        "keywords": ["人才盘点", "九宫格", "talent-review", "ninebox", "talent"],
        "settingFile": "人才盘点报告设定说明.md",
        "prompt": (
            "请按人才盘点报告口径生成：覆盖人才结构、九宫格分布、关键人才、风险人员、"
            "历史变化、校准差异、培养、激励、保留建议和后续跟进动作。"
        ),
    },
}

GRID_LABELS = {
    1: "1问题员工",
    2: "2差距员工",
    3: "3基本胜任",
    4: "4待发展者",
    5: "5中坚力量",
    6: "6熟练员工",
    7: "7潜力之星",
    8: "8绩效之星",
    9: "9超级明星",
}

DEFAULT_HOME_MEMO = {
    "updatedAt": "",
    "records": [],
}

DEFAULT_DESIGN_PROMPT_CONFIG = {
    "basePrompt": "为 HRobot HRBP 工作台生成一张可直接使用的本地海报图片。",
    "brandRequirements": "优先使用HRobot 通用视觉：主蓝 #2f64e9、辅助青 #22d3ee、中性深色 #0f172a；整体保持专业、清晰、可信赖的 HR 场景表达。",
    "customRequirements": "",
    "referenceInstructions": "如果 references 目录中有可用素材，请结合素材文件名、说明和用户需求，预留合适的 logo/吉祥物/模板位置。",
    "template": (
        "{basePrompt}\n"
        "{brandRequirements}\n"
        "{customRequirements}\n"
        "{referenceInstructions}\n"
        "可用参考素材：{referenceSummary}\n"
        "海报类型：{posterType}\n"
        "风格：{style}\n"
        "尺寸：{size}\n"
        "需求：{requirement}"
    ),
}

DEFAULT_AGENT_PROJECT_CENTER = {
    "updatedAt": "",
    "projects": [],
}


def server_status_payload():
    now = datetime.now(LOCAL_TZ)
    return {
        "connected": True,
        "status": "connected",
        "pid": os.getpid(),
        "host": SERVER_HOST,
        "port": SERVER_PORT,
        "root": str(ROOT),
        "startedAt": SERVER_STARTED_AT.isoformat(timespec="seconds"),
        "checkedAt": now.isoformat(timespec="seconds"),
        "uptimeSeconds": max(0, int((now - SERVER_STARTED_AT).total_seconds())),
    }


def schedule_server_restart(delay_seconds=0.8):
    command = [sys.executable]
    if not getattr(sys, "frozen", False):
        command.append(str(ROOT / "server.py"))
    command.extend(["--host", SERVER_HOST, "--port", str(SERVER_PORT)])
    if SERVER_ALLOW_REMOTE_CLIENTS:
        command.append("--allow-remote-clients")

    launcher_script = (
        "import os, subprocess, time\n"
        f"time.sleep({float(delay_seconds)!r})\n"
        f"command = {command!r}\n"
        f"cwd = {str(ROOT)!r}\n"
        "kwargs = {'cwd': cwd, 'stdin': subprocess.DEVNULL, 'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL}\n"
        "if os.name == 'nt':\n"
        "    kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW\n"
        "subprocess.Popen(command, **kwargs)\n"
    )
    kwargs = {
        "cwd": str(ROOT),
        "stdin": subprocess.DEVNULL,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    subprocess.Popen([sys.executable, "-c", launcher_script], **kwargs)
    threading.Timer(0.2, lambda: os._exit(0)).start()


class DataStore(TalentReviewStoreMixin):
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.review_source_dir = self.data_dir / "review_results"
        self.profile_source_dir = self.data_dir / "talent_profiles"
        self.profile_snapshot_dir = self.data_dir / "talent_profile_snapshots"
        self.hrbp_profile_split_dir = self.data_dir / "hrbp_profile_splits"
        self.permission_dir = self.data_dir / "permissions"
        self.report_dir = self.data_dir / "report_generation"
        self.legacy_review_source_dirs = [
            self.data_dir / "盘点结果",
        ]
        self.legacy_profile_source_dirs = [
            self.data_dir / "人才档案",
        ]
        self.legacy_profile_snapshot_dirs = [self.data_dir / "人才档案快照_hrobot"]
        self.legacy_hrbp_profile_split_dirs = [self.data_dir / "人才档案_HRBP拆分"]
        self.legacy_permission_dirs = [self.data_dir / "权限配置"]
        self.legacy_report_dirs = [self.data_dir / "报告生成"]
        self.review_path = self.data_dir / "talent_review_2026.json"
        self.profile_path = self.data_dir / "people_profiles.json"
        self.overrides_path = self.data_dir / "calibration_overrides.json"
        self.employee_map_path = self.data_dir / "employee_manager_map.json"
        self.ai_config_path = self.data_dir / "ai_config.json"
        self.talent_pool_path = self.data_dir / "talent_pools.json"
        self.intelligence_path = self.data_dir / "intelligence.json"
        self.intelligence_history_path = self.data_dir / "intelligence_history.json"
        self.intelligence_config_path = self.data_dir / "intelligence_config.json"
        self.intelligence_update_status_path = self.data_dir / "intelligence_update_status.json"
        self.design_dir = self.data_dir / "design_center"
        self.design_poster_dir = self.design_dir / "posters"
        self.design_history_path = self.design_dir / "poster_history.json"
        self.design_prompt_config_path = self.design_dir / "poster_prompt_config.json"
        self.design_reference_dir = self.design_dir / "references"
        self.design_reference_readme_path = self.design_reference_dir / "README.md"
        self.agent_center_dir = self.data_dir / "agent_center"
        self.agent_zip_dir = self.agent_center_dir / "zips"
        self.agent_project_dir = self.agent_center_dir / "projects"
        self.agent_manifest_path = self.agent_center_dir / "manifest.json"
        self._agent_processes = {}
        self._agent_process_lock = threading.RLock()
        self.home_memo_path = self.data_dir / "home_memo.json"
        self.report_skill_dir = self.report_dir / "skills"
        self.report_material_dir = self.report_dir / "materials"
        self.report_setting_dir = self.report_dir / "settings"
        self.report_markdown_dir = self.report_dir / "reports_md"
        self.report_html_dir = self.report_dir / "reports_html"
        self.generated_report_path = self.report_dir / "generated_report.json"
        self.report_history_path = self.report_dir / "generated_reports.json"

    def _review_source_dirs(self):
        return [self.review_source_dir, *self.legacy_review_source_dirs]

    def _profile_source_dirs(self):
        return [self.profile_source_dir, *self.legacy_profile_source_dirs]

    def _report_dirs(self):
        return [self.report_dir, *self.legacy_report_dirs]

    def _first_existing_path(self, paths):
        return next((path for path in paths if path.exists()), paths[0])

    def _path_signature(self, path: Path):
        if not path.exists() or not path.is_file():
            return (str(path), None, 0)
        stat = path.stat()
        return (str(path), stat.st_mtime_ns, stat.st_size)

    def _files_signature(self, folders, pattern, fallback_path=None):
        files = []
        has_source_dir = False
        for folder in folders:
            if folder.exists():
                has_source_dir = True
                files.extend(path for path in folder.glob(pattern) if path.is_file())
        if not files and fallback_path is not None and not has_source_dir:
            files = [fallback_path]
        return tuple(self._path_signature(path) for path in sorted(set(files), key=lambda item: str(item)))

    def _has_source_dir(self, folders):
        return any(folder.exists() for folder in folders)

    def _source_signature(self, folders, pattern, fallback_path: Path):
        source_path = self._latest_file_in(folders, pattern) or fallback_path
        return self._path_signature(source_path)

    def _cached(self, key, signature, factory):
        if not hasattr(self, "_cache"):
            self._cache = {}
            self._cache_lock = threading.RLock()
        with self._cache_lock:
            entry = self._cache.get(key)
            if entry and entry["signature"] == signature:
                return entry["value"]
            value = factory()
            self._cache[key] = {"signature": signature, "value": value}
            return value

    def _clear_cache(self):
        if hasattr(self, "_cache_lock"):
            with self._cache_lock:
                self._cache.clear()

    def _read_json(self, path: Path, fallback):
        if not path.exists():
            return fallback
        return json.loads(path.read_text(encoding="utf-8-sig"))

    def _latest_json_in(self, folder: Path):
        if not folder.exists():
            return None
        files = [path for path in folder.glob("*.json") if path.is_file()]
        if not files:
            return None
        return max(files, key=lambda path: (path.stat().st_mtime, path.name))

    def _latest_file_in(self, folders, pattern):
        files = []
        for folder in folders:
            if folder.exists():
                files.extend(path for path in folder.glob(pattern) if path.is_file())
        if not files:
            return None
        return max(files, key=lambda path: (path.stat().st_mtime, path.name))

    def _latest_review_json(self):
        files = []
        for folder in self._review_source_dirs():
            if folder.exists():
                files.extend(
                    path
                    for path in folder.glob("*.json")
                    if path.is_file() and path.name != "calibrated_latest.json"
                )
        if not files:
            return None
        return max(files, key=lambda path: (path.stat().st_mtime, path.name))

    def _read_source_json(self, folders, fallback_path: Path, fallback):
        source_path = self._latest_file_in(folders, "*.json") or fallback_path
        return self._read_json(source_path, fallback)

    def _review_source_path(self):
        source_path = self._latest_review_json()
        if source_path:
            return source_path
        if self._has_source_dir(self._review_source_dirs()):
            return self.review_source_dir / "__empty_review_results.json"
        return self.review_path

    def _read_profile_source_json(self):
        files = []
        for folder in self._profile_source_dirs():
            if folder.exists():
                files.extend(path for path in folder.glob("*.json") if path.is_file())
        if not files:
            if self._has_source_dir(self._profile_source_dirs()):
                return []
            return self._read_json(self.profile_path, [])

        merged = {}
        anonymous = []
        for path in sorted(files, key=lambda item: (item.stat().st_mtime_ns, item.name)):
            data = self._read_json(path, [])
            profiles = data.get("profiles") if isinstance(data, dict) and "profiles" in data else data
            if not isinstance(profiles, list):
                continue
            for profile in profiles:
                if not isinstance(profile, dict):
                    continue
                employee_id = profile.get("employeeId")
                if employee_id:
                    merged[str(employee_id)] = profile
                else:
                    anonymous.append(profile)
        return anonymous + list(merged.values())

    def _clear_imported_files(self, folder: Path, patterns):
        folder.mkdir(parents=True, exist_ok=True)
        for pattern in patterns:
            for path in folder.glob(pattern):
                if path.is_file():
                    path.unlink()

    def review_results(self):
        source_path = self._review_source_path()
        signature = self._path_signature(source_path)
        return self._cached(
            "review_results",
            signature,
            lambda: self._read_json(source_path, []),
        )

    def profiles(self):
        signature = (
            self._files_signature(self._profile_source_dirs(), "*.json", self.profile_path),
            self._path_signature(self.employee_map_path),
        )

        def load_profiles():
            profiles = self._read_profile_source_json()
            if not isinstance(profiles, list):
                return []
            normalized = []
            for profile in profiles:
                if not isinstance(profile, dict):
                    continue
                item = dict(profile)
                if item.get("employeeId") not in (None, ""):
                    item["employeeId"] = self._normalize_employee_id(item.get("employeeId"))
                normalized.append(self._enrich_with_employee_info(item))
            return normalized

        return self._cached("profiles", signature, load_profiles)

    def employee_map(self):
        signature = self._path_signature(self.employee_map_path)
        return self._cached("employee_map", signature, lambda: self._read_json(self.employee_map_path, {"byEmployeeId": {}, "byName": {}}))

    def _normalize_employee_id(self, value):
        text = str(value or "").strip()
        if re.fullmatch(r"\d+\.0", text):
            return text[:-2]
        return text

    def _employee_info_for(self, record):
        mapping = self.employee_map()
        employee_id = self._normalize_employee_id(record.get("employeeId") or record.get("员工ID") or record.get("工号") or "")
        name = str(record.get("name") or record.get("姓名") or "").strip()
        return mapping.get("byEmployeeId", {}).get(employee_id) or mapping.get("byName", {}).get(name) or {}

    def _normalize_period(self, value):
        text = re.sub(r"\s+", "", str(value or "").strip())
        return text.lstrip(":：")

    def _normalize_multi_value(self, value):
        parts = [part.strip() for part in re.split(r"[;,，、；\n\r]+", str(value or "")) if part and part.strip()]
        seen = []
        for part in parts:
            if part not in seen:
                seen.append(part)
        return ",".join(seen)

    def _profile_annual_manager_comment(self, record):
        for item in record.get("performanceHistory", []) or []:
            if not isinstance(item, dict):
                continue
            period = self._normalize_period(item.get("period", ""))
            comment = item.get("managerComment") or item.get("manager comment") or item.get("Manager Comment")
            if period == "2025年度" and comment not in (None, ""):
                return comment
        return ""

    def _enrich_with_employee_info(self, record):
        enriched = dict(record)
        annual_comment = self._profile_annual_manager_comment(enriched)
        if annual_comment:
            enriched["managerComment2025"] = annual_comment
            enriched["annualPerformanceReview"] = annual_comment
        info = self._employee_info_for(record)
        if not info:
            return enriched
        for target, source in (
            ("manager", "manager"),
            ("managerEmail", "managerEmail"),
            ("title", "title"),
            ("level", "level"),
            ("sequence", "sequence"),
            ("departmentPath", "departmentPath"),
            ("age", "age"),
            ("tenure", "tenure"),
            ("email", "email"),
            ("一级组织", "一级组织"),
            ("二级组织", "二级组织"),
            ("三级组织", "三级组织"),
            ("四级组织", "四级组织"),
            ("五级组织", "五级组织"),
        ):
            if info.get(source) and not enriched.get(target):
                enriched[target] = info.get(source)
        return enriched

    def _safe_upload_name(self, filename: str, fallback: str):
        safe_name = Path(filename or fallback).name
        return safe_name or fallback

    def _read_text_file(self, path: Path, limit=60000):
        if path.suffix.lower() == ".zip":
            snippets = []
            with ZipFile(path) as archive:
                names = [
                    name for name in archive.namelist()
                    if not name.endswith("/") and Path(name).suffix.lower() in {".md", ".txt", ".json", ".yaml", ".yml", ".xml", ".html"}
                ]
                for name in names[:12]:
                    raw = archive.read(name)
                    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
                        try:
                            snippets.append(f"--- {name} ---\n{raw.decode(encoding)[:12000]}")
                            break
                        except UnicodeDecodeError:
                            continue
                    if sum(len(item) for item in snippets) >= limit:
                        break
            return ("\n\n".join(snippets) or f"[压缩包内未发现可读取文本：{path.name}]")[:limit]
        data = path.read_bytes()
        for encoding in ("utf-8-sig", "utf-8", "gb18030"):
            try:
                text = data.decode(encoding)
                return text[:limit]
            except UnicodeDecodeError:
                continue
        return f"[二进制文件，仅记录文件名：{path.name}]"

    def _read_pdf_text_file(self, path: Path, limit=60000):
        try:
            from pypdf import PdfReader
        except ImportError as error:
            raise ValueError("当前环境缺少 PDF 解析依赖 pypdf，无法读取 360 PDF 材料。请先安装依赖或上传可读取文本材料。") from error
        try:
            reader = PdfReader(str(path))
            pages = []
            for page in reader.pages:
                text = page.extract_text() or ""
                if text.strip():
                    pages.append(text.strip())
                if sum(len(item) for item in pages) >= limit:
                    break
            content = "\n\n".join(pages).strip()
        except Exception as error:
            raise ValueError(f"360 PDF 材料解析失败：{path.name}。请上传可解析 PDF 或先转换为文本/Markdown。") from error
        if not content:
            raise ValueError(f"360 PDF 材料未解析出可读取正文：{path.name}。请上传可解析 PDF 或先转换为文本/Markdown。")
        return content[:limit]

    def _read_report_asset_text(self, path: Path, preset_id=None, label=None):
        if preset_id == "360" and label == "其他分析材料" and path.suffix.lower() == ".pdf":
            return self._read_pdf_text_file(path)
        return self._read_text_file(path)

    def import_report_asset(self, kind: str, filename: str, content: bytes):
        folder = self.report_skill_dir if kind == "skill" else self.report_material_dir
        folder.mkdir(parents=True, exist_ok=True)
        safe_name = self._safe_upload_name(filename, f"{kind}_{datetime.now().strftime('%Y%m%d%H%M%S')}.txt")
        target = folder / safe_name
        target.write_bytes(content)
        return {"filename": target.name, "path": str(target), "size": target.stat().st_size}

    def _delete_named_file(self, folders, filename, exclude_names=None):
        safe_name = Path(filename or "").name
        if not safe_name or safe_name != filename:
            raise ValueError("文件名不合法。")
        if safe_name in set(exclude_names or []):
            raise ValueError("该文件不允许删除。")
        for folder in folders:
            path = folder / safe_name
            if path.exists() and path.is_file():
                path.unlink()
                self._clear_cache()
                return {"deleted": True, "filename": safe_name}
        raise FileNotFoundError("未找到要删除的文件。")

    def delete_imported_file(self, kind: str, filename: str):
        targets = {
            "report-skill": ([self.report_skill_dir, *[folder / "skills" for folder in self.legacy_report_dirs]], set()),
            "report-material": ([self.report_material_dir, *[folder / "materials" for folder in self.legacy_report_dirs]], set()),
            "review-result": (self._review_source_dirs(), {"calibrated_latest.json"}),
            "profile": (self._profile_source_dirs(), set()),
            "employee-roster": ([self.data_dir], set()),
        }
        if kind not in targets:
            raise ValueError("不支持的文件类型。")
        folders, exclude_names = targets[kind]
        if kind == "employee-roster" and filename != "employee_manager_map.json":
            raise ValueError("不支持删除该员工关系文件。")
        return self._delete_named_file(folders, filename, exclude_names)

    def report_assets(self):
        def list_files(folders):
            files = []
            for folder in folders:
                if folder.exists():
                    files.extend(path for path in folder.iterdir() if path.is_file())
            return [
                {"filename": path.name, "size": path.stat().st_size, "updatedAt": datetime.fromtimestamp(path.stat().st_mtime).isoformat()}
                for path in sorted(set(files), key=lambda item: item.stat().st_mtime, reverse=True)
            ]
        return {
            "skills": list_files([self.report_skill_dir, *[folder / "skills" for folder in self.legacy_report_dirs]]),
            "materials": list_files([self.report_material_dir, *[folder / "materials" for folder in self.legacy_report_dirs]]),
        }

    def report_presets(self):
        return [
            {
                "id": preset_id,
                "name": preset["name"],
                "description": preset["description"],
                "settingFile": preset.get("settingFile", ""),
            }
            for preset_id, preset in REPORT_PRESETS.items()
        ]

    def import_sources(self):
        def list_files(folder, patterns, exclude_names=None):
            if not folder.exists():
                return []
            exclude_names = set(exclude_names or [])
            files = []
            for pattern in patterns:
                files.extend(path for path in folder.glob(pattern) if path.is_file() and path.name not in exclude_names)
            unique_files = sorted(set(files), key=lambda item: (item.stat().st_mtime, item.name), reverse=True)
            return [
                {
                    "filename": path.name,
                    "size": path.stat().st_size,
                    "updatedAt": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
                }
                for path in unique_files
            ]

        return {
            "reviewResults": sum((list_files(folder, ["*.xlsx", "*.json"], {"calibrated_latest.json"}) for folder in self._review_source_dirs()), []),
            "profiles": sum((list_files(folder, ["*.json"]) for folder in self._profile_source_dirs()), []),
            "employeeRoster": list_files(self.data_dir, ["employee_manager_map.json"]),
        }

    def report_asset_context(self, preset_id=None):
        sections = []
        preset = REPORT_PRESETS.get(preset_id or "")
        if preset:
            setting_paths = [
                self.report_setting_dir / preset.get("settingFile", ""),
                *[folder / "设定说明" / preset.get("settingFile", "") for folder in self.legacy_report_dirs],
            ]
            setting_path = self._first_existing_path(setting_paths)
            if setting_path.exists():
                sections.append({
                    "type": "报告设定说明",
                    "filename": setting_path.name,
                    "priority": "highest",
                    "content": self._read_text_file(setting_path),
                })
            sections.append({
                "type": "报告预设",
                "filename": preset["name"],
                "content": preset["prompt"],
            })
        asset_groups = [
            ("skill框架与分析逻辑", [self.report_skill_dir, *[folder / "skills" for folder in self.legacy_report_dirs]], True),
            ("其他分析材料", [self.report_material_dir, *[folder / "materials" for folder in self.legacy_report_dirs]], False),
        ]
        for label, folders, is_skill_group in asset_groups:
            paths = []
            for folder in folders:
                if folder.exists():
                    paths.extend(path for path in folder.iterdir() if path.is_file())
            if preset and is_skill_group:
                keywords = [keyword.lower() for keyword in preset.get("keywords", [])]

                def priority(path):
                    return 0 if any(keyword in path.name.lower() for keyword in keywords) else 1
                paths = sorted(paths, key=lambda item: (priority(item), -item.stat().st_mtime))
            else:
                paths = sorted(paths, key=lambda item: item.stat().st_mtime, reverse=True)
            for path in paths:
                if path.is_file():
                    sections.append({"type": label, "filename": path.name, "content": self._read_report_asset_text(path, preset_id, label)})
        return sections

    def _report_title(self, content: str, fallback: str):
        content = self._clean_report_content(content)
        html_title = self._html_report_title(content)
        if html_title:
            return html_title[:80]
        for line in str(content or "").splitlines():
            text = line.strip()
            if text.startswith("#"):
                return text.lstrip("#").strip()[:80] or fallback
        return fallback

    def _report_intro(self, content: str):
        text = self._plain_report_text(content)
        text = re.sub(r"[*_>`|#-]+", "", text)
        text = re.sub(r"\s+", " ", text).strip()
        return (text[:118] + "...") if len(text) > 118 else text

    def _clean_report_content(self, content: str):
        text = str(content or "").strip()
        fence = re.match(r"^```(?:html|HTML)?\s*(.*?)\s*```$", text, re.S)
        return fence.group(1).strip() if fence else text

    def _report_content_format(self, content: str):
        text = self._clean_report_content(content).lstrip()
        return "html" if re.search(r"<!doctype\s+html|<html[\s>]|<body[\s>]|<section[\s>]|<article[\s>]|<div[\s>]", text, re.I) else "markdown"

    def _html_report_title(self, content: str):
        text = self._clean_report_content(content)
        for pattern in (r"<title[^>]*>(.*?)</title>", r"<h1[^>]*>(.*?)</h1>"):
            match = re.search(pattern, text, re.I | re.S)
            if match:
                title = re.sub(r"<[^>]+>", "", match.group(1))
                return html_lib.unescape(re.sub(r"\s+", " ", title).strip())
        return ""

    def _plain_report_text(self, content: str):
        text = self._clean_report_content(content)
        if self._report_content_format(text) == "html":
            text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", text, flags=re.I | re.S)
            text = re.sub(r"<[^>]+>", " ", text)
            return html_lib.unescape(text)
        return re.sub(r"#+\s*", "", text)

    def _extract_360_report_person_name(self, content: str, instruction: str = ""):
        text = f"{self._plain_report_text(content)}\n{instruction or ''}"
        text = re.sub(r"\s+", " ", text)
        blocked = {"个人", "员工", "人才", "领导力", "执行层", "战术层", "管理层", "报告", "评估", "通俗", "解读"}
        patterns = [
            r"(?:姓名|对象|被评估人|人员|报告对象)[:：]\s*([\u4e00-\u9fa5]{2,4})",
            r"([\u4e00-\u9fa5]{2,4})\s*(?:-|_|\s)?(?:执行层|战术层|管理层)?(?:领导力)?\s*360",
            r"([\u4e00-\u9fa5]{2,4})\s*360[°度]?",
        ]
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.I):
                name = match.group(1).strip()
                if name and name not in blocked and not any(word in name for word in blocked):
                    return name
        return ""

    def _report_record(self, content: str, instruction: str, report_type: str):
        content = self._clean_report_content(content)
        preset = REPORT_PRESETS.get(report_type or "") or REPORT_PRESETS["talent-review"]
        title = self._report_title(content, preset["name"])
        return self._normalized_report_record({
            "id": uuid.uuid4().hex,
            "title": title,
            "intro": self._report_intro(content) or preset["description"],
            "content": content,
            "contentFormat": self._report_content_format(content),
            "instruction": instruction,
            "reportType": report_type or "talent-review",
            "reportTypeName": preset["name"],
            "updatedAt": datetime.now(LOCAL_TZ).isoformat(timespec="seconds"),
            "source": "ai",
        })

    def _safe_report_filename(self, report):
        title = re.sub(r"[\\/:*?\"<>|]+", "_", str(report.get("title") or "report")).strip(" ._")
        title = re.sub(r"\s+", "_", title)[:60] or "report"
        timestamp = re.sub(r"\D+", "", str(report.get("updatedAt") or ""))[:14] or datetime.now(LOCAL_TZ).strftime("%Y%m%d%H%M%S")
        report_id = str(report.get("id") or uuid.uuid4().hex)[:12]
        return f"{timestamp}-{title}-{report_id}.md"

    def _safe_report_html_filename(self, report):
        return re.sub(r"\.md$", ".html", self._safe_report_filename(report), flags=re.I)

    def _html_to_markdown_text(self, content: str):
        text = self._clean_report_content(content)
        text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", text, flags=re.I | re.S)

        def heading(match):
            level = int(match.group(1))
            body = html_lib.unescape(re.sub(r"<[^>]+>", "", match.group(2))).strip()
            return f"\n{'#' * min(level, 6)} {body}\n"

        text = re.sub(r"<h([1-6])[^>]*>(.*?)</h\1>", heading, text, flags=re.I | re.S)
        text = re.sub(r"<li[^>]*>", "\n- ", text, flags=re.I)
        text = re.sub(r"</(p|div|section|article|tr|ul|ol|table)>", "\n", text, flags=re.I)
        text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
        text = re.sub(r"</t[dh]>\s*<t[dh][^>]*>", " | ", text, flags=re.I)
        text = re.sub(r"<[^>]+>", "", text)
        text = html_lib.unescape(text)
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def _report_markdown_document(self, report):
        content = report.get("content", "")
        body = self._html_to_markdown_text(content) if report.get("contentFormat") == "html" else self._clean_report_content(content)
        title = report.get("title") or report.get("reportTypeName") or "生成报告"
        meta = [
            f"# {title}",
            "",
            f"- 报告类型：{report.get('reportTypeName', '')}",
            f"- 生成时间：{report.get('updatedAt', '')}",
            f"- 材料来源：{report.get('intro', '')}",
            "",
            "---",
            "",
        ]
        return "\n".join(meta) + body.strip() + "\n"

    def _markdown_to_html_fragment(self, markdown: str):
        lines = str(markdown or "").splitlines()
        html = []
        paragraph = []
        list_open = False

        def close_list():
            nonlocal list_open
            if list_open:
                html.append("</ul>")
                list_open = False

        def flush_paragraph():
            nonlocal paragraph
            if paragraph:
                close_list()
                html.append(f"<p>{html_lib.escape(' '.join(paragraph))}</p>")
                paragraph = []

        for line in lines:
            text = line.strip()
            if not text:
                flush_paragraph()
                close_list()
                continue
            heading = re.match(r"^(#{1,6})\s+(.+)$", text)
            if heading:
                flush_paragraph()
                close_list()
                level = min(len(heading.group(1)), 4)
                html.append(f"<h{level}>{html_lib.escape(heading.group(2).strip())}</h{level}>")
                continue
            if re.match(r"^[-*]\s+", text):
                flush_paragraph()
                if not list_open:
                    html.append("<ul>")
                    list_open = True
                item_text = re.sub(r"^[-*]\s+", "", text)
                html.append(f"<li>{html_lib.escape(item_text)}</li>")
                continue
            if text.startswith(">"):
                flush_paragraph()
                close_list()
                html.append(f"<blockquote>{html_lib.escape(text.lstrip('> ').strip())}</blockquote>")
                continue
            paragraph.append(text)
        flush_paragraph()
        close_list()
        return "\n".join(html)

    def _inline_markdown_to_html(self, text: str):
        escaped = html_lib.escape(str(text or ""))
        escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
        escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
        return escaped

    def _markdown_table_cells(self, line: str):
        return [cell.strip() for cell in line.strip().strip("|").split("|")]

    def _is_markdown_table_separator(self, line: str):
        return bool(re.match(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$", line))

    def _report_markdown_body_html(self, markdown: str, skip_first_title: str = ""):
        lines = str(markdown or "").splitlines()
        html = []
        paragraph = []
        list_stack = []
        section_open = False
        index = 0

        def close_lists():
            while list_stack:
                html.append(f"</{list_stack.pop()}>")

        def flush_paragraph():
            if paragraph:
                html.append(f"<p>{self._inline_markdown_to_html(' '.join(paragraph).strip())}</p>")
                paragraph.clear()

        while index < len(lines):
            text = lines[index].strip()
            if not text:
                flush_paragraph()
                close_lists()
                index += 1
                continue
            if text == "---":
                flush_paragraph()
                close_lists()
                html.append("<hr>")
                index += 1
                continue
            if text.startswith("|") and index + 1 < len(lines) and self._is_markdown_table_separator(lines[index + 1]):
                flush_paragraph()
                close_lists()
                header = self._markdown_table_cells(text)
                index += 2
                rows = []
                while index < len(lines) and lines[index].strip().startswith("|"):
                    rows.append(self._markdown_table_cells(lines[index].strip()))
                    index += 1
                html.append("<div class=\"table-wrap\"><table><thead><tr>")
                html.append("".join(f"<th>{self._inline_markdown_to_html(cell)}</th>" for cell in header))
                html.append("</tr></thead><tbody>")
                for row in rows:
                    html.append("<tr>")
                    html.append("".join(f"<td>{self._inline_markdown_to_html(cell)}</td>" for cell in row))
                    html.append("</tr>")
                html.append("</tbody></table></div>")
                continue
            heading = re.match(r"^(#{1,3})\s+(.+)$", text)
            if heading:
                flush_paragraph()
                close_lists()
                level = len(heading.group(1))
                title = heading.group(2).strip()
                if skip_first_title and title == skip_first_title:
                    index += 1
                    continue
                if level == 1:
                    if section_open:
                        html.append("</section>")
                    html.append(f"<section class=\"report-section\"><h2>{self._inline_markdown_to_html(title)}</h2>")
                    section_open = True
                elif level == 2:
                    html.append(f"<h3>{self._inline_markdown_to_html(title)}</h3>")
                else:
                    html.append(f"<h4>{self._inline_markdown_to_html(title)}</h4>")
                index += 1
                continue
            if text.startswith(">"):
                flush_paragraph()
                close_lists()
                html.append(f"<blockquote>{self._inline_markdown_to_html(text.lstrip('> ').strip())}</blockquote>")
                index += 1
                continue
            bullet = re.match(r"^[-*]\s+(.+)$", text)
            if bullet:
                flush_paragraph()
                if list_stack and list_stack[-1] != "ul":
                    close_lists()
                if not list_stack:
                    html.append("<ul>")
                    list_stack.append("ul")
                html.append(f"<li>{self._inline_markdown_to_html(bullet.group(1))}</li>")
                index += 1
                continue
            ordered = re.match(r"^\d+[.)]\s+(.+)$", text)
            if ordered:
                flush_paragraph()
                if list_stack and list_stack[-1] != "ol":
                    close_lists()
                if not list_stack:
                    html.append("<ol>")
                    list_stack.append("ol")
                html.append(f"<li>{self._inline_markdown_to_html(ordered.group(1))}</li>")
                index += 1
                continue
            paragraph.append(text)
            index += 1
        flush_paragraph()
        close_lists()
        if section_open:
            html.append("</section>")
        return "\n".join(html)

    def _first_markdown_section_text(self, markdown: str, heading: str):
        pattern = rf"^#\s+{re.escape(heading)}\s*$"
        lines = str(markdown or "").splitlines()
        start = -1
        for idx, line in enumerate(lines):
            if re.match(pattern, line.strip()):
                start = idx + 1
                break
        if start < 0:
            return ""
        chunk = []
        for line in lines[start:]:
            if line.startswith("# "):
                break
            if line.strip():
                chunk.append(line.strip())
        return re.sub(r"\s+", " ", " ".join(chunk)).strip()

    def _score_row_html(self, label: str, score: float, color: str):
        width = max(0, min(100, score / 5 * 100))
        return (
            "<div class=\"score-row\">"
            f"<span>{html_lib.escape(label)}</span>"
            f"<div class=\"score-track\"><i style=\"width:{width:.1f}%;background:{html_lib.escape(color)}\"></i></div>"
            f"<strong>{score:.2f}</strong>"
            "</div>"
        )

    def _chip_card_html(self, name: str, score: str, text: str, style: str):
        return (
            f"<div class=\"chip-card {style}\">"
            f"<b>{html_lib.escape(name)}</b><span>{html_lib.escape(score)}</span><p>{html_lib.escape(text)}</p>"
            "</div>"
        )

    def _quadrant_cell_html(self, title: str, style: str, items):
        tags = "".join(f"<span>{html_lib.escape(item)}</span>" for item in items)
        return f"<div class=\"quadrant-cell {style}\"><h4>{html_lib.escape(title)}</h4><div class=\"quadrant-tags\">{tags}</div></div>"

    def _report_360_html_document(self, report):
        title = report.get("title") or "360报告解读"
        markdown = self._clean_report_content(report.get("content", ""))
        first_title = ""
        first_heading = re.search(r"^#\s+(.+)$", markdown, re.M)
        if first_heading:
            first_title = first_heading.group(1).strip()
        summary = self._first_markdown_section_text(markdown, "一句话总结")
        body = self._report_markdown_body_html(markdown, skip_first_title=first_title)
        metrics = [
            ("他评总分", "4.54", "整体认可度较高"),
            ("排名", "25 / 249", "干部360评价活动"),
            ("自评", "4.48", "自他认知基本一致"),
            ("上级 / 同事 / 下级", "4.30 / 4.58 / 4.83", "下级感受最强，上级期待更高"),
        ]
        metrics_html = "".join(
            "<article class=\"metric-card\">"
            f"<span>{html_lib.escape(name)}</span><strong>{html_lib.escape(value)}</strong><em>{html_lib.escape(note)}</em>"
            "</article>"
            for name, value, note in metrics
        )
        role_html = "".join(
            [
                self._score_row_html("上级", 4.30, "#f59e0b"),
                self._score_row_html("同事", 4.58, "#2563eb"),
                self._score_row_html("下级", 4.83, "#0f9f8f"),
                self._score_row_html("自评", 4.48, "#e85d75"),
            ]
        )
        strength_html = "".join(
            [
                self._chip_card_html("务实正直", "4.96", "可靠扎实，业务判断被多方认可", "positive"),
                self._chip_card_html("小步快跑快速迭代", "4.93", "快速识别问题、推动优化闭环", "positive"),
                self._chip_card_html("坚定从容", "4.73", "压力场景下稳定团队节奏", "positive"),
            ]
        )
        development_html = "".join(
            [
                self._chip_card_html("引入和培养高潜", "4.40 / 自评4.00", "团队梯队建设要机制化", "caution"),
                self._chip_card_html("整合资源树立标杆", "4.26", "用标杆和机制放大影响", "caution"),
                self._chip_card_html("玩心热爱", "4.30 / 自评5.00", "创新热情需要更外显", "caution"),
            ]
        )
        quadrant_html = "".join(
            [
                self._quadrant_cell_html("优势共识区：自评高 / 他评高", "q-good", ["务实正直", "小步快跑快速迭代", "坚定从容"]),
                self._quadrant_cell_html("外显加强区：自评高 / 他评相对低", "q-watch", ["玩心热爱", "打破常规敢于尝试"]),
                self._quadrant_cell_html("待发展共识区：自评低 / 他评相对低", "q-dev", ["引入和培养高潜", "整合资源树立标杆", "流程机制提效能"]),
                self._quadrant_cell_html("潜在低估区：自评低 / 他评高", "q-muted", ["暂无明显项", "后续持续观察"]),
            ]
        )
        css = (
            ":root{--bg:#f5f7fb;--surface:#fff;--ink:#18202f;--muted:#657084;--line:#dfe5ef;--blue:#2457d6;--blue-soft:#eaf1ff;--teal:#0f9f8f;--teal-soft:#e9f8f5;--amber:#c97800;--amber-soft:#fff3dd;--rose:#c84662;--rose-soft:#fff0f3;--slate:#253044;--shadow:0 18px 48px rgba(24,32,47,.10)}"
            "*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;font-size:15px;line-height:1.72}.report-page{max-width:1180px;margin:0 auto;padding:28px 28px 64px}"
            ".hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(360px,.85fr);gap:18px;align-items:stretch;margin-bottom:18px}.hero-main,.hero-panel,.report-section,.insight-panel,.quadrant-panel{border:1px solid var(--line);border-radius:18px;background:var(--surface);box-shadow:var(--shadow)}"
            ".hero-main{padding:28px;background:linear-gradient(135deg,#131a28,#24324b 58%,#1e4d6f);color:#fff}.kicker{margin:0 0 14px;color:#9edbd4;font-size:13px;font-weight:800}h1{margin:0;font-size:34px;line-height:1.18;letter-spacing:0}.subtitle{margin:10px 0 0;max-width:64ch;color:rgba(255,255,255,.78)}"
            ".summary-box{margin-top:22px;padding:18px;border-radius:14px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18)}.summary-box b{display:block;margin-bottom:6px;color:#b7f0e8}.summary-box p{margin:0;color:rgba(255,255,255,.90)}.hero-panel{display:grid;gap:12px;padding:18px}"
            ".metric-card{padding:14px;border:1px solid var(--line);border-radius:14px;background:#fbfcff}.metric-card span{display:block;color:var(--muted);font-size:13px;font-weight:700}.metric-card strong{display:block;margin-top:4px;color:var(--blue);font-size:26px;line-height:1.15}.metric-card em{display:block;margin-top:6px;color:var(--muted);font-style:normal;font-size:12px}"
            ".insight-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:18px 0}.insight-panel{padding:20px}.insight-panel h2,.report-section h2{margin:0 0 14px;font-size:22px;line-height:1.35}.score-row{display:grid;grid-template-columns:56px minmax(0,1fr) 46px;gap:10px;align-items:center;margin:12px 0}.score-row span{color:var(--muted);font-weight:700}.score-row strong{text-align:right}.score-track{height:12px;border-radius:999px;background:#edf1f7;overflow:hidden}.score-track i{display:block;height:100%;border-radius:inherit}"
            ".chip-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.chip-card{min-height:128px;padding:14px;border-radius:14px;border:1px solid var(--line)}.chip-card b{display:block;font-size:15px}.chip-card span{display:inline-flex;margin:8px 0;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:800}.chip-card p{margin:0;color:var(--muted);font-size:13px}.chip-card.positive{background:var(--teal-soft);border-color:#bfe8e0}.chip-card.positive span{color:#08766b;background:rgba(15,159,143,.12)}.chip-card.caution{background:var(--amber-soft);border-color:#f3d29b}.chip-card.caution span{color:#9b5700;background:rgba(201,120,0,.12)}"
            ".quadrant-panel{margin:18px 0;padding:22px}.quadrant-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}.quadrant-head h2{margin:0;font-size:22px}.quadrant-head p{margin:0;color:var(--muted);font-size:13px}.quadrant-wrap{display:grid;grid-template-columns:42px 1fr;gap:10px;align-items:stretch}.axis-y{writing-mode:vertical-rl;transform:rotate(180deg);display:grid;place-items:center;color:var(--muted);font-size:12px;font-weight:800}.quadrant-grid{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:10px}.quadrant-grid:before,.quadrant-grid:after{content:'';position:absolute;background:rgba(37,48,68,.18)}.quadrant-grid:before{width:1px;top:0;bottom:0;left:50%}.quadrant-grid:after{height:1px;left:0;right:0;top:50%}"
            ".quadrant-cell{min-height:154px;padding:16px;border-radius:14px;border:1px solid var(--line);background:#fbfcff}.quadrant-cell h4{margin:0 0 12px;font-size:15px}.q-good{background:var(--teal-soft)}.q-watch{background:var(--rose-soft)}.q-dev{background:var(--amber-soft)}.q-muted{background:#f2f5fa}.quadrant-tags{display:flex;gap:8px;flex-wrap:wrap}.quadrant-tags span{padding:6px 9px;border-radius:999px;background:rgba(255,255,255,.72);border:1px solid rgba(24,32,47,.10);font-size:12px;font-weight:750}.axis-x{margin:8px 0 0 52px;display:flex;justify-content:space-between;color:var(--muted);font-size:12px;font-weight:800}"
            ".report-section{margin-top:18px;padding:24px}.report-section h3{margin:24px 0 10px;font-size:18px;color:var(--blue)}.report-section h4{margin:18px 0 8px;font-size:15px;color:var(--slate)}p{margin:10px 0}ul,ol{margin:10px 0 0 22px;padding:0}li{margin:6px 0}strong{color:#111827}code{padding:2px 6px;border-radius:6px;background:#edf1f7;color:#334155}blockquote{margin:14px 0;padding:14px 16px;border:1px solid #c9d8ff;border-radius:12px;background:var(--blue-soft);color:#1c3f97;font-weight:650}.table-wrap{overflow-x:auto;margin:14px 0;border:1px solid var(--line);border-radius:14px}table{width:100%;min-width:760px;border-collapse:collapse;background:#fff}th,td{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{background:#f3f6fb;color:#344054;font-size:13px}td{color:#344054}tr:last-child td{border-bottom:0}hr{border:0;border-top:1px solid var(--line);margin:18px 0}"
            "@media(max-width:860px){.report-page{padding:16px}.hero,.insight-grid{grid-template-columns:1fr}.chip-grid{grid-template-columns:1fr}h1{font-size:28px}}@media print{body{background:#fff}.report-page{max-width:none;padding:0}.hero-main,.hero-panel,.report-section,.insight-panel,.quadrant-panel{box-shadow:none;break-inside:avoid}}"
        )
        return (
            "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            f"<title>{html_lib.escape(title)}</title><style>{css}</style></head><body><main class=\"report-page\">"
            "<section class=\"hero\"><div class=\"hero-main\">"
            "<p class=\"kicker\">360°评估解读 · HRBP 一对一沟通版</p>"
            f"<h1>{html_lib.escape(title)}</h1>"
            "<p class=\"subtitle\">基于360个人报告标准版、核心版及开放性反馈整理。页面保留原始 MD 框架，并将关键分数、角色差异和行动重点前置呈现。</p>"
            f"<div class=\"summary-box\"><b>一句话总结</b><p>{self._inline_markdown_to_html(summary)}</p></div>"
            f"</div><aside class=\"hero-panel\" aria-label=\"关键指标\">{metrics_html}</aside></section>"
            f"<section class=\"insight-grid\"><div class=\"insight-panel\"><h2>角色评分对比</h2>{role_html}</div>"
            f"<div class=\"insight-panel\"><h2>优势与发展抓手</h2><div class=\"chip-grid\">{strength_html}</div><div style=\"height:10px\"></div><div class=\"chip-grid\">{development_html}</div></div></section>"
            "<section class=\"quadrant-panel\"><div class=\"quadrant-head\"><div><h2>个人发展四宫格</h2><p>用自评与他评的相对位置，帮助 HRBP 快速定位沟通重点。</p></div></div>"
            f"<div class=\"quadrant-wrap\"><div class=\"axis-y\">他评：低 → 高</div><div class=\"quadrant-grid\">{quadrant_html}</div></div>"
            "<div class=\"axis-x\"><span>自评低</span><span>自评高</span></div></section>"
            f"{body}</main></body></html>"
        )

    def _normalize_html_document(self, content: str, title: str = "生成报告"):
        html = self._clean_report_content(content)
        if re.search(r"<!doctype\s+html|<html[\s>]", html, re.I):
            return html
        return (
            "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            f"<title>{html_lib.escape(title)}</title>"
            "<style>"
            "body{margin:0;background:#f5f7fb;color:#172033;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;line-height:1.75;}"
            "main{max-width:920px;margin:0 auto;padding:48px 28px 72px;background:#fff;min-height:100vh;box-shadow:0 24px 64px rgba(16,24,40,.08);}"
            "h1{font-size:30px;line-height:1.25;margin:0 0 18px;color:#101217;}h2{font-size:22px;margin:32px 0 12px;color:#101217;}h3{font-size:18px;margin:24px 0 10px;color:#101217;}"
            "p,li{font-size:15px;color:#344054;}ul{padding-left:22px;}blockquote{margin:16px 0;padding:12px 16px;border-left:4px solid #2457d6;background:#f4f7ff;color:#344054;}"
            ".meta{margin:0 0 28px;padding:12px 14px;border:1px solid #e4e9f2;border-radius:8px;background:#f8fafc;color:#667085;font-size:13px;}"
            "</style></head><body>"
            f"<main><h1>{html_lib.escape(title)}</h1>{html}</main>"
            "</body></html>"
        )

    def _report_html_document(self, report):
        title = report.get("title") or report.get("reportTypeName") or "生成报告"
        if report.get("contentFormat") == "html":
            return self._normalize_html_document(report.get("content", ""), title)
        if report.get("reportType") == "360":
            return self._report_360_html_document(report)
        body = self._markdown_to_html_fragment(self._clean_report_content(report.get("content", "")))
        meta = (
            f"<div class=\"meta\">报告类型：{html_lib.escape(report.get('reportTypeName', ''))}"
            f"　生成时间：{html_lib.escape(report.get('updatedAt', ''))}"
            f"　材料来源：{html_lib.escape(report.get('intro', ''))}</div>"
        )
        return self._normalize_html_document(meta + body, title)

    def _resolve_report_path(self, path_value):
        if not path_value:
            return None
        path = Path(path_value)
        if not path.is_absolute():
            path = self.data_dir / path
        return path

    def _report_path_for_storage(self, path_value):
        path = self._resolve_report_path(path_value)
        if not path:
            return ""
        try:
            return str(path.resolve().relative_to(self.data_dir.resolve()))
        except ValueError:
            return str(path)

    def _report_record_for_storage(self, report):
        stored = dict(report)
        for key in ("mdPath", "htmlPath"):
            if stored.get(key):
                stored[key] = self._report_path_for_storage(stored[key])
        return stored

    def _ensure_report_markdown_file(self, report):
        if not report.get("id"):
            return report
        path_value = report.get("mdPath")
        path = self._resolve_report_path(path_value)
        if not path or not path.exists():
            self.report_markdown_dir.mkdir(parents=True, exist_ok=True)
            path = self.report_markdown_dir / self._safe_report_filename(report)
            path.write_text(self._report_markdown_document(report), encoding="utf-8")
        return {**report, "mdPath": str(path)}

    def _with_report_html_content(self, report):
        html_path = self._resolve_report_path(report.get("htmlPath", ""))
        if html_path and html_path.exists() and html_path.is_file():
            try:
                return {**report, "htmlContent": html_path.read_text(encoding="utf-8")}
            except UnicodeDecodeError:
                return {**report, "htmlContent": html_path.read_text(encoding="utf-8", errors="ignore")}
        return report

    def _with_report_markdown_content(self, report):
        report = self._ensure_report_markdown_file(report)
        md_path = self._resolve_report_path(report.get("mdPath", ""))
        if md_path and md_path.exists() and md_path.is_file():
            try:
                return {**report, "mdContent": md_path.read_text(encoding="utf-8")}
            except UnicodeDecodeError:
                return {**report, "mdContent": md_path.read_text(encoding="utf-8", errors="ignore")}
        return report

    def _normalized_report_record(self, report):
        if not isinstance(report, dict):
            return {}
        content = self._clean_report_content(report.get("content", ""))
        report_type = report.get("reportType") or "talent-review"
        preset = REPORT_PRESETS.get(report_type) or REPORT_PRESETS["talent-review"]
        content_format = report.get("contentFormat") or self._report_content_format(content)
        intro = report.get("intro") or ""
        if content_format == "html" and re.search(r"```|<!doctype\s+html|<html[\s>]", intro, re.I):
            intro = ""
        title = report.get("title") or self._report_title(content, preset["name"])
        if report_type == "360":
            person_name = self._extract_360_report_person_name(content, report.get("instruction", ""))
            title = f"{person_name}360报告解读" if person_name else "360报告解读"
            intro = "参考材料来源"
        return {
            **report,
            "title": title,
            "intro": intro or self._report_intro(content) or preset["description"],
            "content": content,
            "contentFormat": content_format,
            "reportType": report_type,
            "reportTypeName": report.get("reportTypeName") or preset["name"],
            "source": report.get("source", "ai"),
        }

    def generated_reports(self):
        history_path = self._first_existing_path([self.report_history_path, *[folder / "generated_reports.json" for folder in self.legacy_report_dirs]])
        records = self._read_json(history_path, [])
        if isinstance(records, dict):
            records = records.get("reports", [])
        records = [self._normalized_report_record(report) for report in records if isinstance(report, dict)]
        if not records:
            latest_path = self._first_existing_path([self.generated_report_path, *[folder / "generated_report.json" for folder in self.legacy_report_dirs]])
            legacy = self._read_json(latest_path, {"content": "", "updatedAt": "", "source": "none"})
            if legacy.get("content"):
                record = self._normalized_report_record({
                    "id": "legacy-latest",
                    "title": self._report_title(legacy.get("content", ""), "人才盘点报告"),
                    "intro": self._report_intro(legacy.get("content", "")),
                    "content": legacy.get("content", ""),
                    "contentFormat": legacy.get("contentFormat", self._report_content_format(legacy.get("content", ""))),
                    "instruction": legacy.get("instruction", ""),
                    "reportType": legacy.get("reportType", "talent-review"),
                    "reportTypeName": legacy.get("reportTypeName", REPORT_PRESETS["talent-review"]["name"]),
                    "updatedAt": legacy.get("updatedAt", ""),
                    "source": legacy.get("source", "ai"),
                })
                records = [record]
        return sorted([self._ensure_report_markdown_file(report) for report in records], key=lambda item: item.get("updatedAt", ""), reverse=True)

    def generated_report(self, report_id=None):
        reports = self.generated_reports()
        if report_id:
            for report in reports:
                if report.get("id") == report_id:
                    return self._with_report_html_content(self._with_report_markdown_content(report))
            return {"content": "", "updatedAt": "", "source": "none"}
        return self._with_report_html_content(self._with_report_markdown_content(reports[0])) if reports else {"content": "", "updatedAt": "", "source": "none"}

    def generated_report_list(self):
        return [
            {
                **{key: report.get(key, "") for key in ("id", "title", "intro", "reportType", "reportTypeName", "updatedAt", "source", "contentFormat", "mdPath", "htmlPath", "htmlGeneratedAt")},
                "hasHtml": bool(report.get("htmlPath") and self._resolve_report_path(report.get("htmlPath", "")).exists()),
            }
            for report in self.generated_reports()
        ]

    def save_generated_report(self, content: str, instruction: str, report_type: str = "talent-review"):
        payload = self._report_record(content, instruction, report_type)
        try:
            self.generated_report_path.parent.mkdir(parents=True, exist_ok=True)
            payload = self._ensure_report_markdown_file(payload)
            self.generated_report_path.write_text(json.dumps(self._report_record_for_storage(payload), ensure_ascii=False, indent=2), encoding="utf-8")
            existing = self._read_json(self.report_history_path, [])
            if isinstance(existing, dict):
                existing = existing.get("reports", [])
            reports = [payload] + [report for report in existing if report.get("id") != payload["id"]]
            self.report_history_path.write_text(json.dumps([self._report_record_for_storage(report) for report in reports[:50]], ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            payload["_saveError"] = f"报告未持久化: {e}"
        return payload

    def delete_generated_report(self, report_id: str):
        report_id = str(report_id or "").strip()
        if not report_id:
            raise ValueError("缺少报告 ID。")
        existing = self._read_json(self.report_history_path, [])
        if isinstance(existing, dict):
            existing = existing.get("reports", [])
        normalized = [self._normalized_report_record(report) for report in existing if isinstance(report, dict)]
        target = next((report for report in normalized if report.get("id") == report_id), None)
        if not target:
            raise FileNotFoundError("未找到要删除的报告。")
        remaining = [report for report in normalized if report.get("id") != report_id]
        md_path = self._resolve_report_path(target.get("mdPath", ""))
        if md_path and md_path.exists() and md_path.is_file():
            md_path.unlink()
        if self.report_markdown_dir.exists():
            for path in self.report_markdown_dir.glob(f"*{report_id[:12]}.md"):
                if path.is_file():
                    path.unlink()
        html_path = self._resolve_report_path(target.get("htmlPath", ""))
        if html_path and html_path.exists() and html_path.is_file():
            html_path.unlink()
        if self.report_html_dir.exists():
            for path in self.report_html_dir.glob(f"*{report_id[:12]}.html"):
                if path.is_file():
                    path.unlink()
        self.report_history_path.write_text(json.dumps([self._report_record_for_storage(report) for report in remaining[:50]], ensure_ascii=False, indent=2), encoding="utf-8")
        if remaining:
            latest = self._ensure_report_markdown_file(remaining[0])
            self.generated_report_path.write_text(json.dumps(self._report_record_for_storage(latest), ensure_ascii=False, indent=2), encoding="utf-8")
        elif self.generated_report_path.exists():
            self.generated_report_path.unlink()
        return {"deleted": True, "id": report_id, "remaining": len(remaining)}

    def generate_report_html(self, report_id: str):
        report_id = str(report_id or "").strip()
        if not report_id:
            raise ValueError("缺少报告 ID。")
        existing = self._read_json(self.report_history_path, [])
        if isinstance(existing, dict):
            existing = existing.get("reports", [])
        records = [self._normalized_report_record(report) for report in existing if isinstance(report, dict)]
        index = next((idx for idx, report in enumerate(records) if report.get("id") == report_id), -1)
        if index < 0:
            raise FileNotFoundError("未找到要生成 HTML 的报告。")
        report = self._ensure_report_markdown_file(records[index])
        self.report_html_dir.mkdir(parents=True, exist_ok=True)
        path = self._resolve_report_path(report.get("htmlPath", "")) if report.get("htmlPath") else self.report_html_dir / self._safe_report_html_filename(report)
        try:
            path.resolve().relative_to(self.report_html_dir.resolve())
        except ValueError:
            path = self.report_html_dir / self._safe_report_html_filename(report)
        path.write_text(self._report_html_document(report), encoding="utf-8")
        updated = {
            **report,
            "htmlPath": str(path),
            "htmlGeneratedAt": datetime.now(LOCAL_TZ).isoformat(timespec="seconds"),
        }
        records[index] = updated
        self.report_history_path.write_text(json.dumps([self._report_record_for_storage(report) for report in records[:50]], ensure_ascii=False, indent=2), encoding="utf-8")
        latest = self._read_json(self.generated_report_path, {}) if self.generated_report_path.exists() else {}
        if latest.get("id") == report_id:
            self.generated_report_path.write_text(json.dumps(self._report_record_for_storage(updated), ensure_ascii=False, indent=2), encoding="utf-8")
        return self._with_report_html_content(updated)

    def ai_config(self):
        if not hasattr(self, "_runtime_ai_keys"):
            self._runtime_ai_keys = {}
        saved = self._read_json(
            self.ai_config_path,
            {
                "apiKey": "",
                "baseUrl": "https://api.openai.com/v1",
                "model": "",
            },
        )
        if not isinstance(saved, dict):
            saved = {}

        def group_config(name, legacy=False):
            raw = saved.get(name, {}) if isinstance(saved.get(name, {}), dict) else {}
            if legacy:
                raw = {
                    "apiKey": raw.get("apiKey", ""),
                    "baseUrl": raw.get("baseUrl", saved.get("baseUrl", "https://api.openai.com/v1")),
                    "model": raw.get("model", saved.get("model", "")),
                }
            env_name = "HROBOT_AI_API_KEY" if name == "multimodal" else "HROBOT_IMAGE_API_KEY"
            return {
                "apiKey": os.environ.get(env_name) or self._runtime_ai_keys.get(name, "") or "",
                "baseUrl": raw.get("baseUrl", "https://api.openai.com/v1"),
                "model": raw.get("model", ""),
            }

        return {
            "multimodal": group_config("multimodal", legacy=True),
            "image": group_config("image"),
            "updatedAt": saved.get("updatedAt", ""),
        }

    def ai_config_status(self):
        config = self.ai_config()
        def status_for(group):
            return {
                "configured": bool(group.get("apiKey") and group.get("baseUrl") and group.get("model")),
                "baseUrl": group.get("baseUrl", ""),
                "model": group.get("model", ""),
            }

        return {
            "multimodal": status_for(config["multimodal"]),
            "image": status_for(config["image"]),
            "updatedAt": config.get("updatedAt", ""),
        }

    def save_ai_config(self, config):
        current = self.ai_config()
        timestamp = datetime.now(timezone.utc).isoformat()

        def merge_group(name):
            incoming = config.get(name, {}) if isinstance(config.get(name, {}), dict) else {}
            existing = current.get(name, {})
            api_key = incoming.get("apiKey")
            if api_key:
                self._runtime_ai_keys[name] = api_key
            return {
                "apiKey": "",
                "baseUrl": incoming.get("baseUrl") or existing.get("baseUrl", "https://api.openai.com/v1"),
                "model": incoming.get("model") or existing.get("model", ""),
            }

        if any(key in config for key in ("apiKey", "baseUrl", "model")):
            config = {
                "multimodal": {
                    "apiKey": config.get("apiKey"),
                    "baseUrl": config.get("baseUrl"),
                    "model": config.get("model"),
                }
            }
        payload = {
            "multimodal": merge_group("multimodal"),
            "image": merge_group("image"),
            "updatedAt": timestamp,
        }
        self.ai_config_path.parent.mkdir(parents=True, exist_ok=True)
        self.ai_config_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return self.ai_config_status()

    def _first_query_value(self, query, name):
        values = query.get(name, [])
        if not values:
            return ""
        return str(values[0] or "").strip()

    def intelligence_config(self):
        default = {
            "autoEnabled": True,
            "runAt": "10:00",
            "channel": "all",
            "source": "all",
            "maxPerQuery": 3,
            "wechatFulltextLimit": 1,
            "allowUnverifiedWechat": False,
            "updatedAt": "",
        }
        saved = self._read_json(self.intelligence_config_path, {})
        if not isinstance(saved, dict):
            saved = {}
        config = {**default, **saved}
        config["autoEnabled"] = bool(config.get("autoEnabled"))
        config["allowUnverifiedWechat"] = bool(config.get("allowUnverifiedWechat"))
        config["runAt"] = str(config.get("runAt") or "10:00")[:5]
        if config["channel"] not in {"all", "ai_hr", "game_org"}:
            config["channel"] = "all"
        if config["source"] not in {"all", "bing", "wechat"}:
            config["source"] = "all"
        try:
            config["maxPerQuery"] = max(1, min(10, int(config.get("maxPerQuery") or 3)))
        except (TypeError, ValueError):
            config["maxPerQuery"] = 3
        try:
            config["wechatFulltextLimit"] = max(0, min(5, int(config.get("wechatFulltextLimit", 1))))
        except (TypeError, ValueError):
            config["wechatFulltextLimit"] = 1
        return config

    def save_intelligence_config(self, config):
        current = self.intelligence_config()
        incoming = config if isinstance(config, dict) else {}
        payload = {**current}
        for key in ("autoEnabled", "runAt", "channel", "source", "maxPerQuery", "wechatFulltextLimit", "allowUnverifiedWechat"):
            if key in incoming:
                payload[key] = incoming[key]
        payload["updatedAt"] = datetime.now(LOCAL_TZ).isoformat(timespec="seconds")
        self.intelligence_config_path.parent.mkdir(parents=True, exist_ok=True)
        self.intelligence_config_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return self.intelligence_config()

    def intelligence_update_status(self):
        status = self._read_json(
            self.intelligence_update_status_path,
            {"running": False, "lastStartedAt": "", "lastFinishedAt": "", "lastAutoDate": "", "lastTrigger": "", "ok": None, "message": ""},
        )
        return status if isinstance(status, dict) else {}

    def _save_intelligence_update_status(self, status):
        self.intelligence_update_status_path.parent.mkdir(parents=True, exist_ok=True)
        self.intelligence_update_status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")

    def _run_intelligence_update_script(self, script_path, args):
        if not getattr(sys, "frozen", False):
            return subprocess.run(
                [sys.executable, str(script_path), *args],
                cwd=str(ROOT),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=900,
            )

        spec = importlib.util.spec_from_file_location("hrobot_update_intelligence", script_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"Cannot load intelligence script: {script_path}")
        module = importlib.util.module_from_spec(spec)
        old_argv = sys.argv[:]
        stdout = io.StringIO()
        stderr = io.StringIO()
        return_code = 0
        try:
            sys.argv = [str(script_path), *args]
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                spec.loader.exec_module(module)
                return_code = int(module.main() or 0)
        except SystemExit as exc:
            return_code = int(exc.code or 0) if isinstance(exc.code, int) else 1
        finally:
            sys.argv = old_argv
        return subprocess.CompletedProcess(
            [str(script_path), *args],
            return_code,
            stdout.getvalue(),
            stderr.getvalue(),
        )

    def update_intelligence_now(self, trigger="manual", target_date=None):
        if not INTELLIGENCE_UPDATE_LOCK.acquire(blocking=False):
            return {"ok": False, "running": True, "message": "情报更新正在运行，请稍后再试。", "status": self.intelligence_update_status()}
        started_at = datetime.now(LOCAL_TZ).isoformat(timespec="seconds")
        status = {
            **self.intelligence_update_status(),
            "running": True,
            "lastStartedAt": started_at,
            "lastTrigger": trigger,
            "ok": None,
            "message": "运行中",
        }
        self._save_intelligence_update_status(status)
        try:
            config = self.intelligence_config()
            script_path = ROOT / "scripts" / "update_intelligence.py"
            date_arg = target_date or (datetime.now(LOCAL_TZ).date() - timedelta(days=1)).isoformat()
            args = [
                "--date",
                date_arg,
                "--channel",
                config["channel"],
                "--source",
                config["source"],
                "--max-per-query",
                str(config["maxPerQuery"]),
                "--wechat-fulltext-limit",
                str(config["wechatFulltextLimit"]),
            ]
            if config.get("allowUnverifiedWechat"):
                args.append("--allow-unverified-wechat")
            completed = self._run_intelligence_update_script(script_path, args)
            finished_at = datetime.now(LOCAL_TZ).isoformat(timespec="seconds")
            ok = completed.returncode == 0
            message = (completed.stdout or completed.stderr or "").strip()
            status = {
                **status,
                "running": False,
                "lastFinishedAt": finished_at,
                "lastTrigger": trigger,
                "ok": ok,
                "message": message or ("更新完成" if ok else "更新失败"),
                "returnCode": completed.returncode,
            }
            if trigger == "auto":
                status["lastAutoDate"] = datetime.now(LOCAL_TZ).date().isoformat()
            self._save_intelligence_update_status(status)
            return {"ok": ok, "message": status["message"], "status": status}
        except subprocess.TimeoutExpired:
            status = {
                **status,
                "running": False,
                "lastFinishedAt": datetime.now(LOCAL_TZ).isoformat(timespec="seconds"),
                "lastTrigger": trigger,
                "ok": False,
                "message": "情报更新超时，请稍后重试或检查网络。",
            }
            if trigger == "auto":
                status["lastAutoDate"] = datetime.now(LOCAL_TZ).date().isoformat()
            self._save_intelligence_update_status(status)
            return {"ok": False, "message": status["message"], "status": status}
        except Exception as error:
            status = {
                **status,
                "running": False,
                "lastFinishedAt": datetime.now(LOCAL_TZ).isoformat(timespec="seconds"),
                "lastTrigger": trigger,
                "ok": False,
                "message": f"情报更新异常：{error}",
            }
            if trigger == "auto":
                status["lastAutoDate"] = datetime.now(LOCAL_TZ).date().isoformat()
            self._save_intelligence_update_status(status)
            return {"ok": False, "message": status["message"], "status": status}
        finally:
            INTELLIGENCE_UPDATE_LOCK.release()

    def _read_intelligence_file(self, path: Path):
        payload = self._read_json(path, {"updated_at": "", "items": []})
        if not isinstance(payload, dict):
            payload = {"updated_at": "", "items": []}
        items = payload.get("items", [])
        if not isinstance(items, list):
            items = []
        return {
            "updated_at": payload.get("updated_at", ""),
            "items": items,
        }

    def _filter_intelligence_items(self, items, query):
        channel = self._first_query_value(query, "channel")
        category = self._first_query_value(query, "category")
        date = self._first_query_value(query, "date")
        date_from = self._first_query_value(query, "from")
        date_to = self._first_query_value(query, "to")
        search = self._first_query_value(query, "search").lower()

        def matches(item):
            if channel and item.get("channel") != channel:
                return False
            if category and item.get("category") != category:
                return False
            published_at = str(item.get("published_at", ""))
            if date and published_at != date:
                return False
            if date_from and published_at < date_from:
                return False
            if date_to and published_at > date_to:
                return False
            if search:
                keywords = item.get("keywords", [])
                if not isinstance(keywords, list):
                    keywords = []
                haystack = " ".join(
                    [
                        str(item.get("title", "")),
                        str(item.get("summary", "")),
                        str(item.get("hrbp_takeaway", "")),
                        str(item.get("source", "")),
                        " ".join(str(keyword) for keyword in keywords),
                    ]
                ).lower()
                if search not in haystack:
                    return False
            return True

        return [item for item in items if isinstance(item, dict) and matches(item)]

    def intelligence(self, query=None):
        query = query or {}
        use_history = self._first_query_value(query, "history").lower() in {"1", "true", "yes", "on"}
        if not use_history:
            use_history = any(self._first_query_value(query, key) for key in ("date", "from", "to", "channel", "category", "search"))
            if use_history and not any(self._first_query_value(query, key) for key in ("date", "from", "to")):
                use_history = False
        payload = self._read_intelligence_file(self.intelligence_history_path if use_history else self.intelligence_path)
        items = self._filter_intelligence_items(payload["items"], query)
        return {
            "ok": True,
            "scope": "history" if use_history else "current",
            "updated_at": payload["updated_at"],
            "items": items,
            "total": len(payload["items"]),
            "count": len(items),
        }

    def design_posters(self):
        payload = self._read_json(self.design_history_path, {"updatedAt": "", "items": []})
        if not isinstance(payload, dict):
            payload = {"updatedAt": "", "items": []}
        items = payload.get("items", [])
        if not isinstance(items, list):
            items = []
        return {
            "updatedAt": payload.get("updatedAt", ""),
            "items": items,
        }

    @staticmethod
    def _normalize_home_memo_records(records):
        normalized = []
        seen = set()
        for item in records or []:
            if not isinstance(item, dict):
                continue
            date = str(item.get("date", "")).strip()
            text = str(item.get("text", "")).strip()
            if not date or not text:
                continue
            if date in seen:
                continue
            seen.add(date)
            normalized.append({"date": date, "text": text})
        normalized.sort(key=lambda item: item["date"])
        return normalized

    def home_memos(self):
        payload = self._read_json(self.home_memo_path, DEFAULT_HOME_MEMO)
        if not isinstance(payload, dict):
            payload = dict(DEFAULT_HOME_MEMO)
        return {
            "updatedAt": payload.get("updatedAt", ""),
            "records": self._normalize_home_memo_records(payload.get("records", [])),
        }

    def save_home_memos(self, records):
        payload = {
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "records": self._normalize_home_memo_records(records),
        }
        self.home_memo_path.parent.mkdir(parents=True, exist_ok=True)
        self.home_memo_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return payload

    def save_home_memo(self, date, text):
        date = str(date or "").strip()
        text = str(text or "").strip()
        if not date:
            raise ValueError("缺少备忘日期。")
        if not text:
            raise ValueError("缺少备忘内容。")
        records = [item for item in self.home_memos()["records"] if item.get("date") != date]
        records.append({"date": date, "text": text})
        return self.save_home_memos(records)

    def delete_home_memo(self, date):
        date = str(date or "").strip()
        if not date:
            raise ValueError("缺少备忘日期。")
        records = [item for item in self.home_memos()["records"] if item.get("date") != date]
        return self.save_home_memos(records)

    def _ensure_design_reference_readme(self):
        if self.design_reference_readme_path.exists():
            return
        content = (
            "# Design References\n\n"
            "Place logo images, mascot images, poster templates, and other reference assets in this folder.\n"
            "The current prompt builder will expose file names to the model as text hints.\n"
            "Future upgrades can attach these files as true multimodal references.\n"
        )
        self.design_reference_dir.mkdir(parents=True, exist_ok=True)
        self.design_reference_readme_path.write_text(content, encoding="utf-8")

    def design_reference_assets(self):
        self.design_reference_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_design_reference_readme()
        items = []
        for path in sorted(self.design_reference_dir.iterdir(), key=lambda item: item.name.lower()):
            if not path.is_file() or path.name.lower() == "readme.md":
                continue
            items.append(
                {
                    "name": path.name,
                    "path": f"/data/design_center/references/{path.name}",
                    "size": path.stat().st_size,
                    "updatedAt": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
                }
            )
        return items

    def design_prompt_config(self):
        self.design_dir.mkdir(parents=True, exist_ok=True)
        self.design_reference_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_design_reference_readme()
        saved = self._read_json(self.design_prompt_config_path, {})
        if not isinstance(saved, dict):
            saved = {}
        config = {**DEFAULT_DESIGN_PROMPT_CONFIG, **{key: str(value) for key, value in saved.items() if isinstance(value, (str, int, float))}}
        return {
            **config,
            "configPath": str(self.design_prompt_config_path),
            "referenceFolder": str(self.design_reference_dir),
            "referenceFiles": self.design_reference_assets(),
        }

    def save_design_prompt_config(self, config):
        payload = {
            key: str((config or {}).get(key, DEFAULT_DESIGN_PROMPT_CONFIG[key]) or "").strip()
            for key in DEFAULT_DESIGN_PROMPT_CONFIG
        }
        self.design_prompt_config_path.parent.mkdir(parents=True, exist_ok=True)
        self.design_reference_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_design_reference_readme()
        self.design_prompt_config_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return self.design_prompt_config()

    @staticmethod
    def _agent_timestamp():
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _agent_slug(value):
        value = str(value or "").strip().lower()
        slug = re.sub(r"[^a-z0-9_-]+", "-", value).strip("-")
        return slug or f"web-{uuid.uuid4().hex[:8]}"

    @staticmethod
    def _url_path(value):
        return "/".join(quote(part) for part in str(value or "").replace("\\", "/").split("/") if part)

    def _agent_manifest(self):
        payload = self._read_json(self.agent_manifest_path, DEFAULT_AGENT_PROJECT_CENTER)
        if not isinstance(payload, dict):
            payload = dict(DEFAULT_AGENT_PROJECT_CENTER)
        projects = [item for item in payload.get("projects", []) if isinstance(item, dict)]
        return {"updatedAt": payload.get("updatedAt", ""), "projects": projects}

    def _save_agent_manifest(self, projects):
        payload = {
            "updatedAt": self._agent_timestamp(),
            "projects": sorted(projects, key=lambda item: item.get("updatedAt", ""), reverse=True),
        }
        self.agent_center_dir.mkdir(parents=True, exist_ok=True)
        self.agent_manifest_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return payload

    def _safe_extract_zip(self, zip_path: Path, target_dir: Path):
        target_dir.mkdir(parents=True, exist_ok=True)
        file_count = 0
        total_size = 0
        with ZipFile(zip_path) as archive:
            for member in archive.infolist():
                raw_name = member.filename.replace("\\", "/")
                if member.is_dir() or raw_name.startswith("__MACOSX/") or raw_name.endswith(".DS_Store"):
                    continue
                if raw_name.startswith("/") or re.match(r"^[A-Za-z]:", raw_name):
                    raise ValueError("Zip 中包含不安全的绝对路径。")
                parts = [part for part in raw_name.split("/") if part and part != "."]
                if not parts or any(part == ".." for part in parts):
                    raise ValueError("Zip 中包含不安全的相对路径。")
                output_path = target_dir.joinpath(*parts)
                if not str(output_path.resolve()).startswith(str(target_dir.resolve())):
                    raise ValueError("Zip 解压路径越界。")
                output_path.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, output_path.open("wb") as target:
                    shutil.copyfileobj(source, target)
                file_count += 1
                total_size += member.file_size
        if file_count == 0:
            raise ValueError("Zip 中没有可用文件。")
        return file_count, total_size

    def _find_project_entry(self, project_dir: Path):
        direct = project_dir / "index.html"
        if direct.exists():
            return direct
        candidates = sorted(project_dir.rglob("index.html"), key=lambda item: (len(item.relative_to(project_dir).parts), str(item)))
        if candidates:
            return candidates[0]
        html_files = sorted(project_dir.rglob("*.html"), key=lambda item: (len(item.relative_to(project_dir).parts), str(item)))
        if html_files:
            return html_files[0]
        raise ValueError("未找到 index.html 或其他 HTML 入口文件。")

    @staticmethod
    def _html_title(path: Path):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")[:20000]
        except OSError:
            return ""
        match = re.search(r"<title[^>]*>(.*?)</title>", text, flags=re.IGNORECASE | re.DOTALL)
        if not match:
            return ""
        title = re.sub(r"\s+", " ", html_lib.unescape(match.group(1))).strip()
        return title[:80]

    @staticmethod
    def _plain_text_summary(text, limit=92):
        text = re.sub(r"```[\s\S]*?```", " ", text)
        text = re.sub(r"`([^`]*)`", r"\1", text)
        text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text)
        text = re.sub(r"\[[^\]]+\]\([^)]+\)", " ", text)
        text = re.sub(r"https?://\S+", " ", text)
        lines = []
        for line in text.splitlines():
            line = re.sub(r"^\s{0,3}#{1,6}\s*", "", line)
            line = re.sub(r"^\s*[-*+]\s+", "", line)
            line = re.sub(r"^\s*\d+[.)]\s+", "", line)
            line = re.sub(r"\s+", " ", line).strip(" #|-*_")
            if not line or line.lower().startswith(("usage", "install", "start")):
                continue
            if re.search(r"(使用说明|运行前准备|Python|下载地址|一键启动|免 Python|安装|浏览器|双击|chmod|PyInstaller|端口|Windows|Mac|终端|命令行|启动)", line, re.IGNORECASE):
                continue
            if line:
                lines.append(line)
            if len(" ".join(lines)) >= limit:
                break
        summary = " ".join(lines).strip()
        return summary[:limit].rstrip("，,。.;； ") if len(summary) > limit else summary

    @staticmethod
    def _description_from_title(title=""):
        title = str(title or "")
        if "人才" in title and ("盘点" in title or "九宫格" in title):
            return "用于查看人才盘点结果、九宫格校准和本地报告资料的独立 Web 功能。"
        if "九宫格" in title:
            return "用于查看九宫格分布、校准记录和相关人才数据的独立 Web 功能。"
        return ""

    @staticmethod
    def _description_is_setup_text(description=""):
        return bool(re.search(r"(运行前准备|Python|下载地址|一键启动|免 Python|安装|浏览器|双击|chmod|PyInstaller|Windows|Mac|终端|命令行|启动|本机访问|局域网|运行)", str(description or ""), re.IGNORECASE))

    def _project_description(self, project_dir: Path, title=""):
        title_description = self._description_from_title(title)
        if title_description:
            return title_description
        readme_names = {
            "readme.md",
            "readme_使用说明.md",
            "使用说明.md",
            "说明.md",
        }
        candidates = []
        for path in project_dir.rglob("*"):
            if path.is_file() and path.name.lower() in readme_names:
                candidates.append(path)
        for path in sorted(candidates, key=lambda item: (len(item.parts), item.name.lower())):
            with contextlib.suppress(OSError):
                summary = self._plain_text_summary(path.read_text(encoding="utf-8", errors="ignore"))
                if summary and summary != title and not self._description_is_setup_text(summary):
                    return summary
        return ""

    def _project_metadata(self, project_id, project_dir: Path, source_zip: Path, file_count=None, total_size=None):
        entry = self._find_project_entry(project_dir)
        entry_rel = entry.relative_to(project_dir).as_posix()
        title = self._html_title(entry) or source_zip.stem
        description = self._project_description(project_dir, title)
        server_path = self._find_project_server(project_dir, entry)
        server_rel = server_path.relative_to(project_dir).as_posix() if server_path else ""
        if file_count is None or total_size is None:
            files = [path for path in project_dir.rglob("*") if path.is_file()]
            file_count = len(files)
            total_size = sum(path.stat().st_size for path in files)
        timestamp = self._agent_timestamp()
        return {
            "id": project_id,
            "name": title,
            "description": description,
            "sourceZip": source_zip.name,
            "sourceZipMtime": source_zip.stat().st_mtime_ns if source_zip.exists() else 0,
            "entry": entry_rel,
            "entryUrl": f"/data/agent_center/projects/{quote(project_id)}/{self._url_path(entry_rel)}",
            "serverEntry": server_rel,
            "runtime": "python-server" if server_rel else "static-web",
            "folderPath": str(project_dir),
            "fileCount": file_count,
            "size": total_size,
            "kind": "static-web",
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }

    def _import_agent_zip_path(self, zip_path: Path):
        if not zip_path.exists() or zip_path.suffix.lower() != ".zip":
            raise ValueError("请提供独立 Web 项目的 zip 文件。")
        project_id = f"{self._agent_slug(zip_path.stem)}-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4]}"
        project_dir = self.agent_project_dir / project_id
        if project_dir.exists():
            self._remove_agent_project_dir(project_dir)
        file_count, total_size = self._safe_extract_zip(zip_path, project_dir)
        return self._project_metadata(project_id, project_dir, zip_path, file_count=file_count, total_size=total_size)

    def _remove_agent_project_dir(self, project_dir: Path):
        project_dir = project_dir.resolve()
        project_root = self.agent_project_dir.resolve()
        if project_root not in [project_dir, *project_dir.parents]:
            raise ValueError("项目目录不在允许删除的范围内。")
        if not project_dir.exists():
            return

        def handle_remove_error(func, path, exc_info):
            with contextlib.suppress(Exception):
                os.chmod(path, 0o700)
            func(path)

        last_error = None
        for _ in range(3):
            try:
                shutil.rmtree(project_dir, onerror=handle_remove_error)
                return
            except PermissionError as error:
                last_error = error
                time.sleep(0.5)
            except OSError as error:
                last_error = error
                time.sleep(0.5)
        raise RuntimeError(f"项目文件夹被其他程序占用，请关闭已打开的项目页面或文件夹后重试：{last_error}")

    def _refresh_agent_project_runtime_metadata(self, project, project_dir: Path):
        entry_rel = str(project.get("entry") or "").strip()
        entry = project_dir / entry_rel if entry_rel else None
        if not entry or not entry.exists():
            with contextlib.suppress(Exception):
                entry = self._find_project_entry(project_dir)
        server_path = self._find_project_server(project_dir, entry)
        server_rel = server_path.relative_to(project_dir).as_posix() if server_path else ""
        runtime = "python-server" if server_rel else "static-web"
        title = str(project.get("name") or "")
        existing_description = str(project.get("description") or "").strip()
        description = self._project_description(project_dir, title) if self._description_is_setup_text(existing_description) else existing_description
        description = description or self._project_description(project_dir, title)
        if project.get("serverEntry") == server_rel and project.get("runtime") == runtime and project.get("description", "") == description:
            return project, False
        return {**project, "description": description, "serverEntry": server_rel, "runtime": runtime}, True

    def _find_project_server(self, project_dir: Path, entry: Path | None = None):
        candidates = []
        if entry:
            for parent in [entry.parent, *entry.parents]:
                if project_dir not in [parent, *parent.parents]:
                    break
                server_path = parent / "server.py"
                if server_path.exists() and server_path.is_file():
                    candidates.append(server_path)
                    break
        candidates.extend(path for path in project_dir.rglob("server.py") if path.is_file())
        unique = []
        seen = set()
        for path in candidates:
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            unique.append(path)
        return unique[0] if unique else None

    @staticmethod
    def _find_free_local_port():
        for port in range(8768, 8999):
            with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
                try:
                    sock.bind(("127.0.0.1", port))
                    return port
                except OSError:
                    continue
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]

    @staticmethod
    def _agent_project_url_ready(url):
        try:
            with urlopen(Request(url, headers={"User-Agent": "AgentCenterRuntimeCheck/1.0"}), timeout=0.8):
                return True
        except Exception:
            return False

    def _agent_project_by_id(self, project_id):
        project_id = str(project_id or "").strip()
        if not project_id:
            raise ValueError("缺少项目 ID。")
        manifest = self._agent_manifest()
        project = next((item for item in manifest["projects"] if item.get("id") == project_id), None)
        if not project:
            raise FileNotFoundError("未找到 Web 项目。")
        project_dir = self.agent_project_dir / project_id
        if not project_dir.exists():
            raise FileNotFoundError("项目文件夹不存在。")
        return project, project_dir

    def _stop_agent_project_process(self, project_id):
        with self._agent_process_lock:
            runtime = self._agent_processes.pop(project_id, None)
        if not runtime:
            return False
        process = runtime.get("process")
        if process and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
        log_file = runtime.get("log")
        if log_file:
            with contextlib.suppress(Exception):
                log_file.close()
        return True

    def _stop_agent_project_orphan_processes(self, project_dir: Path):
        if os.name != "nt":
            return
        needle = str(project_dir.resolve())
        script = f"""
$needle = @'
{needle}
'@
Get-CimInstance Win32_Process |
  Where-Object {{ $_.CommandLine -and $_.CommandLine.Contains($needle) }} |
  ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}
"""
        with contextlib.suppress(Exception):
            subprocess.run(
                ["powershell", "-NoProfile", "-Command", script],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5,
                check=False,
            )

    def open_agent_project(self, project_id):
        project, project_dir = self._agent_project_by_id(project_id)
        server_entry = (project.get("serverEntry") or "").strip()
        if not server_entry:
            return {"project": project, "url": project.get("entryUrl", ""), "runtime": "static-web", "port": None}

        server_path = (project_dir / server_entry).resolve()
        if not server_path.exists() or project_dir.resolve() not in [server_path, *server_path.parents]:
            raise FileNotFoundError("项目服务入口不存在。")

        with self._agent_process_lock:
            runtime = self._agent_processes.get(project_id)
            if runtime and runtime["process"].poll() is None:
                return {"project": project, "url": runtime["url"], "runtime": "python-server", "port": runtime["port"]}

            port = self._find_free_local_port()
            entry_path = (project_dir / str(project.get("entry") or "index.html")).resolve()
            server_root = server_path.parent.resolve()
            entry_rel = "index.html"
            if server_root in [entry_path, *entry_path.parents]:
                entry_rel = entry_path.relative_to(server_root).as_posix()
            url = f"http://127.0.0.1:{port}/{self._url_path(entry_rel)}"
            log_dir = self.agent_center_dir / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = (log_dir / f"{project_id}.log").open("a", encoding="utf-8")
            command = [sys.executable, str(server_path), "--host", "127.0.0.1", "--port", str(port)]
            kwargs = {
                "cwd": str(server_path.parent),
                "stdout": log_file,
                "stderr": subprocess.STDOUT,
                "stdin": subprocess.DEVNULL,
            }
            if os.name == "nt":
                kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
            process = subprocess.Popen(command, **kwargs)
            self._agent_processes[project_id] = {"process": process, "port": port, "url": url, "log": log_file}

        deadline = time.time() + 8
        while time.time() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"项目服务启动失败，日志：{log_dir / f'{project_id}.log'}")
            if self._agent_project_url_ready(url):
                break
            time.sleep(0.25)
        return {"project": project, "url": url, "runtime": "python-server", "port": port}

    def _remove_agent_source_zip(self, source_zip_name):
        source_zip = self.agent_zip_dir / Path(source_zip_name or "").name
        if source_zip.exists() and source_zip.is_file():
            source_zip.unlink()

    def _sync_agent_zip_drop_folder(self, projects):
        self.agent_zip_dir.mkdir(parents=True, exist_ok=True)
        self.agent_project_dir.mkdir(parents=True, exist_ok=True)
        seen = {(item.get("sourceZip"), item.get("sourceZipMtime")) for item in projects}
        imported = []
        for zip_path in sorted(self.agent_zip_dir.glob("*.zip"), key=lambda item: item.stat().st_mtime_ns):
            signature = (zip_path.name, zip_path.stat().st_mtime_ns)
            if signature in seen:
                self._remove_agent_source_zip(zip_path.name)
                continue
            project = self._import_agent_zip_path(zip_path)
            imported.append(project)
            self._remove_agent_source_zip(project.get("sourceZip"))
        return imported

    def agent_projects(self):
        manifest = self._agent_manifest()
        projects = []
        metadata_changed = False
        for item in manifest["projects"]:
            project_id = str(item.get("id", "")).strip()
            if project_id and (self.agent_project_dir / project_id).exists():
                refreshed, changed = self._refresh_agent_project_runtime_metadata(item, self.agent_project_dir / project_id)
                metadata_changed = metadata_changed or changed
                projects.append(refreshed)
        imported = self._sync_agent_zip_drop_folder(projects)
        if imported or metadata_changed or len(projects) != len(manifest["projects"]):
            manifest = self._save_agent_manifest([*imported, *projects])
            projects = manifest["projects"]
        return {
            "updatedAt": manifest.get("updatedAt", ""),
            "projects": projects,
            "count": len(projects),
            "zipDropFolder": str(self.agent_zip_dir),
            "projectFolder": str(self.agent_project_dir),
        }

    def import_agent_project_zip(self, filename, content):
        if not content:
            raise ValueError("请上传独立 Web 项目 zip。")
        self.agent_zip_dir.mkdir(parents=True, exist_ok=True)
        safe_name = Path(filename or "agent-project.zip").name
        if not safe_name.lower().endswith(".zip"):
            raise ValueError("只支持 zip 文件。")
        zip_path = self.agent_zip_dir / safe_name
        if zip_path.exists():
            zip_path = self.agent_zip_dir / f"{zip_path.stem}-{datetime.now().strftime('%Y%m%d%H%M%S')}{zip_path.suffix}"
        zip_path.write_bytes(content)
        manifest = self._agent_manifest()
        project = self._import_agent_zip_path(zip_path)
        self._remove_agent_source_zip(project.get("sourceZip"))
        payload = self._save_agent_manifest([project, *manifest["projects"]])
        return {**payload, "project": project, "count": len(payload["projects"]), "zipDropFolder": str(self.agent_zip_dir), "projectFolder": str(self.agent_project_dir)}

    def delete_agent_project(self, project_id):
        project_id = str(project_id or "").strip()
        if not project_id:
            raise ValueError("缺少项目 ID。")
        manifest = self._agent_manifest()
        project = next((item for item in manifest["projects"] if item.get("id") == project_id), None)
        if not project:
            raise FileNotFoundError("未找到要删除的 Web 项目。")
        project_dir = self.agent_project_dir / project_id
        self._stop_agent_project_process(project_id)
        self._stop_agent_project_orphan_processes(project_dir)
        if project_dir.exists():
            self._remove_agent_project_dir(project_dir)
        self._remove_agent_source_zip(project.get("sourceZip"))
        projects = [item for item in manifest["projects"] if item.get("id") != project_id]
        payload = self._save_agent_manifest(projects)
        return {**payload, "count": len(payload["projects"]), "zipDropFolder": str(self.agent_zip_dir), "projectFolder": str(self.agent_project_dir)}

    def save_design_poster(self, poster):
        timestamp = datetime.now(timezone.utc).isoformat()
        poster_id = datetime.now().strftime("%Y%m%d%H%M%S%f")
        image_name = f"poster-{poster_id}.png"
        self.design_poster_dir.mkdir(parents=True, exist_ok=True)
        image_path = self.design_poster_dir / image_name

        if poster.get("b64_json"):
            image_path.write_bytes(base64.b64decode(poster["b64_json"]))
        elif poster.get("imageBytes"):
            image_path.write_bytes(poster["imageBytes"])
        else:
            raise ValueError("No image data returned by image model")

        item = {
            "id": poster_id,
            "posterType": poster.get("posterType", ""),
            "style": poster.get("style", ""),
            "size": poster.get("size", ""),
            "prompt": poster.get("prompt", ""),
            "model": poster.get("model", ""),
            "imagePath": f"/data/design_center/posters/{image_name}",
            "createdAt": timestamp,
        }
        history = self.design_posters()
        payload = {
            "updatedAt": timestamp,
            "items": [item] + history["items"],
        }
        self.design_history_path.parent.mkdir(parents=True, exist_ok=True)
        self.design_history_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return item



class Handler(SimpleHTTPRequestHandler):
    store = DataStore(DATA_DIR)
    allow_remote_clients = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _client_is_local(self):
        host = (self.client_address[0] if self.client_address else "") or ""
        return host.startswith("127.") or host == "::1" or host == "localhost"

    def _allow_request(self):
        if self.allow_remote_clients or self._client_is_local():
            return True
        body = "Remote access is disabled. Restart with --allow-remote-clients only on a trusted network."
        encoded = body.encode("utf-8")
        self.send_response(403)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
        return False

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path, content_type: str):
        body = path.read_bytes()
        filename = quote(path.name)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{filename}")
        self.end_headers()
        self.wfile.write(body)

    def _read_request_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        try:
            return json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return None

    def _read_multipart_file(self):
        files = self._read_multipart_files()
        return files[0] if files else (None, None)

    def _read_multipart_files(self):
        content_type = self.headers.get("Content-Type", "")
        match = re.search(r"boundary=(.+)", content_type)
        if not match:
            return []
        boundary = match.group(1).strip('"').encode("utf-8")
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        files = []
        for part in body.split(b"--" + boundary):
            if b"\r\n\r\n" not in part:
                continue
            raw_headers, content = part.split(b"\r\n\r\n", 1)
            headers = raw_headers.decode("utf-8", errors="replace")
            if "filename=" not in headers:
                continue
            filename_match = re.search(r'filename="([^"]*)"', headers)
            filename = filename_match.group(1) if filename_match else "upload"
            if content.endswith(b"\r\n"):
                content = content[:-2]
            files.append((filename, content))
        return files

    @staticmethod
    def _ai_request_payload(model, messages):
        return {
            "model": model,
            "messages": messages,
        }

    @staticmethod
    def _image_request_payload(model, prompt, size):
        return {
            "model": model,
            "prompt": prompt,
            "size": size or "1024x1024",
            "n": 1,
        }

    def _call_ai_model(self, messages):
        config = self.store.ai_config()["multimodal"]
        if not (config.get("apiKey") and config.get("baseUrl") and config.get("model")):
            return {
                "configured": False,
                "message": "请先在 09 设置页配置模型 Base URL、模型名，并通过本次运行输入 API Key，或设置 HROBOT_AI_API_KEY 环境变量。"
            }

        endpoint = config["baseUrl"].rstrip("/") + "/chat/completions"
        payload = self._ai_request_payload(config["model"], messages)
        request = Request(
            endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {config['apiKey']}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=300) as response:
                data = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            return {"configured": True, "error": f"模型接口返回 {error.code}: {detail}"}
        except URLError as error:
            return {"configured": True, "error": f"无法连接模型接口: {error.reason}"}

        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"configured": True, "message": content or "模型未返回内容。", "raw": data}

    def _call_image_model(self, prompt, size="1024x1024"):
        config = self.store.ai_config()["image"]
        if not (config.get("apiKey") and config.get("baseUrl") and config.get("model")):
            return {
                "configured": False,
                "message": "请先在 09 设置页配置图片模型，或设置 HROBOT_IMAGE_API_KEY 环境变量。",
            }
        endpoint = config["baseUrl"].rstrip("/") + "/images/generations"
        payload = self._image_request_payload(config["model"], prompt, size)
        request = Request(
            endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {config['apiKey']}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=300) as response:
                data = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            return {"configured": True, "error": f"图像模型接口返回 {error.code}: {detail}"}
        except URLError as error:
            return {"configured": True, "error": f"无法连接图像模型接口: {error.reason}"}

        first = (data.get("data") or [{}])[0]
        if first.get("b64_json"):
            return {
                "configured": True,
                "model": config["model"],
                "b64_json": first["b64_json"],
                "raw": data,
            }
        if first.get("url"):
            try:
                with urlopen(first["url"], timeout=120) as image_response:
                    return {
                        "configured": True,
                        "model": config["model"],
                        "imageBytes": image_response.read(),
                        "raw": data,
                    }
            except URLError as error:
                return {"configured": True, "error": f"无法下载生成图片: {error.reason}"}
        return {"configured": True, "error": "图像模型未返回 b64_json 或 url。", "raw": data}

    def _build_ai_messages(self, question, history):
        context = self.store.analysis_context()
        context_text = json.dumps(context, ensure_ascii=False)
        if len(context_text) > 120000:
            context_text = context_text[:120000] + "\n...内容过长，后续数据已截断。"
        system = (
            "你是资深 HRBP 和人才盘点顾问。请基于系统提供的人才盘点、九宫格、档案和校准数据回答问题。"
            "不得编造不存在的数据；涉及个人评价时要谨慎、具体、可追溯，并优先服务 HR 复盘、校准和发展建议场景。"
        )
        messages = [
            {"role": "system", "content": system},
            {"role": "system", "content": f"可用数据如下：\n{context_text}"},
        ]
        for item in history[-12:]:
            role = item.get("role")
            content = item.get("content")
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": question})
        return messages

    def _build_report_messages(self, instruction, department=None, report_type=None):
        context = self.store.analysis_context(department=department)
        context_text = json.dumps(context, ensure_ascii=False)
        if len(context_text) > 100000:
            context_text = context_text[:100000] + "\n...内容过长，后续数据已截断。"
        preset = REPORT_PRESETS.get(report_type or "") or REPORT_PRESETS["talent-review"]
        assets_text = json.dumps(self.store.report_asset_context(report_type), ensure_ascii=False)
        if len(assets_text) > 80000:
            assets_text = assets_text[:80000] + "\n...内容过长，后续材料已截断。"
        system = (
            "你是资深 HRBP 和组织人才分析顾问，负责基于真实材料生成可直接用于人才复盘的报告。"
            "请严格依据系统提供的人才盘点、档案、导入 skill 和材料，不得编造评分、姓名、反馈原文或结论。"
            f"本次报告类型为：{preset['name']}。请遵循对应 skill 或设定材料中的结构、口径和注意事项。"
        )
        if department:
            system += f"\n请只分析部门或组织范围：{department}，不要扩展到无关人员。"
        user_instruction = instruction or f"请生成一份{preset['name']}，优先使用已导入的 skill 和材料，并结合 2026 人才盘点数据。"
        markdown_instruction = (
            "输出格式要求：只返回 Markdown 正文，不要返回 HTML，不要把内容放进代码块。"
            "请使用清晰的一级到三级标题、短段落、项目符号和必要的表格。"
        )
        system = f"{system}\n{markdown_instruction}"
        user_instruction = f"{user_instruction}\n\n{markdown_instruction}"
        return [
            {"role": "system", "content": system},
            {"role": "system", "content": f"人才盘点与档案数据：\n{context_text}"},
            {"role": "system", "content": f"导入的 skill 和分析材料：\n{assets_text}"},
            {"role": "user", "content": user_instruction},
        ]

    def _build_design_prompt(self, poster_type, style, size, requirement):
        config = self.store.design_prompt_config()
        reference_files = [item.get("name", "") for item in config.get("referenceFiles", []) if item.get("name")]
        reference_summary = "无" if not reference_files else "；".join(reference_files[:12])
        prompt = config.get("template", DEFAULT_DESIGN_PROMPT_CONFIG["template"])
        values = {
            "basePrompt": config.get("basePrompt", ""),
            "brandRequirements": config.get("brandRequirements", ""),
            "customRequirements": config.get("customRequirements", "") or "无额外固定限定。",
            "referenceInstructions": config.get("referenceInstructions", ""),
            "referenceSummary": reference_summary,
            "posterType": poster_type,
            "style": style,
            "size": size,
            "requirement": requirement,
        }
        try:
            return prompt.format(**values)
        except (KeyError, ValueError):
            return "\n".join(
                [
                    values["basePrompt"],
                    values["brandRequirements"],
                    values["customRequirements"],
                    values["referenceInstructions"],
                    f"可用参考素材：{values['referenceSummary']}",
                    f"海报类型：{poster_type}",
                    f"风格：{style}",
                    f"尺寸：{size}",
                    f"需求：{requirement}",
                ]
            )

    def do_GET(self):
        if not self._allow_request():
            return
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if path == "/api/people":
            self._send_json({"people": self.store.people()})
            return
        if path == "/api/review-results":
            self._send_json({"results": self.store.review_results()})
            return
        if path == "/api/profiles":
            self._send_json({"profiles": self.store.profiles()})
            return
        if path == "/api/overrides":
            self._send_json(self.store.overrides())
            return
        if path == "/api/ai/config":
            self._send_json(self.store.ai_config_status())
            return
        if path == "/api/server/status":
            self._send_json(server_status_payload())
            return
        if path == "/api/home-memos":
            self._send_json(self.store.home_memos())
            return
        if path == "/api/intelligence":
            self._send_json(self.store.intelligence(query))
            return
        if path == "/api/intelligence/config":
            self._send_json({"config": self.store.intelligence_config(), "status": self.store.intelligence_update_status()})
            return
        if path == "/api/design/posters":
            self._send_json(self.store.design_posters())
            return
        if path == "/api/design/prompt-config":
            self._send_json(self.store.design_prompt_config())
            return
        if path == "/api/agent-projects":
            self._send_json(self.store.agent_projects())
            return
        if path == "/api/ai/context":
            self._send_json(self.store.analysis_context())
            return
        if path == "/api/talent-pools":
            self._send_json(self.store.talent_pools())
            return
        if path == "/api/report/assets":
            self._send_json(self.store.report_assets())
            return
        if path == "/api/report/presets":
            self._send_json({"presets": self.store.report_presets()})
            return
        if path == "/api/report/list":
            self._send_json({"reports": self.store.generated_report_list()})
            return
        if path == "/api/import/sources":
            self._send_json(self.store.import_sources())
            return
        if path == "/api/report/latest":
            if query.get("list"):
                self._send_json({"reports": self.store.generated_report_list()})
                return
            self._send_json(self.store.generated_report((query.get("id") or [None])[0]))
            return
        if path == "/api/export/calibrated-excel":
            try:
                output_path = self.store.export_calibrated_excel()
                self._send_file(output_path, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            except FileNotFoundError as error:
                self._send_json({"error": str(error)}, status=404)
            return
        if path == "/api/export/calibration-differences":
            try:
                output_path = self.store.export_calibration_differences()
                self._send_file(output_path, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            except FileNotFoundError as error:
                self._send_json({"error": str(error)}, status=404)
            return
        super().do_GET()

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path == "/api/report":
            payload = self._read_request_json()
            if payload is None:
                self._send_json({"error": "Invalid JSON"}, status=400)
                return
            try:
                self._send_json(self.store.delete_generated_report(payload.get("id", "")))
            except FileNotFoundError as error:
                self._send_json({"error": str(error)}, status=404)
            except ValueError as error:
                self._send_json({"error": str(error)}, status=400)
            return
        if path == "/api/import/file":
            payload = self._read_request_json()
            if payload is None:
                self._send_json({"error": "Invalid JSON"}, status=400)
                return
            try:
                self._send_json(self.store.delete_imported_file(payload.get("type", ""), payload.get("filename", "")))
            except FileNotFoundError as error:
                self._send_json({"error": str(error)}, status=404)
            except ValueError as error:
                self._send_json({"error": str(error)}, status=400)
            return
        self._send_json({"error": "Not found"}, status=404)

    def do_POST(self):
        if not self._allow_request():
            return
        path = urlparse(self.path).path
        if path == "/api/import/review-excel":
            filename, content = self._read_multipart_file()
            if not content:
                self._send_json({"error": "请上传人才盘点 Excel 文件。"}, status=400)
                return
            temp_dir = self.store.data_dir / "uploads"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_path = temp_dir / (Path(filename).name or "review.xlsx")
            temp_path.write_bytes(content)
            try:
                self._send_json(self.store.import_review_excel(temp_path, filename))
            except Exception as error:
                self._send_json({"error": str(error)}, status=400)
            return
        if path == "/api/import/profiles-json":
            filename, content = self._read_multipart_file()
            if not content:
                self._send_json({"error": "请上传人才档案 JSON 文件。"}, status=400)
                return
            try:
                data = json.loads(content.decode("utf-8-sig"))
                self._send_json(self.store.import_profiles_json(data, filename))
            except Exception as error:
                self._send_json({"error": str(error)}, status=400)
            return
        if path == "/api/import/employee-roster-excel":
            files = self._read_multipart_files()
            if not files:
                self._send_json({"error": "请上传员工花名册 Excel 文件。"}, status=400)
                return
            temp_dir = self.store.data_dir / "uploads"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_files = []
            try:
                for index, (filename, content) in enumerate(files, start=1):
                    if not content:
                        continue
                    temp_path = temp_dir / (Path(filename).name or f"employee_roster_{index}.xlsx")
                    temp_path.write_bytes(content)
                    temp_files.append((temp_path, filename))
                self._send_json(self.store.import_employee_roster_excels(temp_files))
            except Exception as error:
                self._send_json({"error": str(error)}, status=400)
            return
        if path in {"/api/report/upload-skill", "/api/report/upload-material"}:
            filename, content = self._read_multipart_file()
            if not content:
                self._send_json({"error": "请先选择要上传的文件。"}, status=400)
                return
            kind = "skill" if path.endswith("upload-skill") else "material"
            try:
                self._send_json(self.store.import_report_asset(kind, filename, content))
            except Exception as error:
                self._send_json({"error": str(error)}, status=400)
            return
        if path == "/api/agent-projects/upload":
            filename, content = self._read_multipart_file()
            if not content:
                self._send_json({"error": "请上传独立 Web 项目 zip。"}, status=400)
                return
            try:
                self._send_json(self.store.import_agent_project_zip(filename, content))
            except Exception as error:
                self._send_json({"error": str(error)}, status=400)
            return
        payload = self._read_request_json()
        if payload is None:
            self._send_json({"error": "Invalid JSON"}, status=400)
            return
        if path == "/api/overrides":
            changes = payload.get("changes", [])
            self._send_json(self.store.save_overrides(changes))
            return
        if path == "/api/ai/config":
            self._send_json(self.store.save_ai_config(payload))
            return
        if path == "/api/server/restart":
            status = server_status_payload()
            self._send_json({**status, "restarting": True, "message": "服务器正在重启，请稍候刷新状态。"})
            schedule_server_restart()
            return
        if path == "/api/home-memos":
            self._send_json(self.store.save_home_memo(payload.get("date", ""), payload.get("text", "")))
            return
        if path == "/api/home-memos/delete":
            self._send_json(self.store.delete_home_memo(payload.get("date", "")))
            return
        if path == "/api/home-memos/migrate":
            self._send_json(self.store.save_home_memos(payload.get("records", [])))
            return
        if path == "/api/intelligence/config":
            self._send_json({"config": self.store.save_intelligence_config(payload), "status": self.store.intelligence_update_status()})
            return
        if path == "/api/design/prompt-config":
            self._send_json(self.store.save_design_prompt_config(payload))
            return
        if path == "/api/agent-projects/delete":
            try:
                self._send_json(self.store.delete_agent_project(payload.get("id", "")))
            except FileNotFoundError as error:
                self._send_json({"error": str(error)}, status=404)
            except ValueError as error:
                self._send_json({"error": str(error)}, status=400)
            except Exception as error:
                self._send_json({"error": str(error)}, status=500)
            return
        if path == "/api/agent-projects/open":
            try:
                self._send_json(self.store.open_agent_project(payload.get("id", "")))
            except FileNotFoundError as error:
                self._send_json({"error": str(error)}, status=404)
            except ValueError as error:
                self._send_json({"error": str(error)}, status=400)
            except Exception as error:
                self._send_json({"error": str(error)}, status=500)
            return
        if path == "/api/intelligence/update":
            self._send_json(self.store.update_intelligence_now(trigger="manual", target_date=(payload.get("date") or "").strip() or None))
            return
        if path == "/api/talent-pools":
            self._send_json(self.store.save_talent_pools(payload.get("pools", [])))
            return
        if path == "/api/ai/chat":
            question = (payload.get("message") or "").strip()
            if not question:
                self._send_json({"error": "请输入问题。"}, status=400)
                return
            messages = self._build_ai_messages(question, payload.get("history", []))
            self._send_json(self._call_ai_model(messages))
            return
        if path == "/api/ai/image/test":
            prompt = (payload.get("prompt") or "HRobot orange simple poster test").strip()
            result = self._call_image_model(prompt, payload.get("size") or "1024x1024")
            self._send_json(
                {
                    "ok": not bool(result.get("error")) and result.get("configured") is not False,
                    "configured": result.get("configured", True),
                    "model": result.get("model", self.store.ai_config()["image"].get("model", "")),
                    "message": result.get("message", ""),
                    "error": result.get("error", ""),
                    "hasImage": bool(result.get("b64_json") or result.get("imageBytes")),
                },
                status=502 if result.get("error") else 200,
            )
            return
        if path == "/api/design/posters/generate":
            requirement = (payload.get("prompt") or payload.get("requirement") or "").strip()
            if not requirement:
                self._send_json({"error": "请先填写海报需求描述。"}, status=400)
                return
            poster_type = (payload.get("posterType") or "custom").strip()
            style = (payload.get("style") or "modern").strip()
            size = (payload.get("size") or "1024x1024").strip()
            prompt = self._build_design_prompt(poster_type, style, size, requirement)
            result = self._call_image_model(prompt, size)
            if result.get("configured") is False:
                self._send_json(result, status=503)
                return
            if result.get("error"):
                self._send_json(result, status=502)
                return
            try:
                saved = self.store.save_design_poster(
                    {
                        "posterType": poster_type,
                        "style": style,
                        "size": size,
                        "prompt": requirement,
                        "model": result.get("model", self.store.ai_config()["image"].get("model", "")),
                        "b64_json": result.get("b64_json"),
                        "imageBytes": result.get("imageBytes"),
                    }
                )
            except Exception as error:
                self._send_json({"error": f"海报保存失败: {error}"}, status=500)
                return
            self._send_json({"ok": True, "poster": saved})
            return
        if path == "/api/report/generate":
            instruction = (payload.get("instruction") or "").strip()
            department = (payload.get("department") or "").strip() or None
            report_type = (payload.get("reportType") or "talent-review").strip()
            if report_type not in REPORT_PRESETS:
                report_type = "talent-review"
            import traceback as tb
            try:
                msgs = self._build_report_messages(instruction, department=department, report_type=report_type)
                result = self._call_ai_model(msgs)
                if result.get("message"):
                    message = result["message"]
                    if self.store._report_content_format(message) == "html":
                        message = self.store._html_to_markdown_text(message)
                        result["message"] = message
                    result["report"] = self.store.save_generated_report(message, instruction, report_type)
                self._send_json(result)
            except Exception as ex:
                self._send_json({"error": f"报告生成异常: {type(ex).__name__}: {str(ex)}", "detail": tb.format_exc()}, status=500)
            return
        if path == "/api/report/html":
            try:
                self._send_json({"report": self.store.generate_report_html(payload.get("id", ""))})
            except FileNotFoundError as error:
                self._send_json({"error": str(error)}, status=404)
            except ValueError as error:
                self._send_json({"error": str(error)}, status=400)
            return
        self._send_json({"error": "Not found"}, status=404)


def start_intelligence_scheduler(store: DataStore):
    def loop():
        while True:
            try:
                config = store.intelligence_config()
                now = datetime.now(LOCAL_TZ)
                run_at = config.get("runAt", "10:00")
                status = store.intelligence_update_status()
                if (
                    config.get("autoEnabled")
                    and now.strftime("%H:%M") == run_at
                    and status.get("lastAutoDate") != now.date().isoformat()
                    and not status.get("running")
                ):
                    store.update_intelligence_now(trigger="auto")
            except Exception as error:
                status = store.intelligence_update_status()
                status.update(
                    {
                        "running": False,
                        "lastFinishedAt": datetime.now(LOCAL_TZ).isoformat(timespec="seconds"),
                        "lastTrigger": "auto",
                        "ok": False,
                        "message": f"自动更新调度异常：{error}",
                    }
                )
                store._save_intelligence_update_status(status)
            time.sleep(30)

    thread = threading.Thread(target=loop, name="intelligence-scheduler", daemon=True)
    thread.start()
    return thread


def main():
    global SERVER_HOST, SERVER_PORT, SERVER_ALLOW_REMOTE_CLIENTS
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8767, type=int)
    parser.add_argument("--allow-remote-clients", action="store_true", help="Allow non-local clients. Use only on a trusted network.")
    args = parser.parse_args()
    SERVER_HOST = args.host
    SERVER_PORT = args.port
    SERVER_ALLOW_REMOTE_CLIENTS = args.allow_remote_clients
    Handler.allow_remote_clients = args.allow_remote_clients
    start_intelligence_scheduler(Handler.store)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Talent nine-box app running at http://{args.host}:{args.port}/index.html")
    if args.host not in {"127.0.0.1", "localhost", "::1"} and not args.allow_remote_clients:
        print("Remote clients are blocked by default. Add --allow-remote-clients only on a trusted network.")
    server.serve_forever()


if __name__ == "__main__":
    main()
