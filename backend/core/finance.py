from fastapi import HTTPException
from backend.db.database import db
from pymongo import ReturnDocument
from bson.decimal128 import Decimal128
from datetime import datetime, timezone
from typing import Any, Dict


def to_decimal(wei_amount: int) -> Decimal128:
    return Decimal128(str(wei_amount))


def to_int(decimal_value: Decimal128) -> int:
    if decimal_value is None:
        return 0
    return int(decimal_value.to_decimal())


async def deduct_balance(wallet_address: str, amount_wei: int, session=None) -> int:
    if amount_wei <= 0:
        raise HTTPException(status_code=400, detail="Сумма ставки должна быть больше 0")

    updated_user = await db.users.find_one_and_update(
        {"wallet_address": wallet_address, "balance": {"$gte": to_decimal(amount_wei)}},
        {"$inc": {"balance": to_decimal(-amount_wei)}},
        return_document=ReturnDocument.AFTER,
        session=session
    )

    if not updated_user:
        user_check = await db.users.find_one({"wallet_address": wallet_address}, session=session)
        if not user_check:
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        current_balance_wei = to_int(user_check.get("balance", to_decimal(0)))
        raise HTTPException(
            status_code=400,
            detail=f"Недостаточно средств. Ваш баланс: {current_balance_wei} WEI, требуется: {amount_wei} WEI"
        )

    return to_int(updated_user.get("balance"))


async def add_balance(wallet_address: str, amount_wei: int, session=None) -> int:
    if amount_wei <= 0:
        return 0

    updated_user = await db.users.find_one_and_update(
        {"wallet_address": wallet_address},
        {"$inc": {"balance": to_decimal(amount_wei)}},
        return_document=ReturnDocument.AFTER,
        session=session
    )

    if not updated_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return to_int(updated_user.get("balance"))


async def record_transaction(
        wallet_address: str,
        game: str,
        bet_amount_wei: int,
        is_win: bool,
        payout_wei: int,
        game_details: Dict[str, Any] = None
):
    document = {
        "wallet_address": wallet_address,
        "game": game,
        "bet_amount_wei": str(bet_amount_wei),
        "is_win": is_win,
        "payout_wei": str(payout_wei),
        "timestamp": datetime.now(timezone.utc)
    }

    if game_details:
        document.update(game_details)

    await db.transactions.insert_one(document)