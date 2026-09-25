# NEXUS_OWNER_CONSOLE_SHELL_V1 (plan PR 12/13): a real, professional billing
# document -- replaces the hand-rolled raw-PDF-byte generator that used to
# live in owner_billing_hub.py (fixed Helvetica text lines assembled into a
# PDF 1.4 byte stream by hand, no layout engine, no brand identity at all).
# Built on reportlab's Platypus layout engine instead, using the exact same
# brand palette as the web app (frontend/src/index.css light-theme tokens),
# so a downloaded invoice looks like it came from the same product as the
# console, not a different one bolted on. Invoices are generated on demand
# from the stored document every time they're downloaded (never cached to
# disk), so every existing invoice automatically renders with this template
# too -- no backfill, no migration, nothing to break for a document issued
# before this file existed.
from __future__ import annotations

from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# Brand palette -- lifted 1:1 from frontend/src/index.css :root (light theme),
# the tokens the web app itself uses for --app-primary/--app-text-*/--app-*.
PRIMARY = colors.HexColor("#7c3aed")
PRIMARY_DARK = colors.HexColor("#6d28d9")
TEXT_PRIMARY = colors.HexColor("#101828")
TEXT_SECONDARY = colors.HexColor("#475467")
TEXT_MUTED = colors.HexColor("#667085")
BORDER = colors.HexColor("#e4e7ec")
SURFACE_MUTED = colors.HexColor("#f8f7fc")
WHITE = colors.white
SUCCESS = colors.HexColor("#087f5b")
SUCCESS_BG = colors.HexColor("#e7f7f1")
WARNING = colors.HexColor("#b54708")
WARNING_BG = colors.HexColor("#fff4e5")
DANGER = colors.HexColor("#c43232")
DANGER_BG = colors.HexColor("#fff0f0")
INFO = colors.HexColor("#175cd3")
INFO_BG = colors.HexColor("#edf4ff")
NEUTRAL = colors.HexColor("#475467")
NEUTRAL_BG = colors.HexColor("#f1f4f8")

STATUS_META = {
    "draft": ("Borrador", NEUTRAL, NEUTRAL_BG),
    "issued": ("Emitida", INFO, INFO_BG),
    "pending": ("Pendiente", WARNING, WARNING_BG),
    "paid": ("Pagada", SUCCESS, SUCCESS_BG),
    "overdue": ("Vencida", DANGER, DANGER_BG),
    "void": ("Anulada", NEUTRAL, NEUTRAL_BG),
    "refunded": ("Reembolsada", NEUTRAL, NEUTRAL_BG),
}

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
HEADER_H = 30 * mm
FOOTER_H = 16 * mm

_STYLES = {
    "label": ParagraphStyle(
        "label",
        fontName="Helvetica-Bold",
        fontSize=7.2,
        leading=9,
        textColor=TEXT_MUTED,
        spaceAfter=1,
    ),
    "value": ParagraphStyle(
        "value",
        fontName="Helvetica",
        fontSize=9.3,
        leading=12.5,
        textColor=TEXT_PRIMARY,
        spaceAfter=5,
    ),
    "block_title": ParagraphStyle(
        "block_title",
        fontName="Helvetica-Bold",
        fontSize=8.6,
        leading=11,
        textColor=PRIMARY_DARK,
        spaceAfter=6,
    ),
    "cell_label": ParagraphStyle(
        "cell_label",
        fontName="Helvetica",
        fontSize=7.6,
        leading=9.5,
        textColor=TEXT_MUTED,
    ),
    "cell_value": ParagraphStyle(
        "cell_value",
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=TEXT_PRIMARY,
    ),
    "item_main": ParagraphStyle(
        "item_main",
        fontName="Helvetica-Bold",
        fontSize=9.3,
        leading=12,
        textColor=TEXT_PRIMARY,
    ),
    "item_sub": ParagraphStyle(
        "item_sub", fontName="Helvetica", fontSize=7.8, leading=10, textColor=TEXT_MUTED
    ),
    "footer": ParagraphStyle(
        "footer", fontName="Helvetica", fontSize=7.2, leading=10, textColor=TEXT_MUTED
    ),
}


