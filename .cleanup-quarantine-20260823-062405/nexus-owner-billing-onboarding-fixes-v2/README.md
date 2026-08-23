# Nexus owner billing/onboarding package

Contiene snapshots exactos de backend/server.py, backend/owner_billing_hub.py y frontend/src/pages/OwnerOrganizationOnboarding.jsx, con fixes 1–10 recuperados de la conversación.

Fixes incluidos:

- billing_contact_name obligatorio en FISCAL_REQUIRED_FIELDS.
- Normalización fiscal segura ante valores ausentes.
- profile_source explícito para perfiles reales y fallback.
- HTTP 422 para perfil fiscal incompleto, con campos faltantes y versión.
- Error de carrera del Manager con manager_user_id.
- Rollback dirigido del Manager, sin replace_one destructivo.
- Rollback del perfil fiscal con created_by y updated_by.
- Validación explícita de email en frontend.
- Payload fiscal frontend centralizado.
- Errores frontend enriquecidos con missing_required_fields.

También incluye patches/0001-owner-billing-onboarding-fixes.patch.

Flujo recomendado (PowerShell), desde la raíz del repositorio:

    pwsh -File .\path\to\package\scripts\validate-prereqs.ps1 -RepoRoot (Get-Location)
    pwsh -File .\path\to\package\scripts\backup.ps1 -RepoRoot (Get-Location)
    pwsh -File .\path\to\package\scripts\inspect-patch.ps1 -RepoRoot (Get-Location)
    pwsh -File .\path\to\package\scripts\apply-patch.ps1 -RepoRoot (Get-Location)
    pwsh -File .\path\to\package\scripts\validate.ps1 -RepoRoot (Get-Location)
    pwsh -File .\path\to\package\scripts\audit.ps1 -RepoRoot (Get-Location)

Si falla la validación de contexto, no fuerces la aplicación. Revisa el diff o regenera el paquete contra el checkout correcto.

Rollback:

    pwsh -File .\path\to\package\scripts\rollback.ps1 -RepoRoot (Get-Location) -BackupPath <ruta-devuelta-por-backup>

Los scripts no ejecutan migraciones ni contactan MongoDB. El backup se conserva hasta eliminarlo explícitamente.

validate.ps1 ejecuta py_compile para los módulos Python y npm run build/lint si existe frontend/package.json. Las pruebas de MongoDB (HTTP 422, duplicados, Manager ocupado y rollback bajo fallo) deben ejecutarse en el entorno de la aplicación.
