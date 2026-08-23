#!/usr/bin/env python3
"""Static/contract smoke test for the Nexus owner billing onboarding fix."""
from __future__ import annotations

import argparse
import ast
import json
import subprocess
from pathlib import Path

FILES = {
    "server": Path("backend/server.py"),
    "billing": Path("backend/owner_billing_hub.py"),
    "frontend": Path("frontend/src/pages/OwnerOrganizationOnboarding.jsx"),
}

def check(label: str, condition: bool, details: str = "") -> bool:
    print(f"[{'PASS' if condition else 'FAIL'}] {label}" + (f" — {details}" if details else ""))
    return condition

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".", type=Path)
    parser.add_argument("--run-build", action="store_true")
    args = parser.parse_args()
    root = args.repo_root.resolve()
    ok = True
    texts = {}

    for name, rel in FILES.items():
        path = root / rel
        exists = path.is_file()
        ok &= check(f"{rel} existe", exists)
        if exists:
            texts[name] = path.read_text(encoding="utf-8")

    if len(texts) != 3:
        return 1

    billing, server, frontend = texts["billing"], texts["server"], texts["frontend"]
    ok &= check("billing_contact_name es obligatorio", 'billing_email","billing_contact_name","city' in billing)
    ok &= check("normalización fiscal segura", 'billing_email=clean_optional(item.get("billing_email"))' in billing and 'str(item["billing_email"]).strip().lower()' not in billing)
    ok &= check("profile_source está presente", 'profile_source' in billing and 'organization_billing_profiles' in billing and '"fallback"' in billing)
    ok &= check("onboarding incompleto devuelve HTTP 422", 'raise HTTPException(status_code=422' in server and '"fiscal_profile_incomplete"' in server)
    ok &= check("error de carrera incluye manager_user_id", '"manager_assignment_conflict"' in server and '"manager_user_id":data.manager_user_id' in server)
    ok &= check("rollback dirigido del Manager", "rollback_update=" in server and "await db.users.update_one" in server)
    ok &= check("frontend valida email y campos faltantes", "isValidEmail=" in frontend and "missing_required_fields" in frontend)
    ok &= check("frontend usa payload fiscal explícito", "fiscalProfilePayload=" in frontend and "cc_emails:[]" in frontend)

    for rel in (FILES["server"], FILES["billing"]):
        try:
            ast.parse((root / rel).read_text(encoding="utf-8"))
            ok &= check(f"{rel} tiene sintaxis Python válida", True)
        except SyntaxError as exc:
            ok &= check(f"{rel} tiene sintaxis Python válida", False, str(exc))

    if args.run_build:
        package = root / "frontend" / "package.json"
        if not package.is_file():
            ok &= check("frontend/package.json existe para build", False)
        else:
            scripts = json.loads(package.read_text(encoding="utf-8")).get("scripts", {})
            result = subprocess.run(["npm", "run", "build"], cwd=root / "frontend", check=False)
            ok &= check("npm run build termina correctamente", result.returncode == 0)
            if "lint" in scripts:
                result = subprocess.run(["npm", "run", "lint"], cwd=root / "frontend", check=False)
                ok &= check("npm run lint termina correctamente", result.returncode == 0)
            else:
                print("[INFO] No existe script npm 'lint'; se omite.")

    print("\nResultado:", "PASS" if ok else "FAIL")
    return 0 if ok else 1

if __name__ == "__main__":
    raise SystemExit(main())

