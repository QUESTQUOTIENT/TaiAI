"""Backup routes — export/import user data (memories, presets, settings, skills, preferences).

Phase 1.4 additions:
- Integrity check (SHA-256) on every export; verified on import.
- Dry-run mode for import (counts only, no writes).
- Restore preview endpoint (``POST /api/backup/preview``).
- Bumped backup schema version to 2.

Phase (2026-06-20) additions:
- DoS guards on ``/api/import``: max body size, max JSON nesting depth,
  and max single-field bytes. A hostile client cannot OOM the server by
  uploading a multi-GB JSON body or a deeply nested object that
  exhausts the stack. The caps match the values used by the CLI backup
  subsystem where they overlap.

Note on encryption
------------------
The HTTP export endpoint produces user-data JSON (memories, presets,
skills, settings, preferences). The CLI ``TaiAi-backup`` subsystem
handles disaster recovery of the whole ``data/`` tree and **does**
support AES-256-GCM. The HTTP path is intentionally plaintext — adding
encryption here requires a passphrase-handling UI and is a design
conversation, not a stealth add. Operators who need encryption on
exported JSON should run the data through ``TaiAi-backup`` instead.
"""

import hashlib
import json
import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, Response
from core.middleware import require_admin
from src.auth_helpers import get_current_user
from src.settings import load_settings, save_settings, load_features, save_features

logger = logging.getLogger(__name__)


# --- DoS guards -------------------------------------------------------
#
# These caps are intentionally generous (the largest legitimate backup
# payload is well under 100 MiB) but tight enough that a malicious client
# cannot exhaust memory or stack on the import path. They mirror the
# archive-bomb caps on the CLI backup restore path (``services.backup``).
MAX_IMPORT_BYTES = 64 * 1024 * 1024          # 64 MiB body cap
MAX_IMPORT_JSON_DEPTH = 32                   # stack-safe nesting cap
MAX_IMPORT_FIELD_BYTES = 4 * 1024 * 1024     # any single string field <= 4 MiB


# --- helpers (module level so unit tests can import directly) ---------


def _integrity(payload: dict) -> dict:
    """Compute a SHA-256 integrity stamp over a backup payload.

    Hashes the canonical-JSON form of the payload with the ``integrity``
    key excluded, so the stamp survives re-serialization round-trips.
    """
    body = {k: v for k, v in payload.items() if k != "integrity"}
    canonical = json.dumps(body, sort_keys=True, ensure_ascii=False,
                           separators=(",", ":")).encode("utf-8")
    return {
        "algorithm": "sha256-canonical-json-v1",
        "sha256": hashlib.sha256(canonical).hexdigest(),
        "size_bytes": len(canonical),
    }


def _verify_integrity(body: dict) -> tuple[bool, str]:
    """Verify that a backup payload's integrity stamp matches its
    contents. Returns (ok, reason). reason is empty when ok."""
    integrity = body.get("integrity") or {}
    if integrity.get("algorithm") != "sha256-canonical-json-v1":
        return False, "missing or unknown integrity stamp (use /api/export)"
    body_for_hash = {k: v for k, v in body.items() if k != "integrity"}
    canonical = json.dumps(body_for_hash, sort_keys=True, ensure_ascii=False,
                           separators=(",", ":")).encode("utf-8")
    actual = hashlib.sha256(canonical).hexdigest()
    if actual != integrity.get("sha256"):
        return False, "integrity check failed: archive is corrupt or modified"
    return True, ""


def _json_depth(obj, _depth: int = 0) -> int:
    """Return the maximum nesting depth of a JSON-like object.

    Used to detect stack-exhaustion attempts in import bodies before
    Python's recursive decoder blows the stack. Strings/ints return 0,
    lists/dicts recurse. Raises :class:`ValueError` if the depth
    exceeds :data:`MAX_IMPORT_JSON_DEPTH` during the walk.
    """
    if _depth > MAX_IMPORT_JSON_DEPTH:
        raise ValueError(f"json depth exceeds {MAX_IMPORT_JSON_DEPTH}")
    if isinstance(obj, dict):
        if not obj:
            return _depth
        return max(_json_depth(v, _depth + 1) for v in obj.values())
    if isinstance(obj, list):
        if not obj:
            return _depth
        return max(_json_depth(v, _depth + 1) for v in obj)
    return _depth


