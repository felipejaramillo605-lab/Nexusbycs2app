from fastapi import FastAPI, APIRouter, HTTPException, Cookie, Response, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
db_name = os.environ['DB_NAME']
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Models
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str = "manager"
    access_status: str = "pending"
    organization_id: Optional[str] = None
    created_at: datetime

class Organization(BaseModel):
    model_config = ConfigDict(extra="ignore")
    organization_id: str
    name: str
    owner_id: str
    created_at: datetime

class Service(BaseModel):
    model_config = ConfigDict(extra="ignore")
    service_id: str
    organization_id: str
    name: str
    duration: int
    price: float
    created_at: datetime

class Barber(BaseModel):
    model_config = ConfigDict(extra="ignore")
    barber_id: str
    organization_id: str
    name: str
    avatar: Optional[str] = None
    available_days: List[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])
    start_time: str = "09:00"
    end_time: str = "18:00"
    created_at: datetime

class Appointment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    appointment_id: str
    organization_id: str
    service_id: str
    barber_id: str
    client_name: str
    client_phone: str
    client_email: str
    date: str
    time: str
    status: str = "confirmed"
    created_at: datetime

class InventoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    item_id: str
    organization_id: str
    name: str
    quantity: int
    min_stock: int
    unit: str
    created_at: datetime

class ServiceCreate(BaseModel):
    name: str
    duration: int
    price: float

class BarberCreate(BaseModel):
    name: str
    avatar: Optional[str] = None
    available_days: Optional[List[int]] = None
    start_time: Optional[str] = "09:00"
    end_time: Optional[str] = "18:00"

class AppointmentCreate(BaseModel):
    service_id: str
    barber_id: str
    client_name: str
    client_phone: str
    client_email: str
    date: str
    time: str

class InventoryCreate(BaseModel):
    name: str
    quantity: int
    min_stock: int
    unit: str

class UserAccessUpdate(BaseModel):
    access_status: str

