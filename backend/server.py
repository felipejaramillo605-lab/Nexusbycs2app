from fastapi import FastAPI, APIRouter, HTTPException, Cookie, Response, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
import json
import bcrypt
import secrets
import hashlib
import re

# Email service
from email_service import email_service
from checkout_inventory import prepare_checkout_inventory, reserve_checkout_inventory, finalize_checkout_inventory, rollback_checkout_inventory, ensure_checkout_inventory_indexes
from transaction_voids import build_transaction_void_router, ensure_transaction_void_indexes
from procurement_suppliers import build_supplier_router, ensure_supplier_indexes

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
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    password_hash: Optional[str] = None  # For manual auth
    auth_method: str = "google"  # google, apple, manual
    role: str = "manager"  # owner, manager, admin, staff
    access_status: str = "pending"  # pending, approved, rejected
    organization_id: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime] = None


# NEXUS_ACCOUNT_SAFETY_V1
class AccountDeletionRequest(BaseModel):
    confirmation: str
    password: Optional[str] = None
    understood: bool = False

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

def require_management_role(user: User) -> None:
    """Restrict administrative operations to management roles."""
    if user.role not in ["owner", "manager", "admin"]:
        raise HTTPException(status_code=403, detail="Management access required")


# NEXUS_ENDPOINT_RBAC_TENANT_ENFORCEMENT_V1
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
    user_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    bio: Optional[str] = None
    avatar: Optional[str] = None
    active: bool = True
    available_days: List[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])
    start_time: str = "09:00"
    end_time: str = "18:00"
    service_ids: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: Optional[datetime] = None

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
    organization_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    bio: Optional[str] = None
    avatar: Optional[str] = None
    active: bool = True
    available_days: Optional[List[int]] = None
    start_time: Optional[str] = "09:00"
    end_time: Optional[str] = "18:00"
    service_ids: Optional[List[str]] = None

class StaffBarberProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: str
    phone: str
    address: Optional[str] = None
    bio: Optional[str] = None
    avatar: Optional[str] = None
    available_days: List[int]
    start_time: str
    end_time: str

class AppointmentCreate(BaseModel):
    service_id: str
    barber_id: str
    client_name: str
    client_phone: str
    client_email: str
    date: str
    time: str

# NEXUS_CHECKOUT_BACKEND_V1
class AppointmentCheckoutRequest(BaseModel):
    discount_amount: float = 0
    tip_amount: float = 0
    payment_method: str
    notes: Optional[str] = None


# NEXUS_STAFF_SETTLEMENTS_FOUNDATION_V1
class SettlementCreateRequest(BaseModel):
    barber_id: str
    period_start: str
    period_end: str
    notes: Optional[str] = None


# NEXUS_STAFF_SETTLEMENTS_WORKFLOW_V1
class SettlementPaymentRequest(BaseModel):
    payment_method: str
    payment_reference: Optional[str] = None
    notes: Optional[str] = None


class SettlementCancelRequest(BaseModel):
    reason: str


class InventoryCreate(BaseModel):
    name: str
    quantity: int
    min_stock: int
    unit: str


# NEXUS_INVENTORY_PACKAGE_1_5A_V1
class InventoryMovementCreate(BaseModel):
    movement_type: str
    quantity: float
    unit_cost: Optional[float] = None
    notes: Optional[str] = None
    reference_type: Optional[str] = None
    reference_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    organization_id: Optional[str] = None

class UserAccessUpdate(BaseModel):
    access_status: str

class UserRoleUpdate(BaseModel):
    role: str

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
    confirm_password: Optional[str] = None

class TeamInvitationCreate(BaseModel):
    email: EmailStr
    role: str = "staff"
    organization_id: Optional[str] = None

class TeamRoleUpdate(BaseModel):
    role: str

# NEXUS_COMMISSION_FOUNDATION_V1
class CommissionSettingsUpdate(BaseModel):
    default_staff_percent: float
    default_business_percent: float
    commission_base: str = "net_service_amount"
    tip_policy: str = "full_tip_to_staff"

class StaffCommissionOverrideUpdate(BaseModel):
    staff_percent: float
    business_percent: float
    reason: str

class InvitationAcceptRequest(BaseModel):
    token: str
    first_name: str
    last_name: str
    phone: str
    address: Optional[str] = None
    password: str
    confirm_password: str

# Password Helper Functions
def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def normalize_email(email: str) -> str:
    return str(email).strip().lower()


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def validate_password_policy(password: str) -> None:
    if len(password) < 8 or not re.search(r"[A-Z]", password) or not re.search(r"[0-9]", password):
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least 8 characters, one uppercase letter and one number"
        )


def safe_delivery_error() -> str:
    return "Email provider rejected the delivery attempt"


async def resolve_team_organization(current_user: User, requested_org_id: Optional[str]) -> str:
    if current_user.role not in ["owner", "manager", "admin"]:
        raise HTTPException(status_code=403, detail="Access denied")

    if current_user.role == "owner":
        organization_id = requested_org_id or current_user.organization_id
        if not organization_id:
            raise HTTPException(status_code=400, detail="organization_id is required")
    else:
        if not current_user.organization_id:
            raise HTTPException(status_code=403, detail="No organization assigned")
        if requested_org_id and requested_org_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Access denied to this organization")
        organization_id = current_user.organization_id

    organization = await db.organizations.find_one(
        {"organization_id": organization_id}, {"_id": 0}
    )
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    return organization_id

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

    # NEXUS_AUTHORIZATION_HARDENING_V1
    # Session existence is not sufficient: account authorization is evaluated
    # on every request so rejected, deactivated, or deleted users cannot reuse
    # a previously issued session.
    if user.get("access_status") != "approved":
        raise HTTPException(status_code=403, detail="Account access is not approved")
    if user.get("active") is False or user.get("deleted_at"):
        raise HTTPException(status_code=403, detail="Account is inactive")
    
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
        # NEXUS_AUTHORIZATION_HARDENING_V1
        # Bootstrap is explicit and one-time. It is only considered while no
        # Owner exists, and no identity is embedded in source code.
        bootstrap_owner_email = normalize_email(os.environ.get("BOOTSTRAP_OWNER_EMAIL", ""))
        normalized_login_email = normalize_email(email)
        owner_count = await db.users.count_documents({"role": "owner"})
        is_bootstrap_owner = bool(
            owner_count == 0
            and bootstrap_owner_email
            and normalized_login_email == bootstrap_owner_email
        )
        role = "owner" if is_bootstrap_owner else "manager"
        access_status = "approved" if is_bootstrap_owner else "pending"
        
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
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
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
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc),
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
    """Create and deliver a one-time password reset token without disclosing account existence."""
    generic_response = {"message": "If the email exists, a reset link has been sent"}
    normalized_email = normalize_email(data.email)
    user = await db.users.find_one(
        {"email": {"$regex": f"^{re.escape(normalized_email)}$", "$options": "i"}},
        {"_id": 0}
    )

    if not user or user.get("auth_method") != "manual":
        return generic_response

    raw_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=1)
    await db.password_resets.update_many(
        {"user_id": user["user_id"], "used": False},
        {"$set": {"used": True, "invalidated_at": now.isoformat()}}
    )
    await db.password_resets.insert_one({
        "reset_id": f"reset_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "token_hash": token_digest(raw_token),
        "expires_at": expires_at.isoformat(),
        "used": False,
        "created_at": now.isoformat()
    })

    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not frontend_url:
        logger.error("FRONTEND_URL is not configured; password reset email was not sent")
        return generic_response

    reset_url = f"{frontend_url}/reset-password?token={raw_token}"
    sent = email_service.send_password_reset(
        to_email=user["email"],
        user_name=user.get("name", "usuario"),
        reset_url=reset_url
    )
    if not sent:
        logger.warning("Password reset email delivery failed for user_id=%s", user["user_id"])
    return generic_response