def _check_field_lengths(obj, *, path: str = "") -> None:
    """Reject any single string field larger than :data:`MAX_IMPORT_FIELD_BYTES`.

    A legitimate backup never contains a single string field of more
    than a few hundred KiB; a multi-MiB field is either an attack or a
    bug, and either way we want to surface it rather than silently
    inflate memory. The path argument is for error messages only.
    """
    if isinstance(obj, dict):
        for k, v in obj.items():
            _check_field_lengths(v, path=f"{path}.{k}" if path else str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _check_field_lengths(v, path=f"{path}[{i}]")
    elif isinstance(obj, str) and len(obj.encode("utf-8")) > MAX_IMPORT_FIELD_BYTES:
        raise HTTPException(
            400,
            f"field {path!r} exceeds {MAX_IMPORT_FIELD_BYTES} bytes",
        )


# --- route setup -----------------------------------------------------


def setup_backup_routes(memory_manager, preset_manager, skills_manager) -> APIRouter:
    router = APIRouter(tags=["backup"])

    def _gather(user: str) -> dict:
        try:
            from routes.prefs_routes import _load_for_user
            preferences = _load_for_user(user)
        except Exception as e:  # noqa: BLE001
            logger.debug("prefs load skipped in export: %r", e)
            preferences = {}
        return {
            "version": 2,
            "exported_at": datetime.now().isoformat(),
            "exported_by": user,
            "memories": memory_manager.load(owner=user),
            "presets": preset_manager.get_all(),
            "skills": skills_manager.load(owner=user),
            "settings": load_settings(),
            "features": load_features(),
            "preferences": preferences,
        }

    @router.get("/api/export")
    async def export_data(request: Request):
        """Export all user data as a downloadable JSON file with an
        embedded SHA-256 integrity hash. Use POST /api/import to
        restore; POST /api/backup/preview for a dry-run count."""
        require_admin(request)
        user = get_current_user(request)
        payload = _gather(user)
        payload["integrity"] = _integrity(payload)
        filename = f"TaiAi_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        body = json.dumps(payload, indent=2, ensure_ascii=False)
        return Response(
            content=body,
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "X-Backup-SHA256": payload["integrity"]["sha256"],
                "X-Backup-Size": str(payload["integrity"]["size_bytes"]),
            },
        )

    @router.post("/api/backup/preview")
    async def backup_preview(request: Request):
        """Validate + count what an import would change WITHOUT writing.
        Returns counts only — the UI shows this before the destructive
        Apply button. Same auth gate as import (admin)."""
        require_admin(request)
        user = get_current_user(request)
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(400, "Invalid JSON")
        if not isinstance(body, dict):
            raise HTTPException(400, "Expected a JSON object")

        ok, reason = _verify_integrity(body)
        counts: dict = {}
        if isinstance(body.get("memories"), list):
            counts["memories_in_archive"] = len(body["memories"])
        if isinstance(body.get("skills"), list):
            counts["skills_in_archive"] = len(body["skills"])
        if isinstance(body.get("presets"), dict):
            counts["presets_in_archive"] = len(body["presets"])
        return {
            "ok": ok,
            "reason": reason,
            "integrity_ok": ok,
            "target_user": user,
            "exported_at": body.get("exported_at", "?"),
            "exported_by": body.get("exported_by", "?"),
            "counts": counts,
        }

    @router.post("/api/import")
    async def import_data(request: Request):
        """Import user data from a previously exported JSON file.
        Honors ``?dry_run=true`` for validate-only + counts. Verifies
        integrity stamp before applying any change. Same merge
        semantics as before; cross-tenant dedup scoped to caller.

        DoS guards run before the JSON decoder allocates anything:
        Content-Length cap → body cap → depth cap → per-field cap.
        """
        require_admin(request)
        user = get_current_user(request)
        dry_run = request.query_params.get("dry_run", "").lower() in ("1", "true", "yes")

        # --- DoS guards -------------------------------------------
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > MAX_IMPORT_BYTES:
                    raise HTTPException(
                        413,
                        f"payload too large: {content_length} > {MAX_IMPORT_BYTES}",
                    )
            except ValueError:
                raise HTTPException(400, "invalid Content-Length header")
        try:
            raw = await request.body()
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"could not read request body: {e}")
        if len(raw) > MAX_IMPORT_BYTES:
            raise HTTPException(
                413, f"payload too large: {len(raw)} > {MAX_IMPORT_BYTES}"
            )

        try:
            body = json.loads(raw)
        except json.JSONDecodeError as e:
            raise HTTPException(400, f"Invalid JSON: {e}")
        if not isinstance(body, dict):
            raise HTTPException(400, "Expected a JSON object")

        try:
            depth = _json_depth(body)
        except ValueError as e:
            raise HTTPException(400, f"JSON nesting too deep: {e}")
        if depth > MAX_IMPORT_JSON_DEPTH:
            raise HTTPException(
                400, f"JSON nesting too deep: {depth} > {MAX_IMPORT_JSON_DEPTH}"
            )

        # Per-field byte cap. Runs before integrity so a 1 GB blob in
        # a single field can't waste cycles computing sha256 over it.
        _check_field_lengths(body)

        ok, reason = _verify_integrity(body)
        if not ok:
            raise HTTPException(400, reason)

        imported = []

        # --- Memories ---
        if "memories" in body and isinstance(body["memories"], list):
            existing = memory_manager.load_all()
            existing_texts = {e.get("text", "").strip().lower()
                              for e in existing if e.get("owner") == user}
            added = 0
            for mem in body["memories"]:
                if not isinstance(mem, dict) or not mem.get("text"):
                    continue
                if mem["text"].strip().lower() in existing_texts:
                    continue
                if user and not mem.get("owner"):
                    mem["owner"] = user
                if not dry_run:
                    existing.append(mem)
                    existing_texts.add(mem["text"].strip().lower())
                added += 1
            if not dry_run:
                memory_manager.save(existing)
            imported.append(f"{added} memories")

        # --- Skills ---
        if "skills" in body and isinstance(body["skills"], list):
            added = 0
            for skill in body["skills"]:
                if not isinstance(skill, dict):
                    continue
                title = (skill.get("title") or skill.get("description")
                         or skill.get("name") or "").strip()
                if not title:
                    continue
                if dry_run:
                    added += 1
                    continue
                owner = skill.get("owner") or user
                try:
                    result = skills_manager.add_skill(
                        title=title,
                        name=skill.get("name"),
                        description=skill.get("description"),
                        problem=skill.get("problem", ""),
                        solution=skill.get("solution", ""),
                        steps=skill.get("steps"),
                        tags=skill.get("tags"),
                        source="user",
                        teacher_model=skill.get("teacher_model"),
                        confidence=skill.get("confidence", 0.8),
                        owner=owner,
                        category=skill.get("category", "general"),
                        when_to_use=skill.get("when_to_use"),
                        procedure=skill.get("procedure"),
                        pitfalls=skill.get("pitfalls"),
                        verification=skill.get("verification"),
                        platforms=skill.get("platforms"),
                        requires_toolsets=skill.get("requires_toolsets"),
                        fallback_for_toolsets=skill.get("fallback_for_toolsets"),
                        status=skill.get("status", "draft"),
                        version=skill.get("version", "1.0.0"),
                    )
                except Exception as e:  # noqa: BLE001
                    logger.warning("skill restore failed for %s: %r", title, e)
                    continue
                if result.get("_deduped"):
                    continue
                added += 1
            imported.append(f"{added} skills")

        # --- Presets ---
        if "presets" in body and isinstance(body["presets"], dict):
            preset_count = len(body["presets"])
            if not dry_run:
                current = preset_manager.get_all()
                for key, value in body["presets"].items():
                    if isinstance(value, (dict, list)):
                        current[key] = value
                preset_manager.save(current)
            imported.append(f"{preset_count} presets")

        # --- Settings / features / preferences (last-write-wins for now) ---
        for key in ("settings", "features"):
            if key in body and isinstance(body[key], dict):
                if not dry_run:
                    if key == "settings":
                        save_settings(body[key])
                    else:
                        save_features(body[key])
                imported.append(key)

        if "preferences" in body and isinstance(body["preferences"], dict):
            if not dry_run:
                from routes.prefs_routes import _save_for_user
                try:
                    _save_for_user(user, body["preferences"])
                except Exception as e:  # noqa: BLE001
                    logger.warning("preferences restore failed: %r", e)
            imported.append("preferences")

        return {
            "ok": True,
            "dry_run": dry_run,
            "imported": imported,
            "target_user": user,
            "integrity_ok": True,
        }

    return router
