#!/usr/bin/env python3
"""Authenticated, non-destructive RBAC and tenant-isolation matrix for Nexus.

Uses active sessions directly from MongoDB only in memory. It never prints or
writes session tokens, cookies, passwords, email addresses, names, or user IDs.
Run from /app/backend with the backend virtual environment.
"""
from __future__ import annotations

import asyncio
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path("/app/backend")
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

API = "http://127.0.0.1:8001/api"
REPORT = Path("/app/test_reports/nexus_authenticated_rbac_matrix.json")
TIMEOUT = 12


def request(token: str, path: str, params: dict | None = None):
    url = API + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": "Bearer " + token,
            "User-Agent": "Nexus-Authenticated-RBAC-Matrix/1.0",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
            body = response.read().decode("utf-8")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                payload = None
            return response.status, payload, ""
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            payload = None
        return exc.code, payload, ""
    except Exception as exc:
        return 0, None, type(exc).__name__


def rows(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("items", "data", "results", "organizations", "services"):
            if isinstance(payload.get(key), list):
                return payload[key]
    return []


def tenant_values(payload):
    values = set()
    for item in rows(payload):
        if not isinstance(item, dict):
            continue
        value = item.get("organization_id") or item.get("org_id")
        if value:
            values.add(str(value))
    return values


async def main():
    import server

    db = server.db
    await db.command("ping")
    now = datetime.now(timezone.utc)

    users = {}
    cursor = db.users.find(
        {
            "role": {"$in": ["owner", "manager", "staff"]},
            "access_status": "approved",
            "$or": [{"active": {"$exists": False}}, {"active": {"$ne": False}}],
            "deleted_at": {"$exists": False},
        },
        {"_id": 0, "user_id": 1, "role": 1, "organization_id": 1},
    )
    async for user in cursor:
        users[user.get("user_id")] = user

    candidates = {}
    sessions = db.user_sessions.find(
        {"user_id": {"$in": list(users)}},
        {"_id": 0, "user_id": 1, "session_token": 1, "expires_at": 1},
    ).sort("expires_at", -1)
    async for session in sessions:
        expiry = session.get("expires_at")
        if isinstance(expiry, str):
            try:
                expiry = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            except ValueError:
                continue
        if not isinstance(expiry, datetime):
            continue
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry <= now:
            continue
        user = users.get(session.get("user_id"))
        if not user or not session.get("session_token"):
            continue
        candidates.setdefault(user.get("role"), (user, session.get("session_token")))

    org_docs = await db.organizations.find(
        {}, {"_id": 0, "organization_id": 1}
    ).to_list(length=1000)
    all_orgs = sorted(
        str(item["organization_id"])
        for item in org_docs
        if item.get("organization_id")
    )

    results = []

    def record(role, name, status, expected, passed, detail=""):
        item = {
            "role": role,
            "test": name,
            "status_code": status,
            "expected": expected,
            "result": "PASS" if passed else "FAIL",
        }
        if detail:
            item["detail"] = detail
        results.append(item)
        print(f"{role.upper()}_{name}={item['result']} ({status}; expected {expected})")

    required_roles = ("owner", "manager", "staff")
    missing_roles = [role for role in required_roles if role not in candidates]
    if missing_roles:
        print("MISSING_ACTIVE_ROLES=" + ",".join(missing_roles))

    # Identity continuity for every available role.
    for role in required_roles:
        candidate = candidates.get(role)
        if not candidate:
            record(role, "AUTH_ME", 0, "200", False, "no_active_session")
            continue
        user, token = candidate
        status, payload, error = request(token, "/auth/me")
        returned_role = payload.get("role") if isinstance(payload, dict) else None
        record(role, "AUTH_ME", status, "200", status == 200 and returned_role == role, error)

    # Owner: enumerate organizations, and prove requested service responses do not
    # contain a different tenant identifier. Test at least two organizations.
    if "owner" in candidates:
        _, token = candidates["owner"]
        status, payload, error = request(token, "/organizations")
        record("owner", "ORGANIZATIONS", status, "200", status == 200, error)
        owner_orgs = all_orgs[:3]
        for pos, org_id in enumerate(owner_orgs, 1):
            status, payload, error = request(token, "/services", {"organization_id": org_id})
            leaked = tenant_values(payload) - {org_id}
            record(
                "owner", f"TENANT_{pos}_SERVICES", status, "200 and no cross-tenant rows",
                status == 200 and not leaked,
                error or ("cross_tenant_rows" if leaked else ""),
            )

    # Manager: own administrative reads succeed; alternate tenant and Owner route fail.
    if "manager" in candidates:
        user, token = candidates["manager"]
        own_org = str(user.get("organization_id") or "")
        other_org = next((org for org in all_orgs if org != own_org), "")
        for name, path in (
            ("OWN_SERVICES", "/services"),
            ("OWN_CLIENTS", "/clients"),
            ("OWN_INVENTORY", "/inventory"),
        ):
            status, payload, error = request(token, path, {"organization_id": own_org})
            leaked = tenant_values(payload) - {own_org}
            record("manager", name, status, "200 and own tenant only", status == 200 and not leaked, error or ("cross_tenant_rows" if leaked else ""))
        if other_org:
            for name, path in (
                ("CROSS_TENANT_SERVICES", "/services"),
                ("CROSS_TENANT_CLIENTS", "/clients"),
                ("CROSS_TENANT_INVENTORY", "/inventory"),
            ):
                status, _, error = request(token, path, {"organization_id": other_org})
                record("manager", name, status, "403", status == 403, error)
        else:
            record("manager", "CROSS_TENANT_SETUP", 0, "alternate organization", False, "no_alternate_organization")
        status, _, error = request(token, "/owner/users")
        record("manager", "OWNER_ROUTE_DENIAL", status, "403", status == 403, error)

    # Staff: self-service succeeds; all administrative and cross-tenant reads fail.
    if "staff" in candidates:
        user, token = candidates["staff"]
        own_org = str(user.get("organization_id") or "")
        other_org = next((org for org in all_orgs if org != own_org), "")
        for name, path in (
            ("SELF_APPOINTMENTS", "/staff/appointments"),
            ("SELF_INCOME", "/staff/income/summary"),
            ("SELF_SETTLEMENTS", "/staff/settlements"),
        ):
            status, _, error = request(token, path)
            record("staff", name, status, "200", status == 200, error)
        for name, path in (
            ("ADMIN_ORGANIZATIONS_DENIAL", "/organizations"),
            ("ADMIN_SERVICES_DENIAL", "/services"),
            ("ADMIN_CLIENTS_DENIAL", "/clients"),
            ("ADMIN_INVENTORY_DENIAL", "/inventory"),
            ("OWNER_ROUTE_DENIAL", "/owner/users"),
        ):
            status, _, error = request(token, path)
            record("staff", name, status, "403", status == 403, error)
        if other_org:
            for name, path in (
                ("CROSS_TENANT_SERVICES", "/services"),
                ("CROSS_TENANT_CLIENTS", "/clients"),
                ("CROSS_TENANT_INVENTORY", "/inventory"),
            ):
                status, _, error = request(token, path, {"organization_id": other_org})
                record("staff", name, status, "403", status == 403, error)

    # Public route remains available without authentication.
    if all_orgs:
        status, _, error = request("", f"/public/{all_orgs[0]}/services")
        # urllib receives an empty Bearer header; public endpoint must still be public.
        record("public", "SERVICES", status, "200", status == 200, error)

    failed = [item for item in results if item["result"] == "FAIL"]
    summary = Counter(item["result"] for item in results)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "read_only",
        "roles_available": sorted(candidates),
        "organization_count": len(all_orgs),
        "results": results,
        "summary": {
            "total": len(results),
            "pass": summary["PASS"],
            "fail": summary["FAIL"],
        },
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"REPORT={REPORT}")
    print(f"TOTAL={len(results)} PASS={summary['PASS']} FAIL={summary['FAIL']}")
    print("AUTHENTICATED_RBAC_MATRIX=" + ("PASS" if not failed else "FAIL"))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
