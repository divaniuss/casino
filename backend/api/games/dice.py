from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import secrets

from backend.core.finance import deduct_balance, add_balance, record_transaction
from backend.core.security import get_current_user

router = APIRouter(prefix="/games/dice", tags=["dice"])


class DiceBet(BaseModel):
    bet_amount_wei: str = Field(description="Сумма ставки в WEI")
    target: int = Field(ge=1, le=99, description="Целевое число")
    condition: str = Field(pattern="^(under|over)$", description="under (меньше) или over (больше)")


@router.post("/roll")
async def roll_dice(bet: DiceBet, user: dict = Depends(get_current_user)):
    wallet_address = user["wallet_address"]

    try:
        bet_wei = int(bet.bet_amount_wei)
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат ставки. Ожидается целое число WEI в строке.")

    if bet_wei <= 0:
        raise HTTPException(status_code=400, detail="Ставка должна быть больше 0")

    current_balance_wei = await deduct_balance(wallet_address, bet_wei)

    result_number = secrets.randbelow(100) + 1


    win = False
    multiplier = 0.0

    if bet.condition == "under" and result_number < bet.target:
        win = True
        multiplier = 100.0 / bet.target
    elif bet.condition == "over" and result_number > bet.target:
        win = True
        multiplier = 100.0 / (100 - bet.target)

    if win:
        multiplier = round(multiplier * 0.98, 2)

    payout_wei = 0
    if win:
        payout_wei = int(bet_wei * multiplier)
        current_balance_wei = await add_balance(wallet_address, payout_wei)

    game_details = {
        "target": bet.target,
        "condition": bet.condition,
        "result_roll": result_number,
        "multiplier": multiplier if win else 0,
    }

    await record_transaction(
        wallet_address=wallet_address,
        game="dice",
        bet_amount_wei=bet_wei,
        is_win=win,
        payout_wei=payout_wei,
        game_details=game_details
    )

    return {
        "wallet": wallet_address,
        "roll": result_number,
        "target": bet.target,
        "condition": bet.condition,
        "win": win,
        "multiplier": multiplier if win else 0,
        "payout_wei": str(payout_wei),
        "new_balance_wei": str(current_balance_wei)
    }