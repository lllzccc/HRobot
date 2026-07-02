from __future__ import annotations

from collections import OrderedDict
from datetime import datetime, timezone

from .identity import first_text, normalize_department, record_identity


class PeopleDataService:
    """Canonical employee-centered data layer shared by HR workflows."""

    def __init__(self, store):
        self.store = store

    def _new_record(self, identity):
        return {
            "id": identity["key"],
            "employeeId": identity["employeeId"],
            "name": identity["name"],
            "departmentPath": identity["departmentPath"],
            "current": {},
            "projects": {},
            "derived": {"talentPools": [], "notes": []},
            "sources": [],
        }

    @staticmethod
    def _merge_identity(target, identity):
        for field in ("employeeId", "name", "departmentPath"):
            if not target.get(field) and identity.get(field):
                target[field] = identity[field]

    @staticmethod
    def _department_matches(record, department):
        if not department:
            return True
        needle = normalize_department(department).lower()
        haystack = normalize_department(record.get("departmentPath")).lower()
        return bool(needle and (needle in haystack or haystack in needle))

    @staticmethod
    def _current_profile(profile):
        return {
            "employeeId": first_text(profile.get("employeeId")),
            "name": first_text(profile.get("name"), profile.get("姓名")),
            "departmentPath": normalize_department(first_text(profile.get("departmentPath"), profile.get("departmentPathRaw"), profile.get("组织全称"))),
            "title": first_text(profile.get("title"), profile.get("positionName"), profile.get("职位")),
            "level": first_text(profile.get("level"), profile.get("职级")),
            "sequence": first_text(profile.get("sequence"), profile.get("序列")),
            "manager": first_text(profile.get("manager"), profile.get("直属上级")),
            "status": first_text(profile.get("status"), profile.get("员工状态")),
            "hireDate": first_text(profile.get("hireDate"), profile.get("入职日期")),
            "profileTags": profile.get("profileTags") or [],
        }

    @staticmethod
    def _talent_review_project(person):
        profile = person.get("profile") if isinstance(person.get("profile"), dict) else {}
        return {
            "employeeId": first_text(person.get("employeeId")),
            "name": first_text(person.get("name"), profile.get("name")),
            "departmentPath": normalize_department(first_text(person.get("departmentPath"), profile.get("departmentPath"))),
            "gridOriginal": person.get("gridOriginal"),
            "gridCurrent": person.get("gridCurrent"),
            "performanceLatest": first_text(person.get("performanceLatest"), person.get("performanceBand")),
            "potentialBand": first_text(person.get("potentialBand")),
            "aiTalentTag": first_text(person.get("aiTalentTag"), person.get("aiAbilityCalibrated")),
            "noGrowthWarning": first_text(person.get("noGrowthWarning"), person.get("noGrowthWarningCalibrated")),
            "incentives": first_text(person.get("incentives")),
            "developmentAdvice": first_text(person.get("developmentAdvice")),
            "managerComment2025": first_text(person.get("managerComment2025"), person.get("annualPerformanceReview")),
            "hasCalibrationAdjustment": bool(person.get("adjustment")),
            "hasSupervisorAdjustment": bool(person.get("hasSupervisorAdjustment")),
        }

    def _talent_pool_index(self):
        index = {}
        payload = self.store.talent_pools()
        pools = payload.get("pools", []) if isinstance(payload, dict) else payload
        for pool in pools or []:
            if not isinstance(pool, dict):
                continue
            name = first_text(pool.get("name"))
            if not name:
                continue
            for member in pool.get("members", []):
                member_name = first_text(member)
                if member_name:
                    index.setdefault(member_name, []).append(name)
        return index

    def _profile_notes_index(self):
        notes = self.store.profile_notes().get("notes", {})
        if not isinstance(notes, dict):
            return {}
        return notes

    def canonical_people(self, department=None):
        records = OrderedDict()

        def ensure(identity):
            key = identity["key"]
            if not key:
                return None
            if key not in records:
                records[key] = self._new_record(identity)
            self._merge_identity(records[key], identity)
            return records[key]

        for profile in self.store.profiles():
            if not isinstance(profile, dict):
                continue
            identity = record_identity(profile)
            record = ensure(identity)
            if not record:
                continue
            current = self._current_profile(profile)
            record["current"] = {key: value for key, value in current.items() if value not in ("", [], {})}
            record["sources"].append({"type": "current_profile", "name": "HRobot MCP/profile snapshot"})

        for person in self.store.people():
            if not isinstance(person, dict):
                continue
            identity = record_identity(person)
            record = ensure(identity)
            if not record:
                continue
            project = self._talent_review_project(person)
            record["projects"]["talentReview"] = {key: value for key, value in project.items() if value not in ("", None, [], {})}
            record["sources"].append({"type": "project_record", "name": "talent_review"})
            if not record.get("departmentPath") and project.get("departmentPath"):
                record["departmentPath"] = project["departmentPath"]

        pool_index = self._talent_pool_index()
        notes_index = self._profile_notes_index()
        for record in records.values():
            if record.get("name") in pool_index:
                record["derived"]["talentPools"] = pool_index[record["name"]]
            note_key = record.get("employeeId") or record.get("name")
            if note_key and note_key in notes_index:
                record["derived"]["notes"] = [notes_index[note_key]]

        return [record for record in records.values() if self._department_matches(record, department)]

    def analysis_context(self, department=None, limit=300):
        records = self.canonical_people(department=department)
        visible_records = records[:limit]
        permission_dir = getattr(self.store, "permission_dir", None)
        split_dir = getattr(self.store, "hrbp_profile_split_dir", None)
        return {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "model": "employee-centered-v1",
            "filteredDepartment": department or "（全部）",
            "totalPeople": len(records),
            "truncated": len(records) > len(visible_records),
            "dataSources": {
                "currentProfiles": {
                    "kind": "daily_snapshot",
                    "description": "HRobot MCP 或导入的人才档案快照，代表员工当前状态。",
                },
                "talentReview": {
                    "kind": "project_snapshot",
                    "description": "线下人才盘点项目表，代表某次/某年度盘点节点数据。",
                },
                "permissions": {
                    "kind": "access_scope",
                    "configured": bool(permission_dir and permission_dir.exists()),
                    "profileSplitConfigured": bool(split_dir and split_dir.exists()),
                },
            },
            "people": visible_records,
        }
