import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from backend.db.database import db
from backend.core.config import SECRET_KEY, ALGORITHM

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        wallet_address = payload.get("sub")
        if wallet_address is None:
            print("invalid payload")
            raise HTTPException(status_code=401, detail="Invalid payload")
    except jwt.ExpiredSignatureError:
        print("token expired")
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        print("invalid token")
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.users.find_one({"wallet_address": wallet_address})
    if user is None:
        print("user missing")
        raise HTTPException(status_code=401, detail="User not found")

    return user

def get_admin_user(user: dict = Depends(get_current_user)):
    if not user.get("is_admin"):
        print("admin required")
        raise HTTPException(status_code=403, detail="admin required")
    return user