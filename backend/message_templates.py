# NEXUS_MESSAGE_TEMPLATES_V1
"""
Plantillas de mensajes (correo, y próximamente WhatsApp) que cada manager
puede personalizar. Reemplaza el texto fijo que antes vivía hardcodeado en
frontend/src/services/whatsappService.js y en los 4 botones de
MarketingCampaigns.js.

`body` es texto plano con variables `{{nombre}}` -- `render_template` es la
única función que las interpreta, así que el día que se conecte WhatsApp de
verdad, el mismo `body` + el mismo render_template sirven para ambos
canales; solo cambia quién lo envía.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

SUPPORTED_VARIABLES = [
    "nombre_cliente",
    "nombre_negocio",
    "codigo_descuento",
    "fecha_expiracion",
    "link_reserva",
    # NEXUS_CLASS_RECURRING_SCHEDULE_V1
    "nombre_clase",
    "fecha_hora_nueva",
    # NEXUS_GROUP_SERVICES_MEMBERSHIPS_V1
    "nombre_plan",
    "fecha_vencimiento",
]

PURPOSES = {
    "birthday",
    "reactivation",
    "promotion",
    "welcome",
    "custom",
    # NEXUS_CLASS_RECURRING_SCHEDULE_V1
    "class_rescheduled",
    "class_cancelled",
    # NEXUS_GROUP_SERVICES_MEMBERSHIPS_V1
    "membership_expired",
    # NEXUS_GROUP_SERVICES_WAITLIST_V1
    "waitlist_promoted",
}
CHANNELS = {"email", "whatsapp"}

# NEXUS_BIRTHDAY_CAMPAIGN_V1 ya generaba este texto en whatsappService.js /
# MarketingCampaigns.js -- se convierten en las plantillas de fábrica.
_DEFAULT_TEMPLATES = [
    {
        "purpose": "birthday",
        "name": "Cumpleaños",
        "subject": "¡Feliz cumpleaños, {{nombre_cliente}}! 🎂",
        "body": (
            "🎂 ¡Feliz cumpleaños, {{nombre_cliente}}!\n\n"
            "Todo el equipo de {{nombre_negocio}} te desea un día increíble.\n\n"
            "Tienes un regalo esperándote: muestra el código {{codigo_descuento}} "
            "en tu próxima visita (válido hasta {{fecha_expiracion}}).\n\n"
            "Reserva aquí: {{link_reserva}}\n\n¡Que lo disfrutes! 🎉"
        ),
    },
    {
        "purpose": "reactivation",
        "name": "Reactivación",
        "subject": "Te extrañamos, {{nombre_cliente}}",
        "body": (
            "👋 ¡Te extrañamos, {{nombre_cliente}}!\n\n"
            "Hace tiempo que no te vemos por {{nombre_negocio}}. "
            "¿Qué tal si agendamos tu próxima visita?\n\n"
            "Reserva aquí: {{link_reserva}}\n\n¡Te esperamos! ✨"
        ),
    },
    {
        "purpose": "promotion",
        "name": "Promoción general",
        "subject": "Oferta especial de {{nombre_negocio}}",
        "body": (
            "🎉 ¡Oferta especial!\n\nHola {{nombre_cliente}},\n\n"
            "Tenemos algo especial para ti en {{nombre_negocio}}.\n\n"
            "Reserva aquí: {{link_reserva}}\n\n¡No te lo pierdas! ⏰"
        ),
    },
    {
        "purpose": "welcome",
        "name": "Bienvenida",
        "subject": "¡Bienvenido a {{nombre_negocio}}!",
        "body": (
            "👋 ¡Hola {{nombre_cliente}}!\n\n"
            "Gracias por registrarte en {{nombre_negocio}}. "
            "Ya puedes reservar tus citas desde tu portal de cliente.\n\n"
            "Reserva aquí: {{link_reserva}}\n\n¡Te esperamos pronto!"
        ),
    },
    {
        # NEXUS_CLASS_RECURRING_SCHEDULE_V1
        "purpose": "class_rescheduled",
        "name": "Cambio de clase",
        "subject": "Cambio en tu clase de {{nombre_clase}}",
        "body": (
            "Hola {{nombre_cliente}},\n\n"
            "Tu clase de {{nombre_clase}} en {{nombre_negocio}} cambió: ahora es el {{fecha_hora_nueva}}.\n\n"
            "Si no puedes asistir en el nuevo horario, cancela tu cupo desde tu confirmación de reserva."
        ),
    },
    {
        "purpose": "class_cancelled",
        "name": "Clase cancelada",
        "subject": "Tu clase de {{nombre_clase}} fue cancelada",
        "body": (
            "Hola {{nombre_cliente}},\n\n"
            "Tu clase de {{nombre_clase}} en {{nombre_negocio}} del {{fecha_hora_nueva}} fue cancelada.\n\n"
            "Lamentamos el inconveniente -- te esperamos en una próxima clase."
        ),
    },
    {
        # NEXUS_GROUP_SERVICES_MEMBERSHIPS_V1
        "purpose": "membership_expired",
        "name": "Membresía vencida",
        "subject": "Tu membresía {{nombre_plan}} venció",
        "body": (
            "Hola {{nombre_cliente}},\n\n"
            "Tu membresía {{nombre_plan}} en {{nombre_negocio}} venció el {{fecha_vencimiento}}.\n\n"
            "Puedes seguir reservando clases pagando el día, o renovar tu membresía para recuperar tus beneficios -- "
            "contáctanos cuando quieras."
        ),
    },
    {
        # NEXUS_GROUP_SERVICES_WAITLIST_V1
        "purpose": "waitlist_promoted",
        "name": "Cupo liberado (lista de espera)",
        "subject": "¡Conseguiste cupo en {{nombre_clase}}!",
        "body": (
            "Hola {{nombre_cliente}},\n\n"
            "Se liberó un cupo en tu clase de {{nombre_clase}} en {{nombre_negocio}} del {{fecha_hora_nueva}} "
            "y ya quedó reservado para ti -- no necesitas hacer nada más."
        ),
    },
]


async def ensure_message_template_indexes(db):
    await db.message_templates.create_index("template_id", unique=True, name="message_template_id_unique")
    await db.message_templates.create_index(
        [("organization_id", 1), ("channel", 1)], name="message_template_org_channel"
    )


def render_template(body: str, context: dict) -> str:
    """Reemplaza {{variable}} por el valor en context; deja el token intacto
    (con corchetes visibles) si la variable no vino en el contexto, para que
    un error de datos sea obvio en vez de mandar un mensaje a medias."""

    def _sub(match):
        key = match.group(1).strip()
        return str(context.get(key)) if key in context and context.get(key) is not None else match.group(0)

    return re.sub(r"\{\{\s*([a-zA-Z_]+)\s*\}\}", _sub, body or "")


async def get_or_seed_templates(db, organization_id: str) -> list[dict]:
    """Devuelve las plantillas de la organización, sembrando las 4 de
    fábrica la primera vez que se piden (orgs creadas antes de esta feature
    no tienen nada en la colección todavía)."""
    existing = await db.message_templates.find({"organization_id": organization_id}, {"_id": 0}).to_list(200)
    if existing:
        return existing

    now = datetime.now(timezone.utc).isoformat()
    seeded = []
    for tpl in _DEFAULT_TEMPLATES:
        row = {
            "template_id": f"msgtpl_{uuid.uuid4().hex[:16]}",
            "organization_id": organization_id,
            "channel": "email",
            "purpose": tpl["purpose"],
            "name": tpl["name"],
            "subject": tpl["subject"],
            "body": tpl["body"],
            "is_default": True,
            "created_at": now,
            "updated_at": now,
        }
        seeded.append(row)
    try:
        await db.message_templates.insert_many(seeded, ordered=False)
    except Exception:
        # otra request concurrente ya sembró -- devolver lo que haya quedado
        return await db.message_templates.find({"organization_id": organization_id}, {"_id": 0}).to_list(200)
    return seeded
