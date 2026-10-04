"""Resend delivery (HTTPS API with the account's own key; portable to any hosting).

Opt-in: nothing changes until EMAIL_PROVIDER=resend, RESEND_API_KEY and RESEND_FROM_EMAIL are all set.
Callers always keep their SMTP path as the fallback, so a Resend outage never loses a message.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Iterable, Optional, Sequence

import requests

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
TIMEOUT_SECONDS = 15


def _fingerprint(value: str) -> str:
    return hashlib.sha256(str(value or "").strip().lower().encode()).hexdigest()[:16]


def resend_enabled() -> bool:
    return (
        os.getenv("EMAIL_PROVIDER", "").strip().lower() == "resend"
        and bool(os.getenv("RESEND_API_KEY", "").strip())
        and bool(os.getenv("RESEND_FROM_EMAIL", "").strip())
    )


def send_via_resend(
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    *,
    cc: Optional[Iterable[str]] = None,
    attachments: Optional[Sequence[tuple[str, bytes, str]]] = None,
    from_name: Optional[str] = None,
) -> tuple[bool, Optional[str]]:
    """Send one message. Returns (accepted, diagnostic_code); never raises, never logs the recipient."""
    if not resend_enabled():
        return False, "resend_not_configured"
    sender = os.getenv("RESEND_FROM_EMAIL", "").strip()
    name = (from_name or os.getenv("SMTP_FROM_NAME", "Nexus by CS2")).replace('"', "").strip()
    payload: dict = {
        "from": f"{name} <{sender}>" if name and "<" not in sender else sender,
        "to": [to_email],
        "subject": subject,
        "html": html_body,
    }
    if text_body:
        payload["text"] = text_body
    cc_list = [address for address in (cc or []) if address]
    if cc_list:
        payload["cc"] = cc_list
    if attachments:
        payload["attachments"] = [
            {"filename": filename, "content": base64.b64encode(content).decode("ascii"), "content_type": mime}
            for filename, content, mime in attachments
        ]
    try:
        response = requests.post(
            RESEND_URL,
            json=payload,
            headers={"Authorization": f"Bearer {os.getenv('RESEND_API_KEY', '').strip()}"},
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        code = type(exc).__name__
        logger.warning("resend_failed recipient_fingerprint=%s diagnostic_code=%s", _fingerprint(to_email), code)
        return False, code
    if 200 <= response.status_code < 300:
        logger.info("resend_accepted recipient_fingerprint=%s", _fingerprint(to_email))
        return True, None
    code = f"http_{response.status_code}"
    logger.warning("resend_failed recipient_fingerprint=%s diagnostic_code=%s", _fingerprint(to_email), code)
    return False, code
