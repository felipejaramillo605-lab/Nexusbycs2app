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
import bcrypt
import secrets

# Email service
from email_service import email_service

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
    password_hash: Optional[str] = None  # For manual auth
    auth_method: str = "google"  # google, apple, manual
    role: str = "manager"  # owner, manager, admin, staff
    access_status: str = "pending"  # pending, approved, rejected
    organization_id: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime] = None

# ==================== ROW LEVEL SECURITY (RLS) HELPERS ====================
async def validate_organization_access(user: User, organization_id: str) -> bool:
    """
    Validates if user has access to the specified organization.
    Owner: Access to all organizations
    Manager: Only their assigned organization
    """
    if user.role == "owner":
        return True
    
    if not user.organization_id:
        return False
    
    return user.organization_id == organization_id

async def get_organization_filter(user: User, provided_org_id: Optional[str] = None) -> dict:
    """
    Returns MongoDB filter for organization-scoped queries.
    Enforces Row Level Security at query level.
    """
    if user.role == "owner":
        # Owner can query specific org or get their own org
        if provided_org_id:
            return {"organization_id": provided_org_id}
        # If no org specified, query for user's primary org (first owned org)
        if user.organization_id:
            return {"organization_id": user.organization_id}
        # Fallback: return empty filter (will return all - owner privilege)
        return {}
    
    # Managers can ONLY access their assigned organization
    if not user.organization_id:
        raise HTTPException(status_code=403, detail="No organization assigned")
    
    # If org_id provided, validate it matches user's org
    if provided_org_id and provided_org_id != user.organization_id:
        raise HTTPException(status_code=403, detail="Access denied to this organization")
    
    return {"organization_id": user.organization_id}

async def enforce_rls_on_write(user: User, document: dict, organization_id: str) -> None:
    """
    Enforces Row Level Security on write operations (create/update).
    Prevents managers from creating/modifying data outside their organization.
    """
    if user.role != "owner":
        if not user.organization_id:
            raise HTTPException(status_code=403, detail="No organization assigned")
        
        if organization_id != user.organization_id:
            raise HTTPException(status_code=403, detail="Cannot modify data outside your organization")

# ==================== END RLS HELPERS ====================

class Organization(BaseModel):
    model_config = ConfigDict(extra="ignore")
    organization_id: str
    name: str
    owner_id: str
    # Enhanced fields for business profile
    address: Optional[str] = None
    business_hours: Optional[str] = None  # JSON string: {"mon": "9:00-18:00", ...}
    phone: Optional[str] = None
    whatsapp_link: Optional[str] = None
    created_at: datetime
    # Notification settings (personalizable por admin)
    notification_settings: Optional[dict] = Field(default_factory=lambda: {
        "appointment_confirmation": True,
        "appointment_reminder": True,
        "appointment_reminder_hours": 24,
        "appointment_completed": True,
        "appointment_cancelled": True,
        "admin_new_appointment": True,
        "client_reactivation_enabled": False,
        "client_reactivation_days": 60,
        "marketing_campaigns_enabled": False
    })

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

class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    client_id: str
    organization_id: str
    phone: str  # Primary identifier
    name: str
    email: Optional[str] = None
    accepts_marketing: bool = True  # Opt-in for notifications/campaigns
    total_visits: int = 0
    last_visit: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class BlockedTime(BaseModel):
    model_config = ConfigDict(extra="ignore")
    block_id: str
    barber_id: str
    organization_id: str
    date: str
    start_time: str
    end_time: str
    reason: str
    created_at: datetime

class BlockedTimeCreate(BaseModel):
    date: str
    start_time: str
    end_time: str
    reason: str

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

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

class OrganizationCreate(BaseModel):
    name: str
    address: Optional[str] = None
    business_hours: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_link: Optional[str] = None

class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    business_hours: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_link: Optional[str] = None

# Helper function to sanitize phone numbers
def sanitize_phone(phone: str) -> str:
    """Remove spaces, dashes, and parentheses from phone, keep only + and digits"""
    if not phone:
        return phone
    # Remove spaces, dashes, parentheses
    sanitized = phone.replace(' ', '').replace('-', '').replace('(', '').replace(')', '')
    # Ensure it starts with + if it has international format
    if sanitized and not sanitized.startswith('+'):
        # If it's a number without +, assume it needs formatting
        sanitized = '+' + sanitized if sanitized[0].isdigit() else sanitized
    return sanitized

class PasswordlessLoginRequest(BaseModel):
    phone: str
    name: Optional[str] = None  # Only required for first-time registration
    organization_id: str  # Required to know which barbershop

class LoginRequest(BaseModel):
    email: str
    password: str

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

