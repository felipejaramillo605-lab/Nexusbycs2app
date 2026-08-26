"""
Script de migración para corregir total_visits en clientes
Calcula el total_visits real basándose en citas completadas
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def fix_total_visits():
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ['DB_NAME']
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print("🔧 Iniciando corrección de total_visits...")
    
    # Obtener todos los clientes
    clients = await db.clients.find({}, {"_id": 0}).to_list(10000)
    print(f"📊 Encontrados {len(clients)} clientes")
    
    updated_count = 0
    
    for client in clients:
        phone = client.get("phone")
        org_id = client.get("organization_id")
        
        # Contar citas completadas para este cliente
        completed_appointments = await db.appointments.count_documents({
            "customer_phone": phone,
            "organization_id": org_id,
            "status": "completed"
        })
        
        # Actualizar solo si hay diferencia
        current_visits = client.get("total_visits", 0)
        if current_visits != completed_appointments:
            await db.clients.update_one(
                {"client_id": client["client_id"]},
                {"$set": {"total_visits": completed_appointments}}
            )
            print(f"  ✅ {client['name']}: {current_visits} → {completed_appointments} visitas")
            updated_count += 1
    
    print(f"\n✨ Corrección completada: {updated_count} clientes actualizados")
    
    # Close MongoDB connection
    client_connection = client
    client_connection.close()

if __name__ == "__main__":
    asyncio.run(fix_total_visits())
