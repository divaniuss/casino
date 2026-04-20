from fastapi import APIRouter, Depends, Query
from backend.core.security import get_current_user
from backend.core.finance import to_int
from backend.db.database import db
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

@router.get("/me/history")
async def get_my_history(
    limit: int = Query(20, le=100, description="Количество записей (макс 100)"),
    user: dict = Depends(get_current_user)
):
    wallet_address = user["wallet_address"]

    cursor = db.transactions.find(
        {"wallet_address": wallet_address},
        {"_id": 0}
    ).sort("timestamp", -1).limit(limit)

    history = await cursor.to_list(length=limit)

    return {
        "wallet_address": wallet_address,
        "total_records_returned": len(history),
        "history": history
    }