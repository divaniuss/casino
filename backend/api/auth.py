import secrets
from datetime import datetime, timedelta, timezone
import jwt
from eth_account.messages import encode_defunct
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from web3 import Web3
from slowapi import Limiter
from slowapi.util import get_remote_address
from backend.db.database import db
from backend.core.config import SECRET_KEY, ALGORITHM

router = APIRouter(prefix="/auth", tags=["auth"])
w3 = Web3()
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri="memory://"
)

class VerifyRequest(BaseModel):
    wallet_address: str
    signature: str

def create_jwt_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=1)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def generate_sign_message(nonce: str) -> str:
    return f"Sign this message to authenticate.\nNonce: {nonce}"

@router.get("/nonce/{wallet_address}")
@limiter.limit("5/minute")
async def get_nonce(request: Request, wallet_address: str):
    print(request.client.host)
    if not w3.is_address(wallet_address):
        raise HTTPException(status_code=400, detail="Invalid address")

    address = w3.to_checksum_address(wallet_address)
    new_nonce = secrets.token_hex(16)
    now = datetime.now(timezone.utc)

    await db.users.update_one(
        {"wallet_address": address},
        {
            "$set": {
                "nonce": new_nonce,
                "nonce_created_at": now
            },
            "$setOnInsert": {
                "is_admin": False,
                "username": None,
                "shipping_address": None
            }
        },
        upsert=True
    )

    return {"nonce": new_nonce}

@router.post("/verify")
async def verify_signature(req: VerifyRequest):
    if not w3.is_address(req.wallet_address):
        raise HTTPException(status_code=400, detail="Invalid address")

    address = w3.to_checksum_address(req.wallet_address)
    user = await db.users.find_one({"wallet_address": address})

    if not user or not user.get("nonce"):
        raise HTTPException(status_code=404, detail="User or nonce not found")

    nonce_created_at = user.get("nonce_created_at")
    if not nonce_created_at:
        raise HTTPException(status_code=400, detail="Nonce expired or invalid")

    if nonce_created_at.tzinfo is None:
        nonce_created_at = nonce_created_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) - nonce_created_at > timedelta(minutes=5):
        raise HTTPException(status_code=400, detail="Nonce expired")

    try:
        sign_text = generate_sign_message(user["nonce"])
        message = encode_defunct(text=sign_text)
        recovered_address = w3.eth.account.recover_message(message, signature=req.signature)

        if recovered_address == address:
            await db.users.update_one(
                {"wallet_address": address},
                {"$set": {"nonce": None, "nonce_created_at": None}}
            )

            token = create_jwt_token({"sub": address})
            is_admin = user.get("is_admin", False)
            return {"access_token": token, "token_type": "bearer", "is_admin": is_admin}
        else:
            raise HTTPException(status_code=401, detail="Invalid signature")

    except ValueError:
        raise HTTPException(status_code=400, detail="Signature processing error")