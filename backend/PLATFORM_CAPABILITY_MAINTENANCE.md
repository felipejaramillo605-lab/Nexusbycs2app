# Platform capability maintenance and recovery

This runbook covers the standalone MongoDB authority used for premium portal-template entitlements. The collection `platform_capability_authority` is the serialization point for grants, audit events, archival, and maintenance locks. Do not remove a lock by editing MongoDB directly.

## Archive a capability audit ledger

1. Run the archive command with a new, protected destination. The command takes `archive_lock` using a version compare-and-set, persists request-ID tombstones, verifies the hash chain, compacts the events, and releases the lock.

   ```powershell
   python backend/archive_platform_capability_audit.py --archive C:\secure-audit\platform-capabilities-YYYYMMDD.json --confirm
   ```

2. Keep the archive file read-only in the approved audit store. Verify it independently with:

   ```powershell
   python backend/archive_platform_capability_audit.py --verify C:\secure-audit\platform-capabilities-YYYYMMDD.json
   ```

The archive command stops if pending entitlement events exist. Reconcile those only by following the writer-drain procedure below.

## Reconcile pending entitlements

Reconciliation can mark a pending audit request failed when its organization marker is not present. An active request may still be between writing that audit event and updating the organization, so reconciliation must run after every API instance and worker that can write platform entitlements has stopped and all in-flight requests have drained.

1. Stop the backend API replicas and any worker or maintenance process that can mutate organizations or platform capabilities. Confirm the processes have exited and no requests remain in flight. Keep them stopped until the command finishes.
2. Run:

   ```powershell
   python backend/reconcile_platform_entitlements.py
   ```

   The script acquires `maintenance_lock` with a version compare-and-set. New authority writes and archival fail closed while it is held. Reconciliation refuses to run without the matching lock. The script releases the lock after it completes.
3. Review the applied, failed, and still-pending counts before restarting writers. Investigate failed events against the organization's current entitlement marker and the audit event's `request_id`.

If the process is interrupted, leave the lock in place until the recovery steps below confirm the database state. Do not restart API writers while an unexplained maintenance lock remains.

## Recover a stale archive lock

The archive process can be interrupted after acquiring its lock. Recovery is deliberately manual and fail-closed. First stop and drain backend writers as above. Read the current `archive_lock` value and `version` from `platform_capability_authority` using an authorized read-only database session; never paste the Mongo connection string into logs or this runbook.

If the archive file exists, verify its hash chain and compare its authority version with the current locked version. The recovery command also confirms the authority still contains exactly the archived events and that each request-ID tombstone matches its archived event hash. It refuses if the version, event list, lock ID, or any existing tombstone differs.

```powershell
python backend/archive_platform_capability_audit.py --verify C:\secure-audit\platform-capabilities-YYYYMMDD.json
python backend/recover_platform_capability_lock.py --lock-id archive_ID_FROM_DB --expected-version VERSION_FROM_DB --archive C:\secure-audit\platform-capabilities-YYYYMMDD.json --confirm
```

If the archive verifies but some tombstones were not written before interruption, inspect the reported IDs, then explicitly repair them from that verified archive:

```powershell
python backend/recover_platform_capability_lock.py --lock-id archive_ID_FROM_DB --expected-version VERSION_FROM_DB --archive C:\secure-audit\platform-capabilities-YYYYMMDD.json --repair-tombstones --confirm
```

If the process stopped before creating the archive file, use `--no-archive`. This path only unlocks when current ledger request IDs have no tombstones; it preserves the ledger as-is.

```powershell
python backend/recover_platform_capability_lock.py --lock-id archive_ID_FROM_DB --expected-version VERSION_FROM_DB --no-archive --confirm
```

The recovery command increments the authority version while clearing the exact lock with a compare-and-set. If any check fails, leave the lock in place and investigate; do not lower the expected version or edit the lock directly.

## Recover a stale reconciliation lock

Stop and drain every writer, inspect the pending audit events and organization markers, and read the exact `maintenance_lock` and authority version. Review whether reconciliation already changed any event to `applied` or `failed`. Then clear only that exact lock:

```powershell
python backend/recover_platform_capability_lock.py --maintenance-lock --lock-id maintenance_ID_FROM_DB --expected-version VERSION_FROM_DB --confirm
```

The lock ID and version must still match. After recovery, rerun the reconciliation command while writers remain stopped if pending events remain. Restart API writers only after the lock is absent and the audit results have been reviewed.

## Owner eligibility race on standalone MongoDB

Grant creation checks that the target is an approved owner, active, and not deleted. Account lifecycle handlers also prevent disabling or deleting an owner who already has a platform grant. There is still a narrow cross-document race if an account lifecycle write lands after the target check but before the grant is committed. A standalone MongoDB deployment cannot atomically validate the user document and update the authority document in one transaction.

For this deployment, issue grants during a short administrative window with account role/status changes for the target paused. Immediately after the grant succeeds, read the target account and confirm `role=owner`, `access_status=approved`, `active` is not false, and `deleted_at` is absent. If that check fails, revoke the grant before allowing premium entitlement changes. Eliminating this window in code requires either replica-set transactions or moving the grant eligibility fence into the authority document; do not assume a second read alone makes the two-document write atomic.
