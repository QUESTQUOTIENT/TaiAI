import os
import re
from pathlib import Path

from fastapi import HTTPException

from src.constants import GENERATED_IMAGES_DIR


GENERATED_IMAGE_DIR = Path(GENERATED_IMAGES_DIR)
GENERATED_IMAGE_RE = re.compile(
    r"^[a-f0-9]{8,64}\.(png|jpg|jpeg|webp|gif|mp4|mov|webm|mkv|m4v)$"
)
GENERATED_IMAGE_HEADERS = {
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
}


def resolve_generated_image_path(filename: str) -> Path:
    if not isinstance(filename, str) or not GENERATED_IMAGE_RE.fullmatch(filename):
        raise HTTPException(status_code=400, detail="Invalid filename")
    root = GENERATED_IMAGE_DIR.resolve()
    path = (GENERATED_IMAGE_DIR / filename).resolve()
    try:
        if os.path.commonpath([str(root), str(path)]) != str(root):
            raise ValueError
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return path


def prune_old(max_age_days: int = 30) -> int:
    """P2-30: retention policy for data/generated_images/. Deletes files
    older than max_age_days that are NOT referenced by the gallery DB.
    Returns the count of files deleted. Safe to call from a periodic
    scheduler (cleanup_routes, cron, or any background task).

    The "not referenced" check is best-effort: we walk the on-disk files
    and ask the gallery DB whether each filename is owned by a current
    image row. The gallery DB owns its own deletion path; this only
    catches orphaned files (e.g. a user deleted via the filesystem, or
    a crashed save).
    """
    import logging
    import time as _time

    log = logging.getLogger(__name__)
    if not GENERATED_IMAGE_DIR.exists():
        return 0

    # Build the set of filenames the gallery DB still references.
    referenced: set[str] = set()
    try:
        from src.database import get_db_session
        from sqlalchemy import text as _text
        with get_db_session() as db:
            for row in db.execute(_text("SELECT filename FROM gallery_images WHERE is_deleted = 0")):
                referenced.add(row[0])
    except Exception as e:  # noqa: BLE001
        log.warning("prune_old: gallery lookup failed (%r) — skipping retention sweep", e)
        return 0

    cutoff = _time.time() - (max_age_days * 86400)
    deleted = 0
    for p in GENERATED_IMAGE_DIR.iterdir():
        try:
            if not p.is_file():
                continue
            if p.name in referenced:
                continue
            if p.stat().st_mtime > cutoff:
                continue
            p.unlink()
            deleted += 1
        except Exception as e:  # noqa: BLE001
            log.debug("prune_old: skipping %s (%r)", p, e)
    if deleted:
        log.info("prune_old: removed %d orphaned image(s) older than %d day(s)", deleted, max_age_days)
    return deleted
