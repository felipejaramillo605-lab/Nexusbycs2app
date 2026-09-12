"""
Email Service for Nexus by CS2
Sends automated notifications using Gmail SMTP
"""
import os
import hashlib
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv
from pathlib import Path
from urllib.parse import quote
from html import escape

# NEXUS_EMAIL_LIQUID_GLASS_V1: shell claro compartido por todos los correos --
# reemplaza el fondo negro/gradiente oscuro que tenía cada método aquí abajo.
from appointment_email_templates import (
    DEFAULT_ACCENT,
    render_alert_box,
    render_button,
    render_email_shell,
    resolve_accent_color,
)

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# NEXUS_8A7G1B2B0_SMTP_LOG_PRIVACY_V1
logger = logging.getLogger(__name__)


def recipient_fingerprint(value: str) -> str:
    return hashlib.sha256(str(value or "").strip().lower().encode()).hexdigest()[:16]


class EmailService:
    def __init__(self):
        self.smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        self.smtp_user = os.environ.get('SMTP_USER', 'nexusbycs2@gmail.com')
        self.smtp_password = os.environ.get('SMTP_PASSWORD', '')
        self.from_email = os.environ.get('SMTP_FROM_EMAIL', 'nexusbycs2@gmail.com')
        self.from_name = os.environ.get('SMTP_FROM_NAME', 'Nexus by CS2')
    
    def _create_google_calendar_link(
        self, 
        title: str, 
        date: str, 
        time: str, 
        duration_minutes: int = 60,
        description: str = "",
        location: str = ""
    ) -> str:
        """
        Creates a Google Calendar event link
        
        Args:
            title: Event title
            date: Date in format YYYY-MM-DD
            time: Time in format HH:MM AM/PM
            duration_minutes: Duration of appointment in minutes (default 60)
            description: Event description
            location: Event location
            
        Returns:
            Google Calendar URL
        """
        try:
            # Parse date and time
            # NEXUS_CALENDAR_LINK_TIME_FORMAT_FIX_V1
            # Backend availability genera slots en 24h ("14:30"). Aceptamos
            # también el legado 12h ("2:30 PM") por compatibilidad y a prueba
            # de fallos si algún flujo aún envía el formato con AM/PM.
            time_str = (time or "").strip()
            time_obj = None
            for fmt in ("%H:%M", "%I:%M %p", "%I:%M%p"):
                try:
                    time_obj = datetime.strptime(time_str, fmt)
                    break
                except ValueError:
                    continue
            if time_obj is None:
                raise ValueError(f"unsupported_time_format")
            date_obj = datetime.strptime(date, "%Y-%m-%d")
            
            # Combine date and time
            start_datetime = datetime.combine(date_obj.date(), time_obj.time())
            end_datetime = start_datetime + timedelta(minutes=duration_minutes)
            
            # Format for Google Calendar (yyyyMMddTHHmmss)
            start_str = start_datetime.strftime("%Y%m%dT%H%M%S")
            end_str = end_datetime.strftime("%Y%m%dT%H%M%S")
            
            # URL encode parameters
            title_encoded = quote(title)
            description_encoded = quote(description)
            location_encoded = quote(location)
            
            # Build Google Calendar URL
            calendar_url = (
                f"https://calendar.google.com/calendar/render?"
                f"action=TEMPLATE"
                f"&text={title_encoded}"
                f"&dates={start_str}/{end_str}"
                f"&details={description_encoded}"
                f"&location={location_encoded}"
            )
            
            return calendar_url
            
        except Exception as exc:
            logger.warning(
                "calendar_link_failed diagnostic_code=%s",
                type(exc).__name__,
            )
            return ""

    # NEXUS_OUTLOOK_CALENDAR_LINK_V1
    def _create_outlook_calendar_link(
        self,
        title: str,
        date: str,
        time: str,
        duration_minutes: int = 60,
        description: str = "",
        location: str = "",
    ) -> str:
        """Creates a Microsoft Outlook Calendar deeplink (funciona con
        cuentas Microsoft personales y Office 365 autenticadas)."""
        try:
            time_str = (time or "").strip()
            time_obj = None
            for fmt in ("%H:%M", "%I:%M %p", "%I:%M%p"):
                try:
                    time_obj = datetime.strptime(time_str, fmt)
                    break
                except ValueError:
                    continue
            if time_obj is None:
                raise ValueError("unsupported_time_format")
            date_obj = datetime.strptime(date, "%Y-%m-%d")
            start_dt = datetime.combine(date_obj.date(), time_obj.time())
            end_dt = start_dt + timedelta(minutes=duration_minutes)
            # Outlook usa ISO 8601 sin timezone
            start_iso = start_dt.strftime("%Y-%m-%dT%H:%M:%S")
            end_iso = end_dt.strftime("%Y-%m-%dT%H:%M:%S")
            outlook_url = (
                "https://outlook.live.com/calendar/0/deeplink/compose?"
                "path=/calendar/action/compose"
                "&rru=addevent"
                f"&subject={quote(title)}"
                f"&startdt={quote(start_iso)}"
                f"&enddt={quote(end_iso)}"
                f"&body={quote(description)}"
                f"&location={quote(location)}"
            )
            return outlook_url
        except Exception as exc:
            logger.warning(
                "outlook_link_failed diagnostic_code=%s",
                type(exc).__name__,
            )
            return ""
        
    def _send_email(self, to_email: str, subject: str, html_body: str, text_body: Optional[str] = None) -> bool:
        """Send email via SMTP"""
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            
            # Add text and HTML parts
            if text_body:
                part1 = MIMEText(text_body, 'plain', 'utf-8')
                msg.attach(part1)
            
            part2 = MIMEText(html_body, 'html', 'utf-8')
            msg.attach(part2)
            
            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            
            logger.info(
                "email_provider_accepted recipient_fingerprint=%s",
                recipient_fingerprint(to_email),
            )
            return True

        except Exception as exc:
            logger.warning(
                "email_provider_failed recipient_fingerprint=%s diagnostic_code=%s",
                recipient_fingerprint(to_email),
                type(exc).__name__,
            )
            return False
    
    def send_appointment_confirmation(
        self,
        to_email: str,
        customer_name: str,
        barber_name: str,
        service_name: str,
        date: str,
        time: str,
        organization_name: str,
        organization_address: Optional[str] = None,
        cancellation_url: Optional[str] = None,
        theme: str = 'classic',
        total_visits: int = 0,
        whatsapp_link: Optional[str] = None,
        phone: Optional[str] = None
    ) -> bool:
        """Send appointment confirmation email"""
        # Escape all user inputs
        customer_name = escape(customer_name)
        barber_name = escape(barber_name)
        service_name = escape(service_name)
        organization_name = escape(organization_name)
        
        subject = f"✅ Cita Confirmada - {organization_name}"
        
        # Personalized greeting based on visit count
        if total_visits == 0:
            greeting = f"¡Gracias por elegirnos, <strong>{customer_name}</strong>! Esta será tu primera visita y estamos emocionados de recibirte."
        else:
            greeting = f"¡Qué bueno tenerte de vuelta, <strong>{customer_name}</strong>! Siempre es un placer atenderte."
        
        # Create Google Calendar link
        calendar_description = f"Cita para {service_name} con {barber_name} en {organization_name}"
        calendar_location = organization_address or organization_name
        google_calendar_link = self._create_google_calendar_link(
            title=f"{service_name} - {organization_name}",
            date=date,
            time=time,
            duration_minutes=60,
            description=calendar_description,
            location=calendar_location
        )
        # NEXUS_OUTLOOK_CALENDAR_LINK_V1
        outlook_calendar_link = self._create_outlook_calendar_link(
            title=f"{service_name} - {organization_name}",
            date=date,
            time=time,
            duration_minutes=60,
            description=calendar_description,
            location=calendar_location,
        )
        
        # Google Maps link if address exists
        maps_link = ""
        if organization_address:
            maps_url = f"https://www.google.com/maps/search/?api=1&query={quote(organization_address)}"
            maps_link = render_button("📍 Cómo llegar", maps_url, color="#475569")

        # Contact options
        contact_html = ""
        if whatsapp_link:
            contact_html += f'<a href="{escape(whatsapp_link)}" style="margin-right:12px;color:#22A559;text-decoration:none;font-weight:600;">WhatsApp</a>'
        if phone:
            contact_html += f'<a href="tel:{escape(phone)}" style="color:#1D4ED8;text-decoration:none;font-weight:600;">{escape(phone)}</a>'
        if contact_html:
            contact_html = f"<p style='color:#667085;margin-top:20px;font-size:14px;'>¿Necesitas cambiar algo? Contáctanos: {contact_html}</p>"

        accent = resolve_accent_color(theme)

        cancellation_html = (
            render_button("Ver o cancelar cita", cancellation_url, color="#DC2626")
            if cancellation_url else ""
        )
        rows_html = "".join(
            f'<tr><td style="padding:10px 0;font-family:Arial,sans-serif;font-size:14px;color:#667085;border-bottom:1px solid #EEF1F6;">{label}</td>'
            f'<td align="right" style="padding:10px 0;font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #EEF1F6;">{value}</td></tr>'
            for label, value in [
                ("📅 Fecha", date), ("🕐 Hora", time), ("✂️ Servicio", service_name), ("👤 Profesional", barber_name),
            ] + ([("📍 Dirección", escape(organization_address))] if organization_address else [])
        )
        body_html = f"""
            <p style="font-size:16px;line-height:24px;margin:0 0 16px;">{greeting}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                style="background:#F8FAFC;border:1px solid #EEF1F6;border-radius:14px;padding:6px 18px;margin:16px 0;">
                {rows_html}
            </table>
            <div style="text-align:center;margin:20px 0 4px;">
                {render_button("📅 Google Calendar", google_calendar_link, color="#22A559") if google_calendar_link else ''}
                {render_button("📆 Outlook Calendar", outlook_calendar_link, color="#1D4ED8") if outlook_calendar_link else ''}
                {maps_link}
            </div>
            <div style="text-align:center;">{cancellation_html}</div>
            {contact_html}
            <p style="color:#667085;margin-top:24px;font-size:14px;">💡 <strong>Recomendación:</strong> te sugerimos llegar 5 minutos antes de tu cita.</p>
        """
        html_body = render_email_shell(
            organization_name=organization_name, eyebrow="Confirmación", title="✨ ¡Cita confirmada!",
            body_html=body_html, accent_color=accent,
            footer_lines=("Este es un mensaje automático, por favor no respondas a este correo.",),
        )
        
        text_body = f"""
        ¡Cita Confirmada!
        
        Hola {customer_name},
        
        Tu cita ha sido confirmada:
        
        Fecha: {date}
        Hora: {time}
        Servicio: {service_name}
        Profesional: {barber_name}
        {f'Dirección: {organization_address}' if organization_address else ''}
        
        {organization_name}
        """
        
        return self._send_email(to_email, subject, html_body, text_body)
    
    def send_appointment_reminder(
        self,
        to_email: str,
        customer_name: str,
        barber_name: str,
        service_name: str,
        date: str,
        time: str,
        organization_name: str,
        organization_phone: Optional[str] = None
    ) -> bool:
        """Send appointment reminder email (24h before)"""
        # Escape all user inputs
        customer_name = escape(customer_name)
        barber_name = escape(barber_name)
        service_name = escape(service_name)
        organization_name = escape(organization_name)
        if organization_phone:
            organization_phone = escape(organization_phone)
        
        subject = f"🔔 Recordatorio de Cita - {organization_name}"

        body_html = f"""
            <p style="font-size:16px;line-height:24px;margin:0 0 4px;">Hola <strong>{customer_name}</strong>,</p>
            {render_alert_box(f"⚠️ Tu cita es mañana a las {time}", color="#D97706")}
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                style="background:#F8FAFC;border:1px solid #EEF1F6;border-radius:14px;padding:16px 18px;margin:16px 0;">
                <tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#1F2937;padding:4px 0;"><strong>📅 {date}</strong> a las <strong>🕐 {time}</strong></td></tr>
                <tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#1F2937;padding:4px 0;">✂️ {service_name}</td></tr>
                <tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#1F2937;padding:4px 0;">👤 {barber_name}</td></tr>
                {f'<tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#1F2937;padding:4px 0;">📞 {organization_phone}</td></tr>' if organization_phone else ''}
            </table>
            <p style="color:#667085;margin-top:24px;font-size:14px;">¡Te esperamos! Si no puedes asistir, por favor avísanos con anticipación.</p>
        """
        html_body = render_email_shell(
            organization_name=organization_name, eyebrow="Recordatorio", title="⏰ Recordatorio de cita",
            body_html=body_html, accent_color="#D97706",
            footer_lines=("Este es un mensaje automático, por favor no respondas a este correo.",),
        )
        
        text_body = f"""
        Recordatorio de Cita
        
        Hola {customer_name},
        
        Tu cita es mañana:
        
        Fecha: {date}
        Hora: {time}
        Servicio: {service_name}
        Profesional: {barber_name}
        
        ¡Te esperamos!
        
        {organization_name}
        """
        
        return self._send_email(to_email, subject, html_body, text_body)
    
    def send_appointment_cancelled(
        self,
        to_email: str,
        customer_name: str,
        date: str,
        time: str,
        organization_name: str
    ) -> bool:
        """Send cancellation notification"""
        # Escape all user inputs
        customer_name = escape(customer_name)
        organization_name = escape(organization_name)
        
        subject = f"❌ Cita Cancelada - {organization_name}"

        body_html = f"""
            <p style="font-size:16px;line-height:24px;margin:0 0 12px;">Hola <strong>{customer_name}</strong>,</p>
            <p style="color:#667085;font-size:14px;line-height:22px;">Tu cita del <strong style="color:#1F2937;">{date}</strong> a las <strong style="color:#1F2937;">{time}</strong> ha sido cancelada.</p>
            <p style="color:#667085;margin-top:20px;font-size:14px;">Si deseas agendar una nueva cita, estaremos encantados de atenderte.</p>
        """
        html_body = render_email_shell(
            organization_name=organization_name, eyebrow="Cancelación", title="Cita cancelada",
            body_html=body_html, accent_color="#DC2626",
        )

        return self._send_email(to_email, subject, html_body)

    def send_appointment_completed(
        self,
        to_email: str,
        customer_name: str,
        organization_name: str,
        date: str,
        service_name: str
    ) -> bool:
        """Send thank you email after completed appointment"""
        # Escape all user inputs
        customer_name = escape(customer_name)
        organization_name = escape(organization_name)
        service_name = escape(service_name)
        
        subject = f"✨ ¡Gracias por tu visita! - {organization_name}"

        body_html = f"""
            <p style="font-size:16px;line-height:24px;margin:0 0 12px;">Hola <strong>{customer_name}</strong>,</p>
            <p style="color:#667085;font-size:14px;line-height:22px;">Esperamos que hayas disfrutado tu experiencia del <strong style="color:#1F2937;">{date}</strong> ({service_name}).</p>
            <p style="color:#667085;margin-top:16px;font-size:14px;">Tu satisfacción es nuestra prioridad. ¡Esperamos verte pronto!</p>
        """
        html_body = render_email_shell(
            organization_name=organization_name, eyebrow="Gracias", title="⭐ ¡Gracias por tu visita!",
            body_html=body_html, accent_color="#22A559",
        )

        return self._send_email(to_email, subject, html_body)

    def send_review_request(
        self,
        to_email: str,
        customer_name: str,
        organization_name: str,
        review_link: str
    ) -> bool:
        """Send review request email, 1h after appointment completion."""
        # Escape all user inputs
        customer_name = escape(customer_name)
        organization_name = escape(organization_name)
        # review_link viene de configuración del manager (no del cliente final),
        # pero igual se valida esquema antes de usarlo como href para evitar
        # inyección de javascript:/data: si algún día se abre a más edición.
        safe_link = review_link if str(review_link).strip().lower().startswith("https://") else None
        if not safe_link:
            logger.warning("review_request_invalid_link_skipped")
            return False

        subject = f"⭐ ¿Cómo estuvo tu visita a {organization_name}?"

        body_html = f"""
            <div style="text-align:center;">
                <p style="font-size:16px;line-height:24px;margin:0 0 8px;">Hola <strong>{customer_name}</strong>,</p>
                <p style="color:#667085;font-size:14px;line-height:22px;">Tu opinión nos ayuda a seguir mejorando y a que más clientes nos encuentren. ¿Nos regalas un minuto para dejarnos una reseña en Google?</p>
                <div style="font-size:28px;letter-spacing:6px;margin:14px 0;">⭐⭐⭐⭐⭐</div>
                {render_button("Calificar en Google", safe_link, color="#1D4ED8")}
                <p style="color:#98A2B3;font-size:12px;margin-top:16px;">Solo te tomará 30 segundos</p>
            </div>
        """
        html_body = render_email_shell(
            organization_name=organization_name, eyebrow="Reseña", title="⭐ ¿Cómo estuvo tu visita?",
            body_html=body_html, accent_color="#1D4ED8",
        )

        return self._send_email(to_email, subject, html_body)

    def send_admin_new_appointment_notification(
        self,
        admin_email: str,
        customer_name: str,
        customer_phone: str,
        service_name: str,
        barber_name: str,
        date: str,
        time: str,
        organization_name: str
    ) -> bool:
        """Notify admin of new appointment"""
        # Escape all user inputs
        customer_name = escape(customer_name)
        customer_phone = escape(customer_phone)
        service_name = escape(service_name)
        barber_name = escape(barber_name)
        organization_name = escape(organization_name)
        
        subject = f"🔔 Nueva Reserva - {organization_name}"

        body_html = f"""
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                style="background:#F8FAFC;border:1px solid #EEF1F6;border-radius:14px;padding:6px 18px;margin:0 0 16px;">
                {"".join(
                    f'<tr><td style="padding:8px 0;font-family:Arial,sans-serif;font-size:13px;color:#667085;border-bottom:1px solid #EEF1F6;">{label}</td>'
                    f'<td align="right" style="padding:8px 0;font-family:Arial,sans-serif;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #EEF1F6;">{value}</td></tr>'
                    for label, value in [
                        ("Cliente", customer_name), ("Teléfono", customer_phone), ("Servicio", service_name),
                        ("Profesional", barber_name), ("Fecha", date), ("Hora", time),
                    ]
                )}
            </table>
            <p style="color:#667085;font-size:14px;">Revisa tu dashboard para más detalles.</p>
        """
        html_body = render_email_shell(
            organization_name=organization_name, eyebrow="Nueva reserva", title="🔔 Nueva reserva recibida",
            body_html=body_html, accent_color=DEFAULT_ACCENT,
        )

        return self._send_email(admin_email, subject, html_body)

    # NEXUS_LOW_STOCK_ALERT_DAEMON_V1
    def send_low_stock_alert_email(self, to_email: str, organization_name: str, items: list) -> bool:
        """Monthly low-stock digest for a manager/owner."""
        organization_name = escape(organization_name)
        top_items = items[:15]
        rows = "".join(
            f"""<tr>
                <td style="padding:9px 12px;border-bottom:1px solid #EEF1F6;font-family:Arial,sans-serif;font-size:13px;color:#1F2937;">{escape(str(item.get('name') or 'Producto'))}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #EEF1F6;text-align:center;font-family:Arial,sans-serif;font-size:13px;color:#1F2937;">{escape(str(item.get('quantity', 0)))} {escape(str(item.get('unit') or ''))}</td>
                <td style="padding:9px 12px;border-bottom:1px solid #EEF1F6;text-align:center;font-family:Arial,sans-serif;font-size:13px;font-weight:600;color:{'#DC2626' if item.get('severity') == 'critical' else '#D97706'};">
                    {'Crítico' if item.get('severity') == 'critical' else 'Bajo'}
                </td>
            </tr>"""
            for item in top_items
        )
        more_note = (
            f"<p style='color:#98A2B3;font-size:13px;'>Y {len(items) - 15} producto(s) más con bajo stock.</p>"
            if len(items) > 15
            else ""
        )
        subject = f"⚠️ Alerta mensual de inventario - {organization_name}"
        body_html = f"""
            <p style="font-size:14px;color:#1F2937;">Estos productos necesitan reabastecimiento en <strong>{organization_name}</strong>:</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-top:8px;">
                <tr>
                    <th style="text-align:left;padding:8px 12px;color:#98A2B3;font-size:11px;text-transform:uppercase;font-family:Arial,sans-serif;">Producto</th>
                    <th style="text-align:center;padding:8px 12px;color:#98A2B3;font-size:11px;text-transform:uppercase;font-family:Arial,sans-serif;">Stock</th>
                    <th style="text-align:center;padding:8px 12px;color:#98A2B3;font-size:11px;text-transform:uppercase;font-family:Arial,sans-serif;">Estado</th>
                </tr>
                {rows}
            </table>
            {more_note}
            <p style="color:#667085;margin-top:20px;font-size:14px;">Genera órdenes de compra desde el módulo de Inventario en Nexus.</p>
        """
        html_body = render_email_shell(
            organization_name=organization_name, eyebrow="Inventario", title="⚠️ Alerta mensual de inventario",
            body_html=body_html, accent_color="#D97706",
            footer_lines=("Alerta enviada automáticamente una vez al mes.",),
        )
        return self._send_email(to_email, subject, html_body)

    def send_team_invitation(
        self,
        to_email: str,
        organization_name: str,
        inviter_name: str,
        role: str,
        invitation_url: str,
        expires_days: int = 7
    ) -> bool:
        """Send a team invitation with a one-time registration link."""
        safe_org = escape(organization_name)
        safe_inviter = escape(inviter_name)
        safe_role = escape(role)
        safe_url = escape(invitation_url, quote=True)
        subject = f"Invitación para unirte a {organization_name}"
        body_html = f"""
            <p style="color:#374151;line-height:1.6;font-size:15px;">{safe_inviter} te invitó a Nexus by CS2 con el rol <strong style="color:#111827;">{safe_role}</strong>.</p>
            <p style="color:#374151;line-height:1.6;font-size:15px;">Completa tu registro, crea tu contraseña y configura tus datos personales.</p>
            <div style="margin:24px 0;">{render_button("Aceptar invitación", safe_url)}</div>
            <p style="color:#98A2B3;font-size:13px;">Este enlace vence en {expires_days} días y solo puede utilizarse una vez.</p>
        """
        html_body = render_email_shell(
            organization_name=organization_name, eyebrow="Invitación", title=f"Únete a {safe_org}",
            body_html=body_html, accent_color=DEFAULT_ACCENT,
        )
        text_body = f"""{inviter_name} te invitó a unirte a {organization_name} como {role}.

Completa tu registro aquí: {invitation_url}

El enlace vence en {expires_days} días y solo puede utilizarse una vez."""
        return self._send_email(to_email, subject, html_body, text_body)

    def send_password_reset(self, to_email: str, user_name: str, reset_url: str) -> bool:
        """Send a one-time password reset link."""
        safe_name = escape(user_name)
        safe_url = escape(reset_url, quote=True)
        subject = "Restablece tu contraseña de Nexus by CS2"
        body_html = f"""
            <p style="color:#374151;line-height:1.6;font-size:15px;">Hola {safe_name}. Recibimos una solicitud para restablecer tu contraseña.</p>
            <div style="margin:24px 0;">{render_button("Crear nueva contraseña", safe_url)}</div>
            <p style="color:#98A2B3;font-size:13px;">El enlace vence en una hora y solo puede utilizarse una vez. Si no solicitaste el cambio, ignora este correo.</p>
        """
        html_body = render_email_shell(
            organization_name="Nexus by CS2", eyebrow="Seguridad", title="Restablecer contraseña",
            body_html=body_html, accent_color=DEFAULT_ACCENT,
        )
        text_body = f"""Hola {user_name}. Usa este enlace para restablecer tu contraseña:

{reset_url}

El enlace vence en una hora y solo puede utilizarse una vez."""
        return self._send_email(to_email, subject, html_body, text_body)

    def send_password_changed(self, to_email: str, user_name: str) -> bool:
        """Notify a user after a successful password change."""
        safe_name = escape(user_name)
        subject = "Tu contraseña de Nexus by CS2 fue actualizada"
        body_html = f"""
            <p style="color:#374151;line-height:1.6;font-size:15px;">Hola {safe_name}. Tu contraseña fue actualizada correctamente y las sesiones anteriores fueron cerradas.</p>
            <p style="color:#98A2B3;font-size:13px;margin-top:16px;">Si no realizaste este cambio, contacta al administrador de tu organización.</p>
        """
        html_body = render_email_shell(
            organization_name="Nexus by CS2", eyebrow="Seguridad", title="Contraseña actualizada",
            body_html=body_html, accent_color="#22A559",
        )
        return self._send_email(to_email, subject, html_body)

    def send_pin_reset(self, to_email: str, customer_name: str, reset_url: str) -> bool:
        """Send PIN reset link to client (Client Portal)"""
        safe_name = escape(customer_name)
        safe_url = escape(reset_url, quote=True)
        subject = "Restablece tu PIN - Portal de Clientes Nexus"
        body_html = f"""
            <p style="font-size:16px;line-height:24px;margin:0 0 12px;">Hola <strong>{safe_name}</strong>,</p>
            <p style="color:#667085;font-size:14px;">Recibimos una solicitud para restablecer tu PIN del Portal de Clientes.</p>
            <div style="text-align:center;margin:24px 0;">{render_button("Crear nuevo PIN", safe_url)}</div>
            <p style="color:#667085;font-size:14px;">Este enlace es válido por <strong>1 hora</strong> y solo puede usarse una vez.</p>
            <p style="color:#98A2B3;font-size:13px;margin-top:20px;">Si no solicitaste este cambio, ignora este correo. Tu PIN actual sigue siendo válido.</p>
        """
        html_body = render_email_shell(
            organization_name="Nexus by CS2", eyebrow="Portal de clientes", title="🔐 Restablecer PIN",
            body_html=body_html, accent_color=DEFAULT_ACCENT,
            footer_lines=("Este es un mensaje automático, por favor no respondas a este correo.",),
        )
        text_body = f"""Hola {customer_name}.

Recibimos una solicitud para restablecer tu PIN del Portal de Clientes.

Usa este enlace para crear un nuevo PIN:
{reset_url}

El enlace vence en 1 hora y solo puede utilizarse una vez.

Si no solicitaste este cambio, ignora este correo.

---
Nexus by CS2 - Portal de Clientes"""
        return self._send_email(to_email, subject, html_body, text_body)

# Singleton instance
email_service = EmailService()