# Auth Helper
async def get_current_user(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    token = None
    if session_token:
        token = session_token
    elif authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
    
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if isinstance(user["created_at"], str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    
    return User(**user)

# Health check endpoint
@api_router.get("/")
async def root():
    return {"message": "Nexus by CS2 API - Barber Shop Management System", "status": "running"}

# Auth Endpoints
@api_router.post("/auth/session")
async def create_session(response: Response, x_session_id: str = Header(None)):
    if not x_session_id:
        raise HTTPException(status_code=400, detail="Session ID required")
    
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": x_session_id},
                timeout=10.0
            )
            res.raise_for_status()
            session_data = res.json()
        except Exception as e:
            logger.error(f"Failed to get session data: {e}")
            raise HTTPException(status_code=400, detail="Invalid session")
    
    email = session_data["email"]
    name = session_data["name"]
    picture = session_data.get("picture")
    session_token = session_data["session_token"]
    
    user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if not user:
        # Special case: felipejaramillo605@gmail.com is always owner
        is_owner_email = email == "felipejaramillo605@gmail.com"
        user_count = await db.users.count_documents({})
        role = "owner" if (user_count == 0 or is_owner_email) else "manager"
        access_status = "approved" if (role == "owner" or is_owner_email) else "pending"
        
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "role": role,
            "access_status": access_status,
            "organization_id": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_doc)
        user = user_doc
    else:
        user_id = user["user_id"]
    
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.user_sessions.insert_one(session_doc)
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7*24*60*60
    )
    
    if isinstance(user["created_at"], str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    
    return User(**user)

@api_router.get("/auth/me")
async def get_me(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    return user

@api_router.post("/auth/logout")
async def logout(response: Response, session_token: Optional[str] = Cookie(None)):
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out"}

# Owner Endpoints
@api_router.get("/owner/users")
async def get_all_users(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Access denied")
    
    users = await db.users.find({}, {"_id": 0}).to_list(1000)
    for user in users:
        if isinstance(user["created_at"], str):
            user["created_at"] = datetime.fromisoformat(user["created_at"])
    return users

@api_router.put("/owner/users/{user_id}/access")
async def update_user_access(user_id: str, data: UserAccessUpdate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"access_status": data.access_status}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "Access updated"}

@api_router.delete("/owner/users/{user_id}")
async def delete_user(user_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.users.delete_one({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    return {"message": "User deleted"}

# Organization Endpoints
@api_router.get("/organizations")
async def get_organizations(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if current_user.role == "owner":
        orgs = await db.organizations.find({}, {"_id": 0}).to_list(1000)
    else:
        if not current_user.organization_id:
            return []
        org = await db.organizations.find_one({"organization_id": current_user.organization_id}, {"_id": 0})
        orgs = [org] if org else []
    
    for org in orgs:
        if isinstance(org["created_at"], str):
            org["created_at"] = datetime.fromisoformat(org["created_at"])
    
    return orgs

@api_router.post("/organizations")
async def create_organization(name: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if current_user.access_status != "approved":
        raise HTTPException(status_code=403, detail="Account pending approval")
    
    org_id = f"org_{uuid.uuid4().hex[:12]}"
    org_doc = {
        "organization_id": org_id,
        "name": name,
        "owner_id": current_user.user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.organizations.insert_one(org_doc)
    
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": {"organization_id": org_id}}
    )
    
    org_doc["created_at"] = datetime.fromisoformat(org_doc["created_at"])
    return Organization(**org_doc)

# Services Endpoints
@api_router.get("/services")
async def get_services(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    services = await db.services.find({"organization_id": current_user.organization_id}, {"_id": 0}).to_list(1000)
    for service in services:
        if isinstance(service["created_at"], str):
            service["created_at"] = datetime.fromisoformat(service["created_at"])
    return services

@api_router.post("/services")
async def create_service(data: ServiceCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    service_id = f"service_{uuid.uuid4().hex[:12]}"
    service_doc = {
        "service_id": service_id,
        "organization_id": current_user.organization_id,
        "name": data.name,
        "duration": data.duration,
        "price": data.price,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.services.insert_one(service_doc)
    service_doc["created_at"] = datetime.fromisoformat(service_doc["created_at"])
    return Service(**service_doc)

@api_router.delete("/services/{service_id}")
async def delete_service(service_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    await db.services.delete_one({"service_id": service_id, "organization_id": current_user.organization_id})
    return {"message": "Service deleted"}

# Barbers Endpoints
@api_router.get("/barbers")
async def get_barbers(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    barbers = await db.barbers.find({"organization_id": current_user.organization_id}, {"_id": 0}).to_list(1000)
    for barber in barbers:
        if isinstance(barber["created_at"], str):
            barber["created_at"] = datetime.fromisoformat(barber["created_at"])
    return barbers

@api_router.post("/barbers")
async def create_barber(data: BarberCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    barber_id = f"barber_{uuid.uuid4().hex[:12]}"
    barber_doc = {
        "barber_id": barber_id,
        "organization_id": current_user.organization_id,
        "name": data.name,
        "avatar": data.avatar,
        "available_days": data.available_days or [1, 2, 3, 4, 5],
        "start_time": data.start_time or "09:00",
        "end_time": data.end_time or "18:00",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.barbers.insert_one(barber_doc)
    barber_doc["created_at"] = datetime.fromisoformat(barber_doc["created_at"])
    return Barber(**barber_doc)

@api_router.delete("/barbers/{barber_id}")
async def delete_barber(barber_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    await db.barbers.delete_one({"barber_id": barber_id, "organization_id": current_user.organization_id})
    return {"message": "Barber deleted"}

# Appointments Endpoints
@api_router.get("/appointments")
async def get_appointments(date: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    query = {"organization_id": current_user.organization_id}
    if date:
        query["date"] = date
    
    appointments = await db.appointments.find(query, {"_id": 0}).to_list(1000)
    
    for apt in appointments:
        if isinstance(apt["created_at"], str):
            apt["created_at"] = datetime.fromisoformat(apt["created_at"])
        
        service = await db.services.find_one({"service_id": apt["service_id"]}, {"_id": 0})
        barber = await db.barbers.find_one({"barber_id": apt["barber_id"]}, {"_id": 0})
        
        apt["service_name"] = service["name"] if service else "Unknown"
        apt["service_price"] = service["price"] if service else 0
        apt["barber_name"] = barber["name"] if barber else "Unknown"
    
    return appointments

@api_router.get("/appointments/today")
async def get_today_appointments(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return await get_appointments(date=today, authorization=authorization, session_token=session_token)

# Inventory Endpoints
@api_router.get("/inventory")
async def get_inventory(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    items = await db.inventory.find({"organization_id": current_user.organization_id}, {"_id": 0}).to_list(1000)
    for item in items:
        if isinstance(item["created_at"], str):
            item["created_at"] = datetime.fromisoformat(item["created_at"])
        item["is_low_stock"] = item["quantity"] <= item["min_stock"]
    return items

@api_router.post("/inventory")
async def create_inventory_item(data: InventoryCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # Validate non-negative stock
    if data.quantity < 0:
        raise HTTPException(status_code=400, detail="Quantity cannot be negative")
    if data.min_stock < 0:
        raise HTTPException(status_code=400, detail="Minimum stock cannot be negative")
    
    item_id = f"item_{uuid.uuid4().hex[:12]}"
    item_doc = {
        "item_id": item_id,
        "organization_id": current_user.organization_id,
        "name": data.name,
        "quantity": data.quantity,
        "min_stock": data.min_stock,
        "unit": data.unit,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.inventory.insert_one(item_doc.copy())  # Use copy to prevent _id mutation
    item_doc["is_low_stock"] = item_doc["quantity"] <= item_doc["min_stock"]
    return InventoryItem(**{**item_doc, "created_at": datetime.fromisoformat(item_doc["created_at"])})

@api_router.put("/inventory/{item_id}")
async def update_inventory_item(item_id: str, data: InventoryCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # Validate non-negative stock
    if data.quantity < 0:
        raise HTTPException(status_code=400, detail="Quantity cannot be negative")
    if data.min_stock < 0:
        raise HTTPException(status_code=400, detail="Minimum stock cannot be negative")
    
    result = await db.inventory.update_one(
        {"item_id": item_id, "organization_id": current_user.organization_id},
        {"$set": {"name": data.name, "quantity": data.quantity, "min_stock": data.min_stock, "unit": data.unit}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return {"message": "Item updated"}

@api_router.delete("/inventory/{item_id}")
async def delete_inventory_item(item_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    await db.inventory.delete_one({"item_id": item_id, "organization_id": current_user.organization_id})
    return {"message": "Item deleted"}

@api_router.post("/inventory/generate-order")
async def generate_purchase_order(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    items = await db.inventory.find({"organization_id": current_user.organization_id}, {"_id": 0}).to_list(1000)
    low_stock_items = [item for item in items if item["quantity"] <= item["min_stock"]]
    
    if not low_stock_items:
        return {"message": "No items need reordering", "items": []}
    
    items_text = "\n".join([f"- {item['name']}: Current stock {item['quantity']} {item['unit']}, minimum {item['min_stock']} {item['unit']}" for item in low_stock_items])
    
    prompt = f"""Analiza los siguientes productos de inventario con stock bajo y genera recomendaciones de compra inteligentes:

{items_text}

Para cada producto, recomienda:
1. Cantidad a pedir (considerando el stock mínimo y uso estimado)
2. Prioridad de compra (Alta/Media/Baja)

Formatea la respuesta como una lista clara y accionable."""
    
    async def generate():
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"purchase_order_{current_user.user_id}",
                system_message="Eres un asistente experto en gestión de inventarios para barberías."
            ).with_model("gemini", "gemini-3.5-flash")
            
            user_message = UserMessage(text=prompt)
            full_response = ""
            
            async for event in chat.stream_message(user_message):
                if isinstance(event, TextDelta):
                    full_response += event.content
                    yield f"data: {json.dumps({'content': event.content})}\n\n"
                elif isinstance(event, StreamDone):
                    yield f"data: {json.dumps({'done': True, 'full_response': full_response})}\n\n"
                    break
        except Exception as e:
            logger.error(f"Error generating purchase order: {e}")
            error_msg = str(e)
            if "budget" in error_msg.lower():
                error_msg = "El presupuesto del servicio de IA se ha agotado. Por favor, contacta al administrador."
            elif "quota" in error_msg.lower():
                error_msg = "Se ha excedido la cuota del servicio de IA. Intenta de nuevo más tarde."
            else:
                error_msg = "Error al generar la recomendación. Por favor, intenta de nuevo."
            yield f"data: {json.dumps({'error': error_msg})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

# Public Endpoints (for clients)
@api_router.get("/public/{org_id}/services")
async def get_public_services(org_id: str):
    services = await db.services.find({"organization_id": org_id}, {"_id": 0}).to_list(1000)
    for service in services:
        if isinstance(service["created_at"], str):
            service["created_at"] = datetime.fromisoformat(service["created_at"])
    return services

@api_router.get("/public/{org_id}/barbers")
async def get_public_barbers(org_id: str):
    barbers = await db.barbers.find({"organization_id": org_id}, {"_id": 0}).to_list(1000)
    for barber in barbers:
        if isinstance(barber["created_at"], str):
            barber["created_at"] = datetime.fromisoformat(barber["created_at"])
    return barbers

@api_router.get("/public/{org_id}/availability")
async def get_availability(org_id: str, barber_id: str, date: str, service_id: str):
    # Get barber
    barber = await db.barbers.find_one({"barber_id": barber_id, "organization_id": org_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Barber not found")
    
    # Get service to know duration
    service = await db.services.find_one({"service_id": service_id, "organization_id": org_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    service_duration = service["duration"]  # in minutes
    
    # Get all appointments for this barber on this date
    appointments = await db.appointments.find({"barber_id": barber_id, "date": date}, {"_id": 0}).to_list(1000)
    
    # Build set of blocked time slots considering service durations
    blocked_slots = set()
    for apt in appointments:
        apt_service = await db.services.find_one({"service_id": apt["service_id"]}, {"_id": 0})
        apt_duration = apt_service["duration"] if apt_service else 30
        apt_time = apt["time"]
        
        # Parse time
        hour, minute = map(int, apt_time.split(":"))
        start_minutes = hour * 60 + minute
        
        # Block all 30-minute slots covered by this appointment
        slots_needed = (apt_duration + 29) // 30  # Round up
        for i in range(slots_needed):
            slot_minutes = start_minutes + (i * 30)
            slot_hour = slot_minutes // 60
            slot_minute = slot_minutes % 60
            blocked_slots.add(f"{slot_hour:02d}:{slot_minute:02d}")
    
    # Generate available slots
    start_hour = int(barber["start_time"].split(":")[0])
    end_hour = int(barber["end_time"].split(":")[0])
    
    available_slots = []
    for hour in range(start_hour, end_hour):
        for minute in [0, 30]:
            time_slot = f"{hour:02d}:{minute:02d}"
            
            # Check if this slot and required consecutive slots are available
            slot_minutes = hour * 60 + minute
            slots_needed = (service_duration + 29) // 30
            
            is_available = True
            for i in range(slots_needed):
                check_minutes = slot_minutes + (i * 30)
                check_hour = check_minutes // 60
                check_minute = check_minutes % 60
                check_slot = f"{check_hour:02d}:{check_minute:02d}"
                
                # Check if within barber hours and not blocked
                if check_hour >= end_hour or check_slot in blocked_slots:
                    is_available = False
                    break
            
            if is_available:
                available_slots.append(time_slot)
    
    return {"available_slots": available_slots}

@api_router.post("/public/{org_id}/appointments")
async def create_public_appointment(org_id: str, data: AppointmentCreate):
    # Validate date is not in the past
    appointment_date = datetime.strptime(data.date, "%Y-%m-%d").date()
    today = datetime.now(timezone.utc).date()
    if appointment_date < today:
        raise HTTPException(status_code=400, detail="Cannot book appointments in the past")
    
    # Get service to know duration
    service = await db.services.find_one({"service_id": data.service_id, "organization_id": org_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    service_duration = service["duration"]
    
    # ATOMIC CHECK: Verify the slot is still available
    # Parse the requested time
    hour, minute = map(int, data.time.split(":"))
    start_minutes = hour * 60 + minute
    slots_needed = (service_duration + 29) // 30
    
    # Get current appointments
    appointments = await db.appointments.find({
        "barber_id": data.barber_id,
        "date": data.date
    }, {"_id": 0}).to_list(1000)
    
    # Check for conflicts
    for apt in appointments:
        apt_service = await db.services.find_one({"service_id": apt["service_id"]}, {"_id": 0})
        apt_duration = apt_service["duration"] if apt_service else 30
        apt_hour, apt_minute = map(int, apt["time"].split(":"))
        apt_start_minutes = apt_hour * 60 + apt_minute
        apt_end_minutes = apt_start_minutes + apt_duration
        
        new_end_minutes = start_minutes + service_duration
        
        # Check for overlap
        if not (new_end_minutes <= apt_start_minutes or start_minutes >= apt_end_minutes):
            raise HTTPException(status_code=409, detail="This time slot is no longer available")
    
    appointment_id = f"apt_{uuid.uuid4().hex[:12]}"
    appointment_doc = {
        "appointment_id": appointment_id,
        "organization_id": org_id,
        "service_id": data.service_id,
        "barber_id": data.barber_id,
        "client_name": data.client_name,
        "client_phone": data.client_phone,
        "client_email": data.client_email,
        "date": data.date,
        "time": data.time,
        "status": "confirmed",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        await db.appointments.insert_one(appointment_doc)
    except Exception as e:
        # Handle duplicate key error from unique index
        if "E11000" in str(e) or "duplicate key" in str(e).lower():
            raise HTTPException(status_code=409, detail="This time slot is no longer available")
        raise
    
    logger.info(f"[MOCK] WhatsApp confirmation sent to {data.client_phone}: Appointment confirmed for {data.date} at {data.time}")
    
    appointment_doc["created_at"] = datetime.fromisoformat(appointment_doc["created_at"])
    return Appointment(**appointment_doc)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()