from __future__ import annotations

import re


def clean_text(value) -> str:
    return str(value or "").strip()


def normalize_employee_id(value) -> str:
    text = clean_text(value)
    if re.fullmatch(r"\d+\.0", text):
        return text[:-2]
    return text


def normalize_department(value) -> str:
    text = clean_text(value)
    text = text.replace(" > ", "/").replace(">", "/")
    text = re.sub(r"/+", "/", text)
    return text.strip("/")


def first_text(*values) -> str:
    for value in values:
        text = clean_text(value)
        if text and text.lower() not in {"n/a", "none", "null", "-"}:
            return text
    return ""


def record_identity(record: dict) -> dict:
    profile = record.get("profile") if isinstance(record.get("profile"), dict) else {}
    employee_id = normalize_employee_id(
        first_text(
            record.get("employeeId"),
            record.get("员工ID"),
            record.get("工号"),
            profile.get("employeeId"),
        )
    )
    name = first_text(record.get("name"), record.get("姓名"), profile.get("name"), profile.get("姓名"))
    department = normalize_department(
        first_text(
            record.get("departmentPath"),
            record.get("组织全称"),
            record.get("department"),
            profile.get("departmentPath"),
            profile.get("departmentPathRaw"),
            profile.get("组织全称"),
            profile.get("department"),
        )
    )
    key = employee_id or "|".join(part for part in (name, department) if part)
    return {"key": key, "employeeId": employee_id, "name": name, "departmentPath": department}
