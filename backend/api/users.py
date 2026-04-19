from fastapi import APIRouter, Depends
from backend.core.security import get_current_user
from backend.core.finance import to_int

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def get_my_profile(user: dict = Depends(get_current_user)):
    raw_balance = user.get("balance")
    balance_wei = to_int(raw_balance) if raw_balance else 0

    return {
        "wallet_address": user["wallet_address"],
        "is_admin": user.get("is_admin", False),
        "balance_wei": str(balance_wei)
    }