#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Split a full talent-profile snapshot by HRBP organization scopes."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = PROJECT_ROOT / "data" / "permissions" / "hrbp_permissions.json"
DEFAULT_PROFILE_DIR = PROJECT_ROOT / "data" / "talent_profiles"
DEFAULT_OUTPUT_ROOT = PROJECT_ROOT / "data" / "hrbp_profile_splits"


DEPARTMENT_FIELDS = (
    "departmentPathRaw",
    "departmentPath",
    "department",
    "组织全称",
    "所在部门",
)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def normalize_path(value: Any) -> str:
    text = str(value or "").strip()
    text = text.replace("\\", "/").replace(">", "/").replace("／", "/")
    text = re.sub(r"\s*/\s*", "/", text)
    text = re.sub(r"/+", "/", text)
    return text.strip("/")


def strip_default_root(path: str, default_root: str) -> str:
    normalized = normalize_path(path)
    root = normalize_path(default_root)
    if root and normalized == root:
        return ""
    if root and normalized.startswith(root + "/"):
        return normalized[len(root) + 1 :]
    return normalized


def scope_variants(path: str, default_root: str) -> set[str]:
    normalized = normalize_path(path)
    relative = strip_default_root(normalized, default_root)
    root = normalize_path(default_root)
    variants = {normalized, relative}
    if relative and root:
        variants.add(f"{root}/{relative}")
    return {item for item in variants if item}


def path_matches_scope(department_path: str, scope_path: str, default_root: str) -> bool:
    dept_variants = scope_variants(department_path, default_root)
    scope_items = scope_variants(scope_path, default_root)
    for dept in dept_variants:
        for scope in scope_items:
            if dept == scope or dept.startswith(scope + "/"):
                return True
    return False


def profile_department_path(profile: dict[str, Any]) -> str:
    for field in DEPARTMENT_FIELDS:
        value = profile.get(field)
        if value:
            return normalize_path(value)
    levels = [
        profile.get("一级组织"),
        profile.get("二级组织"),
        profile.get("三级组织"),
        profile.get("四级组织"),
        profile.get("五级组织"),
    ]
    return normalize_path("/".join(str(item) for item in levels if item))


def profile_key(profile: dict[str, Any]) -> str:
    for field in ("employeeId", "员工工号", "workId", "id"):
        if profile.get(field):
            return str(profile[field])
    return f"{profile.get('name') or profile.get('姓名') or ''}|{profile_department_path(profile)}"


def extract_profiles(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        profiles = payload
    elif isinstance(payload, dict):
        for key in ("profiles", "data", "items", "records"):
            if isinstance(payload.get(key), list):
                profiles = payload[key]
                break
        else:
            raise ValueError("人才档案 JSON 必须是数组，或包含 profiles/data/items/records 数组。")
    else:
        raise ValueError("人才档案 JSON 必须是数组或对象。")
    return [item for item in profiles if isinstance(item, dict)]


def latest_profile_file() -> Path | None:
    candidates = sorted(
        DEFAULT_PROFILE_DIR.glob("*.json"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    if candidates:
        return candidates[0]
    fallback = PROJECT_ROOT / "data" / "people_profiles_hrobot_latest.json"
    return fallback if fallback.exists() else None


def safe_file_name(name: str) -> str:
    clean = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip()
    return clean or "未命名HRBP"


def split_profiles(source: Path, config: Path, output_root: Path, run_name: str | None) -> dict[str, Any]:
    config_payload = read_json(config)
    default_root = config_payload.get("defaultRoot", "")
    hrbps = config_payload.get("hrbps", [])
    profiles = extract_profiles(read_json(source))
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = output_root / (run_name or f"snapshot_{timestamp}")
    output_dir.mkdir(parents=True, exist_ok=True)

    summary_rows = []
    for hrbp in hrbps:
        name = str(hrbp.get("name") or "").strip()
        orgs = [normalize_path(item) for item in hrbp.get("organizations", []) if item]
        matched: list[dict[str, Any]] = []
        seen: set[str] = set()
        for profile in profiles:
            dept = profile_department_path(profile)
            if not dept:
                continue
            if any(path_matches_scope(dept, org, default_root) for org in orgs):
                key = profile_key(profile)
                if key not in seen:
                    matched.append(profile)
                    seen.add(key)
        payload = {
            "metadata": {
                "generatedAt": datetime.now().isoformat(timespec="seconds"),
                "sourceFile": str(source),
                "hrbp": name,
                "defaultRoot": default_root,
                "organizations": orgs,
                "profileCount": len(matched),
                "matchRule": "人员组织路径等于配置组织，或位于该组织以下任一子组织。",
            },
            "profiles": matched,
        }
        output_file = output_dir / f"{safe_file_name(name)}.json"
        write_json(output_file, payload)
        summary_rows.append(
            {
                "hrbp": name,
                "profileCount": len(matched),
                "organizations": orgs,
                "file": str(output_file),
            }
        )

    summary = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sourceFile": str(source),
        "sourceProfileCount": len(profiles),
        "outputDir": str(output_dir),
        "hrbps": summary_rows,
    }
    write_json(output_dir / "_summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="按 HRBP 权限配置拆分人才档案 JSON。")
    parser.add_argument("--source", type=Path, help="完整人才档案 JSON。默认读取 data/talent_profiles 下最新 JSON。")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="HRBP 权限配置 JSON。")
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT, help="拆分结果输出根目录。")
    parser.add_argument("--run-name", help="本次输出文件夹名，默认 snapshot_YYYYMMDD_HHMMSS。")
    args = parser.parse_args()

    source = args.source or latest_profile_file()
    if not source:
        raise SystemExit("未找到人才档案 JSON，请先通过数据导入或 --source 指定完整快照。")
    summary = split_profiles(source.resolve(), args.config.resolve(), args.output_root.resolve(), args.run_name)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
