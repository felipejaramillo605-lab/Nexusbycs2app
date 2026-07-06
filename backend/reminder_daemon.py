"""
🤖 DAEMON DE RECORDATORIOS AUTOMÁTICOS
Servicio que se ejecuta continuamente y envía recordatorios cada hora
Administrado por Supervisor
"""
import asyncio
import os
import sys
import signal
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))
from email_service import email_service

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Control flag for graceful shutdown
running = True

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    global running
    print(f"\n⚠️  Señal de apagado recibida ({signum}). Finalizando...")
    running = False

# Register signal handlers
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

async def send_appointment_reminders():
    """
    Find appointments in the next 24 hours and send reminder emails
    """
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    try:
        # Calculate tomorrow's date range
        now = datetime.now(timezone.utc)
        tomorrow_start = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        
        tomorrow_date = tomorrow_start.strftime("%Y-%m-%d")
        
        print(f"\n🔍 Checking for appointments on {tomorrow_date}...")
        
        # Find appointments for tomorrow that haven't been reminded
        appointments = await db.appointments.find({
            "date": tomorrow_date,
            "status": {"$in": ["confirmed", "pending"]},
            "reminder_sent": {"$ne": True}
        }, {"_id": 0}).to_list(1000)
        
        print(f"📧 Found {len(appointments)} appointments to remind")
        
        if len(appointments) == 0:
            print("✅ No hay recordatorios pendientes por enviar")
            return
        
        sent_count = 0
        failed_count = 0
        
        for appointment in appointments:
            # Skip if no email
            if not appointment.get("client_email"):
                print(f"⏭️  Skipping {appointment['appointment_id']} - No email")
                continue
            
            try:
                # Get related data
                organization = await db.organizations.find_one(
                    {"organization_id": appointment["organization_id"]}, 
                    {"_id": 0}
                )
                
                barber = await db.barbers.find_one(
                    {"barber_id": appointment["barber_id"]}, 
                    {"_id": 0}
                )
                
                service = await db.services.find_one(
                    {"service_id": appointment["service_id"]}, 
                    {"_id": 0}
                )
                
                # Send reminder email
                success = email_service.send_appointment_reminder(
                    to_email=appointment["client_email"],
                    customer_name=appointment.get("client_name", "Cliente"),
                    barber_name=barber.get("name", "Barbero") if barber else "Barbero",
                    service_name=service.get("name", "Servicio") if service else "Servicio",
                    date=appointment["date"],
                    time=appointment["time"],
                    organization_name=organization.get("name", "Nexus") if organization else "Nexus",
                    organization_phone=organization.get("phone") if organization else None
                )
                
                if success:
                    # Mark as reminded
                    await db.appointments.update_one(
                        {"appointment_id": appointment["appointment_id"]},
                        {"$set": {"reminder_sent": True, "reminder_sent_at": now.isoformat()}}
                    )
                    sent_count += 1
                    print(f"✅ Reminder sent: {appointment['client_email']}")
                else:
                    failed_count += 1
                    print(f"❌ Failed to send: {appointment['client_email']}")
                    
            except Exception as e:
                failed_count += 1
                print(f"❌ Error processing {appointment['appointment_id']}: {str(e)}")
        
        print("\n📊 Summary:")
        print(f"   ✅ Sent: {sent_count}")
        print(f"   ❌ Failed: {failed_count}")
        print(f"   ⏭️  Skipped: {len(appointments) - sent_count - failed_count}")
        
    finally:
        client.close()

async def run_daemon():
    """Main daemon loop - runs every hour"""
    global running
    
    print("="*60)
    print("🤖 DAEMON DE RECORDATORIOS INICIADO")
    print("="*60)
    print(f"⏰ Hora de inicio: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("🔄 Frecuencia: Cada 1 hora")
    print(f"📧 SMTP: {os.environ.get('SMTP_USER', 'No configurado')}")
    print("="*60 + "\n")
    
    while running:
        try:
            print("\n" + "="*60)
            print(f"⏰ Ejecutando ciclo de recordatorios - {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
            print("="*60)
            
            await send_appointment_reminders()
            
            if not running:
                break
            
            print(f"\n💤 Próximo ciclo en 1 hora (esperando hasta {(datetime.now(timezone.utc) + timedelta(hours=1)).strftime('%H:%M UTC')})")
            print("="*60)
            
            # Wait 1 hour (checking every 10 seconds for shutdown signal)
            for _ in range(360):  # 360 * 10 seconds = 1 hour
                if not running:
                    break
                await asyncio.sleep(10)
            
        except Exception as e:
            print(f"❌ Error en el daemon: {str(e)}")
            if running:
                print("⏳ Reintentando en 5 minutos...")
                await asyncio.sleep(300)  # Wait 5 minutes before retry
    
    print("\n" + "="*60)
    print("🛑 DAEMON DE RECORDATORIOS DETENIDO")
    print(f"⏰ Hora de parada: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("="*60 + "\n")

if __name__ == "__main__":
    try:
        asyncio.run(run_daemon())
    except KeyboardInterrupt:
        print("\n⚠️  Daemon interrumpido por el usuario")
    except Exception as e:
        print(f"\n❌ Error fatal: {str(e)}")
        sys.exit(1)