# Password Helper Functions
def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

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
        
        # CRITICAL: Always update felipejaramillo605@gmail.com to owner + approved
        if email == "felipejaramillo605@gmail.com":
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {"role": "owner", "access_status": "approved"}}
            )
            user["role"] = "owner"
            user["access_status"] = "approved"
    
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

# Manual Auth Endpoints
@api_router.post("/auth/register")
async def register_user(data: RegisterRequest):
    """Register new user with email/password. User starts with pending status."""
    existing = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    password_hash = hash_password(data.password)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": data.email,
        "name": data.name,
        "password_hash": password_hash,
        "auth_method": "manual",
        "picture": None,
        "role": "manager",
        "access_status": "pending",
        "organization_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_login": None
    }
    await db.users.insert_one(user_doc)
    logger.info(f"New user registered: {data.email} (pending approval)")
    return {"message": "Registration successful. Awaiting admin approval.", "user_id": user_id}

@api_router.post("/auth/login")
async def login_user(data: LoginRequest, response: Response):
    """Login with email/password."""
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or user.get("auth_method") != "manual":
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get("password_hash") or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user["access_status"] != "approved":
        raise HTTPException(status_code=403, detail="Account pending approval")
    
    session_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user["user_id"],
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"last_login": datetime.now(timezone.utc).isoformat()}})
    
    response.set_cookie(key="session_token", value=session_token, httponly=True, secure=True, samesite="none", path="/", max_age=7*24*60*60)
    
    if isinstance(user["created_at"], str):
        user["created_at"] = datetime.fromisoformat(user["created_at"])
    if user.get("last_login") and isinstance(user["last_login"], str):
        user["last_login"] = datetime.fromisoformat(user["last_login"])
    return User(**user)