def _money(minor, currency="COP"):
    try:
        value = int(minor or 0) / 100
    except (TypeError, ValueError):
        value = 0
    return f"{currency} $ {value:,.0f}".replace(",", ".")


def _date(value):
    text = (str(value or ""))[:10]
    return text or "—"


def _p(text, style_key):
    return Paragraph(text if text else "—", _STYLES[style_key])


def _info_block(title, lines):
    rows = [[Paragraph(title, _STYLES["block_title"])]]
    for label, value in lines:
        rows.append(
            [
                Paragraph(
                    f"<b>{label}:</b> {value or 'Pendiente de configurar'}",
                    _STYLES["value"],
                )
            ]
        )
    table = Table(rows, colWidths=[(PAGE_W - 2 * MARGIN - 6 * mm) / 2])
    table.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (0, 0), 10),
                ("BOTTOMPADDING", (0, -1), (0, -1), 10),
                ("TOPPADDING", (0, 1), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 1), (-1, -1), 0),
                ("LINEABOVE", (0, 0), (-1, 0), 2, PRIMARY),
                ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
            ]
        )
    )
    return table


def _status_badge(status):
    label, fg, bg = STATUS_META.get(
        status, (status or "Desconocido", NEUTRAL, NEUTRAL_BG)
    )
    style = ParagraphStyle(
        "badge",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=fg,
        alignment=TA_RIGHT,
    )
    table = Table([[Paragraph(label.upper(), style)]], colWidths=[32 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("BOX", (0, 0), (-1, -1), 0.75, fg),
            ]
        )
    )
    return table


