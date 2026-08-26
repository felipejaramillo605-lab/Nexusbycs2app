#!/usr/bin/env python3
"""
Seed script for Nexus by CS2
Creates initial data for testing in Preview environment
"""
import asyncio
import os
import bcrypt
from uuid import uuid4
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

async def seed_database():
    """Create seed data for testing"""
    mongo_url = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.getenv('DB_NAME', 'barbershop')
    
    print(f"Connecting to: {db_name}")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    now = datetime.now(timezone.utc).isoformat()
    
    # 1. Create Organization
    org_id = "org_demo001"
    existing_org = await db.organizations.find_one({"organization_id": org_id})
    if not existing_org:
        org_doc = {
            "organization_id": org_id,
            "name": "Demo Barbershop",
            "address": "Calle 123 #45-67, Bogotá",
            "phone": "+573001234567",
            "email": "info@demobarbershop.com",
            "created_at": now,
            "updated_at": now
        }
        await db.organizations.insert_one(org_doc)
        print(f"✓ Created organization: {org_id}")
    else:
        print(f"⊙ Organization already exists: {org_id}")
    
    # 2. Create Owner User
    owner_email = "admin@nexus.com"
    existing_owner = await db.users.find_one({"email": owner_email})
    if not existing_owner:
        password_hash = bcrypt.hashpw("admin123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        owner_doc = {
            "user_id": f"user_{uuid4().hex[:12]}",
            "email": owner_email,
            "normalized_email": owner_email.lower(),
            "password_hash": password_hash,
            "auth_method": "manual",
            "name": "Admin User",
            "first_name": "Admin",
            "last_name": "User",
            "role": "owner",
            "access_status": "approved",
            "organization_id": org_id,
            "created_at": now,
            "updated_at": now,
            "last_login": None
        }
        await db.users.insert_one(owner_doc)
        print(f"✓ Created owner user: {owner_email} / admin123")
    else:
        # Update if missing fields
        update_fields = {}
        if not existing_owner.get('auth_method'):
            update_fields['auth_method'] = 'manual'
        if not existing_owner.get('access_status'):
            update_fields['access_status'] = 'approved'
        if not existing_owner.get('normalized_email'):
            update_fields['normalized_email'] = owner_email.lower()
        if not existing_owner.get('name'):
            update_fields['name'] = 'Admin User'
        if not existing_owner.get('organization_id'):
            update_fields['organization_id'] = org_id
            
        if update_fields:
            await db.users.update_one(
                {"email": owner_email},
                {"$set": update_fields}
            )
            print(f"✓ Updated owner user: {owner_email}")
        else:
            print(f"⊙ Owner user already exists: {owner_email}")
    
    # 3. Create Manager User
    manager_email = "manager@nexus.com"
    existing_manager = await db.users.find_one({"email": manager_email})
    if not existing_manager:
        password_hash = bcrypt.hashpw("manager123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        manager_doc = {
            "user_id": f"user_{uuid4().hex[:12]}",
            "email": manager_email,
            "normalized_email": manager_email.lower(),
            "password_hash": password_hash,
            "auth_method": "manual",
            "name": "Manager User",
            "first_name": "Manager",
            "last_name": "User",
            "role": "manager",
            "access_status": "approved",
            "organization_id": org_id,
            "created_at": now,
            "updated_at": now,
            "last_login": None
        }
        await db.users.insert_one(manager_doc)
        print(f"✓ Created manager user: {manager_email} / manager123")
    else:
        print(f"⊙ Manager user already exists: {manager_email}")
    
    # 4. Create sample services
    services_to_create = [
        {"name": "Corte Clásico", "duration": 30, "price": 25000},
        {"name": "Corte + Barba", "duration": 45, "price": 35000},
        {"name": "Afeitado", "duration": 20, "price": 15000}
    ]
    
    for service_data in services_to_create:
        existing_service = await db.services.find_one({
            "organization_id": org_id,
            "name": service_data["name"]
        })
        if not existing_service:
            service_doc = {
                "service_id": f"service_{uuid4().hex[:12]}",
                "organization_id": org_id,
                "name": service_data["name"],
                "duration": service_data["duration"],
                "price": service_data["price"],
                "active": True,
                "created_at": now,
                "updated_at": now
            }
            await db.services.insert_one(service_doc)
            print(f"✓ Created service: {service_data['name']}")
        else:
            print(f"⊙ Service already exists: {service_data['name']}")
    
    # 5. Create sample barber
    barber_name = "Carlos Peluquero"
    existing_barber = await db.barbers.find_one({"organization_id": org_id, "name": barber_name})
    if not existing_barber:
        barber_doc = {
            "barber_id": f"barber_{uuid4().hex[:12]}",
            "organization_id": org_id,
            "name": barber_name,
            "display_name": barber_name,
            "first_name": "Carlos",
            "last_name": "Peluquero",
            "user_id": None,
            "phone": None,
            "address": None,
            "bio": None,
            "avatar": None,
            "active": True,
            "available_days": [1, 2, 3, 4, 5],
            "start_time": "09:00",
            "end_time": "18:00",
            "service_ids": [],
            "created_at": now,
            "updated_at": now
        }
        await db.barbers.insert_one(barber_doc)
        print(f"✓ Created barber: {barber_name}")
    else:
        print(f"⊙ Barber already exists: {barber_name}")

    # 6. Summary
    print("\n=== Database Summary ===")
    org_count = await db.organizations.count_documents({})
    user_count = await db.users.count_documents({})
    service_count = await db.services.count_documents({"organization_id": org_id})
    barber_count = await db.barbers.count_documents({"organization_id": org_id})
    
    print(f"Organizations: {org_count}")
    print(f"Users: {user_count}")
    print(f"Services: {service_count}")
    print(f"Barbers: {barber_count}")
    
    print("\n=== Test Credentials ===")
    print("Owner: admin@nexus.com / admin123")
    print("Manager: manager@nexus.com / manager123")
    print("Organization: org_demo001")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_database())