@api_router.post("/auth/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    """Initiate password reset (mock)."""
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if user and user.get("auth_method") == "manual":
        reset_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.password_resets.insert_one({
            "user_id": user["user_id"],
            "token": reset_token,
            "expires_at": expires_at.isoformat(),
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"[MOCK] Password reset token: {reset_token}")
    return {"message": "If the email exists, a reset link has been sent"}

@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Reset password with token."""
    reset_doc = await db.password_resets.find_one({"token": data.token, "used": False}, {"_id": 0})
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired token")
    
    expires_at = datetime.fromisoformat(reset_doc["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Token expired")
    
    password_hash = hash_password(data.new_password)
    await db.users.update_one({"user_id": reset_doc["user_id"]}, {"$set": {"password_hash": password_hash}})
    await db.password_resets.update_one({"token": data.token}, {"$set": {"used": True}})
    return {"message": "Password reset successful"}

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

@api_router.put("/owner/users/{user_id}/role")
async def update_user_role(
    user_id: str, 
    role: str,
    authorization: Optional[str] = Header(None), 
    session_token: Optional[str] = Cookie(None)
):
    """Update user role (owner/admin only)"""
    current_user = await get_current_user(authorization, session_token)
    if current_user.role not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if role not in ["owner", "manager", "admin", "staff"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    result = await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"role": role}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": f"User role updated to {role}"}

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

@api_router.put("/organizations/{organization_id}")
async def update_organization_profile(
    organization_id: str,
    data: OrganizationUpdate,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    """Update organization business profile (owner/manager only)"""
    current_user = await get_current_user(authorization, session_token)
    
    # ✅ CORRECCIÓN CRÍTICA: Pydantic model usa atributos, no .get()
    # Verify user belongs to this organization
    if current_user.organization_id != organization_id and current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    
    # Sanitize phone number if present
    if 'phone' in update_data and update_data['phone']:
        update_data['phone'] = sanitize_phone(update_data['phone'])
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.organizations.update_one(
        {"organization_id": organization_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Return updated organization
    updated_org = await db.organizations.find_one({"organization_id": organization_id}, {"_id": 0})
    return updated_org

@api_router.get("/public/{organization_id}/organization")
async def get_organization_public(organization_id: str):
    """Get organization details (public endpoint for booking flow)"""
    org = await db.organizations.find_one({"organization_id": organization_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org

@api_router.post("/public/auth/passwordless")
async def passwordless_login(data: PasswordlessLoginRequest):
    """Passwordless authentication for clients using phone number"""
    # Check if client exists
    client = await db.clients.find_one(
        {
            "phone": data.phone,
            "organization_id": data.organization_id
        },
        {"_id": 0}
    )
    
    if client:
        # Existing client - return client data
        return {
            "status": "existing",
            "client": client,
            "message": f"Bienvenido de nuevo, {client['name']}!"
        }
    else:
        # New client - require name
        if not data.name or not data.name.strip():
            raise HTTPException(
                status_code=400,
                detail="name_required"
            )
        
        # Create new client
        from uuid import uuid4
        new_client = {
            "client_id": f"client_{uuid4().hex[:12]}",
            "organization_id": data.organization_id,
            "phone": data.phone,
            "name": data.name.strip(),
            "email": None,
            "accepts_marketing": True,  # Opt-in by default
            "total_visits": 0,
            "last_visit": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
        await db.clients.insert_one(new_client)
        new_client.pop('_id', None)  # Remove MongoDB _id before returning
        
        return {
            "status": "new",
            "client": new_client,
            "message": f"¡Bienvenido, {new_client['name']}! Tu cuenta ha sido creada."
        }

# Services Endpoints
@api_router.get("/services")
async def get_services(organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # RLS: Get organization filter based on user role
    org_filter = await get_organization_filter(current_user, organization_id)
    services = await db.services.find(org_filter, {"_id": 0}).to_list(1000)
    
    for service in services:
        if isinstance(service["created_at"], str):
            service["created_at"] = datetime.fromisoformat(service["created_at"])
    return services

@api_router.post("/services")
async def create_service(data: ServiceCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # RLS: Enforce write access
    await enforce_rls_on_write(current_user, {}, current_user.organization_id)
    
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

@api_router.put("/services/{service_id}")
async def update_service(service_id: str, data: ServiceCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # Get the service first to verify it exists and belongs to accessible organization
    service = await db.services.find_one({"service_id": service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    # RLS: Validate organization access
    if not await validate_organization_access(current_user, service["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied to this organization")
    
    # RLS: Enforce write access
    await enforce_rls_on_write(current_user, service, service["organization_id"])
    
    update_data = {
        "name": data.name,
        "duration": data.duration,
        "price": data.price
    }
    
    result = await db.services.update_one(
        {"service_id": service_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Service not found")
    
    updated_service = await db.services.find_one({"service_id": service_id}, {"_id": 0})
    if isinstance(updated_service["created_at"], str):
        updated_service["created_at"] = datetime.fromisoformat(updated_service["created_at"])
    return Service(**updated_service)

@api_router.delete("/services/{service_id}")
async def delete_service(service_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # RLS: Get service and validate access
    service = await db.services.find_one({"service_id": service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    if not await validate_organization_access(current_user, service["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.services.delete_one({"service_id": service_id})
    return {"message": "Service deleted"}

# Barbers Endpoints
@api_router.get("/barbers")
async def get_barbers(organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # RLS: Get organization filter
    org_filter = await get_organization_filter(current_user, organization_id)
    barbers = await db.barbers.find(org_filter, {"_id": 0}).to_list(1000)
    
    for barber in barbers:
        if isinstance(barber["created_at"], str):
            barber["created_at"] = datetime.fromisoformat(barber["created_at"])
    return barbers

@api_router.post("/barbers")
async def create_barber(data: BarberCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    
    # RLS: Enforce write access
    await enforce_rls_on_write(current_user, {}, current_user.organization_id)
    
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

@api_router.put("/barbers/{barber_id}")
async def update_barber(barber_id: str, data: BarberCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # Get the barber first to verify it exists and belongs to accessible organization
    barber = await db.barbers.find_one({"barber_id": barber_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Barber not found")
    
    # RLS: Validate organization access
    if not await validate_organization_access(current_user, barber["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied to this organization")
    
    # RLS: Enforce write access
    await enforce_rls_on_write(current_user, barber, barber["organization_id"])
    
    update_data = {
        "name": data.name,
        "avatar": data.avatar,
        "available_days": data.available_days or [1, 2, 3, 4, 5],
        "start_time": data.start_time or "09:00",
        "end_time": data.end_time or "18:00"
    }
    
    result = await db.barbers.update_one(
        {"barber_id": barber_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Barber not found")
    
    updated_barber = await db.barbers.find_one({"barber_id": barber_id}, {"_id": 0})
    if isinstance(updated_barber["created_at"], str):
        updated_barber["created_at"] = datetime.fromisoformat(updated_barber["created_at"])
    return Barber(**updated_barber)

@api_router.delete("/barbers/{barber_id}")
async def delete_barber(barber_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # RLS: Get barber and validate access
    barber = await db.barbers.find_one({"barber_id": barber_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Barber not found")
    
    if not await validate_organization_access(current_user, barber["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.barbers.delete_one({"barber_id": barber_id})
    return {"message": "Barber deleted"}

# Blocked Times Endpoints
@api_router.get("/barbers/{barber_id}/blocked-times")
async def get_blocked_times(barber_id: str, date: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    await get_current_user(authorization, session_token)
    
    query = {"barber_id": barber_id}
    if date:
        query["date"] = date
    
    blocked_times = await db.blocked_times.find(query, {"_id": 0}).to_list(1000)
    for bt in blocked_times:
        if isinstance(bt["created_at"], str):
            bt["created_at"] = datetime.fromisoformat(bt["created_at"])
    return blocked_times

@api_router.post("/barbers/{barber_id}/blocked-times")
async def create_blocked_time(barber_id: str, data: BlockedTimeCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # Get barber to obtain organization_id
    barber = await db.barbers.find_one({"barber_id": barber_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Barber not found")
    
    # Validate access for non-owner users
    if current_user.role != "owner":
        if not current_user.organization_id:
            raise HTTPException(status_code=400, detail="No organization assigned")
        if barber["organization_id"] != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    
    block_id = f"block_{uuid.uuid4().hex[:12]}"
    block_doc = {
        "block_id": block_id,
        "barber_id": barber_id,
        "organization_id": barber["organization_id"],
        "date": data.date,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "reason": data.reason,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.blocked_times.insert_one(block_doc)
    block_doc["created_at"] = datetime.fromisoformat(block_doc["created_at"])
    return BlockedTime(**block_doc)

@api_router.delete("/barbers/{barber_id}/blocked-times/{block_id}")
async def delete_blocked_time(barber_id: str, block_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    await get_current_user(authorization, session_token)
    await db.blocked_times.delete_one({"block_id": block_id, "barber_id": barber_id})
    return {"message": "Blocked time deleted"}

# Appointments Endpoints
@api_router.get("/appointments")
async def get_appointments(date: Optional[str] = None, organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # Build query based on role
    if current_user.role == "owner":
        if organization_id:
            query = {"organization_id": organization_id}
        else:
            query = {}
    else:
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

@api_router.put("/appointments/{appointment_id}/status")
async def update_appointment_status(
    appointment_id: str, 
    status: str,
    authorization: Optional[str] = Header(None), 
    session_token: Optional[str] = Cookie(None)
):
    """Update appointment status to 'completed' or 'cancelled'"""
    current_user = await get_current_user(authorization, session_token)
    
    if status not in ["confirmed", "completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    # Get appointment
    appointment = await db.appointments.find_one({"appointment_id": appointment_id}, {"_id": 0})
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    # RLS: Validate organization access
    if not await validate_organization_access(current_user, appointment["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Store previous status to check if this is a new completion
    previous_status = appointment.get("status")
    
    # Update status
    result = await db.appointments.update_one(
        {"appointment_id": appointment_id},
        {"$set": {"status": status}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    # If marking as completed for the first time, increment client's total_visits
    if status == "completed" and previous_status != "completed":
        customer_phone = appointment.get("customer_phone")
        if customer_phone:
            await db.clients.update_one(
                {
                    "phone": customer_phone,
                    "organization_id": appointment["organization_id"]
                },
                {
                    "$inc": {"total_visits": 1},
                    "$set": {
                        "last_visit": appointment.get("date"),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
        
        # ✅ SEND COMPLETED EMAIL (if enabled)
        try:
            organization = await db.organizations.find_one(
                {"organization_id": appointment["organization_id"]}, 
                {"_id": 0}
            )
            if organization and organization.get("notification_settings", {}).get("appointment_completed", True):
                if appointment.get("client_email"):
                    service = await db.services.find_one(
                        {"service_id": appointment["service_id"]}, 
                        {"_id": 0}
                    )
                    email_service.send_appointment_completed(
                        to_email=appointment["client_email"],
                        customer_name=appointment.get("client_name", "Cliente"),
                        organization_name=organization.get("name", "Nexus"),
                        date=appointment.get("date"),
                        service_name=service.get("name", "Servicio") if service else "Servicio"
                    )
        except Exception as email_error:
            print(f"⚠️ Completed email failed: {email_error}")
    
    return {"message": f"Appointment status updated to {status}", "appointment_id": appointment_id, "status": status}

# Statistics Endpoints
@api_router.get("/statistics")
async def get_statistics(start_date: str, end_date: str, organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # Build query
    if current_user.role == "owner":
        if organization_id:
            query = {"organization_id": organization_id}
        else:
            query = {}
    else:
        if not current_user.organization_id:
            raise HTTPException(status_code=400, detail="No organization assigned")
        query = {"organization_id": current_user.organization_id}
    
    # Add date range
    query["date"] = {"$gte": start_date, "$lte": end_date}
    
    # Get appointments (exclude cancelled from revenue calculations)
    appointments = await db.appointments.find(query, {"_id": 0}).to_list(10000)
    
    # Batch fetch all unique services and barbers to avoid N+1 queries
    service_ids = list(set(apt.get("service_id") for apt in appointments if apt.get("service_id")))
    barber_ids = list(set(apt.get("barber_id") for apt in appointments if apt.get("barber_id")))
    
    # Fetch all services and barbers in single queries
    services = await db.services.find({"service_id": {"$in": service_ids}}, {"_id": 0}).to_list(1000)
    barbers = await db.barbers.find({"barber_id": {"$in": barber_ids}}, {"_id": 0}).to_list(1000)
    
    # Create lookup dictionaries for O(1) access
    service_lookup = {s["service_id"]: s for s in services}
    barber_lookup = {b["barber_id"]: b for b in barbers}
    
    # Calculate statistics
    daily_revenue = {}
    service_count = {}
    barber_count = {}
    
    for apt in appointments:
        # Skip cancelled appointments for revenue calculations
        if apt.get("status") == "cancelled":
            continue
            
        # Get service info from lookup
        service = service_lookup.get(apt.get("service_id"))
        service_price = service["price"] if service else 0
        service_name = service["name"] if service else "Unknown"
        
        # Get barber info from lookup
        barber = barber_lookup.get(apt.get("barber_id"))
        barber_name = barber["name"] if barber else "Unknown"
        
        # Daily revenue
        date = apt["date"]
        if date not in daily_revenue:
            daily_revenue[date] = 0
        daily_revenue[date] += service_price
        
        # Service count
        if service_name not in service_count:
            service_count[service_name] = 0
        service_count[service_name] += 1
        
        # Barber count
        if barber_name not in barber_count:
            barber_count[barber_name] = 0
        barber_count[barber_name] += 1
    
    # Format for charts
    daily_stats = [{"date": date, "revenue": revenue} for date, revenue in sorted(daily_revenue.items())]
    service_stats = [{"name": name, "count": count} for name, count in service_count.items()]
    barber_stats = [{"name": name, "count": count} for name, count in barber_count.items()]
    
    total_revenue = sum(daily_revenue.values())
    total_appointments = len(appointments)
    
    return {
        "total_revenue": total_revenue,
        "total_appointments": total_appointments,
        "daily_stats": daily_stats,
        "service_stats": service_stats,
        "barber_stats": barber_stats
    }


# ==================== CLIENTS ENDPOINTS ====================

@api_router.get("/clients")
async def get_clients(organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # RLS: Get organization filter
    org_filter = await get_organization_filter(current_user, organization_id)
    clients = await db.clients.find(org_filter, {"_id": 0}).sort("total_visits", -1).to_list(1000)
    
    for client in clients:
        if isinstance(client.get("created_at"), str):
            client["created_at"] = datetime.fromisoformat(client["created_at"])
        if isinstance(client.get("updated_at"), str):
            client["updated_at"] = datetime.fromisoformat(client["updated_at"])
    
    return clients

@api_router.put("/clients/{client_id}")
async def update_client(
    client_id: str,
    accepts_marketing: Optional[bool] = None,
    name: Optional[str] = None,
    email: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    """Update client information (manager/owner only)"""
    current_user = await get_current_user(authorization, session_token)
    
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # RLS: Validate organization access
    if not await validate_organization_access(current_user, client["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    update_data = {}
    if accepts_marketing is not None:
        update_data["accepts_marketing"] = accepts_marketing
    if name:
        update_data["name"] = name
    if email:
        update_data["email"] = email
    
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.clients.update_one(
            {"client_id": client_id},
            {"$set": update_data}
        )
    
    updated_client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    return updated_client

@api_router.get("/clients/{client_id}/history")
async def get_client_history(client_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # Get client first
    client = await db.clients.find_one({"client_id": client_id}, {"_id": 0})
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # RLS: Validate access
    if not await validate_organization_access(current_user, client["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get all appointments for this client
    appointments = await db.appointments.find(
        {"organization_id": client["organization_id"], "client_phone": client["phone"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    # Batch fetch all unique services and barbers to avoid N+1 queries
    service_ids = list(set(apt.get("service_id") for apt in appointments if apt.get("service_id")))
    barber_ids = list(set(apt.get("barber_id") for apt in appointments if apt.get("barber_id")))
    
    services = await db.services.find({"service_id": {"$in": service_ids}}, {"_id": 0}).to_list(1000)
    barbers = await db.barbers.find({"barber_id": {"$in": barber_ids}}, {"_id": 0}).to_list(1000)
    
    # Create lookup dictionaries for O(1) access
    service_lookup = {s["service_id"]: s for s in services}
    barber_lookup = {b["barber_id"]: b for b in barbers}
    
    # Enrich with service and barber names
    for apt in appointments:
        service = service_lookup.get(apt.get("service_id"))
        barber = barber_lookup.get(apt.get("barber_id"))
        apt["service_name"] = service["name"] if service else "Unknown"
        apt["service_price"] = service["price"] if service else 0
        apt["barber_name"] = barber["name"] if barber else "Unknown"
        
        if isinstance(apt.get("created_at"), str):
            apt["created_at"] = datetime.fromisoformat(apt["created_at"])
    
    return appointments

async def upsert_client(organization_id: str, phone: str, name: str, email: Optional[str] = None):
    """
    Create or update client record. Uses phone as unique identifier per organization.
    """
    existing = await db.clients.find_one({"organization_id": organization_id, "phone": phone}, {"_id": 0})
    
    if existing:
        # Update existing client (don't increment visits here - only on appointment completion)
        update_data = {
            "name": name,
            "last_visit": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        if email:
            update_data["email"] = email
        
        await db.clients.update_one(
            {"organization_id": organization_id, "phone": phone},
            {"$set": update_data}
        )
        return {**existing, **update_data}
    else:
        # Create new client
        client_id = f"client_{uuid.uuid4().hex[:12]}"
        client_doc = {
            "client_id": client_id,
            "organization_id": organization_id,
            "phone": phone,
            "name": name,
            "email": email,
            "accepts_marketing": True,  # Default opt-in
            "total_visits": 0,  # Starts at 0, increments only when appointments are completed
            "last_visit": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.clients.insert_one(client_doc)
        return client_doc

@api_router.get("/public/clients/history")
async def get_client_history_public(phone: str, organization_id: str):
    """Get client appointment history by phone number (public endpoint for customer portal)"""
    # Find client by phone and org
    client = await db.clients.find_one(
        {"phone": phone, "organization_id": organization_id},
        {"_id": 0}
    )
    
    if not client:
        return {"client": None, "appointments": []}
    
    # Get all appointments for this client
    appointments = await db.appointments.find(
        {
            "customer_phone": phone,
            "organization_id": organization_id
        },
        {"_id": 0}
    ).sort("date", -1).to_list(1000)
    
    # Enrich with service and barber info
    # Batch fetch all unique services and barbers to avoid N+1 queries
    service_ids = list(set(apt.get("service_id") for apt in appointments if apt.get("service_id")))
    barber_ids = list(set(apt.get("barber_id") for apt in appointments if apt.get("barber_id")))
    
    services = await db.services.find({"service_id": {"$in": service_ids}}, {"_id": 0}).to_list(1000)
    barbers = await db.barbers.find({"barber_id": {"$in": barber_ids}}, {"_id": 0}).to_list(1000)
    
    # Create lookup dictionaries for O(1) access
    service_lookup = {s["service_id"]: s for s in services}
    barber_lookup = {b["barber_id"]: b for b in barbers}
    
    for apt in appointments:
        service = service_lookup.get(apt.get("service_id"))
        barber = barber_lookup.get(apt.get("barber_id"))
        
        apt["service_name"] = service["name"] if service else "Unknown"
        apt["service_price"] = service["price"] if service else 0
        apt["barber_name"] = barber["name"] if barber else "Unknown"
    
    return {
        "client": client,
        "appointments": appointments
    }

# ==================== END CLIENTS ENDPOINTS ====================

# ==================== MARKETING & CAMPAIGNS ====================

class CampaignRequest(BaseModel):
    client_ids: List[str]  # List of client IDs to send to
    message: str
    send_immediately: bool = True
    scheduled_date: Optional[str] = None  # ISO format for scheduled campaigns
    channel: str = "whatsapp"  # "whatsapp", "email", or "both"
    subject: Optional[str] = None  # Email subject (required if channel is email/both)

@api_router.post("/marketing/campaigns")
async def create_campaign(
    data: CampaignRequest,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    """Send marketing campaign to selected clients via WhatsApp and/or Email"""
    current_user = await get_current_user(authorization, session_token)
    
    if not data.client_ids:
        raise HTTPException(status_code=400, detail="No clients selected")
    
    # Validate email channel requires subject
    if data.channel in ["email", "both"] and not data.subject:
        raise HTTPException(status_code=400, detail="Subject is required for email campaigns")
    
    # Get clients and filter by accepts_marketing
    clients = await db.clients.find(
        {
            "client_id": {"$in": data.client_ids},
            "accepts_marketing": True  # Automatic filter
        },
        {"_id": 0}
    ).to_list(1000)
    
    # Verify organization access
    for client in clients:
        if not await validate_organization_access(current_user, client["organization_id"]):
            raise HTTPException(status_code=403, detail="Access denied to one or more clients")
    
    # Get organization info for email signature
    org_id = clients[0]["organization_id"] if clients else None
    organization = None
    if org_id:
        organization = await db.organizations.find_one({"organization_id": org_id}, {"_id": 0})
    
    org_name = organization.get("name", "Nexus") if organization else "Nexus"
    
    # Send campaigns
    whatsapp_sent = 0
    whatsapp_failed = 0
    email_sent = 0
    email_failed = 0
    
    for client in clients:
        # Send via WhatsApp (mocked)
        if data.channel in ["whatsapp", "both"]:
            try:
                print(f"📱 [MOCK WhatsApp] Sending to {client['name']} ({client['phone']}): {data.message}")
                whatsapp_sent += 1
            except Exception as e:
                print(f"❌ Failed WhatsApp to {client['phone']}: {str(e)}")
                whatsapp_failed += 1
        
        # Send via Email (real SMTP)
        if data.channel in ["email", "both"] and client.get("email"):
            try:
                # Create HTML email body with marketing message
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
                        .message-box {{ background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; margin: 20px 0; white-space: pre-wrap; line-height: 1.6; }}
                        .footer {{ padding: 30px; text-align: center; color: #666; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.1); }}
                        .emoji {{ font-size: 48px; margin: 20px 0; }}
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <div class="emoji">✨</div>
                            <h1>{data.subject}</h1>
                        </div>
                        <div class="content">
                            <p style="font-size: 18px; color: #fff;">Hola <strong>{client['name']}</strong>,</p>
                            
                            <div class="message-box">
                                {data.message}
                            </div>
                            
                            <p style="color: #aaa; margin-top: 30px;">¡Esperamos verte pronto!</p>
                        </div>
                        <div class="footer">
                            <p><strong>{org_name}</strong></p>
                            <p>Este es un email de marketing. Si no deseas recibir más emails, puedes desactivarlo desde tu perfil.</p>
                        </div>
                    </div>
                </body>
                </html>
                """
                
                success = email_service._send_email(
                    to_email=client["email"],
                    subject=data.subject,
                    html_body=html_body,
                    text_body=data.message
                )
                
                if success:
                    email_sent += 1
                else:
                    email_failed += 1
                    
            except Exception as e:
                print(f"❌ Failed Email to {client.get('email')}: {str(e)}")
                email_failed += 1
    
    # Build response message
    messages = []
    if data.channel in ["whatsapp", "both"]:
        messages.append(f"WhatsApp: {whatsapp_sent} enviados")
    if data.channel in ["email", "both"]:
        messages.append(f"Email: {email_sent} enviados")
    
    return {
        "status": "success",
        "total_selected": len(data.client_ids),
        "eligible_clients": len(clients),
        "whatsapp_sent": whatsapp_sent,
        "whatsapp_failed": whatsapp_failed,
        "email_sent": email_sent,
        "email_failed": email_failed,
        "message": f"Campaña enviada: {', '.join(messages)}"
    }

# ==================== END MARKETING ====================

# Inventory Endpoints
@api_router.get("/inventory")
async def get_inventory(organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    
    # Owner can query any organization, manager only their own
    if current_user.role == "owner":
        if not organization_id:
            items = await db.inventory.find({}, {"_id": 0}).to_list(1000)
        else:
            items = await db.inventory.find({"organization_id": organization_id}, {"_id": 0}).to_list(1000)
    else:
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
    
    # Get blocked times for this barber on this date
    blocked_times = await db.blocked_times.find({"barber_id": barber_id, "date": date}, {"_id": 0}).to_list(1000)
    
    # Build set of blocked time slots considering service durations
    blocked_slots = set()
    
    # Block appointment slots
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
    
    # Block manually blocked time ranges
    for blocked in blocked_times:
        start_hour, start_minute = map(int, blocked["start_time"].split(":"))
        end_hour, end_minute = map(int, blocked["end_time"].split(":"))
        
        start_total_minutes = start_hour * 60 + start_minute
        end_total_minutes = end_hour * 60 + end_minute
        
        # Block all 30-minute slots in this range
        current_minutes = start_total_minutes
        while current_minutes < end_total_minutes:
            slot_hour = current_minutes // 60
            slot_minute = current_minutes % 60
            blocked_slots.add(f"{slot_hour:02d}:{slot_minute:02d}")
            current_minutes += 30
    
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
        
        # ✅ SEND CONFIRMATION EMAIL
        if data.client_email:
            try:
                # Get organization, barber and service details
                organization = await db.organizations.find_one({"organization_id": org_id}, {"_id": 0})
                barber = await db.barbers.find_one({"barber_id": data.barber_id}, {"_id": 0})
                
                # Send confirmation to customer
                email_service.send_appointment_confirmation(
                    to_email=data.client_email,
                    customer_name=data.client_name,
                    barber_name=barber.get("name", "Barbero") if barber else "Barbero",
                    service_name=service.get("name", "Servicio"),
                    date=data.date,
                    time=data.time,
                    organization_name=organization.get("name", "Nexus") if organization else "Nexus",
                    organization_address=organization.get("address") if organization else None
                )
                
                # ✅ SEND NOTIFICATION TO ADMIN (if enabled)
                if organization and organization.get("notification_settings", {}).get("admin_new_appointment", True):
                    admin_user = await db.users.find_one(
                        {"organization_id": org_id, "role": {"$in": ["owner", "admin"]}},
                        {"_id": 0}
                    )
                    if admin_user and admin_user.get("email"):
                        email_service.send_admin_new_appointment_notification(
                            admin_email=admin_user["email"],
                            customer_name=data.client_name,
                            customer_phone=data.client_phone,
                            service_name=service.get("name", "Servicio"),
                            barber_name=barber.get("name", "Barbero") if barber else "Barbero",
                            date=data.date,
                            time=data.time,
                            organization_name=organization.get("name", "Nexus")
                        )
                
            except Exception as email_error:
                # Don't fail appointment creation if email fails
                print(f"⚠️ Email sending failed: {email_error}")
        
    except Exception as e:
        # Handle duplicate key error from unique index
        if "E11000" in str(e) or "duplicate key" in str(e).lower():
            raise HTTPException(status_code=409, detail="This time slot is no longer available")
        raise
    
    # Create or update client record
    await upsert_client(
        organization_id=org_id,
        phone=data.client_phone,
        name=data.client_name,
        email=data.client_email
    )
    
    logger.info(f"[MOCK] WhatsApp confirmation sent to {data.client_phone}: Appointment {appointment_id} confirmed for {data.date} at {data.time}")
    
    appointment_doc["created_at"] = datetime.fromisoformat(appointment_doc["created_at"])
    return Appointment(**appointment_doc)

# Public Cancellation Endpoint
@api_router.post("/public/appointments/{appointment_id}/cancel")
async def cancel_public_appointment(appointment_id: str):
    """
    Public endpoint for clients to cancel their appointments via unique link.
    No authentication required - secured by unique appointment_id.
    """
    appointment = await db.appointments.find_one({"appointment_id": appointment_id}, {"_id": 0})
    
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    if appointment["status"] == "cancelled":
        raise HTTPException(status_code=400, detail="Appointment already cancelled")
    
    # Cancel the appointment
    await db.appointments.update_one(
        {"appointment_id": appointment_id},
        {"$set": {"status": "cancelled"}}
    )
    
    logger.info(f"[MOCK] WhatsApp cancellation notification sent to {appointment['client_phone']}: Appointment {appointment_id} cancelled")
    
    return {"message": "Appointment cancelled successfully", "appointment_id": appointment_id}

@api_router.get("/public/appointments/{appointment_id}")
async def get_public_appointment(appointment_id: str):
    """
    Public endpoint to view appointment details for cancellation page.
    """
    appointment = await db.appointments.find_one({"appointment_id": appointment_id}, {"_id": 0})
    
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    
    # Enrich with service and barber names
    service = await db.services.find_one({"service_id": appointment["service_id"]}, {"_id": 0})
    barber = await db.barbers.find_one({"barber_id": appointment["barber_id"]}, {"_id": 0})
    
    appointment["service_name"] = service["name"] if service else "Unknown"
    appointment["service_price"] = service["price"] if service else 0
    appointment["barber_name"] = barber["name"] if barber else "Unknown"
    
    if isinstance(appointment.get("created_at"), str):
        appointment["created_at"] = datetime.fromisoformat(appointment["created_at"])
    
    return appointment

app.include_router(api_router)

# ==================== SECURITY MIDDLEWARE ====================

# CORS Configuration - RESTRICTIVE
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # Explicit methods only
    allow_headers=["Content-Type", "Authorization", "Cookie", "X-Session-ID"],  # Explicit headers only
    expose_headers=["Set-Cookie"],
    max_age=600,  # Cache preflight requests for 10 minutes
)

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    
    # Prevent clickjacking
    response.headers["X-Frame-Options"] = "DENY"
    
    # Prevent MIME type sniffing
    response.headers["X-Content-Type-Options"] = "nosniff"
    
    # Enable XSS protection
    response.headers["X-XSS-Protection"] = "1; mode=block"
    
    # Strict Transport Security (HTTPS only)
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    # Content Security Policy
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    
    # Referrer Policy
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    # Permissions Policy
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    
    return response

# ==================== END SECURITY MIDDLEWARE ====================

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()