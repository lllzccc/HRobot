from __future__ import annotations

import contextlib
import html as html_lib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from zipfile import ZipFile

PROJECT_ROOT = (
    Path(sys.executable).resolve().parent
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parents[3]
)

DEFAULT_AGENT_PROJECT_CENTER = {
    "updatedAt": "",
    "projects": [],
}

AGENT_RUNTIME_LABELS = {
    "static-web": "静态页面",
    "python-server": "Python 服务",
    "windows-server": "Windows 内置服务",
    "node-vite": "Vite 前端服务",
    "node-next": "Next.js 服务",
    "node-server": "Node 服务",
    "unknown": "待确认结构",
}

AGENT_RUNTIME_VALUES = set(AGENT_RUNTIME_LABELS)


class AgentCenterStoreMixin:
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

    @staticmethod
    def _agent_file_text(path: Path, limit=16000):
        try:
            return path.read_text(encoding="utf-8", errors="ignore")[:limit]
        except OSError:
            return ""

    @staticmethod
    def _agent_json_file(path: Path):
        try:
            return json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception:
            return {}

    def _agent_package_files(self, project_dir: Path):
        ignored_parts = {"node_modules", ".git", "__pycache__", "dist", "build", ".next"}
        return sorted(
            (
                path
                for path in project_dir.rglob("package.json")
                if path.is_file() and not any(part in ignored_parts for part in path.relative_to(project_dir).parts)
            ),
            key=lambda item: (len(item.relative_to(project_dir).parts), str(item).lower()),
        )

    def _agent_nearest_package(self, project_dir: Path, entry: Path | None):
        packages = self._agent_package_files(project_dir)
        if not packages:
            return None, {}
        if entry:
            entry_parent = entry.parent.resolve()
            scoped = []
            for package_path in packages:
                package_dir = package_path.parent.resolve()
                if package_dir in [entry_parent, *entry_parent.parents] or package_dir == project_dir.resolve():
                    scoped.append(package_path)
            if scoped:
                packages = scoped
        package_path = packages[0]
        data = self._agent_json_file(package_path)
        return package_path, data if isinstance(data, dict) else {}

    def _find_project_windows_server(self, project_dir: Path):
        candidates = []
        likely_names = {"talent-ninebox-server.exe", "server.exe", "app.exe"}
        for path in project_dir.rglob("*.exe"):
            if not path.is_file():
                continue
            rel_parts = {part.lower() for part in path.relative_to(project_dir).parts}
            score = 0
            if path.name.lower() in likely_names:
                score += 20
            if "server" in rel_parts:
                score += 10
            if "setup" in path.name.lower() or "install" in path.name.lower():
                score -= 20
            candidates.append((score, len(path.relative_to(project_dir).parts), str(path).lower(), path))
        candidates = [item for item in candidates if item[0] >= 10]
        if not candidates:
            return None
        return sorted(candidates, key=lambda item: (-item[0], item[1], item[2]))[0][3]

    def _agent_preferred_port(self, project_dir: Path):
        candidates = []
        for name in ("Start.bat", "start.bat", "run_server.bat", "README.txt", "README.md"):
            candidates.extend(path for path in project_dir.rglob(name) if path.is_file())
        for path in sorted(candidates, key=lambda item: (len(item.relative_to(project_dir).parts), str(item).lower())):
            text = self._agent_file_text(path, limit=12000)
            match = re.search(r"\b(?:PORT\s*=\s*|port\s+)(87\d{2}|88\d{2}|89\d{2})\b", text, flags=re.IGNORECASE)
            if match:
                return int(match.group(1))
            match = re.search(r"127\.0\.0\.1:(87\d{2}|88\d{2}|89\d{2})", text)
            if match:
                return int(match.group(1))
        return None

    @staticmethod
    def _agent_package_has_dependency(package, name):
        for group in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
            deps = package.get(group, {})
            if isinstance(deps, dict) and name in deps:
                return True
        return False

    def _agent_tree_summary(self, project_dir: Path, limit=180):
        ignored_dirs = {"node_modules", ".git", "__pycache__", ".next", ".venv", "venv"}
        rows = []
        for path in sorted(project_dir.rglob("*"), key=lambda item: str(item).lower()):
            rel_parts = path.relative_to(project_dir).parts
            if any(part in ignored_dirs for part in rel_parts):
                continue
            suffix = "/" if path.is_dir() else ""
            rows.append("/".join(rel_parts) + suffix)
            if len(rows) >= limit:
                break
        return rows

    def _agent_runtime_analysis(self, project_dir: Path, entry: Path | None, title="", description=""):
        windows_server_path = self._find_project_windows_server(project_dir)
        server_path = self._find_project_server(project_dir, entry)
        package_path, package = self._agent_nearest_package(project_dir, entry)
        scripts = package.get("scripts", {}) if isinstance(package.get("scripts", {}), dict) else {}
        package_dir = package_path.parent if package_path else None
        has_node_modules = bool(package_dir and (package_dir / "node_modules").exists())
        has_vite = bool(
            package_path
            and (
                self._agent_package_has_dependency(package, "vite")
                or (package_dir / "vite.config.js").exists()
                or (package_dir / "vite.config.ts").exists()
            )
        )
        has_next = bool(
            package_path
            and (
                self._agent_package_has_dependency(package, "next")
                or (package_dir / "next.config.js").exists()
                or (package_dir / "next.config.mjs").exists()
                or (package_dir / "next.config.ts").exists()
            )
        )
        server_rel = server_path.relative_to(project_dir).as_posix() if server_path else ""
        package_rel = package_dir.relative_to(project_dir).as_posix() if package_dir else ""
        entry_rel = entry.relative_to(project_dir).as_posix() if entry else ""
        analysis = {
            "source": "rules",
            "confidence": 0.72,
            "runtime": "static-web" if entry else "unknown",
            "runtimeLabel": AGENT_RUNTIME_LABELS["static-web" if entry else "unknown"],
            "entry": entry_rel,
            "serverEntry": server_rel,
            "startCwd": "",
            "startCommand": "",
            "requiresInstall": False,
            "detectedFrontend": "html" if entry else "",
            "detectedBackend": "",
            "flags": [],
            "summary": "",
        }
        if windows_server_path and os.name == "nt":
            server_rel = windows_server_path.relative_to(project_dir).as_posix()
            preferred_port = self._agent_preferred_port(project_dir)
            analysis.update(
                {
                    "confidence": 0.9,
                    "runtime": "windows-server",
                    "runtimeLabel": AGENT_RUNTIME_LABELS["windows-server"],
                    "serverEntry": server_rel,
                    "startCwd": windows_server_path.parent.relative_to(project_dir).as_posix(),
                    "startCommand": f"{windows_server_path.name} --host 127.0.0.1 --port {{port}}",
                    "requiresInstall": False,
                    "detectedFrontend": "html" if entry else "",
                    "detectedBackend": "windows-exe",
                    "preferredPort": preferred_port,
                    "summary": "规则扫描到内置 Windows 服务 exe，打开卡片时会按独立端口启动。",
                }
            )
            return analysis
        if server_path:
            analysis.update(
                {
                    "confidence": 0.88,
                    "runtime": "python-server",
                    "runtimeLabel": AGENT_RUNTIME_LABELS["python-server"],
                    "startCwd": server_path.parent.relative_to(project_dir).as_posix(),
                    "startCommand": f"python {server_path.name} --host 127.0.0.1 --port {{port}}",
                    "detectedBackend": "server.py",
                    "summary": "规则扫描到 Python server.py，打开卡片时会分配独立端口启动。",
                }
            )
            return analysis
        if has_next:
            analysis.update(
                {
                    "confidence": 0.84,
                    "runtime": "node-next",
                    "runtimeLabel": AGENT_RUNTIME_LABELS["node-next"],
                    "startCwd": package_rel,
                    "startCommand": "npm run dev -- -H 127.0.0.1 -p {port}",
                    "requiresInstall": not has_node_modules,
                    "detectedFrontend": "next",
                    "detectedBackend": "next",
                    "summary": "规则扫描到 Next.js 项目，依赖已安装时可按独立端口启动。",
                }
            )
            return analysis
        if has_vite:
            analysis.update(
                {
                    "confidence": 0.84,
                    "runtime": "node-vite",
                    "runtimeLabel": AGENT_RUNTIME_LABELS["node-vite"],
                    "startCwd": package_rel,
                    "startCommand": "npm run dev -- --host 127.0.0.1 --port {port}",
                    "requiresInstall": not has_node_modules,
                    "detectedFrontend": "vite",
                    "summary": "规则扫描到 Vite 项目，依赖已安装时可按独立端口启动。",
                }
            )
            return analysis
        if package_path and ("start" in scripts or "dev" in scripts):
            script_name = "start" if "start" in scripts else "dev"
            analysis.update(
                {
                    "confidence": 0.66,
                    "runtime": "node-server",
                    "runtimeLabel": AGENT_RUNTIME_LABELS["node-server"],
                    "startCwd": package_rel,
                    "startCommand": f"npm run {script_name}",
                    "requiresInstall": not has_node_modules,
                    "detectedFrontend": "node",
                    "detectedBackend": "node",
                    "flags": ["需要确认 npm 脚本是否读取 PORT/HOST 环境变量。"],
                    "summary": "规则扫描到 package.json 启动脚本，但端口注入方式需要确认。",
                }
            )
            return analysis
        if entry:
            analysis.update(
                {
                    "confidence": 0.78,
                    "runtime": "static-web",
                    "runtimeLabel": AGENT_RUNTIME_LABELS["static-web"],
                    "summary": "规则扫描到 HTML 入口，按静态 Web 卡片打开。",
                }
            )
            return analysis
        analysis["flags"].append("未找到明确的 HTML 或服务入口。")
        analysis["summary"] = "规则扫描未能确定可打开入口。"
        return analysis

    @staticmethod
    def _agent_analysis_needs_ai(analysis, force=False):
        if force:
            return True
        if not analysis:
            return True
        return (
            analysis.get("runtime") == "unknown"
            or float(analysis.get("confidence") or 0) < 0.74
            or bool(analysis.get("flags"))
        )

    @staticmethod
    def _extract_json_object(text):
        text = str(text or "").strip()
        if not text:
            return {}
        fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
        if fenced:
            text = fenced.group(1).strip()
        if not text.startswith("{"):
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                text = text[start : end + 1]
        try:
            value = json.loads(text)
            return value if isinstance(value, dict) else {}
        except json.JSONDecodeError:
            return {}

    def _agent_ai_messages(self, project_dir: Path, project, rule_analysis):
        snippets = {}
        interesting_names = {"package.json", "readme.md", "readme_使用说明.md", "使用说明.md", "requirements.txt", "pyproject.toml"}
        for path in sorted(project_dir.rglob("*"), key=lambda item: (len(item.relative_to(project_dir).parts), str(item).lower())):
            if not path.is_file() or path.name.lower() not in interesting_names:
                continue
            snippets[path.relative_to(project_dir).as_posix()] = self._agent_file_text(path, limit=5000)
            if len(snippets) >= 8:
                break
        prompt = {
            "project": {
                "name": project.get("name", ""),
                "entry": project.get("entry", ""),
                "ruleAnalysis": rule_analysis,
            },
            "tree": self._agent_tree_summary(project_dir),
            "snippets": snippets,
            "allowedRuntimes": sorted(AGENT_RUNTIME_VALUES),
        }
        return [
            {
                "role": "system",
                "content": (
                    "你是本地 Web 项目结构分析助手。只输出一个 JSON 对象，不要 Markdown。"
                    "判断项目的前端入口、后端/开发服务器类型、启动目录和是否需要安装依赖。"
                    "runtime 只能使用 allowedRuntimes 中的值。不要编造不存在的文件。"
                ),
            },
            {
                "role": "user",
                "content": (
                    "请分析这个 zip 解压后的 Web 项目结构，并输出字段："
                    "runtime, entry, serverEntry, startCwd, startCommand, requiresInstall, confidence, description, reason, flags。"
                    "startCommand 仅用于展示，不会直接执行。\n"
                    + json.dumps(prompt, ensure_ascii=False)
                ),
            },
        ]

    def _validated_agent_ai_analysis(self, project_dir: Path, ai_payload):
        if not isinstance(ai_payload, dict):
            return {}
        result = {}
        project_root = project_dir.resolve()
        runtime = str(ai_payload.get("runtime") or "").strip()
        if runtime in AGENT_RUNTIME_VALUES:
            result["runtime"] = runtime
            result["runtimeLabel"] = AGENT_RUNTIME_LABELS[runtime]
        for field in ("entry", "serverEntry", "startCwd"):
            raw = str(ai_payload.get(field) or "").strip().replace("\\", "/").strip("/")
            if not raw:
                continue
            path = (project_dir / raw).resolve()
            if project_root in [path, *path.parents] and (path.exists() if field != "startCwd" else path.is_dir()):
                result[field] = path.relative_to(project_root).as_posix()
        try:
            result["confidence"] = max(0, min(1, float(ai_payload.get("confidence"))))
        except (TypeError, ValueError):
            pass
        for field, limit in (("description", 120), ("reason", 180), ("startCommand", 160)):
            text = re.sub(r"\s+", " ", str(ai_payload.get(field) or "")).strip()
            if text:
                result[field] = text[:limit]
        flags = ai_payload.get("flags", [])
        if isinstance(flags, list):
            result["flags"] = [re.sub(r"\s+", " ", str(item)).strip()[:100] for item in flags if str(item).strip()][:4]
        if "requiresInstall" in ai_payload:
            result["requiresInstall"] = bool(ai_payload.get("requiresInstall"))
        return result

    def _agent_apply_ai_analysis(self, project, project_dir: Path, ai_analysis):
        analysis = dict(project.get("analysis") or {})
        ai_runtime = ai_analysis.get("runtime")
        if ai_runtime in AGENT_RUNTIME_VALUES:
            analysis["ai"] = ai_analysis
            analysis["source"] = "rules+ai"
            analysis["runtime"] = ai_runtime
            analysis["runtimeLabel"] = AGENT_RUNTIME_LABELS[ai_runtime]
            analysis["confidence"] = max(float(analysis.get("confidence") or 0), float(ai_analysis.get("confidence") or 0))
            for field in ("startCwd", "startCommand", "requiresInstall", "flags"):
                if field in ai_analysis:
                    analysis[field] = ai_analysis[field]
            if ai_analysis.get("reason"):
                analysis["summary"] = ai_analysis["reason"]
            project = {**project, "analysis": analysis, "runtime": ai_runtime}
        if ai_analysis.get("entry"):
            project = {**project, "entry": ai_analysis["entry"], "entryUrl": f"/data/agent_center/projects/{quote(project['id'])}/{self._url_path(ai_analysis['entry'])}"}
        if ai_analysis.get("serverEntry") and ai_runtime in {"python-server", "windows-server"}:
            project = {**project, "serverEntry": ai_analysis["serverEntry"]}
        description = ai_analysis.get("description")
        if description and (not project.get("description") or self._description_is_setup_text(project.get("description"))):
            project = {**project, "description": description}
        return project

    def _agent_enrich_with_ai(self, project, project_dir: Path, ai_provider=None, force_ai=False):
        if not ai_provider or not self._agent_analysis_needs_ai(project.get("analysis"), force=force_ai):
            return project
        messages = self._agent_ai_messages(project_dir, project, project.get("analysis") or {})
        result = ai_provider(messages)
        analysis = dict(project.get("analysis") or {})
        if result.get("configured") is False:
            analysis["aiStatus"] = result.get("message") or "AI 未配置。"
            return {**project, "analysis": analysis}
        if result.get("error"):
            analysis["aiStatus"] = result.get("error")
            return {**project, "analysis": analysis}
        ai_json = self._extract_json_object(result.get("message", ""))
        ai_analysis = self._validated_agent_ai_analysis(project_dir, ai_json)
        if not ai_analysis:
            analysis["aiStatus"] = "AI 未返回可用结构化判断。"
            return {**project, "analysis": analysis}
        ai_analysis["status"] = "ok"
        return self._agent_apply_ai_analysis(project, project_dir, ai_analysis)

    def _project_metadata(self, project_id, project_dir: Path, source_zip: Path, file_count=None, total_size=None, ai_provider=None):
        entry = self._find_project_entry(project_dir)
        entry_rel = entry.relative_to(project_dir).as_posix()
        title = self._html_title(entry) or source_zip.stem
        description = self._project_description(project_dir, title)
        analysis = self._agent_runtime_analysis(project_dir, entry, title, description)
        server_rel = analysis.get("serverEntry", "")
        if file_count is None or total_size is None:
            files = [path for path in project_dir.rglob("*") if path.is_file()]
            file_count = len(files)
            total_size = sum(path.stat().st_size for path in files)
        timestamp = self._agent_timestamp()
        project = {
            "id": project_id,
            "name": title,
            "description": description,
            "sourceZip": source_zip.name,
            "sourceZipMtime": source_zip.stat().st_mtime_ns if source_zip.exists() else 0,
            "entry": entry_rel,
            "entryUrl": f"/data/agent_center/projects/{quote(project_id)}/{self._url_path(entry_rel)}",
            "serverEntry": server_rel,
            "runtime": analysis.get("runtime", "static-web"),
            "analysis": analysis,
            "folderPath": str(project_dir),
            "fileCount": file_count,
            "size": total_size,
            "kind": "static-web",
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }
        return self._agent_enrich_with_ai(project, project_dir, ai_provider=ai_provider)

    def _import_agent_zip_path(self, zip_path: Path, ai_provider=None):
        if not zip_path.exists() or zip_path.suffix.lower() != ".zip":
            raise ValueError("请提供独立 Web 项目的 zip 文件。")
        project_id = f"{self._agent_slug(zip_path.stem)}-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4]}"
        project_dir = self.agent_project_dir / project_id
        if project_dir.exists():
            self._remove_agent_project_dir(project_dir)
        file_count, total_size = self._safe_extract_zip(zip_path, project_dir)
        return self._project_metadata(project_id, project_dir, zip_path, file_count=file_count, total_size=total_size, ai_provider=ai_provider)

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
        analysis = self._agent_runtime_analysis(project_dir, entry, project.get("name", ""), project.get("description", ""))
        server_rel = analysis.get("serverEntry", "")
        runtime = analysis.get("runtime", "unknown")
        title = str(project.get("name") or "")
        existing_description = str(project.get("description") or "").strip()
        description = self._project_description(project_dir, title) if self._description_is_setup_text(existing_description) else existing_description
        description = description or self._project_description(project_dir, title)
        old_analysis = project.get("analysis") if isinstance(project.get("analysis"), dict) else {}
        if old_analysis.get("source") == "rules+ai":
            analysis = {**analysis, **old_analysis, "serverEntry": server_rel or old_analysis.get("serverEntry", "")}
            runtime = old_analysis.get("runtime", runtime)
        if project.get("serverEntry") == server_rel and project.get("runtime") == runtime and project.get("description", "") == description and project.get("analysis") == analysis:
            return project, False
        return {**project, "description": description, "serverEntry": server_rel, "runtime": runtime, "analysis": analysis}, True

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
    def _find_free_local_port(preferred=None):
        if preferred:
            with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
                try:
                    sock.bind(("127.0.0.1", int(preferred)))
                    return int(preferred)
                except OSError:
                    pass
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

    @staticmethod
    def _portable_runtime_path(*parts):
        rel = Path(*parts)
        for base in (PROJECT_ROOT / "runtime", PROJECT_ROOT.parent / "runtime"):
            path = base / rel
            if path.exists():
                return str(path)
        return ""

    @classmethod
    def _agent_runtime_commands(cls):
        portable_python = cls._portable_runtime_path("python", "python.exe" if os.name == "nt" else "bin/python")
        portable_node = cls._portable_runtime_path("node", "node.exe" if os.name == "nt" else "bin/node")
        portable_npm = cls._portable_runtime_path("node", "npm.cmd" if os.name == "nt" else "bin/npm")
        return {
            "python": portable_python or (sys.executable if Path(sys.executable or "").exists() else ""),
            "node": portable_node or shutil.which("node") or "",
            "npm": portable_npm or shutil.which("npm.cmd" if os.name == "nt" else "npm") or shutil.which("npm") or "",
        }

    @classmethod
    def _agent_runtime_environment(cls, project):
        analysis = project.get("analysis") if isinstance(project.get("analysis"), dict) else {}
        runtime_name = (project.get("runtime") or analysis.get("runtime") or "unknown").strip()
        commands = cls._agent_runtime_commands()
        checks = []

        def add_check(name, ok, detail=""):
            checks.append({"name": name, "ok": bool(ok), "detail": str(detail or "")})

        if runtime_name == "static-web":
            add_check("浏览器", True, "静态 HTML 页面不需要 Python 或 Node.js。")
            return {
                "status": "ready",
                "canOpen": True,
                "label": "无需运行时",
                "message": "静态页面可直接打开。",
                "checks": checks,
            }

        if runtime_name == "unknown":
            add_check("项目结构", False, "还没有识别到可启动入口。")
            return {
                "status": "blocked",
                "canOpen": False,
                "label": "结构待确认",
                "message": "请先重新分析项目结构。",
                "checks": checks,
            }

        if runtime_name == "python-server":
            python_path = commands.get("python", "")
            add_check("Python", bool(python_path), python_path or "未找到 Python。")
            can_open = bool(python_path)
            return {
                "status": "ready" if can_open else "blocked",
                "canOpen": can_open,
                "label": "Python 可用" if can_open else "缺 Python",
                "message": "本机 Python 可启动该服务。" if can_open else "本机缺少 Python，无法启动该项目服务。",
                "checks": checks,
            }

        if runtime_name == "windows-server":
            server_entry = str(project.get("serverEntry") or analysis.get("serverEntry") or "")
            exe_path = Path(project.get("folderPath", "")) / server_entry if project.get("folderPath") else Path(server_entry)
            can_open = os.name == "nt" and bool(server_entry) and exe_path.exists()
            add_check("Windows", os.name == "nt", "内置 exe 仅支持 Windows。")
            add_check("服务程序", bool(server_entry) and exe_path.exists(), server_entry or "未找到服务程序。")
            return {
                "status": "ready" if can_open else "blocked",
                "canOpen": can_open,
                "label": "内置服务可用" if can_open else "服务不可用",
                "message": "该项目会使用自带服务程序在独立端口启动。" if can_open else "未找到可启动的内置服务程序。",
                "checks": checks,
            }

        if runtime_name.startswith("node-"):
            node_path = commands.get("node", "")
            npm_path = commands.get("npm", "")
            add_check("Node.js", bool(node_path), node_path or "未找到 node。")
            add_check("npm", bool(npm_path), npm_path or "未找到 npm。")
            if analysis.get("requiresInstall"):
                add_check("项目依赖", False, "未找到 node_modules，需要先安装项目依赖。")
            else:
                add_check("项目依赖", True, "已检测到 node_modules。")
            missing_runtime = not (node_path and npm_path)
            missing_install = bool(analysis.get("requiresInstall"))
            if missing_runtime:
                message = "本机缺少 Node.js/npm，无法启动该 Node 项目。"
                label = "缺 Node.js"
            elif missing_install:
                message = "本机有 Node.js，但该项目依赖尚未安装。"
                label = "依赖未安装"
            else:
                message = "本机 Node.js 和项目依赖可用。"
                label = "Node 可用"
            can_open = not missing_runtime and not missing_install
            return {
                "status": "ready" if can_open else "blocked",
                "canOpen": can_open,
                "label": label,
                "message": message,
                "checks": checks,
            }

        add_check("运行时", False, f"暂不支持 {runtime_name}。")
        return {
            "status": "blocked",
            "canOpen": False,
            "label": "暂不支持",
            "message": "暂不支持自动启动该项目类型。",
            "checks": checks,
        }

    def _agent_project_with_environment(self, project):
        return {**project, "environment": self._agent_runtime_environment(project)}

    def _agent_payload_with_environment(self, payload, project=None):
        projects = [self._agent_project_with_environment(item) for item in payload.get("projects", [])]
        result = {**payload, "projects": projects}
        if project:
            result["project"] = self._agent_project_with_environment(project)
        return result

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
        refreshed = self._agent_runtime_analysis(
            project_dir,
            project_dir / str(project.get("entry") or "") if project.get("entry") else None,
        )
        if (
            refreshed.get("runtime") != project.get("runtime")
            or refreshed.get("runtime") != project.get("kind")
            or refreshed.get("serverEntry", "") != project.get("serverEntry", "")
            or refreshed.get("preferredPort") != (project.get("analysis") or {}).get("preferredPort")
        ):
            manifest = self._agent_manifest()
            projects = []
            for item in manifest["projects"]:
                if item.get("id") == project_id:
                    updated_analysis = {**(item.get("analysis") or {}), **refreshed}
                    item = {
                        **item,
                        "runtime": refreshed.get("runtime", item.get("runtime", "static-web")),
                        "kind": refreshed.get("runtime", item.get("kind", item.get("runtime", "static-web"))),
                        "serverEntry": refreshed.get("serverEntry", item.get("serverEntry", "")),
                        "analysis": updated_analysis,
                        "updatedAt": self._agent_timestamp(),
                    }
                    project = item
                projects.append(item)
            self._save_agent_manifest(projects)
        runtime_name = (project.get("runtime") or "static-web").strip()
        if runtime_name == "static-web":
            return {"project": project, "url": project.get("entryUrl", ""), "runtime": "static-web", "port": None}
        if runtime_name == "unknown":
            raise ValueError("项目结构还未识别，请先重新分析结构。")

        analysis = project.get("analysis") if isinstance(project.get("analysis"), dict) else {}
        environment = self._agent_runtime_environment(project)
        if not environment.get("canOpen"):
            raise ValueError(environment.get("message") or "当前电脑缺少运行该项目的环境。")
        runtime_commands = self._agent_runtime_commands()

        with self._agent_process_lock:
            runtime = self._agent_processes.get(project_id)
            if runtime and runtime["process"].poll() is None:
                return {"project": project, "url": runtime["url"], "runtime": runtime_name, "port": runtime["port"]}

            preferred_port = analysis.get("preferredPort")
            port = self._find_free_local_port(preferred_port)
            entry_path = (project_dir / str(project.get("entry") or "index.html")).resolve()
            start_cwd = str(analysis.get("startCwd") or "").strip().replace("\\", "/").strip("/")
            server_root = (project_dir / start_cwd).resolve() if start_cwd else project_dir.resolve()
            if project_dir.resolve() not in [server_root, *server_root.parents] or not server_root.exists():
                raise FileNotFoundError("项目启动目录不存在。")
            entry_rel = ""
            if entry_path.exists() and server_root in [entry_path, *entry_path.parents]:
                entry_rel = entry_path.relative_to(server_root).as_posix()
            url_path = self._url_path(entry_rel) if runtime_name == "python-server" else ""
            url = f"http://127.0.0.1:{port}/{url_path}".rstrip("/")
            log_dir = self.agent_center_dir / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            log_file = (log_dir / f"{project_id}.log").open("a", encoding="utf-8")
            command = None
            if runtime_name == "python-server":
                server_entry = (project.get("serverEntry") or analysis.get("serverEntry") or "").strip()
                server_path = (project_dir / server_entry).resolve()
                if not server_path.exists() or project_dir.resolve() not in [server_path, *server_path.parents]:
                    raise FileNotFoundError("项目服务入口不存在。")
                command = [runtime_commands["python"], str(server_path), "--host", "127.0.0.1", "--port", str(port)]
                server_root = server_path.parent.resolve()
                if entry_path.exists() and server_root in [entry_path, *entry_path.parents]:
                    url = f"http://127.0.0.1:{port}/{self._url_path(entry_path.relative_to(server_root).as_posix())}"
            elif runtime_name == "windows-server":
                server_entry = (project.get("serverEntry") or analysis.get("serverEntry") or "").strip()
                server_path = (project_dir / server_entry).resolve()
                if not server_path.exists() or project_dir.resolve() not in [server_path, *server_path.parents]:
                    raise FileNotFoundError("项目服务程序不存在。")
                server_root = server_path.parent.resolve()
                command = [str(server_path), "--host", "127.0.0.1", "--port", str(port)]
                if entry_path.exists() and project_dir.resolve() in [entry_path, *entry_path.parents]:
                    url = f"http://127.0.0.1:{port}/{self._url_path(entry_path.relative_to(project_dir.resolve()).as_posix())}"
            elif runtime_name == "node-vite":
                command = [runtime_commands["npm"], "run", "dev", "--", "--host", "127.0.0.1", "--port", str(port)]
            elif runtime_name == "node-next":
                command = [runtime_commands["npm"], "run", "dev", "--", "-H", "127.0.0.1", "-p", str(port)]
            elif runtime_name == "node-server":
                command = [runtime_commands["npm"], "run", "start"]
            else:
                raise ValueError("暂不支持自动启动该项目类型。")
            kwargs = {
                "cwd": str(server_root),
                "stdout": log_file,
                "stderr": subprocess.STDOUT,
                "stdin": subprocess.DEVNULL,
                "env": {**os.environ, "HOST": "127.0.0.1", "PORT": str(port)},
            }
            if os.name == "nt":
                kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
            process = subprocess.Popen(command, **kwargs)
            self._agent_processes[project_id] = {"process": process, "port": port, "url": url, "log": log_file, "runtime": runtime_name}

        deadline = time.time() + 8
        while time.time() < deadline:
            if process.poll() is not None:
                raise RuntimeError(f"项目服务启动失败，日志：{log_dir / f'{project_id}.log'}")
            if self._agent_project_url_ready(url):
                break
            time.sleep(0.25)
        return {"project": project, "url": url, "runtime": runtime_name, "port": port}

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
            "projects": [self._agent_project_with_environment(project) for project in projects],
            "count": len(projects),
            "zipDropFolder": str(self.agent_zip_dir),
            "projectFolder": str(self.agent_project_dir),
        }

    def import_agent_project_zip(self, filename, content, ai_provider=None):
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
        project = self._import_agent_zip_path(zip_path, ai_provider=ai_provider)
        self._remove_agent_source_zip(project.get("sourceZip"))
        payload = self._save_agent_manifest([project, *manifest["projects"]])
        payload = {**payload, "project": project, "count": len(payload["projects"]), "zipDropFolder": str(self.agent_zip_dir), "projectFolder": str(self.agent_project_dir)}
        return self._agent_payload_with_environment(payload, project=project)

    def analyze_agent_project(self, project_id, ai_provider=None, force_ai=True):
        project, project_dir = self._agent_project_by_id(project_id)
        entry = None
        if project.get("entry"):
            entry_path = (project_dir / str(project.get("entry"))).resolve()
            if entry_path.exists() and project_dir.resolve() in [entry_path, *entry_path.parents]:
                entry = entry_path
        if not entry:
            with contextlib.suppress(Exception):
                entry = self._find_project_entry(project_dir)
        analysis = self._agent_runtime_analysis(project_dir, entry, project.get("name", ""), project.get("description", ""))
        updated = {
            **project,
            "runtime": analysis.get("runtime", project.get("runtime", "unknown")),
            "serverEntry": analysis.get("serverEntry", ""),
            "analysis": analysis,
            "updatedAt": self._agent_timestamp(),
        }
        updated = self._agent_enrich_with_ai(updated, project_dir, ai_provider=ai_provider, force_ai=force_ai)
        manifest = self._agent_manifest()
        projects = [updated if item.get("id") == project_id else item for item in manifest["projects"]]
        payload = self._save_agent_manifest(projects)
        payload = {**payload, "project": updated, "count": len(payload["projects"]), "zipDropFolder": str(self.agent_zip_dir), "projectFolder": str(self.agent_project_dir)}
        return self._agent_payload_with_environment(payload, project=updated)

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
        payload = {**payload, "count": len(payload["projects"]), "zipDropFolder": str(self.agent_zip_dir), "projectFolder": str(self.agent_project_dir)}
        return self._agent_payload_with_environment(payload)
