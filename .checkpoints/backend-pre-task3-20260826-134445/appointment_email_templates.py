# NEXUS_8A7G1C1B1_SAFE_EMAIL_TEMPLATE_FOUNDATION_V1
from __future__ import annotations

import os
import re
from html import escape
from pathlib import PurePosixPath
from typing import Iterable, Mapping
from urllib.parse import urljoin, urlsplit

MEDIA_PREFIX = "/api/media/professionals/"
SAFE_SEGMENT = re.compile(r"^[A-Za-z0-9_.-]+$")
ALLOWED_IMAGE_SUFFIXES = {".webp"}


def safe_text(value, fallback="") -> str:
    text = str(value if value is not None else fallback).strip()
    return escape(text, quote=True)


def safe_initial(value, fallback="P") -> str:
    text = str(value or "").strip()
    initial = text[0].upper() if text else fallback
    return safe_text(initial[:1], fallback)


def trusted_public_base(environ: Mapping[str, str] | None = None) -> str | None:
    values = environ or os.environ
    for key in ("PUBLIC_APP_URL", "FRONTEND_URL"):
        raw = str(values.get(key) or "").strip().rstrip("/")
        parsed = urlsplit(raw)
        if parsed.scheme == "https" and parsed.netloc and not parsed.username and not parsed.password:
            return raw
    return None


def safe_professional_avatar_url(avatar, environ: Mapping[str, str] | None = None) -> str | None:
    value = str(avatar or "").strip()
    if not value.startswith(MEDIA_PREFIX):
        return None
    relative = value[len(MEDIA_PREFIX):]
    parts = PurePosixPath(relative).parts
    if len(parts) != 2 or ".." in parts or not all(SAFE_SEGMENT.fullmatch(part) for part in parts):
        return None
    if PurePosixPath(parts[-1]).suffix.lower() not in ALLOWED_IMAGE_SUFFIXES:
        return None
    base = trusted_public_base(environ)
    if not base:
        return None
    absolute = urljoin(base + "/", value.lstrip("/"))
    parsed = urlsplit(absolute)
    base_parsed = urlsplit(base)
    if parsed.scheme != "https" or parsed.netloc != base_parsed.netloc:
        return None
    return escape(absolute, quote=True)


def render_professional_identity(name, avatar=None, environ: Mapping[str, str] | None = None) -> str:
    safe_name = safe_text(name, "Profesional")
    image_url = safe_professional_avatar_url(avatar, environ)
    if image_url:
        visual = (
            f'<img src="{image_url}" width="72" height="72" alt="" '
            'style="display:block;width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid #DDE7FF;" />'
        )
    else:
        visual = (
            '<div role="img" aria-label="Profesional" '
            'style="width:72px;height:72px;line-height:72px;border-radius:50%;background:#E8EEFF;color:#3159B8;'
            'font-family:Arial,sans-serif;font-size:28px;font-weight:700;text-align:center;">'
            f'{safe_initial(name)}</div>'
        )
    return (
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">'
        '<tr><td width="88" valign="middle">' + visual + '</td>'
        '<td valign="middle" style="font-family:Arial,sans-serif;color:#111827;">'
        '<div style="font-size:12px;line-height:18px;color:#667085;text-transform:uppercase;letter-spacing:.6px;">Profesional</div>'
        f'<div style="font-size:20px;line-height:28px;font-weight:700;">{safe_name}</div>'
        '</td></tr></table>'
    )


def render_detail_rows(rows: Iterable[tuple[str, object]]) -> str:
    rendered = []
    for label, value in rows:
        if value is None or str(value).strip() == "":
            continue
        rendered.append(
            '<tr>'
            f'<td style="padding:10px 12px;font-family:Arial,sans-serif;font-size:13px;color:#667085;border-bottom:1px solid #E8ECF2;">{safe_text(label)}</td>'
            f'<td align="right" style="padding:10px 12px;font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #E8ECF2;">{safe_text(value)}</td>'
            '</tr>'
        )
    return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">' + ''.join(rendered) + '</table>'


def render_email_shell(*, organization_name, eyebrow, title, body_html, footer_lines=()) -> str:
    footer = ''.join(
        f'<div style="margin-top:4px;">{safe_text(line)}</div>'
        for line in footer_lines if line is not None and str(line).strip()
    )
    return (
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>' + safe_text(title) + '</title></head>'
        '<body style="margin:0;padding:0;background:#F3F5F9;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F5F9;">'
        '<tr><td align="center" style="padding:24px 12px;">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E4E7EC;border-radius:18px;overflow:hidden;">'
        '<tr><td style="padding:28px 28px 22px;background:#3159B8;color:#FFFFFF;font-family:Arial,sans-serif;">'
        f'<div style="font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:.7px;opacity:.85;">{safe_text(eyebrow)}</div>'
        f'<h1 style="margin:6px 0 0;font-size:28px;line-height:36px;">{safe_text(title)}</h1></td></tr>'
        f'<tr><td style="padding:28px;">{body_html}</td></tr>'
        '<tr><td style="padding:20px 28px;background:#F8FAFC;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#667085;text-align:center;">'
        f'<strong style="color:#344054;">{safe_text(organization_name, "Nexus")}</strong>{footer}'
        '</td></tr></table></td></tr></table></body></html>'
    )