@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Reset a manual account password using a hashed, expiring, one-time token."""
    if data.confirm_password is not None and data.new_password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    validate_password_policy(data.new_password)

    digest = token_digest(data.token)
    reset_doc = await db.password_resets.find_one(
        {"token_hash": digest, "used": False}, {"_id": 0}
    )
    if not reset_doc:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    expires_at = datetime.fromisoformat(reset_doc["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        await db.password_resets.update_one(
            {"reset_id": reset_doc["reset_id"]},
            {"$set": {"used": True, "expired_at": datetime.now(timezone.utc).isoformat()}}
        )
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    password_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"user_id": reset_doc["user_id"]},
        {"$set": {"password_hash": password_hash}}
    )
    await db.password_resets.update_one(
        {"reset_id": reset_doc["reset_id"]},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}}
    )
    await db.user_sessions.delete_many({"user_id": reset_doc["user_id"]})

    user = await db.users.find_one({"user_id": reset_doc["user_id"]}, {"_id": 0})
    if user:
        email_service.send_password_changed(
            to_email=user["email"],
            user_name=user.get("name", "usuario")
        )
    return {"message": "Password reset successful"}


# Team management endpoints
@api_router.get("/team/members")
async def list_team_members(
    organization_id: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    resolved_org_id = await resolve_team_organization(current_user, organization_id)
    members = await db.users.find(
        {"organization_id": resolved_org_id},
        {"_id": 0, "password_hash": 0}
    ).sort("name", 1).to_list(1000)
    return members


@api_router.put("/team/members/{user_id}/role")
async def update_team_member_role(
    user_id: str,
    data: TeamRoleUpdate,
    organization_id: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    resolved_org_id = await resolve_team_organization(current_user, organization_id)
    member = await db.users.find_one(
        {"user_id": user_id, "organization_id": resolved_org_id}, {"_id": 0}
    )
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    if member.get("role") == "owner":
        raise HTTPException(status_code=403, detail="Owner role cannot be changed here")
    allowed_roles = ["manager", "admin", "staff"] if current_user.role == "owner" else ["staff"]
    if data.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You cannot assign this role")
    if current_user.role != "owner" and member.get("role") != "staff":
        raise HTTPException(status_code=403, detail="You cannot modify this member")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": data.role}})
    return {"message": "Team member role updated", "role": data.role}


@api_router.delete("/team/members/{user_id}")
async def deactivate_team_member(
    user_id: str,
    organization_id: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    resolved_org_id = await resolve_team_organization(current_user, organization_id)
    if user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    member = await db.users.find_one(
        {"user_id": user_id, "organization_id": resolved_org_id}, {"_id": 0}
    )
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    if member.get("role") == "owner":
        raise HTTPException(status_code=403, detail="Owner cannot be deactivated")
    if current_user.role != "owner" and member.get("role") != "staff":
        raise HTTPException(status_code=403, detail="You cannot deactivate this member")
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"access_status": "rejected", "deactivated_at": now}}
    )
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.barbers.update_many({"user_id": user_id}, {"$set": {"active": False, "updated_at": now}})
    return {"message": "Team member deactivated"}


# Team invitation endpoints
@api_router.get("/team/invitations")
async def list_team_invitations(
    organization_id: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    resolved_org_id = await resolve_team_organization(current_user, organization_id)
    invitations = await db.invitations.find(
        {"organization_id": resolved_org_id},
        {"_id": 0, "token_hash": 0, "last_delivery_error": 0}
    ).sort("created_at", -1).to_list(500)

    now = datetime.now(timezone.utc)
    for invitation in invitations:
        expires_at = datetime.fromisoformat(invitation["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if invitation.get("status") in ["sent", "delivery_failed"] and expires_at < now:
            invitation["status"] = "expired"
    return invitations


@api_router.post("/team/invitations")
async def create_team_invitation(
    data: TeamInvitationCreate,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    organization_id = await resolve_team_organization(current_user, data.organization_id)

    allowed_roles = ["manager", "admin", "staff"] if current_user.role == "owner" else ["staff"]
    if data.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="You cannot invite this role")

    normalized_email = normalize_email(data.email)
    existing_user = await db.users.find_one(
        {"email": {"$regex": f"^{re.escape(normalized_email)}$", "$options": "i"}},
        {"_id": 0}
    )
    if existing_user:
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    active_invitation = await db.invitations.find_one({
        "organization_id": organization_id,
        "normalized_email": normalized_email,
        "status": {"$in": ["sent", "delivery_failed"]},
        "expires_at": {"$gt": datetime.now(timezone.utc).isoformat()}
    }, {"_id": 0})
    if active_invitation:
        raise HTTPException(status_code=409, detail="An active invitation already exists for this email")

    organization = await db.organizations.find_one(
        {"organization_id": organization_id}, {"_id": 0}
    )
    raw_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=7)
    invitation_id = f"inv_{uuid.uuid4().hex[:12]}"
    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not frontend_url:
        raise HTTPException(status_code=500, detail="Invitation delivery is not configured")
    invitation_url = f"{frontend_url}/accept-invitation?token={raw_token}"

    invitation_doc = {
        "invitation_id": invitation_id,
        "organization_id": organization_id,
        "organization_name": organization.get("name", "Nexus by CS2"),
        "email": normalized_email,
        "normalized_email": normalized_email,
        "role": data.role,
        "invited_by_user_id": current_user.user_id,
        "token_hash": token_digest(raw_token),
        "status": "pending_send",
        "delivery_status": "pending",
        "send_attempts": 1,
        "last_send_attempt_at": now.isoformat(),
        "expires_at": expires_at.isoformat(),
        "created_at": now.isoformat(),
        "updated_at": now.isoformat()
    }
    await db.invitations.insert_one(invitation_doc)

    sent = email_service.send_team_invitation(
        to_email=normalized_email,
        organization_name=organization.get("name", "Nexus by CS2"),
        inviter_name=current_user.name,
        role=data.role,
        invitation_url=invitation_url,
        expires_days=7
    )
    status_value = "sent" if sent else "delivery_failed"
    update_fields = {
        "status": status_value,
        "delivery_status": status_value,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if not sent:
        update_fields["last_delivery_error"] = safe_delivery_error()
    await db.invitations.update_one(
        {"invitation_id": invitation_id}, {"$set": update_fields}
    )

    return {
        "invitation_id": invitation_id,
        "email": normalized_email,
        "role": data.role,
        "status": status_value,
        "delivery_status": status_value,
        "expires_at": expires_at.isoformat(),
        "invitation_url": invitation_url if not sent else None,
        "message": "Invitation sent successfully" if sent else "Invitation created, but email delivery failed"
    }


@api_router.post("/team/invitations/{invitation_id}/resend")
async def resend_team_invitation(
    invitation_id: str,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    invitation = await db.invitations.find_one({"invitation_id": invitation_id}, {"_id": 0})
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    await resolve_team_organization(current_user, invitation["organization_id"])
    if current_user.role != "owner" and invitation.get("role") != "staff":
        raise HTTPException(status_code=403, detail="You cannot manage this invitation")
    if invitation.get("status") in ["accepted", "revoked"]:
        raise HTTPException(status_code=400, detail="Invitation cannot be resent")

    raw_token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=7)
    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not frontend_url:
        raise HTTPException(status_code=500, detail="Invitation delivery is not configured")
    invitation_url = f"{frontend_url}/accept-invitation?token={raw_token}"

    # Rotate the token in the database BEFORE sending the email. This makes
    # every resend immediately invalidate all previous links and avoids a race
    # where the recipient opens the fresh email before the new hash is stored.
    rotation_result = await db.invitations.update_one(
        {
            "invitation_id": invitation_id,
            "status": {"$nin": ["accepted", "revoked"]}
        },
        {"$set": {
            "token_hash": token_digest(raw_token),
            "status": "sent",
            "delivery_status": "pending",
            "expires_at": expires_at.isoformat(),
            "last_send_attempt_at": now.isoformat(),
            "token_rotated_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "send_attempts": invitation.get("send_attempts", 0) + 1,
            "last_delivery_error": None
        }}
    )
    if rotation_result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Invitation changed before it could be resent")

    sent = email_service.send_team_invitation(
        to_email=invitation["email"],
        organization_name=invitation.get("organization_name", "Nexus by CS2"),
        inviter_name=current_user.name,
        role=invitation["role"],
        invitation_url=invitation_url,
        expires_days=7
    )
    status_value = "sent" if sent else "delivery_failed"
    final_fields = {
        "status": status_value,
        "delivery_status": status_value,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if not sent:
        final_fields["last_delivery_error"] = safe_delivery_error()
    await db.invitations.update_one(
        {"invitation_id": invitation_id},
        {"$set": final_fields}
    )
    return {
        "invitation_id": invitation_id,
        "status": status_value,
        "delivery_status": status_value,
        "expires_at": expires_at.isoformat(),
        "invitation_url": invitation_url if not sent else None,
        "message": "Invitation sent successfully" if sent else "Invitation delivery failed"
    }


@api_router.post("/team/invitations/{invitation_id}/revoke")
async def revoke_team_invitation(
    invitation_id: str,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    invitation = await db.invitations.find_one({"invitation_id": invitation_id}, {"_id": 0})
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    await resolve_team_organization(current_user, invitation["organization_id"])
    if current_user.role != "owner" and invitation.get("role") != "staff":
        raise HTTPException(status_code=403, detail="You cannot manage this invitation")
    if invitation.get("status") == "accepted":
        raise HTTPException(status_code=400, detail="Accepted invitation cannot be revoked")
    await db.invitations.update_one(
        {"invitation_id": invitation_id},
        {"$set": {
            "status": "revoked",
            "revoked_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    return {"message": "Invitation revoked"}


@api_router.get("/public/invitations/validate")
async def validate_public_invitation(token: str):
    invitation = await db.invitations.find_one(
        {"token_hash": token_digest(token)}, {"_id": 0, "token_hash": 0, "last_delivery_error": 0}
    )
    if not invitation:
        raise HTTPException(status_code=400, detail="invitation_replaced_or_invalid")
    if invitation.get("status") == "accepted":
        raise HTTPException(status_code=400, detail="invitation_already_used")
    if invitation.get("status") == "revoked":
        raise HTTPException(status_code=400, detail="invitation_revoked")
    if invitation.get("status") not in ["sent", "delivery_failed"]:
        raise HTTPException(status_code=400, detail="invitation_not_available")
    expires_at = datetime.fromisoformat(invitation["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="invitation_expired")
    return {
        "email": invitation["email"],
        "role": invitation["role"],
        "organization_name": invitation.get("organization_name", "Nexus by CS2"),
        "expires_at": invitation["expires_at"]
    }


@api_router.post("/public/invitations/accept")
async def accept_public_invitation(data: InvitationAcceptRequest):
    if data.password != data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    validate_password_policy(data.password)

    digest = token_digest(data.token)
    invitation = await db.invitations.find_one(
        {"token_hash": digest}, {"_id": 0}
    )
    if not invitation:
        raise HTTPException(status_code=400, detail="invitation_replaced_or_invalid")
    if invitation.get("status") == "accepted":
        raise HTTPException(status_code=400, detail="invitation_already_used")
    if invitation.get("status") == "revoked":
        raise HTTPException(status_code=400, detail="invitation_revoked")
    if invitation.get("status") not in ["sent", "delivery_failed"]:
        raise HTTPException(status_code=400, detail="invitation_not_available")
    expires_at = datetime.fromisoformat(invitation["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="invitation_expired")

    existing_user = await db.users.find_one(
        {"email": {"$regex": f"^{re.escape(invitation['normalized_email'])}$", "$options": "i"}},
        {"_id": 0}
    )
    if existing_user:
        raise HTTPException(status_code=409, detail="A user with this email already exists")

    first_name = data.first_name.strip()
    last_name = data.last_name.strip()
    phone = sanitize_phone(data.phone)
    if not first_name or not last_name or not phone:
        raise HTTPException(status_code=400, detail="First name, last name and phone are required")

    now = datetime.now(timezone.utc)
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    full_name = f"{first_name} {last_name}".strip()
    user_doc = {
        "user_id": user_id,
        "email": invitation["normalized_email"],
        "name": full_name,
        "first_name": first_name,
        "last_name": last_name,
        "phone": phone,
        "address": data.address.strip() if data.address else None,
        "password_hash": hash_password(data.password),
        "auth_method": "manual",
        "picture": None,
        "role": invitation["role"],
        "access_status": "approved",
        "organization_id": invitation["organization_id"],
        "created_at": now.isoformat(),
        "last_login": None
    }
    await db.users.insert_one(user_doc)

    try:
        if invitation["role"] == "staff":
            barber_doc = {
                "barber_id": f"barber_{uuid.uuid4().hex[:12]}",
                "organization_id": invitation["organization_id"],
                "user_id": user_id,
                "name": full_name,
                "display_name": full_name,
                "first_name": first_name,
                "last_name": last_name,
                "phone": phone,
                "address": data.address.strip() if data.address else None,
                "bio": None,
                "avatar": None,
                "active": True,
                "available_days": [1, 2, 3, 4, 5],
                "start_time": "09:00",
                "end_time": "18:00",
                "service_ids": [],
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }
            await db.barbers.insert_one(barber_doc)

        result = await db.invitations.update_one(
            {"invitation_id": invitation["invitation_id"], "status": {"$in": ["sent", "delivery_failed"]}},
            {"$set": {
                "status": "accepted",
                "accepted_at": now.isoformat(),
                "accepted_user_id": user_id,
                "updated_at": now.isoformat()
            }}
        )
        if result.modified_count != 1:
            raise RuntimeError("Invitation acceptance conflict")
    except Exception:
        await db.users.delete_one({"user_id": user_id})
        await db.barbers.delete_many({"user_id": user_id})
        raise

    return {"message": "Invitation accepted successfully", "user_id": user_id}

# ==================== COMMISSION FOUNDATION ====================
# NEXUS_COMMISSION_FOUNDATION_V1
DEFAULT_COMMISSION_SETTINGS = {"default_staff_percent": 60.0, "default_business_percent": 40.0, "commission_base": "net_service_amount", "tip_policy": "full_tip_to_staff", "currency": "COP"}

def validate_commission_split(staff_percent: float, business_percent: float) -> None:
    if not 0 <= staff_percent <= 100 or not 0 <= business_percent <= 100:
        raise HTTPException(status_code=400, detail="Commission percentages must be between 0 and 100")
    if abs(staff_percent + business_percent - 100.0) > 0.001:
        raise HTTPException(status_code=400, detail="Staff and business percentages must add up to 100")

async def commission_audit(org_id, event_type, entity_id, actor_id, previous, new_value, reason=None):
    await db.audit_events.insert_one({"audit_id": f"audit_{uuid.uuid4().hex[:12]}", "organization_id": org_id, "event_type": event_type, "entity_type": "commission", "entity_id": entity_id, "actor_user_id": actor_id, "previous_value": previous, "new_value": new_value, "reason": reason, "created_at": datetime.now(timezone.utc).isoformat()})

async def commission_org(user: User, requested_org_id: Optional[str]) -> str:
    require_management_role(user)
    return await resolve_team_organization(user, requested_org_id)

@api_router.get("/commissions/settings")
async def get_commission_settings(organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    org_id = await commission_org(user, organization_id)
    item = await db.commission_settings.find_one({"organization_id": org_id}, {"_id": 0})
    return {**({"organization_id": org_id, **DEFAULT_COMMISSION_SETTINGS} if not item else item), "is_default": not bool(item)}

@api_router.put("/commissions/settings")
async def put_commission_settings(data: CommissionSettingsUpdate, organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    org_id = await commission_org(user, organization_id)
    validate_commission_split(data.default_staff_percent, data.default_business_percent)
    if data.commission_base != "net_service_amount" or data.tip_policy != "full_tip_to_staff":
        raise HTTPException(status_code=400, detail="Unsupported commission policy")
    previous = await db.commission_settings.find_one({"organization_id": org_id}, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()
    item = {"organization_id": org_id, "default_staff_percent": round(data.default_staff_percent, 2), "default_business_percent": round(data.default_business_percent, 2), "commission_base": data.commission_base, "tip_policy": data.tip_policy, "currency": "COP", "updated_by": user.user_id, "updated_at": now}
    await db.commission_settings.update_one({"organization_id": org_id}, {"$set": item, "$setOnInsert": {"created_at": now}}, upsert=True)
    await commission_audit(org_id, "commission_settings_updated", org_id, user.user_id, previous, item)
    return {**item, "is_default": False}

@api_router.get("/commissions/staff")
async def get_staff_commissions(organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    org_id = await commission_org(user, organization_id)
    settings = await db.commission_settings.find_one({"organization_id": org_id}, {"_id": 0}) or {"organization_id": org_id, **DEFAULT_COMMISSION_SETTINGS}
    barbers = await db.barbers.find({"organization_id": org_id}, {"_id": 0}).sort("name", 1).to_list(1000)
    overrides = await db.staff_commission_overrides.find({"organization_id": org_id, "active": True}, {"_id": 0}).to_list(1000)
    by_barber = {x["barber_id"]: x for x in overrides}
    staff = []
    for barber in barbers:
        override = by_barber.get(barber["barber_id"])
        staff.append({"barber_id": barber["barber_id"], "name": barber.get("display_name") or barber.get("name") or "Profesional", "active": barber.get("active", True), "source": "override" if override else "default", "staff_percent": override.get("staff_percent") if override else settings["default_staff_percent"], "business_percent": override.get("business_percent") if override else settings["default_business_percent"], "reason": override.get("reason") if override else None})
    return {"settings": settings, "staff": staff}

@api_router.put("/commissions/staff/{barber_id}")
async def put_staff_commission(barber_id: str, data: StaffCommissionOverrideUpdate, organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    org_id = await commission_org(user, organization_id)
    validate_commission_split(data.staff_percent, data.business_percent)
    reason = data.reason.strip()
    if len(reason) < 3:
        raise HTTPException(status_code=400, detail="A reason of at least 3 characters is required")
    barber = await db.barbers.find_one({"barber_id": barber_id, "organization_id": org_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Professional not found")
    previous = await db.staff_commission_overrides.find_one({"organization_id": org_id, "barber_id": barber_id, "active": True}, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()
    item = {"override_id": previous.get("override_id") if previous else f"override_{uuid.uuid4().hex[:12]}", "organization_id": org_id, "barber_id": barber_id, "staff_percent": round(data.staff_percent, 2), "business_percent": round(data.business_percent, 2), "reason": reason, "active": True, "effective_from": previous.get("effective_from") if previous else now, "effective_to": None, "created_by": previous.get("created_by") if previous else user.user_id, "created_at": previous.get("created_at") if previous else now, "updated_by": user.user_id, "updated_at": now}
    await db.staff_commission_overrides.update_one({"organization_id": org_id, "barber_id": barber_id, "active": True}, {"$set": item}, upsert=True)
    await commission_audit(org_id, "staff_commission_override_updated", barber_id, user.user_id, previous, item, reason)
    return item

@api_router.delete("/commissions/staff/{barber_id}")
async def delete_staff_commission(barber_id: str, organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    org_id = await commission_org(user, organization_id)
    barber = await db.barbers.find_one({"barber_id": barber_id, "organization_id": org_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Professional not found")
    previous = await db.staff_commission_overrides.find_one({"organization_id": org_id, "barber_id": barber_id, "active": True}, {"_id": 0})
    if not previous:
        return {"message": "Professional already uses default commission"}
    now = datetime.now(timezone.utc).isoformat()
    await db.staff_commission_overrides.update_one({"override_id": previous["override_id"]}, {"$set": {"active": False, "effective_to": now, "updated_by": user.user_id, "updated_at": now}})
    await commission_audit(org_id, "staff_commission_override_reset", barber_id, user.user_id, previous, None, "Reset to organization default")
    return {"message": "Commission reset to organization default"}

# ==================== END COMMISSION FOUNDATION ====================

# Owner Endpoints
# NEXUS_OWNER_ACCOUNT_HARDENING_V1
_ENABLED_ACCOUNT_FILTER = {"access_status": "approved", "active": {"$ne": False}, "deleted_at": {"$exists": False}}
_ALLOWED_OWNER_ACCESS_STATES = {"pending", "approved", "rejected", "denied"}
_ALLOWED_USER_ROLES = {"owner", "manager", "admin", "staff"}


def _is_enabled_account(user: dict) -> bool:
    return bool(user and user.get("access_status") == "approved" and user.get("active") is not False and not user.get("deleted_at"))


def _is_enabled_administrator(user: dict) -> bool:
    return _is_enabled_account(user) and user.get("role") in {"owner", "manager", "admin"}


async def _protect_owner_and_organization_administration(target: dict, *, next_role=None, next_access=None, deleting=False):
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    remains_enabled = not deleting and (next_access or target.get("access_status")) == "approved"
    remains_owner = remains_enabled and (next_role or target.get("role")) == "owner"
    if target.get("role") == "owner" and _is_enabled_account(target) and not remains_owner:
        enabled_owners = await db.users.count_documents({"role": "owner", **_ENABLED_ACCOUNT_FILTER})
        if enabled_owners <= 1:
            raise HTTPException(status_code=409, detail="The last enabled Owner cannot be removed, blocked, or downgraded")
    organization_id = target.get("organization_id")
    remains_admin = remains_enabled and (next_role or target.get("role")) in {"owner", "manager", "admin"}
    if organization_id and _is_enabled_administrator(target) and not remains_admin:
        enabled_admins = await db.users.count_documents({"organization_id": organization_id, "role": {"$in": ["owner", "manager", "admin"]}, **_ENABLED_ACCOUNT_FILTER})
        if enabled_admins <= 1:
            raise HTTPException(status_code=409, detail="The organization must retain at least one enabled administrator")


async def _owner_account_audit(event_type: str, target: dict, actor: User, previous: dict, new_value: dict):
    await db.audit_events.insert_one({"audit_id": f"audit_{uuid.uuid4().hex[:12]}", "organization_id": target.get("organization_id"), "event_type": event_type, "entity_type": "user_account", "entity_id": target.get("user_id"), "actor_user_id": actor.user_id, "previous_value": previous, "new_value": new_value, "created_at": datetime.now(timezone.utc).isoformat()})


@api_router.get("/owner/users")
async def get_all_users(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Access denied")
    projection = {"_id": 0, "password_hash": 0, "session_token": 0, "token": 0, "token_hash": 0, "reset_token": 0, "secret": 0}
    users = await db.users.find({}, projection).to_list(1000)
    for user in users:
        if isinstance(user.get("created_at"), str):
            user["created_at"] = datetime.fromisoformat(user["created_at"])
    return users


@api_router.put("/owner/users/{user_id}/access")
async def update_user_access(user_id: str, data: UserAccessUpdate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Access denied")
    if data.access_status not in _ALLOWED_OWNER_ACCESS_STATES:
        raise HTTPException(status_code=400, detail="Invalid access status")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user_id == current_user.user_id and data.access_status != "approved":
        raise HTTPException(status_code=409, detail="Use account deletion to remove your own account")
    await _protect_owner_and_organization_administration(target, next_access=data.access_status)
    previous={"access_status":target.get("access_status")}
    await db.users.update_one({"user_id":user_id},{"$set":{"access_status":data.access_status}})
    await db.user_sessions.delete_many({"user_id":user_id})
    await _owner_account_audit("user_access_updated",target,current_user,previous,{"access_status":data.access_status})
    return {"message":"Access updated"}


@api_router.delete("/owner/users/{user_id}")
async def delete_user(user_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user=await get_current_user(authorization,session_token)
    if current_user.role != "owner":
        raise HTTPException(status_code=403,detail="Access denied")
    if user_id == current_user.user_id:
        raise HTTPException(status_code=409,detail="Use account deletion to remove your own account")
    target=await db.users.find_one({"user_id":user_id},{"_id":0})
    if not target:
        raise HTTPException(status_code=404,detail="User not found")
    await _protect_owner_and_organization_administration(target,deleting=True)
    now=datetime.now(timezone.utc).isoformat()
    anonymous_email=f"deleted+{user_id}@nexus.invalid"
    await db.user_sessions.delete_many({"user_id":user_id})
    await db.barbers.update_many({"user_id":user_id},{"$set":{"active":False,"deleted_at":now,"updated_at":now},"$unset":{"user_id":""}})
    await db.users.update_one({"user_id":user_id},{"$set":{"email":anonymous_email,"name":"Cuenta eliminada","first_name":None,"last_name":None,"phone":None,"address":None,"picture":None,"password_hash":None,"access_status":"deleted","active":False,"deleted_at":now,"deletion_kind":"owner_admin_anonymization"}})
    await _owner_account_audit("user_admin_deleted",target,current_user,{"role":target.get("role"),"access_status":target.get("access_status")},{"access_status":"deleted"})
    return {"message":"User anonymized and access revoked"}


@api_router.put("/owner/users/{user_id}/role")
async def update_user_role(user_id: str, data: UserRoleUpdate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user=await get_current_user(authorization,session_token)
    if current_user.role != "owner":
        raise HTTPException(status_code=403,detail="Access denied")
    if data.role not in _ALLOWED_USER_ROLES:
        raise HTTPException(status_code=400,detail="Invalid role")
    target=await db.users.find_one({"user_id":user_id},{"_id":0})
    if not target:
        raise HTTPException(status_code=404,detail="User not found")
    if user_id == current_user.user_id and data.role != "owner":
        raise HTTPException(status_code=409,detail="Transfer ownership before changing your own role")
    await _protect_owner_and_organization_administration(target,next_role=data.role)
    previous={"role":target.get("role")}
    await db.users.update_one({"user_id":user_id},{"$set":{"role":data.role}})
    await db.user_sessions.delete_many({"user_id":user_id})
    await _owner_account_audit("user_role_updated",target,current_user,previous,{"role":data.role})
    return {"message":f"User role updated to {data.role}"}


# NEXUS_ACCOUNT_SAFETY_V1
@api_router.delete("/account/me")
async def delete_my_account(
    data: AccountDeletionRequest,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    if data.confirmation != "ELIMINAR MI CUENTA" or data.understood is not True:
        raise HTTPException(status_code=400, detail="Account deletion confirmation is incomplete")

    stored_user = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
    if not stored_user or stored_user.get("access_status") == "deleted":
        raise HTTPException(status_code=404, detail="Account not found")

    if stored_user.get("password_hash"):
        if not data.password or not verify_password(data.password, stored_user["password_hash"]):
            raise HTTPException(status_code=403, detail="Current password is incorrect")
    elif data.password:
        raise HTTPException(status_code=400, detail="This account uses external authentication")

    await _protect_owner_and_organization_administration(stored_user, deleting=True)

    now = datetime.now(timezone.utc).isoformat()
    anonymous_email = f"deleted+{current_user.user_id}@nexus.invalid"
    linked_barbers = await db.barbers.find(
        {"user_id": current_user.user_id}, {"_id": 0, "barber_id": 1}
    ).to_list(1000)
    barber_ids = [item["barber_id"] for item in linked_barbers if item.get("barber_id")]

    await db.user_sessions.delete_many({"user_id": current_user.user_id})
    await db.barbers.update_many(
        {"user_id": current_user.user_id},
        {"$set": {
            "active": False,
            "display_name": "Perfil no disponible",
            "name": "Perfil no disponible",
            "first_name": None,
            "last_name": None,
            "phone": None,
            "address": None,
            "bio": None,
            "avatar": None,
            "deleted_at": now,
            "updated_at": now
        }, "$unset": {"user_id": ""}}
    )
    await db.users.update_one(
        {"user_id": current_user.user_id, "access_status": {"$ne": "deleted"}},
        {"$set": {
            "email": anonymous_email,
            "name": "Cuenta eliminada",
            "first_name": None,
            "last_name": None,
            "phone": None,
            "address": None,
            "picture": None,
            "password_hash": None,
            "access_status": "deleted",
            "deleted_at": now,
            "deletion_kind": "self_service_anonymization"
        }}
    )
    await db.audit_logs.insert_one({
        "audit_id": f"audit_{uuid.uuid4().hex[:12]}",
        "event": "account_self_deleted",
        "actor_user_id": current_user.user_id,
        "organization_id": current_user.organization_id,
        "role": current_user.role,
        "linked_barber_ids": barber_ids,
        "created_at": now
    })
    return {
        "message": "Account deleted",
        "retained_records": "Financial and audit records may remain anonymized when retention is required"
    }

# Organization Endpoints
@api_router.get("/organizations")
async def get_organizations(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)
    
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
    # NEXUS_ENDPOINT_RBAC_TENANT_ENFORCEMENT_V1
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Owner access required")
    
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
    require_management_role(current_user)
    
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
    require_management_role(current_user)
    
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
    require_management_role(current_user)
    
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
    require_management_role(current_user)
    
    # RLS: Get service and validate access
    service = await db.services.find_one({"service_id": service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    if not await validate_organization_access(current_user, service["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    await db.services.delete_one({"service_id": service_id})
    return {"message": "Service deleted"}

# Barbers Endpoints
@api_router.get("/barbers/me/profile")
async def get_my_barber_profile(
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="Staff access required")
    if current_user.access_status != "approved":
        raise HTTPException(status_code=403, detail="Account is not approved")

    barber = await db.barbers.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0}
    )
    if not barber:
        raise HTTPException(status_code=404, detail="Professional profile not found")

    barber["display_name"] = barber.get("display_name") or barber.get("name") or current_user.name
    barber["first_name"] = barber.get("first_name") or current_user.first_name
    barber["last_name"] = barber.get("last_name") or current_user.last_name
    barber["phone"] = barber.get("phone") or current_user.phone
    barber["address"] = barber.get("address") or current_user.address
    barber["available_days"] = barber.get("available_days") or [1, 2, 3, 4, 5]
    barber["start_time"] = barber.get("start_time") or "09:00"
    barber["end_time"] = barber.get("end_time") or "18:00"
    barber["service_ids"] = barber.get("service_ids") or []
    barber["active"] = barber.get("active", True)
    return barber


@api_router.put("/barbers/me/profile")
async def update_my_barber_profile(
    data: StaffBarberProfileUpdate,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="Staff access required")
    if current_user.access_status != "approved":
        raise HTTPException(status_code=403, detail="Account is not approved")

    barber = await db.barbers.find_one(
        {"user_id": current_user.user_id},
        {"_id": 0}
    )
    if not barber:
        raise HTTPException(status_code=404, detail="Professional profile not found")

    display_name = data.display_name.strip()
    phone = sanitize_phone(data.phone)
    first_name = data.first_name.strip() if data.first_name else None
    last_name = data.last_name.strip() if data.last_name else None
    address = data.address.strip() if data.address else None
    bio = data.bio.strip() if data.bio else None
    avatar = data.avatar.strip() if data.avatar else None
    available_days = list(dict.fromkeys(data.available_days))

    if not display_name:
        raise HTTPException(status_code=400, detail="Display name is required")
    if not phone:
        raise HTTPException(status_code=400, detail="Phone is required")
    if bio and len(bio) > 500:
        raise HTTPException(status_code=400, detail="Bio must contain 500 characters or fewer")
    if not available_days or any(day not in [0, 1, 2, 3, 4, 5, 6] for day in available_days):
        raise HTTPException(status_code=400, detail="Select at least one valid working day")
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", data.start_time) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", data.end_time):
        raise HTTPException(status_code=400, detail="Invalid working hours")
    if data.end_time <= data.start_time:
        raise HTTPException(status_code=400, detail="End time must be later than start time")

    now = datetime.now(timezone.utc).isoformat()
    barber_updates = {
        "name": display_name,
        "display_name": display_name,
        "first_name": first_name,
        "last_name": last_name,
        "phone": phone,
        "address": address,
        "bio": bio,
        "avatar": avatar,
        "available_days": available_days,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "updated_at": now
    }
    user_updates = {
        "name": display_name,
        "first_name": first_name,
        "last_name": last_name,
        "phone": phone,
        "address": address,
        "picture": avatar
    }

    await db.barbers.update_one(
        {"barber_id": barber["barber_id"], "user_id": current_user.user_id},
        {"$set": barber_updates}
    )
    await db.users.update_one(
        {"user_id": current_user.user_id},
        {"$set": user_updates}
    )

    updated = await db.barbers.find_one(
        {"barber_id": barber["barber_id"], "user_id": current_user.user_id},
        {"_id": 0}
    )
    return updated


@api_router.get("/barbers")
async def get_barbers(organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)
    
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
    require_management_role(current_user)
    organization_id = await resolve_team_organization(current_user, data.organization_id)
    await enforce_rls_on_write(current_user, {}, organization_id)

    name = data.name.strip()
    first_name = data.first_name.strip() if data.first_name else None
    last_name = data.last_name.strip() if data.last_name else None
    display_name = data.display_name.strip() if data.display_name else name
    if not name or not display_name:
        raise HTTPException(status_code=400, detail="Name is required")
    if data.bio and len(data.bio.strip()) > 500:
        raise HTTPException(status_code=400, detail="Bio must contain 500 characters or fewer")

    service_ids = list(dict.fromkeys(data.service_ids or []))
    if service_ids:
        service_count = await db.services.count_documents({
            "organization_id": organization_id,
            "service_id": {"$in": service_ids}
        })
        if service_count != len(service_ids):
            raise HTTPException(status_code=400, detail="One or more services are invalid")

    now = datetime.now(timezone.utc).isoformat()
    barber_doc = {
        "barber_id": f"barber_{uuid.uuid4().hex[:12]}",
        "organization_id": organization_id,
        "name": display_name,
        "display_name": display_name,
        "first_name": first_name,
        "last_name": last_name,
        "user_id": None,
        "phone": sanitize_phone(data.phone) if data.phone else None,
        "address": data.address.strip() if data.address else None,
        "bio": data.bio.strip() if data.bio else None,
        "avatar": data.avatar,
        "active": data.active,
        "available_days": data.available_days or [1, 2, 3, 4, 5],
        "start_time": data.start_time or "09:00",
        "end_time": data.end_time or "18:00",
        "service_ids": service_ids,
        "created_at": now,
        "updated_at": now
    }
    await db.barbers.insert_one(barber_doc)
    barber_doc["created_at"] = datetime.fromisoformat(barber_doc["created_at"])
    barber_doc["updated_at"] = datetime.fromisoformat(barber_doc["updated_at"])
    return Barber(**barber_doc)

@api_router.put("/barbers/{barber_id}")
async def update_barber(barber_id: str, data: BarberCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)
    barber = await db.barbers.find_one({"barber_id": barber_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Barber not found")
    if not await validate_organization_access(current_user, barber["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied to this organization")
    await enforce_rls_on_write(current_user, barber, barber["organization_id"])

    name = data.name.strip()
    display_name = data.display_name.strip() if data.display_name else name
    if not name or not display_name:
        raise HTTPException(status_code=400, detail="Name is required")
    if data.bio and len(data.bio.strip()) > 500:
        raise HTTPException(status_code=400, detail="Bio must contain 500 characters or fewer")

    service_ids = list(dict.fromkeys(data.service_ids or []))
    if service_ids:
        service_count = await db.services.count_documents({
            "organization_id": barber["organization_id"],
            "service_id": {"$in": service_ids}
        })
        if service_count != len(service_ids):
            raise HTTPException(status_code=400, detail="One or more services are invalid")

    update_data = {
        "name": display_name,
        "display_name": display_name,
        "first_name": data.first_name.strip() if data.first_name else None,
        "last_name": data.last_name.strip() if data.last_name else None,
        "phone": sanitize_phone(data.phone) if data.phone else None,
        "address": data.address.strip() if data.address else None,
        "bio": data.bio.strip() if data.bio else None,
        "avatar": data.avatar,
        "active": data.active,
        "available_days": data.available_days or [1, 2, 3, 4, 5],
        "start_time": data.start_time or "09:00",
        "end_time": data.end_time or "18:00",
        "service_ids": service_ids,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.barbers.update_one({"barber_id": barber_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Barber not found")
    updated_barber = await db.barbers.find_one({"barber_id": barber_id}, {"_id": 0})
    if isinstance(updated_barber["created_at"], str):
        updated_barber["created_at"] = datetime.fromisoformat(updated_barber["created_at"])
    if isinstance(updated_barber.get("updated_at"), str):
        updated_barber["updated_at"] = datetime.fromisoformat(updated_barber["updated_at"])
    return Barber(**updated_barber)

@api_router.delete("/barbers/{barber_id}")
async def delete_barber(barber_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)
    barber = await db.barbers.find_one({"barber_id": barber_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Barber not found")
    if not await validate_organization_access(current_user, barber["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    await enforce_rls_on_write(current_user, barber, barber["organization_id"])
    now = datetime.now(timezone.utc).isoformat()
    await db.barbers.update_one(
        {"barber_id": barber_id},
        {"$set": {"active": False, "updated_at": now}}
    )
    return {"message": "Barber deactivated"}

# Blocked Times Endpoints
@api_router.get("/barbers/{barber_id}/blocked-times")
async def get_blocked_times(barber_id: str, date: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)
    barber = await db.barbers.find_one({"barber_id": barber_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Barber not found")
    if not await validate_organization_access(current_user, barber["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = {"barber_id": barber_id, "organization_id": barber["organization_id"]}
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
    require_management_role(current_user)
    
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
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)
    barber = await db.barbers.find_one({"barber_id": barber_id}, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Barber not found")
    if not await validate_organization_access(current_user, barber["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    result = await db.blocked_times.delete_one({
        "block_id": block_id,
        "barber_id": barber_id,
        "organization_id": barber["organization_id"]
    })
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Blocked time not found")
    return {"message": "Blocked time deleted"}

# Appointments Endpoints
# NEXUS_PAGINATION_FOUNDATION_4D1_V2
@api_router.get("/appointments")
async def get_appointments(date: Optional[str] = None, organization_id: Optional[str] = None, status: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, page: Optional[int] = None, page_size: Optional[int] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)

    if current_user.role == "owner":
        query = {"organization_id": organization_id} if organization_id else {}
    else:
        if not current_user.organization_id:
            raise HTTPException(status_code=403, detail="No organization assigned")
        if organization_id and organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Access denied to this organization")
        query = {"organization_id": current_user.organization_id}

    if date:
        query["date"] = date
    elif start_date or end_date:
        query["date"] = {}
        if start_date:
            query["date"]["$gte"] = start_date
        if end_date:
            query["date"]["$lte"] = end_date
    if status and status != "all":
        query["status"] = status

    paged = page is not None or page_size is not None
    safe_page = max(1, page or 1)
    safe_size = max(1, min(page_size or 25, 100))
    cursor = db.appointments.find(query, {"_id": 0}).sort([("date", -1), ("time", -1), ("appointment_id", -1)])
    total = await db.appointments.count_documents(query) if paged else None
    if paged:
        appointments = await cursor.skip((safe_page - 1) * safe_size).limit(safe_size).to_list(safe_size)
    else:
        appointments = await cursor.to_list(1000)

    service_ids = list({item.get("service_id") for item in appointments if item.get("service_id")})
    barber_ids = list({item.get("barber_id") for item in appointments if item.get("barber_id")})
    services = await db.services.find({"service_id": {"$in": service_ids}}, {"_id": 0}).to_list(len(service_ids) or 1) if service_ids else []
    barbers = await db.barbers.find({"barber_id": {"$in": barber_ids}}, {"_id": 0}).to_list(len(barber_ids) or 1) if barber_ids else []
    service_lookup = {item["service_id"]: item for item in services}
    barber_lookup = {item["barber_id"]: item for item in barbers}

    for appointment in appointments:
        if isinstance(appointment.get("created_at"), str):
            appointment["created_at"] = datetime.fromisoformat(appointment["created_at"])
        service = service_lookup.get(appointment.get("service_id"))
        barber = barber_lookup.get(appointment.get("barber_id"))
        appointment["service_name"] = service["name"] if service else "Unknown"
        appointment["service_price"] = service["price"] if service else 0
        appointment["barber_name"] = barber["name"] if barber else "Unknown"

    if not paged:
        return appointments
    total_pages = (total + safe_size - 1) // safe_size
    return {"items": appointments, "page": safe_page, "page_size": safe_size, "total": total, "total_pages": total_pages, "has_next": safe_page < total_pages, "has_previous": safe_page > 1}

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
    require_management_role(current_user)
    
    if status not in ["confirmed", "cancelled"]:
        if status == "completed":
            raise HTTPException(status_code=400, detail="Use checkout to complete and charge this appointment")
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

# NEXUS_CHECKOUT_BACKEND_V1
CHECKOUT_PAYMENT_METHODS = {"cash", "card", "transfer", "nequi", "daviplata", "other"}

@api_router.post("/appointments/{appointment_id}/checkout")
async def checkout_appointment(appointment_id: str, data: AppointmentCheckoutRequest, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user=await get_current_user(authorization,session_token);require_management_role(user)
    apt=await db.appointments.find_one({'appointment_id':appointment_id},{'_id':0})
    if not apt:raise HTTPException(404,'Appointment not found')
    if not await validate_organization_access(user,apt['organization_id']):raise HTTPException(403,'Access denied')
    if apt.get('status')=='cancelled':raise HTTPException(409,'Cancelled appointments cannot be charged')
    if apt.get('status')=='completed' or await db.transactions.find_one({'appointment_id':appointment_id,'status':'confirmed'},{'_id':0}):raise HTTPException(409,'Appointment has already been charged')
    if data.payment_method not in CHECKOUT_PAYMENT_METHODS:raise HTTPException(400,'Unsupported payment method')
    if data.discount_amount<0 or data.tip_amount<0:raise HTTPException(400,'Discount and tip cannot be negative')
    org_id=apt['organization_id'];service=await db.services.find_one({'service_id':apt['service_id'],'organization_id':org_id},{'_id':0});barber=await db.barbers.find_one({'barber_id':apt['barber_id'],'organization_id':org_id},{'_id':0})
    if not service or not barber:raise HTTPException(409,'Service or professional unavailable')
    price=round(float(service.get('price',0)),2);discount=round(float(data.discount_amount),2);tip=round(float(data.tip_amount),2)
    if discount>price:raise HTTPException(400,'Discount cannot exceed service price')
    override=await db.staff_commission_overrides.find_one({'organization_id':org_id,'barber_id':apt['barber_id'],'active':True},{'_id':0});settings=await db.commission_settings.find_one({'organization_id':org_id},{'_id':0}) or DEFAULT_COMMISSION_SETTINGS
    staff_pct=float(override['staff_percent'] if override else settings['default_staff_percent']);business_pct=float(override['business_percent'] if override else settings['default_business_percent']);validate_commission_split(staff_pct,business_pct)
    plan=await prepare_checkout_inventory(db,org_id,apt['service_id'],appointment_id);reserved=await reserve_checkout_inventory(db,plan,org_id)
    net=round(price-discount,2);staff_amount=round(net*staff_pct/100,2);business_amount=round(net-staff_amount,2);now=datetime.now(timezone.utc).isoformat();recipe=plan.get('recipe') or {}
    item={'transaction_id':f'txn_{uuid.uuid4().hex[:12]}','organization_id':org_id,'appointment_id':appointment_id,'barber_id':apt['barber_id'],'barber_name_snapshot':barber.get('display_name') or barber.get('name'),'service_id':apt['service_id'],'service_name_snapshot':service.get('name'),'service_price_snapshot':price,'discount_amount':discount,'net_service_amount':net,'tip_amount':tip,'total_received':round(net+tip,2),'payment_method':data.payment_method,'staff_percent_snapshot':staff_pct,'business_percent_snapshot':business_pct,'commission_source_snapshot':'override' if override else 'default','staff_commission_amount':staff_amount,'business_amount':business_amount,'staff_total_amount':round(staff_amount+tip,2),'recipe_id_snapshot':recipe.get('recipe_id'),'recipe_version_snapshot':recipe.get('version'),'inventory_policy_snapshot':plan['policy'],'material_cost_expected':plan['material_cost_expected'],'material_cost_consumed':plan['material_cost_consumed'],'inventory_warning':bool(plan['shortages']),'inventory_shortage_count':len(plan['shortages']),'inventory_consumption_status':plan['status'],'inventory_shortages':plan['shortages'],'notes':(data.notes or '').strip()[:500] or None,'status':'confirmed','created_by':user.user_id,'created_at':now}
    try:
        await db.transactions.insert_one(item.copy())
        await finalize_checkout_inventory(db,plan,reserved,org_id,appointment_id,item['transaction_id'],apt['service_id'],user.user_id)
        result=await db.appointments.update_one({'appointment_id':appointment_id,'status':'confirmed'},{'$set':{'status':'completed','completed_at':now,'transaction_id':item['transaction_id'],'updated_at':now}})
        if result.modified_count!=1:raise HTTPException(409,'Appointment state changed during checkout')
    except Exception as exc:
        await rollback_checkout_inventory(db,reserved,org_id,item['transaction_id']);await db.transactions.update_one({'transaction_id':item['transaction_id']},{'$set':{'status':'voided','void_reason':'Checkout inventory rollback','voided_at':now}})
        if 'duplicate' in str(exc).lower() or 'E11000' in str(exc):raise HTTPException(409,'Appointment has already been charged')
        raise
    if apt.get('client_phone'):await db.clients.update_one({'phone':apt['client_phone'],'organization_id':org_id},{'$inc':{'total_visits':1},'$set':{'last_visit':apt.get('date'),'updated_at':now}})
    await commission_audit(org_id,'appointment_checkout_completed',item['transaction_id'],user.user_id,None,{k:v for k,v in item.items() if k!='notes'},data.notes)
    return item

@api_router.get("/appointments/{appointment_id}/transaction")
async def get_appointment_transaction(appointment_id: str, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user=await get_current_user(authorization,session_token); require_management_role(user)
    apt=await db.appointments.find_one({"appointment_id":appointment_id},{"_id":0})
    if not apt: raise HTTPException(status_code=404,detail="Appointment not found")
    if not await validate_organization_access(user,apt["organization_id"]): raise HTTPException(status_code=403,detail="Access denied")
    item=await db.transactions.find_one({"appointment_id":appointment_id,"status":"confirmed"},{"_id":0})
    if not item: raise HTTPException(status_code=404,detail="Transaction not found")
    return item

# ==================== TRANSACTION REVENUE STATISTICS ====================
# NEXUS_TRANSACTION_REVENUE_STATISTICS_V1

def transaction_date_filter(start_date: Optional[str], end_date: Optional[str]) -> Optional[dict]:
    if not start_date and not end_date:
        return None
    date_filter = {}
    try:
        if start_date:
            start_value = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            date_filter["$gte"] = start_value.isoformat()
        if end_date:
            end_value = datetime.strptime(end_date, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc
            )
            date_filter["$lte"] = end_value.isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must use YYYY-MM-DD format")
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")
    return date_filter


async def transaction_query(
    current_user: User,
    organization_id: Optional[str],
    start_date: Optional[str],
    end_date: Optional[str],
    barber_id: Optional[str],
    payment_method: Optional[str]
) -> dict:
    require_management_role(current_user)
    resolved_org_id = await resolve_team_organization(current_user, organization_id)
    query = {"organization_id": resolved_org_id, "status": "confirmed"}
    created_filter = transaction_date_filter(start_date, end_date)
    if created_filter:
        query["created_at"] = created_filter
    if barber_id:
        barber = await db.barbers.find_one(
            {"barber_id": barber_id, "organization_id": resolved_org_id}, {"_id": 0}
        )
        if not barber:
            raise HTTPException(status_code=404, detail="Professional not found")
        query["barber_id"] = barber_id
    if payment_method:
        if payment_method not in CHECKOUT_PAYMENT_METHODS:
            raise HTTPException(status_code=400, detail="Unsupported payment method")
        query["payment_method"] = payment_method
    return query


@api_router.get("/transactions")
async def list_transactions(
    organization_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    barber_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    limit: int = 200,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    query = await transaction_query(
        current_user, organization_id, start_date, end_date, barber_id, payment_method
    )
    paged = page is not None or page_size is not None
    if not paged:
        safe_limit = max(1, min(limit, 1000))
        return await db.transactions.find(query, {"_id": 0}).sort([("created_at", -1), ("transaction_id", -1)]).to_list(safe_limit)
    safe_page = max(1, page or 1)
    safe_size = max(1, min(page_size or 25, 100))
    total = await db.transactions.count_documents(query)
    items = await db.transactions.find(query, {"_id": 0}).sort([("created_at", -1), ("transaction_id", -1)]).skip((safe_page - 1) * safe_size).limit(safe_size).to_list(safe_size)
    total_pages = (total + safe_size - 1) // safe_size
    return {"items": items, "page": safe_page, "page_size": safe_size, "total": total, "total_pages": total_pages, "has_next": safe_page < total_pages, "has_previous": safe_page > 1}


@api_router.get("/transactions/summary")
async def transaction_summary(
    organization_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    barber_id: Optional[str] = None,
    payment_method: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    query = await transaction_query(
        current_user, organization_id, start_date, end_date, barber_id, payment_method
    )
    items = await db.transactions.find(query, {"_id": 0}).to_list(100000)
    totals = {
        "transaction_count": len(items),
        "total_service_price": 0.0,
        "total_discount": 0.0,
        "total_net_service_amount": 0.0,
        "total_tips": 0.0,
        "total_received": 0.0,
        "total_staff_commission": 0.0,
        "total_business_amount": 0.0,
        "total_staff_amount": 0.0
    }
    payment_totals = {}
    daily_totals = {}
    for item in items:
        totals["total_service_price"] += float(item.get("service_price_snapshot", 0) or 0)
        totals["total_discount"] += float(item.get("discount_amount", 0) or 0)
        totals["total_net_service_amount"] += float(item.get("net_service_amount", 0) or 0)
        totals["total_tips"] += float(item.get("tip_amount", 0) or 0)
        totals["total_received"] += float(item.get("total_received", 0) or 0)
        totals["total_staff_commission"] += float(item.get("staff_commission_amount", 0) or 0)
        totals["total_business_amount"] += float(item.get("business_amount", 0) or 0)
        totals["total_staff_amount"] += float(item.get("staff_total_amount", 0) or 0)
        method = item.get("payment_method", "other")
        method_row = payment_totals.setdefault(method, {"method": method, "count": 0, "total_received": 0.0})
        method_row["count"] += 1
        method_row["total_received"] += float(item.get("total_received", 0) or 0)
        day = str(item.get("created_at", ""))[:10] or "unknown"
        day_row = daily_totals.setdefault(day, {"date": day, "total_received": 0.0, "net_service_amount": 0.0, "transaction_count": 0})
        day_row["total_received"] += float(item.get("total_received", 0) or 0)
        day_row["net_service_amount"] += float(item.get("net_service_amount", 0) or 0)
        day_row["transaction_count"] += 1
    for key in totals:
        if key != "transaction_count":
            totals[key] = round(totals[key], 2)
    for row in payment_totals.values():
        row["total_received"] = round(row["total_received"], 2)
    for row in daily_totals.values():
        row["total_received"] = round(row["total_received"], 2)
        row["net_service_amount"] = round(row["net_service_amount"], 2)
    totals["average_ticket"] = round(totals["total_received"] / len(items), 2) if items else 0.0
    totals["payment_methods"] = sorted(payment_totals.values(), key=lambda row: row["total_received"], reverse=True)
    totals["daily_totals"] = [daily_totals[key] for key in sorted(daily_totals)]
    return totals


@api_router.get("/transactions/{transaction_id}")
async def get_transaction_detail(
    transaction_id: str,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)
    item = await db.transactions.find_one(
        {"transaction_id": transaction_id, "status": "confirmed"}, {"_id": 0}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if not await validate_organization_access(current_user, item["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    return item


# ==================== END TRANSACTION REVENUE STATISTICS ====================

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


# ==================== STAFF INCOME PORTAL ====================
# NEXUS_STAFF_INCOME_BACKEND_V1

async def resolve_current_staff_barber(current_user: User) -> dict:
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="Staff access required")
    if current_user.access_status != "approved":
        raise HTTPException(status_code=403, detail="Account is not approved")
    barber = await db.barbers.find_one(
        {"user_id": current_user.user_id, "organization_id": current_user.organization_id},
        {"_id": 0}
    )
    if not barber:
        raise HTTPException(status_code=404, detail="Professional profile not found")
    return barber


async def current_staff_income_query(
    current_user: User,
    start_date: Optional[str],
    end_date: Optional[str]
) -> dict:
    barber = await resolve_current_staff_barber(current_user)
    query = {
        "organization_id": barber["organization_id"],
        "barber_id": barber["barber_id"],
        "status": "confirmed"
    }
    created_filter = transaction_date_filter(start_date, end_date)
    if created_filter:
        query["created_at"] = created_filter
    return query


@api_router.get("/staff/income/transactions")
async def get_my_income_transactions(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 500,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    query = await current_staff_income_query(current_user, start_date, end_date)
    safe_limit = max(1, min(limit, 1000))
    items = await db.transactions.find(query, {
        "_id": 0,
        "transaction_id": 1,
        "appointment_id": 1,
        "service_name_snapshot": 1,
        "net_service_amount": 1,
        "tip_amount": 1,
        "staff_percent_snapshot": 1,
        "staff_commission_amount": 1,
        "staff_total_amount": 1,
        "payment_method": 1,
        "created_at": 1,
        "status": 1
    }).sort("created_at", -1).to_list(safe_limit)
    return items


@api_router.get("/staff/income/summary")
async def get_my_income_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    barber = await resolve_current_staff_barber(current_user)
    query = await current_staff_income_query(current_user, start_date, end_date)
    items = await db.transactions.find(query, {
        "_id": 0,
        "net_service_amount": 1,
        "tip_amount": 1,
        "staff_commission_amount": 1,
        "staff_total_amount": 1,
        "created_at": 1
    }).to_list(100000)
    service_count = len(items)
    total_net = round(sum(float(item.get("net_service_amount", 0) or 0) for item in items), 2)
    total_commission = round(sum(float(item.get("staff_commission_amount", 0) or 0) for item in items), 2)
    total_tips = round(sum(float(item.get("tip_amount", 0) or 0) for item in items), 2)
    total_staff = round(sum(float(item.get("staff_total_amount", 0) or 0) for item in items), 2)
    daily = {}
    for item in items:
        day = str(item.get("created_at", ""))[:10] or "unknown"
        row = daily.setdefault(day, {
            "date": day,
            "service_count": 0,
            "commission_amount": 0.0,
            "tip_amount": 0.0,
            "staff_total_amount": 0.0
        })
        row["service_count"] += 1
        row["commission_amount"] += float(item.get("staff_commission_amount", 0) or 0)
        row["tip_amount"] += float(item.get("tip_amount", 0) or 0)
        row["staff_total_amount"] += float(item.get("staff_total_amount", 0) or 0)
    for row in daily.values():
        row["commission_amount"] = round(row["commission_amount"], 2)
        row["tip_amount"] = round(row["tip_amount"], 2)
        row["staff_total_amount"] = round(row["staff_total_amount"], 2)
    return {
        "barber_id": barber["barber_id"],
        "professional_name": barber.get("display_name") or barber.get("name") or current_user.name,
        "service_count": service_count,
        "total_net_service_amount": total_net,
        "total_commission_amount": total_commission,
        "total_tip_amount": total_tips,
        "total_staff_amount": total_staff,
        "average_staff_amount": round(total_staff / service_count, 2) if service_count else 0.0,
        "daily_totals": [daily[key] for key in sorted(daily)]
    }


# ==================== END STAFF INCOME PORTAL ====================

# ==================== STAFF SETTLEMENT HISTORY ====================
# NEXUS_STAFF_SETTLEMENTS_COMPLETION_V1

@api_router.get("/staff/settlements/summary")
async def get_my_settlement_summary(
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    barber = await resolve_current_staff_barber(current_user)
    base = {"organization_id": barber["organization_id"], "barber_id": barber["barber_id"]}
    pending_items = await db.transactions.find({
        **base,
        "status": "confirmed",
        "$or": [
            {"settlement_id": {"$exists": False}},
            {"settlement_id": None},
            {"settlement_status": "cancelled"}
        ]
    }, {"_id": 0, "staff_total_amount": 1}).to_list(100000)
    settlements = await db.staff_settlements.find(
        {**base, "status": {"$in": ["draft", "approved", "paid"]}},
        {"_id": 0, "status": 1, "total_amount": 1}
    ).to_list(100000)
    def amount_for(status_value: str) -> float:
        return round(sum(float(item.get("total_amount", 0) or 0) for item in settlements if item.get("status") == status_value), 2)
    return {
        "barber_id": barber["barber_id"],
        "pending_amount": round(sum(float(item.get("staff_total_amount", 0) or 0) for item in pending_items), 2),
        "draft_amount": amount_for("draft"),
        "approved_amount": amount_for("approved"),
        "paid_amount": amount_for("paid"),
        "pending_transaction_count": len(pending_items),
        "draft_settlement_count": sum(1 for item in settlements if item.get("status") == "draft"),
        "approved_settlement_count": sum(1 for item in settlements if item.get("status") == "approved"),
        "paid_settlement_count": sum(1 for item in settlements if item.get("status") == "paid"),
        "settlement_count": len(settlements)
    }


@api_router.get("/staff/settlements")
async def list_my_settlements(
    status: Optional[str] = None,
    limit: int = 200,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    barber = await resolve_current_staff_barber(current_user)
    query = {"organization_id": barber["organization_id"], "barber_id": barber["barber_id"]}
    if status:
        if status not in SETTLEMENT_STATUSES:
            raise HTTPException(status_code=400, detail="Unsupported settlement status")
        query["status"] = status
    safe_limit = max(1, min(limit, 500))
    return await db.staff_settlements.find(query, {
        "_id": 0,
        "settlement_id": 1,
        "staff_name_snapshot": 1,
        "period_start": 1,
        "period_end": 1,
        "transaction_count": 1,
        "commission_amount": 1,
        "tip_amount": 1,
        "total_amount": 1,
        "status": 1,
        "payment_method": 1,
        "payment_reference": 1,
        "created_at": 1,
        "approved_at": 1,
        "paid_at": 1,
        "cancelled_at": 1
    }).sort("created_at", -1).to_list(safe_limit)


@api_router.get("/staff/settlements/{settlement_id}")
async def get_my_settlement_detail(
    settlement_id: str,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    barber = await resolve_current_staff_barber(current_user)
    settlement = await db.staff_settlements.find_one({
        "settlement_id": settlement_id,
        "organization_id": barber["organization_id"],
        "barber_id": barber["barber_id"]
    }, {"_id": 0, "created_by": 0, "approved_by": 0, "paid_by": 0, "cancelled_by": 0})
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    transactions = await db.transactions.find({
        "settlement_id": settlement_id,
        "organization_id": barber["organization_id"],
        "barber_id": barber["barber_id"]
    }, {
        "_id": 0,
        "transaction_id": 1,
        "appointment_id": 1,
        "service_name_snapshot": 1,
        "staff_percent_snapshot": 1,
        "staff_commission_amount": 1,
        "tip_amount": 1,
        "staff_total_amount": 1,
        "created_at": 1,
        "settlement_status": 1
    }).sort("created_at", 1).to_list(100000)
    return {**settlement, "transactions": transactions}


# ==================== END STAFF SETTLEMENT HISTORY ====================

# ==================== STAFF APPOINTMENTS PORTAL ====================
# NEXUS_STAFF_APPOINTMENTS_BACKEND_V1

STAFF_APPOINTMENT_STATUSES = {"confirmed", "completed", "cancelled"}


def staff_appointment_date_filter(start_date: Optional[str], end_date: Optional[str]) -> Optional[dict]:
    if not start_date and not end_date:
        return None
    try:
        if start_date:
            datetime.strptime(start_date, "%Y-%m-%d")
        if end_date:
            datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must use YYYY-MM-DD format")
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date cannot be after end_date")
    date_filter = {}
    if start_date:
        date_filter["$gte"] = start_date
    if end_date:
        date_filter["$lte"] = end_date
    return date_filter


async def current_staff_appointment_query(
    current_user: User,
    start_date: Optional[str],
    end_date: Optional[str],
    status: Optional[str]
) -> dict:
    barber = await resolve_current_staff_barber(current_user)
    query = {
        "organization_id": barber["organization_id"],
        "barber_id": barber["barber_id"]
    }
    date_filter = staff_appointment_date_filter(start_date, end_date)
    if date_filter:
        query["date"] = date_filter
    if status:
        if status not in STAFF_APPOINTMENT_STATUSES:
            raise HTTPException(status_code=400, detail="Unsupported appointment status")
        query["status"] = status
    return query


async def enrich_staff_appointments(items: List[dict], organization_id: str) -> List[dict]:
    service_ids = list({item.get("service_id") for item in items if item.get("service_id")})
    services = await db.services.find(
        {"organization_id": organization_id, "service_id": {"$in": service_ids}},
        {"_id": 0, "service_id": 1, "name": 1, "duration": 1}
    ).to_list(1000) if service_ids else []
    service_lookup = {service["service_id"]: service for service in services}
    appointment_ids = [item["appointment_id"] for item in items if item.get("appointment_id")]
    transactions = await db.transactions.find(
        {
            "organization_id": organization_id,
            "appointment_id": {"$in": appointment_ids},
            "status": "confirmed"
        },
        {"_id": 0, "appointment_id": 1, "transaction_id": 1}
    ).to_list(1000) if appointment_ids else []
    transaction_lookup = {item["appointment_id"]: item["transaction_id"] for item in transactions}
    for item in items:
        service = service_lookup.get(item.get("service_id"), {})
        item["service_name"] = service.get("name", "Servicio")
        item["service_duration"] = service.get("duration", 30)
        item["transaction_id"] = transaction_lookup.get(item.get("appointment_id"))
    return items


@api_router.get("/staff/appointments")
async def get_my_staff_appointments(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 500,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    barber = await resolve_current_staff_barber(current_user)
    query = await current_staff_appointment_query(current_user, start_date, end_date, status)
    safe_limit = max(1, min(limit, 1000))
    items = await db.appointments.find(query, {
        "_id": 0,
        "appointment_id": 1,
        "organization_id": 1,
        "service_id": 1,
        "barber_id": 1,
        "client_name": 1,
        "client_phone": 1,
        "client_email": 1,
        "date": 1,
        "time": 1,
        "status": 1,
        "created_at": 1,
        "completed_at": 1
    }).sort([("date", 1), ("time", 1)]).to_list(safe_limit)
    return await enrich_staff_appointments(items, barber["organization_id"])


@api_router.get("/staff/appointments/summary")
async def get_my_staff_appointments_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    query = await current_staff_appointment_query(current_user, start_date, end_date, None)
    items = await db.appointments.find(query, {"_id": 0, "date": 1, "time": 1, "status": 1}).to_list(100000)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_time = datetime.now(timezone.utc).strftime("%H:%M")
    return {
        "total_appointments": len(items),
        "confirmed_count": sum(1 for item in items if item.get("status") == "confirmed"),
        "completed_count": sum(1 for item in items if item.get("status") == "completed"),
        "cancelled_count": sum(1 for item in items if item.get("status") == "cancelled"),
        "today_count": sum(1 for item in items if item.get("date") == today),
        "upcoming_count": sum(
            1 for item in items
            if item.get("status") == "confirmed"
            and (
                item.get("date", "") > today
                or (item.get("date") == today and item.get("time", "") >= now_time)
            )
        )
    }


# ==================== END STAFF APPOINTMENTS PORTAL ====================

# ==================== STAFF SETTLEMENTS FOUNDATION ====================
# NEXUS_STAFF_SETTLEMENTS_FOUNDATION_V1

SETTLEMENT_STATUSES = {"draft", "approved", "paid", "cancelled"}


def settlement_period_filter(period_start: str, period_end: str) -> dict:
    try:
        start_value = datetime.strptime(period_start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_value = datetime.strptime(period_end, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must use YYYY-MM-DD format")
    if period_start > period_end:
        raise HTTPException(status_code=400, detail="period_start cannot be after period_end")
    return {"$gte": start_value.isoformat(), "$lte": end_value.isoformat()}


async def settlement_organization(current_user: User, organization_id: Optional[str]) -> str:
    require_management_role(current_user)
    return await resolve_team_organization(current_user, organization_id)


@api_router.get("/settlements/pending")
async def get_pending_settlements(
    organization_id: Optional[str] = None,
    barber_id: Optional[str] = None,
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    org_id = await settlement_organization(current_user, organization_id)
    match = {
        "organization_id": org_id,
        "status": "confirmed",
        "$or": [
            {"settlement_id": {"$exists": False}},
            {"settlement_id": None},
            {"settlement_status": "cancelled"}
        ]
    }
    if barber_id:
        barber = await db.barbers.find_one(
            {"organization_id": org_id, "barber_id": barber_id}, {"_id": 0}
        )
        if not barber:
            raise HTTPException(status_code=404, detail="Professional not found")
        match["barber_id"] = barber_id
    if period_start or period_end:
        if not period_start or not period_end:
            raise HTTPException(status_code=400, detail="period_start and period_end are both required")
        match["created_at"] = settlement_period_filter(period_start, period_end)
    rows = await db.transactions.aggregate([
        {"$match": match},
        {"$group": {
            "_id": {
                "barber_id": "$barber_id",
                "staff_name": "$barber_name_snapshot"
            },
            "transaction_count": {"$sum": 1},
            "commission_amount": {"$sum": "$staff_commission_amount"},
            "tip_amount": {"$sum": "$tip_amount"},
            "total_amount": {"$sum": "$staff_total_amount"},
            "oldest_transaction_at": {"$min": "$created_at"},
            "newest_transaction_at": {"$max": "$created_at"}
        }},
        {"$sort": {"_id.staff_name": 1}}
    ]).to_list(1000)
    return [{
        "organization_id": org_id,
        "barber_id": row["_id"]["barber_id"],
        "staff_name": row["_id"].get("staff_name") or "Profesional",
        "transaction_count": row["transaction_count"],
        "commission_amount": round(float(row.get("commission_amount", 0) or 0), 2),
        "tip_amount": round(float(row.get("tip_amount", 0) or 0), 2),
        "total_amount": round(float(row.get("total_amount", 0) or 0), 2),
        "oldest_transaction_at": row.get("oldest_transaction_at"),
        "newest_transaction_at": row.get("newest_transaction_at")
    } for row in rows]


@api_router.post("/settlements")
async def create_staff_settlement(
    data: SettlementCreateRequest,
    organization_id: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    org_id = await settlement_organization(current_user, organization_id)
    barber = await db.barbers.find_one(
        {"organization_id": org_id, "barber_id": data.barber_id}, {"_id": 0}
    )
    if not barber:
        raise HTTPException(status_code=404, detail="Professional not found")
    created_filter = settlement_period_filter(data.period_start, data.period_end)
    available_query = {
        "organization_id": org_id,
        "barber_id": data.barber_id,
        "status": "confirmed",
        "created_at": created_filter,
        "$or": [
            {"settlement_id": {"$exists": False}},
            {"settlement_id": None},
            {"settlement_status": "cancelled"}
        ]
    }
    transactions = await db.transactions.find(available_query, {"_id": 0}).sort("created_at", 1).to_list(100000)
    if not transactions:
        raise HTTPException(status_code=409, detail="No pending transactions for this professional and period")
    transaction_ids = [item["transaction_id"] for item in transactions]
    settlement_id = f"stl_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    claim_filter = {
        "transaction_id": {"$in": transaction_ids},
        "organization_id": org_id,
        "barber_id": data.barber_id,
        "status": "confirmed",
        "$or": [
            {"settlement_id": {"$exists": False}},
            {"settlement_id": None},
            {"settlement_status": "cancelled"}
        ]
    }
    claim = await db.transactions.update_many(claim_filter, {"$set": {
        "settlement_id": settlement_id,
        "settlement_status": "draft",
        "settled_at": now
    }})
    if claim.modified_count != len(transaction_ids):
        await db.transactions.update_many(
            {"settlement_id": settlement_id, "settlement_status": "draft"},
            {"$unset": {"settlement_id": "", "settlement_status": "", "settled_at": ""}}
        )
        raise HTTPException(status_code=409, detail="One or more transactions were already included in another settlement")
    notes = (data.notes or "").strip()[:500] or None
    settlement = {
        "settlement_id": settlement_id,
        "organization_id": org_id,
        "barber_id": data.barber_id,
        "staff_name_snapshot": barber.get("display_name") or barber.get("name") or "Profesional",
        "period_start": data.period_start,
        "period_end": data.period_end,
        "transaction_ids": transaction_ids,
        "transaction_count": len(transaction_ids),
        "commission_amount": round(sum(float(item.get("staff_commission_amount", 0) or 0) for item in transactions), 2),
        "tip_amount": round(sum(float(item.get("tip_amount", 0) or 0) for item in transactions), 2),
        "total_amount": round(sum(float(item.get("staff_total_amount", 0) or 0) for item in transactions), 2),
        "status": "draft",
        "notes": notes,
        "created_by": current_user.user_id,
        "created_at": now,
        "updated_at": now
    }
    try:
        await db.staff_settlements.insert_one(settlement.copy())
    except Exception:
        await db.transactions.update_many(
            {"settlement_id": settlement_id, "settlement_status": "draft"},
            {"$unset": {"settlement_id": "", "settlement_status": "", "settled_at": ""}}
        )
        raise
    return settlement


@api_router.get("/settlements")
async def list_staff_settlements(
    organization_id: Optional[str] = None,
    barber_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 500,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    org_id = await settlement_organization(current_user, organization_id)
    query = {"organization_id": org_id}
    if barber_id:
        query["barber_id"] = barber_id
    if status:
        if status not in SETTLEMENT_STATUSES:
            raise HTTPException(status_code=400, detail="Unsupported settlement status")
        query["status"] = status
    paged = page is not None or page_size is not None
    if not paged:
        safe_limit = max(1, min(limit, 1000))
        return await db.staff_settlements.find(query, {"_id": 0}).sort([("created_at", -1), ("settlement_id", -1)]).to_list(safe_limit)
    safe_page = max(1, page or 1)
    safe_size = max(1, min(page_size or 25, 100))
    total = await db.staff_settlements.count_documents(query)
    items = await db.staff_settlements.find(query, {"_id": 0}).sort([("created_at", -1), ("settlement_id", -1)]).skip((safe_page - 1) * safe_size).limit(safe_size).to_list(safe_size)
    total_pages = (total + safe_size - 1) // safe_size
    return {"items": items, "page": safe_page, "page_size": safe_size, "total": total, "total_pages": total_pages, "has_next": safe_page < total_pages, "has_previous": safe_page > 1}


@api_router.get("/settlements/{settlement_id}")
async def get_staff_settlement(
    settlement_id: str,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)
    settlement = await db.staff_settlements.find_one({"settlement_id": settlement_id}, {"_id": 0})
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    if not await validate_organization_access(current_user, settlement["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    transactions = await db.transactions.find(
        {"settlement_id": settlement_id},
        {"_id": 0, "management_token_hash": 0}
    ).sort("created_at", 1).to_list(100000)
    return {**settlement, "transactions": transactions}


# ==================== END STAFF SETTLEMENTS FOUNDATION ====================

# ==================== STAFF SETTLEMENTS WORKFLOW ====================
# NEXUS_STAFF_SETTLEMENTS_WORKFLOW_V1

SETTLEMENT_PAYMENT_METHODS = {"cash", "transfer", "bank_transfer", "nequi", "daviplata", "other"}


async def get_authorized_settlement(current_user: User, settlement_id: str) -> dict:
    require_management_role(current_user)
    settlement = await db.staff_settlements.find_one({"settlement_id": settlement_id}, {"_id": 0})
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    if not await validate_organization_access(current_user, settlement["organization_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    return settlement


@api_router.post("/settlements/{settlement_id}/approve")
async def approve_staff_settlement(
    settlement_id: str,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    settlement = await get_authorized_settlement(current_user, settlement_id)
    if settlement.get("status") != "draft":
        raise HTTPException(status_code=409, detail="Only draft settlements can be approved")
    now = datetime.now(timezone.utc).isoformat()
    result = await db.staff_settlements.update_one(
        {"settlement_id": settlement_id, "status": "draft"},
        {"$set": {
            "status": "approved",
            "approved_by": current_user.user_id,
            "approved_at": now,
            "updated_at": now
        }}
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Settlement state changed")
    transaction_result = await db.transactions.update_many(
        {"settlement_id": settlement_id, "settlement_status": "draft", "status": "confirmed"},
        {"$set": {"settlement_status": "approved"}}
    )
    if transaction_result.modified_count != settlement.get("transaction_count", 0):
        await db.staff_settlements.update_one(
            {"settlement_id": settlement_id, "status": "approved"},
            {"$set": {"status": "draft", "updated_at": now}, "$unset": {"approved_by": "", "approved_at": ""}}
        )
        await db.transactions.update_many(
            {"settlement_id": settlement_id, "settlement_status": "approved"},
            {"$set": {"settlement_status": "draft"}}
        )
        raise HTTPException(status_code=409, detail="Settlement transactions are inconsistent")
    updated = await db.staff_settlements.find_one({"settlement_id": settlement_id}, {"_id": 0})
    await commission_audit(
        settlement["organization_id"], "staff_settlement_approved", settlement_id,
        current_user.user_id, settlement, updated, "Settlement approved"
    )
    return updated


@api_router.post("/settlements/{settlement_id}/pay")
async def pay_staff_settlement(
    settlement_id: str,
    data: SettlementPaymentRequest,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    settlement = await get_authorized_settlement(current_user, settlement_id)
    if settlement.get("status") != "approved":
        raise HTTPException(status_code=409, detail="Only approved settlements can be paid")
    if data.payment_method not in SETTLEMENT_PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Unsupported settlement payment method")
    reference = (data.payment_reference or "").strip()[:200] or None
    notes = (data.notes or "").strip()[:500] or settlement.get("notes")
    now = datetime.now(timezone.utc).isoformat()
    result = await db.staff_settlements.update_one(
        {"settlement_id": settlement_id, "status": "approved"},
        {"$set": {
            "status": "paid",
            "payment_method": data.payment_method,
            "payment_reference": reference,
            "notes": notes,
            "paid_by": current_user.user_id,
            "paid_at": now,
            "updated_at": now
        }}
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Settlement state changed")
    transaction_result = await db.transactions.update_many(
        {"settlement_id": settlement_id, "settlement_status": "approved", "status": "confirmed"},
        {"$set": {"settlement_status": "paid", "settlement_paid_at": now}}
    )
    if transaction_result.modified_count != settlement.get("transaction_count", 0):
        await db.staff_settlements.update_one(
            {"settlement_id": settlement_id, "status": "paid"},
            {"$set": {"status": "approved", "updated_at": now}, "$unset": {
                "payment_method": "", "payment_reference": "", "paid_by": "", "paid_at": ""
            }}
        )
        await db.transactions.update_many(
            {"settlement_id": settlement_id, "settlement_status": "paid"},
            {"$set": {"settlement_status": "approved"}, "$unset": {"settlement_paid_at": ""}}
        )
        raise HTTPException(status_code=409, detail="Settlement transactions are inconsistent")
    updated = await db.staff_settlements.find_one({"settlement_id": settlement_id}, {"_id": 0})
    await commission_audit(
        settlement["organization_id"], "staff_settlement_paid", settlement_id,
        current_user.user_id, settlement, updated, reference or data.payment_method
    )
    return updated


@api_router.post("/settlements/{settlement_id}/cancel")
async def cancel_staff_settlement(
    settlement_id: str,
    data: SettlementCancelRequest,
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None)
):
    current_user = await get_current_user(authorization, session_token)
    settlement = await get_authorized_settlement(current_user, settlement_id)
    if settlement.get("status") == "paid":
        raise HTTPException(status_code=409, detail="Paid settlements cannot be cancelled")
    if settlement.get("status") == "cancelled":
        raise HTTPException(status_code=409, detail="Settlement is already cancelled")
    reason = data.reason.strip()[:500]
    if len(reason) < 5:
        raise HTTPException(status_code=400, detail="Cancellation reason must contain at least 5 characters")
    previous_status = settlement.get("status")
    now = datetime.now(timezone.utc).isoformat()
    result = await db.staff_settlements.update_one(
        {"settlement_id": settlement_id, "status": previous_status},
        {"$set": {
            "status": "cancelled",
            "cancel_reason": reason,
            "cancelled_by": current_user.user_id,
            "cancelled_at": now,
            "updated_at": now
        }}
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Settlement state changed")
    await db.transactions.update_many(
        {"settlement_id": settlement_id, "settlement_status": previous_status},
        {"$unset": {
            "settlement_id": "", "settlement_status": "", "settled_at": "", "settlement_paid_at": ""
        }}
    )
    updated = await db.staff_settlements.find_one({"settlement_id": settlement_id}, {"_id": 0})
    await commission_audit(
        settlement["organization_id"], "staff_settlement_cancelled", settlement_id,
        current_user.user_id, settlement, updated, reason
    )
    return updated


# ==================== END STAFF SETTLEMENTS WORKFLOW ====================

# ==================== CLIENTS ENDPOINTS ====================

@api_router.get("/clients")
async def get_clients(organization_id: Optional[str] = None, page: Optional[int] = None, page_size: Optional[int] = None, search: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)
    org_filter = await get_organization_filter(current_user, organization_id)
    if search and search.strip():
        pattern = re.escape(search.strip())
        org_filter["$or"] = [
            {"name": {"$regex": pattern, "$options": "i"}},
            {"phone": {"$regex": pattern, "$options": "i"}},
            {"email": {"$regex": pattern, "$options": "i"}},
        ]

    paged = page is not None or page_size is not None
    safe_page = max(1, page or 1)
    safe_size = max(1, min(page_size or 25, 100))
    cursor = db.clients.find(org_filter, {"_id": 0}).sort([("total_visits", -1), ("client_id", 1)])
    total = await db.clients.count_documents(org_filter) if paged else None
    if paged:
        clients = await cursor.skip((safe_page - 1) * safe_size).limit(safe_size).to_list(safe_size)
    else:
        clients = await cursor.to_list(1000)

    for client in clients:
        if isinstance(client.get("created_at"), str):
            client["created_at"] = datetime.fromisoformat(client["created_at"])
        if isinstance(client.get("updated_at"), str):
            client["updated_at"] = datetime.fromisoformat(client["updated_at"])

    if not paged:
        return clients
    total_pages = (total + safe_size - 1) // safe_size
    return {"items": clients, "page": safe_page, "page_size": safe_size, "total": total, "total_pages": total_pages, "has_next": safe_page < total_pages, "has_previous": safe_page > 1}

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
    require_management_role(current_user)
    
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
    require_management_role(current_user)
    
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
    require_management_role(current_user)
    
    # Owner can query any organization, manager only their own
    if current_user.role == "owner":
        if not organization_id:
            items = await db.inventory.find({}, {"_id": 0}).to_list(1000)
        else:
            items = await db.inventory.find({"organization_id": organization_id}, {"_id": 0}).to_list(1000)
    else:
        if not current_user.organization_id:
            raise HTTPException(status_code=403, detail="No organization assigned")
        if organization_id and organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Access denied to this organization")
        items = await db.inventory.find({"organization_id": current_user.organization_id}, {"_id": 0}).to_list(1000)
    
    for item in items:
        if isinstance(item["created_at"], str):
            item["created_at"] = datetime.fromisoformat(item["created_at"])
        item["is_low_stock"] = item["quantity"] <= item["min_stock"]
    return items

@api_router.post("/inventory")
async def create_inventory_item(data: InventoryCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)
    
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
    require_management_role(current_user)
    
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
    require_management_role(current_user)
    await db.inventory.delete_one({"item_id": item_id, "organization_id": current_user.organization_id})
    return {"message": "Item deleted"}

@api_router.post("/inventory/generate-order")
async def generate_purchase_order(authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    current_user = await get_current_user(authorization, session_token)
    require_management_role(current_user)
    
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


# ==================== STRICT PUBLIC AVAILABILITY ====================
# NEXUS_STRICT_AVAILABILITY_V1

def _strict_date(value: str):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Date must use YYYY-MM-DD format")


def _strict_minutes(value: str, field: str = "time") -> int:
    if not isinstance(value, str) or not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
        raise HTTPException(status_code=400, detail=f"Invalid {field}")
    hour, minute = map(int, value.split(":"))
    return hour * 60 + minute


def _nexus_weekday(value) -> int:
    # Python: Monday=0. Nexus: Sunday=0, Monday=1 ... Saturday=6.
    return (value.weekday() + 1) % 7


def _intervals_overlap(start_a: int, end_a: int, start_b: int, end_b: int) -> bool:
    return start_a < end_b and end_a > start_b


async def _strict_booking_context(org_id: str, barber_id: str, service_id: str, date_value: str):
    appointment_date = _strict_date(date_value)
    today = datetime.now(timezone.utc).date()
    if appointment_date < today:
        raise HTTPException(status_code=400, detail="Cannot book appointments in the past")

    barber = await db.barbers.find_one({
        "barber_id": barber_id,
        "organization_id": org_id,
        "$or": [{"active": True}, {"active": {"$exists": False}}]
    }, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Professional not found")

    service = await db.services.find_one({
        "service_id": service_id,
        "organization_id": org_id
    }, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    service_ids = barber.get("service_ids") or []
    if service_ids and service_id not in service_ids:
        raise HTTPException(status_code=409, detail="The selected professional does not provide this service")

    available_days = barber.get("available_days") or [1, 2, 3, 4, 5]
    weekday = _nexus_weekday(appointment_date)
    if weekday not in available_days:
        raise HTTPException(status_code=409, detail="The selected professional does not work on this day")

    start_time = barber.get("start_time") or "09:00"
    end_time = barber.get("end_time") or "18:00"
    work_start = _strict_minutes(start_time, "professional start time")
    work_end = _strict_minutes(end_time, "professional end time")
    if work_end <= work_start:
        raise HTTPException(status_code=409, detail="The professional schedule is not configured correctly")

    try:
        duration = int(service.get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0
    if duration <= 0 or duration > 24 * 60:
        raise HTTPException(status_code=409, detail="The service duration is not configured correctly")

    appointments = await db.appointments.find({
        "organization_id": org_id,
        "barber_id": barber_id,
        "date": date_value,
        "status": {"$ne": "cancelled"}
    }, {"_id": 0, "time": 1, "service_id": 1}).to_list(1000)

    appointment_service_ids = list({item.get("service_id") for item in appointments if item.get("service_id")})
    appointment_services = await db.services.find({
        "organization_id": org_id,
        "service_id": {"$in": appointment_service_ids}
    }, {"_id": 0, "service_id": 1, "duration": 1}).to_list(1000) if appointment_service_ids else []
    duration_lookup = {
        item["service_id"]: int(item.get("duration") or 30)
        for item in appointment_services
    }

    occupied = []
    for item in appointments:
        try:
            item_start = _strict_minutes(item.get("time"), "existing appointment time")
        except HTTPException:
            logger.warning("Skipping appointment with invalid time: %s", item.get("appointment_id"))
            continue
        item_duration = max(1, duration_lookup.get(item.get("service_id"), 30))
        occupied.append((item_start, item_start + item_duration, "appointment"))

    blocked_times = await db.blocked_times.find({
        "organization_id": org_id,
        "barber_id": barber_id,
        "date": date_value
    }, {"_id": 0, "start_time": 1, "end_time": 1}).to_list(1000)
    for item in blocked_times:
        block_start = _strict_minutes(item.get("start_time"), "blocked start time")
        block_end = _strict_minutes(item.get("end_time"), "blocked end time")
        if block_end > block_start:
            occupied.append((block_start, block_end, "blocked"))

    return {
        "date": appointment_date,
        "weekday": weekday,
        "barber": barber,
        "service": service,
        "duration": duration,
        "work_start": work_start,
        "work_end": work_end,
        "occupied": occupied
    }


def _strict_slot_is_available(context: dict, requested_start: int) -> bool:
    requested_end = requested_start + context["duration"]
    if requested_start < context["work_start"] or requested_end > context["work_end"]:
        return False
    return not any(
        _intervals_overlap(requested_start, requested_end, busy_start, busy_end)
        for busy_start, busy_end, _ in context["occupied"]
    )


async def _strict_available_slots(org_id: str, barber_id: str, service_id: str, date_value: str):
    context = await _strict_booking_context(org_id, barber_id, service_id, date_value)
    slots = []
    current = context["work_start"]
    remainder = current % 30
    if remainder:
        current += 30 - remainder
    while current + context["duration"] <= context["work_end"]:
        if _strict_slot_is_available(context, current):
            slots.append(f"{current // 60:02d}:{current % 60:02d}")
        current += 30
    return context, slots


async def _acquire_booking_lock(org_id: str, barber_id: str, date_value: str) -> str:
    lock_id = f"booking:{org_id}:{barber_id}:{date_value}"
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=15)
    await db.booking_locks.delete_many({"_id": lock_id, "expires_at": {"$lte": now}})
    try:
        await db.booking_locks.insert_one({
            "_id": lock_id,
            "organization_id": org_id,
            "barber_id": barber_id,
            "date": date_value,
            "created_at": now,
            "expires_at": expires_at
        })
    except Exception as error:
        if "E11000" in str(error) or "duplicate key" in str(error).lower():
            raise HTTPException(status_code=409, detail="This schedule is being updated. Please try again")
        raise
    return lock_id


# ==================== END STRICT PUBLIC AVAILABILITY ====================

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
    query = {
        "organization_id": org_id,
        "$or": [{"active": True}, {"active": {"$exists": False}}]
    }
    projection = {
        "_id": 0,
        "barber_id": 1,
        "name": 1,
        "display_name": 1,
        "bio": 1,
        "avatar": 1,
        "available_days": 1,
        "start_time": 1,
        "end_time": 1,
        "service_ids": 1
    }
    barbers = await db.barbers.find(query, projection).to_list(1000)
    for barber in barbers:
        barber["display_name"] = barber.get("display_name") or barber.get("name")
        barber["name"] = barber.get("name") or barber["display_name"]
        barber["available_days"] = barber.get("available_days") or [1, 2, 3, 4, 5]
        barber["start_time"] = barber.get("start_time") or "09:00"
        barber["end_time"] = barber.get("end_time") or "18:00"
        barber["service_ids"] = barber.get("service_ids") or []
    return barbers

@api_router.get("/public/{org_id}/availability")
async def get_availability(org_id: str, barber_id: str, date: str, service_id: str):
    context, slots = await _strict_available_slots(org_id, barber_id, service_id, date)
    return {
        "available_slots": slots,
        "date": date,
        "weekday": context["weekday"],
        "working_day": True,
        "start_time": context["barber"].get("start_time") or "09:00",
        "end_time": context["barber"].get("end_time") or "18:00",
        "service_duration": context["duration"]
    }

@api_router.post("/public/{org_id}/appointments")
async def create_public_appointment(org_id: str, data: AppointmentCreate):
    # NEXUS_STRICT_AVAILABILITY_V1
    # Parse safely so malformed requests return 400 instead of 500.
    appointment_date = _strict_date(data.date)
    today = datetime.now(timezone.utc).date()
    if appointment_date < today:
        raise HTTPException(status_code=400, detail="Cannot book appointments in the past")
    
    # Get service to know duration
    service = await db.services.find_one({"service_id": data.service_id, "organization_id": org_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    barber = await db.barbers.find_one({
        "barber_id": data.barber_id,
        "organization_id": org_id,
        "$or": [{"active": True}, {"active": {"$exists": False}}]
    }, {"_id": 0})
    if not barber:
        raise HTTPException(status_code=404, detail="Barber not found")
    service_ids = barber.get("service_ids") or []
    if service_ids and data.service_id not in service_ids:
        raise HTTPException(status_code=400, detail="Barber does not provide this service")
    
    service_duration = service["duration"]

    # NEXUS_STRICT_AVAILABILITY_V1: backend is the final authority.
    booking_lock_id = await _acquire_booking_lock(org_id, data.barber_id, data.date)
    try:
        strict_context, available_slots = await _strict_available_slots(
            org_id, data.barber_id, data.service_id, data.date
        )
        start_minutes = _strict_minutes(data.time, "appointment time")
        if data.time not in available_slots or not _strict_slot_is_available(strict_context, start_minutes):
            raise HTTPException(status_code=409, detail="This time slot is no longer available")
    except Exception:
        await db.booking_locks.delete_one({"_id": booking_lock_id})
        raise

    # Compatibility check retained as defense in depth.
    # Get current appointments
    appointments = await db.appointments.find({
        "organization_id": org_id,
        "barber_id": data.barber_id,
        "date": data.date,
        "status": {"$ne": "cancelled"}
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
    
    # NEXUS_INVENTORY_LEDGER_ROUTES_5A_V1
INVENTORY_MOVEMENT_TYPES = {"purchase", "manual_in", "manual_out", "adjustment_in", "adjustment_out", "return", "waste", "service_consumption", "audit_adjustment_in", "audit_adjustment_out"}
INVENTORY_IN_TYPES = {"purchase", "manual_in", "adjustment_in", "return", "audit_adjustment_in"}

async def inventory_organization(user: User, requested: Optional[str]) -> str:
    require_management_role(user)
    return await resolve_team_organization(user, requested)

@api_router.get("/inventory/summary")
async def inventory_summary(organization_id: Optional[str] = None, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    org_id = await inventory_organization(user, organization_id)
    items = await db.inventory.find({"organization_id": org_id, "active": {"$ne": False}}, {"_id": 0}).to_list(100000)
    return {"item_count": len(items), "low_stock_count": sum(1 for x in items if float(x.get("quantity", 0)) <= float(x.get("min_stock", 0))), "total_units": round(sum(float(x.get("quantity", 0)) for x in items), 4), "inventory_value": round(sum(float(x.get("quantity", 0))*float(x.get("unit_cost", 0)) for x in items), 2)}

@api_router.get("/inventory/movements")
async def inventory_movements(organization_id: Optional[str] = None, inventory_item_id: Optional[str] = None, movement_type: Optional[str] = None, page: int = 1, page_size: int = 25, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    org_id = await inventory_organization(user, organization_id)
    page, page_size = max(1, page), max(1, min(page_size, 100))
    query = {"organization_id": org_id}
    if inventory_item_id: query["inventory_item_id"] = inventory_item_id
    if movement_type: query["movement_type"] = movement_type
    total = await db.inventory_movements.count_documents(query)
    items = await db.inventory_movements.find(query, {"_id": 0}).sort([("created_at", -1), ("movement_id", -1)]).skip((page-1)*page_size).limit(page_size).to_list(page_size)
    pages = (total + page_size - 1)//page_size
    return {"items": items, "page": page, "page_size": page_size, "total": total, "total_pages": pages, "has_next": page < pages, "has_previous": page > 1}

@api_router.post("/inventory/{item_id}/movements")
async def create_inventory_movement(item_id: str, data: InventoryMovementCreate, authorization: Optional[str] = Header(None), session_token: Optional[str] = Cookie(None)):
    user = await get_current_user(authorization, session_token)
    org_id = await inventory_organization(user, data.organization_id)
    if data.movement_type not in INVENTORY_MOVEMENT_TYPES: raise HTTPException(status_code=400, detail="Unsupported inventory movement type")
    quantity = round(float(data.quantity), 4)
    if quantity <= 0: raise HTTPException(status_code=400, detail="Movement quantity must be positive")
    key = (data.idempotency_key or "").strip()[:200] or None
    if key:
        existing = await db.inventory_movements.find_one({"organization_id": org_id, "idempotency_key": key}, {"_id": 0})
        if existing: return {**existing, "idempotent_replay": True}
    item = await db.inventory.find_one({"item_id": item_id, "organization_id": org_id, "active": {"$ne": False}}, {"_id": 0})
    if not item: raise HTTPException(status_code=404, detail="Inventory item not found")
    previous = round(float(item.get("quantity", 0)), 4)
    incoming = data.movement_type in INVENTORY_IN_TYPES
    new_stock = round(previous + quantity if incoming else previous - quantity, 4)
    if new_stock < 0: raise HTTPException(status_code=409, detail="Insufficient inventory stock")
    cost = round(float(data.unit_cost if data.unit_cost is not None else item.get("unit_cost", 0) or 0), 4)
    if cost < 0: raise HTTPException(status_code=400, detail="Unit cost cannot be negative")
    now = datetime.now(timezone.utc).isoformat()
    changed = await db.inventory.update_one({"item_id": item_id, "organization_id": org_id, "quantity": item.get("quantity", 0)}, {"$set": {"quantity": new_stock, "unit_cost": cost if data.unit_cost is not None else item.get("unit_cost", 0), "updated_at": now}})
    if changed.modified_count != 1: raise HTTPException(status_code=409, detail="Inventory changed concurrently; retry")
    movement = {"movement_id": f"mov_{uuid.uuid4().hex[:16]}", "organization_id": org_id, "inventory_item_id": item_id, "item_name_snapshot": item.get("name"), "movement_type": data.movement_type, "direction": "in" if incoming else "out", "quantity": quantity, "unit_cost": cost, "total_cost": round(quantity*cost, 2), "previous_stock": previous, "new_stock": new_stock, "reference_type": (data.reference_type or "manual")[:80], "reference_id": (data.reference_id or "")[:160] or None, "idempotency_key": key, "created_by": user.user_id, "created_at": now, "notes": (data.notes or "").strip()[:500] or None}
    try: await db.inventory_movements.insert_one(movement.copy())
    except Exception:
        await db.inventory.update_one({"item_id": item_id, "organization_id": org_id, "quantity": new_stock}, {"$set": {"quantity": previous, "updated_at": now}})
        raise
    return movement

# NEXUS_PUBLIC_APPOINTMENT_TOKEN_V1
    appointment_id = f"apt_{uuid.uuid4().hex[:12]}"
    management_token = secrets.token_urlsafe(32)
    management_token_hash = hashlib.sha256(management_token.encode("utf-8")).hexdigest()
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
        "management_token_hash": management_token_hash,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        await db.appointments.insert_one(appointment_doc)
        await db.booking_locks.delete_one({"_id": booking_lock_id})
        booking_lock_id = None

        # SEND CONFIRMATION EMAIL
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
                    organization_address=organization.get("address") if organization else None,
                    cancellation_url=(
                        f"{os.environ.get('FRONTEND_URL', '').rstrip('/')}/cancel/"
                        f"{appointment_id}?token={management_token}"
                    )
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
        if booking_lock_id:
            await db.booking_locks.delete_one({"_id": booking_lock_id})
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
    
    logger.info(f"[MOCK] Appointment {appointment_id} confirmed for {data.date} at {data.time}")
    
    appointment_doc["created_at"] = datetime.fromisoformat(appointment_doc["created_at"])
    response_doc = Appointment(**appointment_doc).model_dump()
    response_doc["management_token"] = management_token
    return response_doc

# Public appointment management endpoints
# NEXUS_PUBLIC_APPOINTMENT_TOKEN_V1
def _appointment_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _get_public_appointment_with_token(appointment_id: str, token: str):
    if not token or len(token) < 32:
        raise HTTPException(status_code=403, detail="Invalid or missing appointment link")

    appointment = await db.appointments.find_one(
        {"appointment_id": appointment_id}, {"_id": 0}
    )
    stored_hash = appointment.get("management_token_hash") if appointment else None
    supplied_hash = _appointment_token_hash(token)
    if not appointment or not stored_hash or not secrets.compare_digest(stored_hash, supplied_hash):
        raise HTTPException(status_code=403, detail="Invalid or expired appointment link")
    return appointment


@api_router.post("/public/appointments/{appointment_id}/cancel")
async def cancel_public_appointment(appointment_id: str, token: str):
    appointment = await _get_public_appointment_with_token(appointment_id, token)
    if appointment.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Appointment already cancelled")
    if appointment.get("status") == "completed":
        raise HTTPException(status_code=400, detail="Completed appointments cannot be cancelled")

    result = await db.appointments.update_one(
        {
            "appointment_id": appointment_id,
            "management_token_hash": appointment["management_token_hash"],
            "status": {"$nin": ["cancelled", "completed"]}
        },
        {"$set": {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "cancelled_by": "client_public_link"
        }}
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Appointment status changed; refresh the page")

    logger.info(f"Public appointment {appointment_id} cancelled using a valid management token")
    return {"message": "Appointment cancelled successfully", "appointment_id": appointment_id}


@api_router.get("/public/appointments/{appointment_id}")
async def get_public_appointment(appointment_id: str, token: str):
    appointment = await _get_public_appointment_with_token(appointment_id, token)
    organization_id = appointment["organization_id"]
    service = await db.services.find_one(
        {"service_id": appointment["service_id"], "organization_id": organization_id}, {"_id": 0}
    )
    barber = await db.barbers.find_one(
        {"barber_id": appointment["barber_id"], "organization_id": organization_id}, {"_id": 0}
    )
    return {
        "appointment_id": appointment["appointment_id"],
        "date": appointment["date"],
        "time": appointment["time"],
        "status": appointment.get("status", "confirmed"),
        "service_name": service.get("name", "Servicio") if service else "Servicio",
        "service_price": service.get("price", 0) if service else 0,
        "barber_name": (barber.get("display_name") or barber.get("name") or "Profesional") if barber else "Profesional"
    }

# NEXUS_INVENTORY_AUDIT_REGISTRATION_5A_PACKAGE_2_V1
from inventory_audit import build_inventory_audit_router
api_router.include_router(build_inventory_audit_router(db, get_current_user, require_management_role, resolve_team_organization))

# NEXUS_INVENTORY_CATALOG_REGISTRATION_5A_PACKAGE_3_V1
from inventory_catalog import build_inventory_catalog_router
api_router.include_router(build_inventory_catalog_router(db, get_current_user, require_management_role, resolve_team_organization))

# NEXUS_SERVICE_RECIPES_REGISTRATION_5B_PACKAGE_1_V1
from service_recipes import build_service_recipes_router, ensure_service_recipe_indexes
api_router.include_router(build_service_recipes_router(db, get_current_user, require_management_role, resolve_team_organization))

# NEXUS_TRANSACTION_VOID_REVERSAL_5B_PACKAGE_3_V1
api_router.include_router(build_transaction_void_router(db, get_current_user, require_management_role, validate_organization_access))
api_router.include_router(build_supplier_router(db, get_current_user, require_management_role, resolve_team_organization))

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

# NEXUS_SESSION_LIFECYCLE_V1
async def _migrate_user_session_dates_and_indexes():
    invalid_expires = 0
    cursor = db.user_sessions.find({}, {"expires_at": 1, "created_at": 1})
    async for session in cursor:
        updates = {}
        for field in ("expires_at", "created_at"):
            value = session.get(field)
            if isinstance(value, str):
                try:
                    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                    if parsed.tzinfo is None:
                        parsed = parsed.replace(tzinfo=timezone.utc)
                    updates[field] = parsed
                except (TypeError, ValueError):
                    if field == "expires_at":
                        invalid_expires += 1
        if updates:
            await db.user_sessions.update_one({"_id": session["_id"]}, {"$set": updates})
    if invalid_expires:
        logger.error("Invalid session expiry values: %s; TTL index skipped", invalid_expires)
        return
    await db.user_sessions.create_index("session_token", unique=True, name="user_sessions_token_unique")
    await db.user_sessions.create_index("user_id", name="user_sessions_user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0, name="user_sessions_ttl")


@app.on_event("startup")
async def create_application_indexes():
    await _migrate_user_session_dates_and_indexes()
    # NEXUS_CHECKOUT_BACKEND_V1
    await db.transactions.create_index("transaction_id",unique=True)
    await db.transactions.create_index("appointment_id",unique=True,partialFilterExpression={"status":"confirmed"})
    await db.transactions.create_index([("organization_id",1),("created_at",-1)])
    # NEXUS_TRANSACTION_REVENUE_STATISTICS_V1
    await db.transactions.create_index([("organization_id", 1), ("status", 1), ("created_at", -1)])
    await db.transactions.create_index([("organization_id", 1), ("barber_id", 1), ("status", 1), ("created_at", -1)])
    await db.transactions.create_index([("organization_id", 1), ("payment_method", 1), ("status", 1), ("created_at", -1)])
    # NEXUS_STAFF_INCOME_BACKEND_V1
    await db.transactions.create_index([("organization_id", 1), ("barber_id", 1), ("status", 1), ("created_at", -1)])
    # NEXUS_COMMISSION_FOUNDATION_V1
    await db.commission_settings.create_index("organization_id", unique=True)
    await db.staff_commission_overrides.create_index([("organization_id", 1), ("barber_id", 1), ("active", 1)])
    # NEXUS_STAFF_APPOINTMENTS_BACKEND_V1
    await db.appointments.create_index([("organization_id", 1), ("barber_id", 1), ("date", 1), ("time", 1)])
    await db.appointments.create_index([("organization_id", 1), ("barber_id", 1), ("status", 1), ("date", 1)])
    # NEXUS_HARDENING_3C_V1
    await db.booking_locks.create_index(
        "expires_at", expireAfterSeconds=0, name="booking_locks_ttl"
    )
    # NEXUS_STAFF_SETTLEMENTS_FOUNDATION_V1
    await db.staff_settlements.create_index("settlement_id", unique=True)
    await db.staff_settlements.create_index([("organization_id", 1), ("status", 1), ("created_at", -1)])
    await db.staff_settlements.create_index([("organization_id", 1), ("barber_id", 1), ("created_at", -1)])
    await db.transactions.create_index([("organization_id", 1), ("barber_id", 1), ("settlement_id", 1), ("created_at", 1)])
    await db.audit_events.create_index([("organization_id", 1), ("created_at", -1)])
    await db.invitations.create_index(
        "token_hash",
        unique=True,
        partialFilterExpression={"token_hash": {"$exists": True}}
    )
    await db.invitations.create_index([
        ("organization_id", 1),
        ("normalized_email", 1),
        ("status", 1)
    ])
    await db.password_resets.create_index(
        "token_hash",
        unique=True,
        partialFilterExpression={"token_hash": {"$exists": True}}
    )
    await db.password_resets.create_index("expires_at")
    # NEXUS_INVENTORY_PACKAGE_1_INDEXES_5A_V1
    await db.inventory.create_index([("organization_id", 1), ("name", 1)], name="nexus_inventory_org_name")
    await db.inventory_movements.create_index([("organization_id", 1), ("inventory_item_id", 1), ("created_at", -1), ("movement_id", -1)], name="nexus_inventory_movements_item_created")
    await db.inventory_movements.create_index([("organization_id", 1), ("movement_type", 1), ("created_at", -1)], name="nexus_inventory_movements_type_created")
    await db.inventory_movements.create_index([("organization_id", 1), ("idempotency_key", 1)], unique=True, partialFilterExpression={"idempotency_key": {"$type": "string"}}, name="nexus_inventory_movement_idempotency")
    await db.inventory.create_index(
        [("organization_id", 1), ("sku", 1)],
        unique=True,
        partialFilterExpression={"sku": {"$type": "string"}},
        name="nexus_inventory_org_sku_unique",
    )
    await db.inventory_audits.create_index([("organization_id", 1), ("created_at", -1)], name="nexus_inventory_audits_org_created")
    await db.inventory_audit_lines.create_index([("audit_id", 1), ("audit_line_id", 1)], unique=True, name="nexus_inventory_audit_lines_unique")
    # NEXUS_SERVICE_RECIPES_INDEXES_5B_PACKAGE_1_V1
    await ensure_service_recipe_indexes(db)
    # NEXUS_CHECKOUT_INVENTORY_INDEXES_5B_PACKAGE_2_V1
    await ensure_checkout_inventory_indexes(db)
    await ensure_transaction_void_indexes(db)
    await ensure_supplier_indexes(db)
    # NEXUS_PERSISTENT_QUERY_INDEXES_4E3_V1
    await db.appointments.create_index(
        [("organization_id", 1), ("date", -1), ("time", -1), ("appointment_id", -1)],
        name="nexus_org_date_time_appointment_desc",
    )
    await db.appointments.create_index(
        [("organization_id", 1), ("status", 1), ("date", -1), ("time", -1), ("appointment_id", -1)],
        name="nexus_org_status_date_time_appointment_desc",
    )
    await db.clients.create_index(
        [("organization_id", 1), ("total_visits", -1), ("client_id", 1)],
        name="nexus_org_visits_client",
    )
    await db.transactions.create_index(
        [("organization_id", 1), ("created_at", -1), ("transaction_id", -1)],
        name="nexus_org_created_transaction_desc",
    )
    await db.transactions.create_index(
        [("organization_id", 1), ("payment_method", 1), ("created_at", -1), ("transaction_id", -1)],
        name="nexus_org_payment_created_transaction_desc",
    )
    await db.staff_settlements.create_index(
        [("organization_id", 1), ("created_at", -1), ("settlement_id", -1)],
        name="nexus_org_created_settlement_desc",
    )
    await db.staff_settlements.create_index(
        [("organization_id", 1), ("status", 1), ("created_at", -1), ("settlement_id", -1)],
        name="nexus_org_status_created_settlement_desc",
    )


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()