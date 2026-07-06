"""
Automated Email Reminder Scheduler
Checks for appointments in the next 24 hours and sends reminders
Run this script every hour via cron job
"""
import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

# Add parent directory to path to import email_service
sys.path.insert(0, str(Path(__file__).parent))
from email_service import email_service

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def send_appointment_reminders():
    """
    Find appointments in the next 24 hours and send reminder emails
    """
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
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
    
    client.close()

if __name__ == "__main__":
    print("🚀 Starting Automated Reminder Service...")
    asyncio.run(send_appointment_reminders())
    print("✨ Reminder service completed\n")
