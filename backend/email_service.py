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

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# NEXUS_8A7G1B2B0_SMTP_LOG_PRIVACY_V1
logger = logging.getLogger(__name__)


def recipient_fingerprint(value: str) -> str:
    return hashlib.sha256(str(value or "").strip().lower().encode()).hexdigest()[:16]


def _theme_colors(theme_key: str = 'classic') -> tuple:
    """
    Returns gradient colors for email headers based on client portal theme
    Returns: (start_color, end_color)
    """
    themes = {
        'classic': ('#0a0a0a', '#1a1a1a'),
        'feminine': ('#fdf2f6', '#fbe4ec'),
        'professional': ('#0f172a', '#1e293b'),
        'cyberpunk': ('#0d0221', '#1a0533'),
        'underground': ('#1a1a1a', '#0a0a0a'),
        'neutral': ('#f4f5f7', '#e9eaed'),
    }
    return themes.get(theme_key, themes['classic'])


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
            # Convert time from "10:30 AM" format to 24h format
            time_obj = datetime.strptime(time, "%I:%M %p")
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
        
        # Google Maps link if address exists
        maps_link = ""
        if organization_address:
            maps_url = f"https://www.google.com/maps/search/?api=1&query={quote(organization_address)}"
            maps_link = f'<a href="{maps_url}" style="display:inline-block;margin:10px 0;padding:12px 24px;background:rgba(255,255,255,0.1);color:#fff;text-decoration:none;border-radius:10px;border:1px solid rgba(255,255,255,0.2);">📍 Cómo llegar</a>'
        
        # Contact options
        contact_html = ""
        if whatsapp_link:
            contact_html += f'<a href="{escape(whatsapp_link)}" style="margin-right:10px;color:#34C759;">WhatsApp</a>'
        if phone:
            contact_html += f'<a href="tel:{escape(phone)}" style="color:#0A84FF;">{escape(phone)}</a>'
        if contact_html:
            contact_html = f"<p style='color:#aaa;margin-top:20px;'>¿Necesitas cambiar algo? Contáctanos: {contact_html}</p>"
        
        # Theme colors
        theme_start, theme_end = _theme_colors(theme)
        
        cancellation_html = (
            f'<p style="text-align:center;margin:24px 0;"><a href="{cancellation_url}" '
            f'style="display:inline-block;padding:12px 22px;background:#FF453A;color:#fff;'
            f'text-decoration:none;border-radius:10px;">Ver o cancelar cita</a></p>'
            if cancellation_url else ""
        )
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background-color: #000000; }}
                .container {{ max-width: 600px; margin: 40px auto; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }}
                .header {{ background: linear-gradient(135deg, {theme_start} 0%, {theme_end} 100%); padding: 40px 20px; text-align: center; }}
                .header h1 {{ color: white; margin: 0; font-size: 28px; font-weight: 300; }}
                .content {{ padding: 40px 30px; color: #ffffff; }}
                .info-card {{ background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; margin: 20px 0; }}
                .info-row {{ display: flex; justify-content: space-between; margin: 12px 0; padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }}
                .info-row:last-child {{ border-bottom: none; }}
                .label {{ color: #888; font-size: 14px; }}
                .value {{ color: #fff; font-weight: 500; }}
                .calendar-btn {{ display: inline-block; margin: 25px 0; padding: 14px 28px; background: linear-gradient(135deg, #34C759 0%, #30D158 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 500; font-size: 15px; text-align: center; box-shadow: 0 4px 12px rgba(52, 199, 89, 0.3); }}
                .calendar-btn:hover {{ background: linear-gradient(135deg, #30D158 0%, #34C759 100%); }}
                .footer {{ padding: 30px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.1); }}
                .emoji {{ font-size: 48px; margin: 20px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="emoji">✨</div>
                    <h1>¡Cita Confirmada!</h1>
                </div>
                <div class="content">
                    <p style="font-size: 18px; color: #fff;">{greeting}</p>
                    
                    <div class="info-card">
                        <div class="info-row">
                            <span class="label">📅 Fecha</span>
                            <span class="value">{date}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">🕐 Hora</span>
                            <span class="value">{time}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">✂️ Servicio</span>
                            <span class="value">{service_name}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">👤 Profesional</span>
                            <span class="value">{barber_name}</span>
                        </div>
                        {f'<div class="info-row"><span class="label">📍 Dirección</span><span class="value">{escape(organization_address)}</span></div>' if organization_address else ''}
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="{google_calendar_link}" class="calendar-btn">📅 Agregar a Google Calendar</a>
                        {maps_link}
                    </div>
                    
                    {cancellation_html}
                    {contact_html}
                    
                    <p style="color: #aaa; margin-top: 30px; font-size: 14px;">
                        💡 <strong>Recomendación:</strong> Te sugerimos llegar 5 minutos antes de tu cita.
                    </p>
                </div>
                <div class="footer">
                    <p>{organization_name}</p>
                    <p style="margin-top: 8px; color: #444;">Este es un mensaje automático, por favor no respondas a este correo.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
        ¡Cita Confirmada!
        
        Hola {customer_name},
        
        Tu cita ha sido confirmada:
        
        Fecha: {date}
        Hora: {time}
        Servicio: {service_name}
        Barbero: {barber_name}
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
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background-color: #000000; }}
                .container {{ max-width: 600px; margin: 40px auto; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }}
                .header {{ background: linear-gradient(135deg, #FF9500 0%, #FF6B00 100%); padding: 40px 20px; text-align: center; }}
                .header h1 {{ color: white; margin: 0; font-size: 28px; font-weight: 300; }}
                .content {{ padding: 40px 30px; color: #ffffff; }}
                .reminder-box {{ background: rgba(255,149,0,0.1); border-left: 4px solid #FF9500; padding: 20px; margin: 20px 0; border-radius: 8px; }}
                .info-card {{ background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; margin: 20px 0; }}
                .footer {{ padding: 30px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.1); }}
                .emoji {{ font-size: 48px; margin: 20px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="emoji">⏰</div>
                    <h1>Recordatorio de Cita</h1>
                </div>
                <div class="content">
                    <p style="font-size: 18px; color: #fff;">Hola <strong>{customer_name}</strong>,</p>
                    
                    <div class="reminder-box">
                        <p style="margin: 0; color: #FF9500; font-size: 16px; font-weight: 500;">
                            ⚠️ Tu cita es mañana a las {time}
                        </p>
                    </div>
                    
                    <div class="info-card">
                        <p style="margin: 0 0 10px 0; color: #aaa;">Detalles de tu cita:</p>
                        <p style="margin: 8px 0;"><strong>📅 {date}</strong> a las <strong>🕐 {time}</strong></p>
                        <p style="margin: 8px 0;">✂️ {service_name}</p>
                        <p style="margin: 8px 0;">👨‍💼 {barber_name}</p>
                        {f'<p style="margin: 8px 0;">📞 {organization_phone}</p>' if organization_phone else ''}
                    </div>
                    
                    <p style="color: #aaa; margin-top: 30px;">¡Te esperamos! Si no puedes asistir, por favor avísanos con anticipación.</p>
                </div>
                <div class="footer">
                    <p><strong>{organization_name}</strong></p>
                    <p>Este es un email automático, por favor no respondas a este mensaje.</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        text_body = f"""
        Recordatorio de Cita
        
        Hola {customer_name},
        
        Tu cita es mañana:
        
        Fecha: {date}
        Hora: {time}
        Servicio: {service_name}
        Barbero: {barber_name}
        
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
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background-color: #000000; }}
                .container {{ max-width: 600px; margin: 40px auto; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }}
                .header {{ background: linear-gradient(135deg, #FF3B30 0%, #D32F2F 100%); padding: 40px 20px; text-align: center; }}
                .header h1 {{ color: white; margin: 0; font-size: 28px; font-weight: 300; }}
                .content {{ padding: 40px 30px; color: #ffffff; }}
                .footer {{ padding: 30px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.1); }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Cita Cancelada</h1>
                </div>
                <div class="content">
                    <p style="font-size: 18px; color: #fff;">Hola <strong>{customer_name}</strong>,</p>
                    <p style="color: #aaa;">Tu cita del <strong>{date}</strong> a las <strong>{time}</strong> ha sido cancelada.</p>
                    <p style="color: #aaa; margin-top: 30px;">Si deseas agendar una nueva cita, estaremos encantados de atenderte.</p>
                </div>
                <div class="footer">
                    <p><strong>{organization_name}</strong></p>
                </div>
            </div>
        </body>
        </html>
        """
        
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
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background-color: #000000; }}
                .container {{ max-width: 600px; margin: 40px auto; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }}
                .header {{ background: linear-gradient(135deg, #32D74B 0%, #28A745 100%); padding: 40px 20px; text-align: center; }}
                .header h1 {{ color: white; margin: 0; font-size: 28px; font-weight: 300; }}
                .content {{ padding: 40px 30px; color: #ffffff; }}
                .footer {{ padding: 30px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.1); }}
                .emoji {{ font-size: 48px; margin: 20px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="emoji">⭐</div>
                    <h1>¡Gracias por tu visita!</h1>
                </div>
                <div class="content">
                    <p style="font-size: 18px; color: #fff;">Hola <strong>{customer_name}</strong>,</p>
                    <p style="color: #aaa;">Esperamos que hayas disfrutado tu experiencia del <strong>{date}</strong>.</p>
                    <p style="color: #aaa; margin-top: 20px;">Tu satisfacción es nuestra prioridad. ¡Esperamos verte pronto!</p>
                    <p style="color: #aaa; margin-top: 20px;">Si deseas agendar una nueva cita, estaremos encantados de atenderte.</p>
                </div>
                <div class="footer">
                    <p><strong>{organization_name}</strong></p>
                </div>
            </div>
        </body>
        </html>
        """
        
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

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background-color: #000000; }}
                .container {{ max-width: 600px; margin: 40px auto; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }}
                .header {{ background: linear-gradient(135deg, #E1306C 0%, #C13584 100%); padding: 40px 20px; text-align: center; }}
                .header h1 {{ color: white; margin: 0; font-size: 26px; font-weight: 300; }}
                .content {{ padding: 40px 30px; color: #ffffff; text-align: center; }}
                .cta {{ display: inline-block; margin-top: 24px; padding: 14px 32px; background: linear-gradient(135deg, #E1306C 0%, #C13584 100%); color: white; text-decoration: none; border-radius: 999px; font-weight: 500; }}
                .footer {{ padding: 30px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.1); }}
                .emoji {{ font-size: 48px; margin: 20px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="emoji">⭐</div>
                    <h1>¿Cómo estuvo tu visita?</h1>
                </div>
                <div class="content">
                    <p style="font-size: 18px; color: #fff;">Hola <strong>{customer_name}</strong>,</p>
                    <p style="color: #aaa;">Tu opinión nos ayuda muchísimo. ¿Nos regalas un minuto para dejarnos una reseña en Instagram?</p>
                    <a href="{safe_link}" class="cta" target="_blank" rel="noopener noreferrer">Dejar reseña en Instagram</a>
                </div>
                <div class="footer">
                    <p><strong>{organization_name}</strong></p>
                </div>
            </div>
        </body>
        </html>
        """

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
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background-color: #000000; }}
                .container {{ max-width: 600px; margin: 40px auto; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }}
                .header {{ background: linear-gradient(135deg, #0A84FF 0%, #0071E3 100%); padding: 30px 20px; text-align: center; }}
                .header h1 {{ color: white; margin: 0; font-size: 24px; font-weight: 300; }}
                .content {{ padding: 30px; color: #ffffff; }}
                .info-card {{ background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 20px; margin: 20px 0; }}
                .footer {{ padding: 20px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.1); }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔔 Nueva Reserva Recibida</h1>
                </div>
                <div class="content">
                    <div class="info-card">
                        <p style="margin: 8px 0;"><strong>Cliente:</strong> {customer_name}</p>
                        <p style="margin: 8px 0;"><strong>Teléfono:</strong> {customer_phone}</p>
                        <p style="margin: 8px 0;"><strong>Servicio:</strong> {service_name}</p>
                        <p style="margin: 8px 0;"><strong>Barbero:</strong> {barber_name}</p>
                        <p style="margin: 8px 0;"><strong>Fecha:</strong> {date}</p>
                        <p style="margin: 8px 0;"><strong>Hora:</strong> {time}</p>
                    </div>
                    <p style="color: #aaa; margin-top: 20px; font-size: 14px;">Revisa tu dashboard para más detalles.</p>
                </div>
                <div class="footer">
                    <p><strong>{organization_name}</strong></p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self._send_email(admin_email, subject, html_body)

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
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <body style="margin:0;background:#080808;color:#f5f5f5;font-family:Arial,sans-serif;">
          <div style="max-width:600px;margin:32px auto;padding:32px;background:#151515;border:1px solid #2a2a2a;border-radius:20px;">
            <h1 style="margin:0 0 16px;font-size:28px;font-weight:500;">Únete a {safe_org}</h1>
            <p style="color:#b7b7b7;line-height:1.6;">{safe_inviter} te invitó a Nexus by CS2 con el rol <strong style="color:#fff;">{safe_role}</strong>.</p>
            <p style="color:#b7b7b7;line-height:1.6;">Completa tu registro, crea tu contraseña y configura tus datos personales.</p>
            <p style="margin:28px 0;"><a href="{safe_url}" style="display:inline-block;padding:14px 22px;background:#0A84FF;color:#fff;text-decoration:none;border-radius:12px;font-weight:600;">Aceptar invitación</a></p>
            <p style="color:#777;font-size:13px;">Este enlace vence en {expires_days} días y solo puede utilizarse una vez.</p>
          </div>
        </body>
        </html>
        """
        text_body = f"""{inviter_name} te invitó a unirte a {organization_name} como {role}.

Completa tu registro aquí: {invitation_url}

El enlace vence en {expires_days} días y solo puede utilizarse una vez."""
        return self._send_email(to_email, subject, html_body, text_body)

    def send_password_reset(self, to_email: str, user_name: str, reset_url: str) -> bool:
        """Send a one-time password reset link."""
        safe_name = escape(user_name)
        safe_url = escape(reset_url, quote=True)
        subject = "Restablece tu contraseña de Nexus by CS2"
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <body style="margin:0;background:#080808;color:#f5f5f5;font-family:Arial,sans-serif;">
          <div style="max-width:600px;margin:32px auto;padding:32px;background:#151515;border:1px solid #2a2a2a;border-radius:20px;">
            <h1 style="margin:0 0 16px;font-size:28px;font-weight:500;">Restablecer contraseña</h1>
            <p style="color:#b7b7b7;line-height:1.6;">Hola {safe_name}. Recibimos una solicitud para restablecer tu contraseña.</p>
            <p style="margin:28px 0;"><a href="{safe_url}" style="display:inline-block;padding:14px 22px;background:#0A84FF;color:#fff;text-decoration:none;border-radius:12px;font-weight:600;">Crear nueva contraseña</a></p>
            <p style="color:#777;font-size:13px;">El enlace vence en una hora y solo puede utilizarse una vez. Si no solicitaste el cambio, ignora este correo.</p>
          </div>
        </body>
        </html>
        """
        text_body = f"""Hola {user_name}. Usa este enlace para restablecer tu contraseña:

{reset_url}

El enlace vence en una hora y solo puede utilizarse una vez."""
        return self._send_email(to_email, subject, html_body, text_body)

    def send_password_changed(self, to_email: str, user_name: str) -> bool:
        """Notify a user after a successful password change."""
        safe_name = escape(user_name)
        subject = "Tu contraseña de Nexus by CS2 fue actualizada"
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <body style="margin:0;background:#080808;color:#f5f5f5;font-family:Arial,sans-serif;">
          <div style="max-width:600px;margin:32px auto;padding:32px;background:#151515;border:1px solid #2a2a2a;border-radius:20px;">
            <h1 style="margin:0 0 16px;font-size:26px;font-weight:500;">Contraseña actualizada</h1>
            <p style="color:#b7b7b7;line-height:1.6;">Hola {safe_name}. Tu contraseña fue actualizada correctamente y las sesiones anteriores fueron cerradas.</p>
            <p style="color:#777;font-size:13px;">Si no realizaste este cambio, contacta al administrador de tu organización.</p>
          </div>
        </body>
        </html>
        """
        return self._send_email(to_email, subject, html_body)

    def send_pin_reset(self, to_email: str, customer_name: str, reset_url: str) -> bool:
        """Send PIN reset link to client (Client Portal)"""
        safe_name = escape(customer_name)
        safe_url = escape(reset_url, quote=True)
        subject = "Restablece tu PIN - Portal de Clientes Nexus"
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background-color: #000000; }}
                .container {{ max-width: 600px; margin: 40px auto; background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); }}
                .header {{ background: linear-gradient(135deg, #0A84FF 0%, #0071E3 100%); padding: 40px 20px; text-align: center; }}
                .header h1 {{ color: white; margin: 0; font-size: 28px; font-weight: 300; }}
                .content {{ padding: 40px 30px; color: #ffffff; }}
                .button {{ display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #0A84FF 0%, #0071E3 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: 500; margin: 20px 0; }}
                .footer {{ padding: 30px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.1); }}
                .emoji {{ font-size: 48px; margin: 20px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="emoji">🔐</div>
                    <h1>Restablecer PIN</h1>
                </div>
                <div class="content">
                    <p style="font-size: 18px; color: #fff;">Hola <strong>{safe_name}</strong>,</p>
                    <p style="color: #aaa;">Recibimos una solicitud para restablecer tu PIN del Portal de Clientes.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{safe_url}" class="button">Crear Nuevo PIN</a>
                    </div>
                    
                    <p style="color: #aaa; font-size: 14px;">Este enlace es válido por <strong>1 hora</strong> y solo puede usarse una vez.</p>
                    <p style="color: #777; font-size: 13px; margin-top: 30px;">Si no solicitaste este cambio, ignora este correo. Tu PIN actual sigue siendo válido.</p>
                </div>
                <div class="footer">
                    <p><strong>Nexus by CS2</strong> - Portal de Clientes</p>
                    <p>Este es un email automático, por favor no respondas a este mensaje.</p>
                </div>
            </div>
        </body>
        </html>
        """
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
