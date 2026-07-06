"""
Email Service for Nexus by CS2
Sends automated notifications using Gmail SMTP
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta
from typing import Optional
from dotenv import load_dotenv
from pathlib import Path
from urllib.parse import quote

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

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
            
        except Exception as e:
            print(f"Error creating Google Calendar link: {str(e)}")
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
            
            print(f"✅ Email sent to {to_email}: {subject}")
            return True
            
        except Exception as e:
            print(f"❌ Error sending email to {to_email}: {str(e)}")
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
        organization_address: Optional[str] = None
    ) -> bool:
        """Send appointment confirmation email"""
        subject = f"✅ Cita Confirmada - {organization_name}"
        
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
                    <p style="font-size: 18px; color: #fff;">Hola <strong>{customer_name}</strong>,</p>
                    <p style="color: #aaa;">Tu cita ha sido confirmada exitosamente. Te esperamos en:</p>
                    
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
                            <span class="label">👨‍💼 Barbero</span>
                            <span class="value">{barber_name}</span>
                        </div>
                        {f'<div class="info-row"><span class="label">📍 Dirección</span><span class="value">{organization_address}</span></div>' if organization_address else ''}
                    </div>
                    
                    {f'<div style="text-align: center;"><a href="{google_calendar_link}" class="calendar-btn" target="_blank">📅 Agregar a Google Calendar</a></div>' if google_calendar_link else ''}
                    
                    <p style="color: #aaa; margin-top: 30px;">Te enviaremos un recordatorio 24 horas antes de tu cita.</p>
                    <p style="color: #aaa;">Si necesitas cancelar o reagendar, por favor contáctanos con anticipación.</p>
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

# Singleton instance
email_service = EmailService()
