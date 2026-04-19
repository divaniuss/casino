from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from web3 import Web3

from backend.core.security import get_current_user
from backend.core.finance import deduct_balance
from backend.db.database import db

router = APIRouter(prefix="/wallet", tags=["wallet"])


class WithdrawRequest(BaseModel):
    amount_wei: str = Field(description="Сумма для вывода в WEI")


@router.post("/withdraw")
async def request_withdrawal(request: WithdrawRequest, user: dict = Depends(get_current_user)):
    wallet_address = user["wallet_address"]

    try:
        amount_wei_int = int(request.amount_wei)
    except ValueError:
        raise HTTPException(status_code=400, detail="Сумма вывода должна быть целым числом")

    if amount_wei_int <= 0:
        raise HTTPException(status_code=400, detail="Сумма вывода должна быть больше 0")

    if not Web3.is_address(wallet_address):
        raise HTTPException(status_code=400, detail="Некорректный Web3 адрес")
    checksum_address = Web3.to_checksum_address(wallet_address)

    active_request = await db.withdrawals.find_one({
        "wallet_address": checksum_address,
        "status": {"$in": ["PENDING", "PROCESSING", "BROADCASTED"]}
    })

    if active_request:
        raise HTTPException(
            status_code=429,
            detail="У вас уже есть активная заявка на вывод. Дождитесь её завершения."
        )

    try:

        async with await db.client.start_session() as session:
            async with session.start_transaction():
                current_balance_wei = await deduct_balance(checksum_address, amount_wei_int, session=session)

                withdrawal_doc = {
                    "wallet_address": checksum_address,
                    "amount_wei": request.amount_wei,
                    "status": "PENDING",
                    "tx_hash": None,
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                    "locked_at": None
                }

                result = await db.withdrawals.insert_one(withdrawal_doc, session=session)
                inserted_id = str(result.inserted_id)

    except HTTPException:
        raise
    except Exception as e:
        print(f"Transaction aborted: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при создании заявки. Баланс не изменен.")

    return {
        "status": "processing",
        "message": "Заявка на вывод принята в обработку",
        "withdrawal_id": inserted_id,
        "new_balance_wei": str(current_balance_wei)
    }