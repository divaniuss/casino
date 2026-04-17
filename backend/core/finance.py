from fastapi import HTTPException
from backend.db.database import db
from pymongo import ReturnDocument
from datetime import datetime, timezone
from typing import Any, Dict

async def deduct_balance(wallet_address: str, amount: float) -> float:
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма ставки должна быть больше 0")


    updated_user = await db.users.find_one_and_update(
        {"wallet_address": wallet_address, "balance": {"$gte": amount}},
        {"$inc": {"balance": -amount}},
        return_document=ReturnDocument.AFTER
    )


    if not updated_user:
        user_check = await db.users.find_one({"wallet_address": wallet_address})

        if not user_check:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        else:
            current_balance = user_check.get("balance", 0.0)
            raise HTTPException(
                status_code=400,
                detail=f"Недостаточно средств. Ваш баланс: {current_balance}, требуется: {amount}"
            )

    return updated_user.get("balance", 0.0)


async def add_balance(wallet_address: str, amount: float) -> float:
    if amount <= 0:
        return 0.0

    updated_user = await db.users.find_one_and_update(
        {"wallet_address": wallet_address},
        {"$inc": {"balance": amount}},
        return_document=ReturnDocument.AFTER
    )


    if not updated_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден для начисления выигрыша")

    return updated_user.get("balance", 0.0)

async def record_transaction(
    wallet_address: str,
    game: str,
    bet_amount: float,
    is_win: bool,
    payout: float,
    game_details: Dict[str, Any] = None
):

    document = {
        "wallet_address": wallet_address,
        "game": game,
        "bet_amount": bet_amount,
        "is_win": is_win,
        "payout": payout,
        "timestamp": datetime.now(timezone.utc)
    }

    if game_details:
        document.update(game_details)

    await db.transactions.insert_one(document)