def build_invoice_pdf(invoice: dict, logo_bytes: bytes | None = None) -> bytes:
    seller = invoice.get("seller_snapshot") or {}
    buyer = invoice.get("buyer_snapshot") or {}
    currency = invoice.get("currency") or "COP"
    is_surcharge = invoice.get("invoice_type") == "premium_surcharge"
    doc_kind = "EXCEDENTE PLAN PREMIUM" if is_surcharge else "DOCUMENTO DE COBRO"

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=HEADER_H + 8 * mm,
        bottomMargin=FOOTER_H + 6 * mm,
        title=f"{invoice.get('invoice_number') or invoice.get('invoice_id')}",
    )

    story = []

    # Status badge, right-aligned, sits just under the header band.
    story.append(_status_badge(invoice.get("status")))
    story.append(Spacer(1, 8 * mm))

    # Seller / buyer, side by side.
    seller_block = _info_block(
        "Proveedor",
        [
            ("Razón social", seller.get("legal_name") or seller.get("commercial_name")),
            ("NIT", seller.get("tax_id")),
            ("Correo", seller.get("email")),
            (
                "Dirección",
                " ".join(x for x in [seller.get("address"), seller.get("city")] if x)
                or None,
            ),
        ],
    )
    buyer_block = _info_block(
        "Cliente",
        [
            ("Organización", buyer.get("legal_name") or buyer.get("organization_name")),
            ("NIT / documento", buyer.get("tax_id")),
            ("Correo de facturación", invoice.get("delivery_email_snapshot")),
            (
                "Dirección",
                " ".join(x for x in [buyer.get("address"), buyer.get("city")] if x)
                or None,
            ),
        ],
    )
    parties = Table(
        [[seller_block, buyer_block]], colWidths=[(PAGE_W - 2 * MARGIN) / 2] * 2
    )
    parties.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 3 * mm),
                ("RIGHTPADDING", (1, 0), (1, 0), 0),
                ("LEFTPADDING", (1, 0), (1, 0), 3 * mm),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(parties)
    story.append(Spacer(1, 6 * mm))

    # Metadata strip.
    meta_cells = [
        ("Código", invoice.get("invoice_number") or invoice.get("invoice_id")),
        ("Emisión", _date(invoice.get("issued_at"))),
        ("Vencimiento", _date(invoice.get("due_at"))),
        (
            "Plan",
            f"{invoice.get('plan_code_snapshot') or '—'} v{invoice.get('plan_version_snapshot') or 0}",
        ),
    ]
    meta_row = [
        [Paragraph(label.upper(), _STYLES["cell_label"]) for label, _ in meta_cells]
    ]
    meta_row.append(
        [Paragraph(value, _STYLES["cell_value"]) for _, value in meta_cells]
    )
    meta = Table(meta_row, colWidths=[(PAGE_W - 2 * MARGIN) / 4] * 4)
    meta.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SURFACE_MUTED),
                ("BOX", (0, 0), (-1, -1), 0.75, BORDER),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, 0), 8),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
                ("TOPPADDING", (0, 1), (-1, 1), 1),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
            ]
        )
    )
    story.append(meta)
    story.append(Spacer(1, 7 * mm))

    # Line items.
    period = (
        f"{_date(invoice.get('period_start'))} – {_date(invoice.get('period_end'))}"
    )
    concept = invoice.get("service_description") or (
        "Excedente del plan Premium"
        if is_surcharge
        else "Suscripción mensual Nexus Business OS"
    )
    contract_amount = (
        invoice.get("contract_amount_minor_snapshot")
        or invoice.get("subtotal_minor")
        or invoice.get("amount_minor")
    )
    header_style = ParagraphStyle(
        "item_header",
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=WHITE,
    )
    rows = [
        [
            Paragraph("CONCEPTO", header_style),
            Paragraph("PERIODO", header_style),
            Paragraph(
                "VALOR", ParagraphStyle("h2", parent=header_style, alignment=TA_RIGHT)
            ),
        ]
    ]
    rows.append(
        [
            [
                Paragraph(concept, _STYLES["item_main"]),
                Paragraph(
                    "Nexus by CS2 — servicio de gestión para organizaciones",
                    _STYLES["item_sub"],
                ),
            ],
            Paragraph(period, _STYLES["value"]),
            Paragraph(
                _money(contract_amount, currency),
                ParagraphStyle("amt", parent=_STYLES["item_main"], alignment=TA_RIGHT),
            ),
        ]
    )
    discount = int(invoice.get("discount_minor") or 0)
    if discount:
        rows.append(
            [
                Paragraph(
                    invoice.get("discount_reason") or "Descuento excepcional",
                    _STYLES["item_sub"],
                ),
                "",
                Paragraph(
                    f"− {_money(discount, currency)}",
                    ParagraphStyle(
                        "disc",
                        parent=_STYLES["value"],
                        alignment=TA_RIGHT,
                        textColor=DANGER,
                    ),
                ),
            ]
        )
    tax = int(invoice.get("tax_minor") or 0)
    if tax:
        rows.append(
            [
                Paragraph("Impuestos", _STYLES["item_sub"]),
                "",
                Paragraph(
                    _money(tax, currency),
                    ParagraphStyle("tax", parent=_STYLES["value"], alignment=TA_RIGHT),
                ),
            ]
        )
    items = Table(
        rows,
        colWidths=[
            (PAGE_W - 2 * MARGIN) * 0.5,
            (PAGE_W - 2 * MARGIN) * 0.22,
            (PAGE_W - 2 * MARGIN) * 0.28,
        ],
    )
    item_style = [
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 1), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 1), (-1, -1), 0.5, BORDER),
    ]
    items.setStyle(TableStyle(item_style))
    story.append(items)
    story.append(Spacer(1, 6 * mm))

    # Totals, right-aligned.
    paid = int(invoice.get("paid_amount_minor") or 0)
    total = int(invoice.get("amount_minor") or 0)
    balance = max(0, total - paid)
    balance_color = SUCCESS if balance == 0 else DANGER
    total_rows = [
        (
            "Subtotal",
            _money(invoice.get("subtotal_minor") or contract_amount, currency),
            TEXT_SECONDARY,
            False,
        ),
        (
            "Descuento",
            f"− {_money(discount, currency)}" if discount else _money(0, currency),
            TEXT_SECONDARY,
            False,
        ),
        ("Impuestos", _money(tax, currency), TEXT_SECONDARY, False),
        ("TOTAL", _money(total, currency), PRIMARY_DARK, True),
        ("Pagado", _money(paid, currency), TEXT_SECONDARY, False),
        ("Saldo", _money(balance, currency), balance_color, True),
    ]
    totals_data = []
    for label, value, color, bold in total_rows:
        label_style = ParagraphStyle(
            "tl",
            fontName="Helvetica-Bold" if bold else "Helvetica",
            fontSize=10.5 if bold else 9,
            textColor=color,
        )
        value_style = ParagraphStyle("tv", parent=label_style, alignment=TA_RIGHT)
        totals_data.append(
            [Paragraph(label, label_style), Paragraph(value, value_style)]
        )
    totals = Table(totals_data, colWidths=[35 * mm, 45 * mm], hAlign="RIGHT")
    totals.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LINEABOVE", (0, 3), (-1, 3), 1, BORDER),
                ("LINEABOVE", (0, 5), (-1, 5), 1, BORDER),
            ]
        )
    )
    story.append(totals)
    story.append(Spacer(1, 10 * mm))

    # Legal notice.
    notice = invoice.get("legal_notice") or ""
    if notice:
        story.append(
            Paragraph(
                notice,
                ParagraphStyle(
                    "notice",
                    fontName="Helvetica",
                    fontSize=7.6,
                    leading=10.5,
                    textColor=TEXT_MUTED,
                ),
            )
        )

    def _draw_chrome(cnv, _doc):
        cnv.saveState()
        # Header band.
        cnv.setFillColor(PRIMARY)
        cnv.rect(0, PAGE_H - HEADER_H, PAGE_W, HEADER_H, stroke=0, fill=1)
        if logo_bytes:
            try:
                reader = ImageReader(BytesIO(logo_bytes))
                iw, ih = reader.getSize()
                target_h = HEADER_H - 12 * mm
                target_w = target_h * (iw / ih)
                cnv.drawImage(
                    reader,
                    MARGIN,
                    PAGE_H - HEADER_H + 6 * mm,
                    width=target_w,
                    height=target_h,
                    mask="auto",
                    preserveAspectRatio=True,
                )
            except Exception:
                cnv.setFillColor(WHITE)
                cnv.setFont("Helvetica-Bold", 18)
                cnv.drawString(MARGIN, PAGE_H - HEADER_H / 2 - 4, "NEXUS BY CS2")
        else:
            cnv.setFillColor(WHITE)
            cnv.setFont("Helvetica-Bold", 18)
            cnv.drawString(MARGIN, PAGE_H - HEADER_H / 2 - 4, "NEXUS BY CS2")
        cnv.setFillColor(WHITE)
        cnv.setFont("Helvetica-Bold", 12)
        cnv.drawRightString(PAGE_W - MARGIN, PAGE_H - HEADER_H / 2 + 1, doc_kind)
        cnv.setFont("Helvetica", 8.5)
        cnv.drawRightString(
            PAGE_W - MARGIN,
            PAGE_H - HEADER_H / 2 - 11,
            invoice.get("invoice_number") or invoice.get("invoice_id") or "",
        )
        # Footer band.
        cnv.setStrokeColor(BORDER)
        cnv.setLineWidth(0.75)
        cnv.line(MARGIN, FOOTER_H, PAGE_W - MARGIN, FOOTER_H)
        cnv.setFillColor(TEXT_MUTED)
        cnv.setFont("Helvetica", 7.5)
        cnv.drawString(
            MARGIN,
            FOOTER_H - 9,
            "Nexus by CS2 · Business OS para organizaciones de servicios",
        )
        cnv.drawRightString(
            PAGE_W - MARGIN, FOOTER_H - 9, f"Página {cnv.getPageNumber()}"
        )
        cnv.restoreState()

    doc.build(story, onFirstPage=_draw_chrome, onLaterPages=_draw_chrome)
    return buffer.getvalue()
