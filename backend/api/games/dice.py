
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
import secrets

from backend.core.finance import deduct_balance, add_balance, record_transaction
from backend.core.security import get_current_user

router = APIRouter(prefix="/games/dice", tags=["dice"])

class DiceBet(BaseModel):
    bet_amount: float = Field(gt=0, description="Сумма ставки")
    target: int = Field(ge=1, le=99, description="Целевое число")
    condition: str = Field(pattern="^(under|over)$", description="under (меньше) или over (больше)")

@router.post("/roll")
async def roll_dice(bet: DiceBet, user: dict = Depends(get_current_user)):
    wallet_address = user["wallet_address"]


    current_balance = await deduct_balance(wallet_address, bet.bet_amount)


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


    payout = 0.0
    if win:
        payout = round(bet.bet_amount * multiplier, 4)
        current_balance = await add_balance(wallet_address, payout)


    game_details = {
        "target": bet.target,
        "condition": bet.condition,
        "result_roll": result_number,
        "multiplier": multiplier if win else 0,
    }

    await record_transaction(
        wallet_address=wallet_address,
        game="dice",
        bet_amount=bet.bet_amount,
        is_win=win,
        payout=payout,
        game_details=game_details
    )

    return {
        "wallet": wallet_address,
        "roll": result_number,
        "target": bet.target,
        "condition": bet.condition,
        "win": win,
        "multiplier": multiplier if win else 0,
        "payout": payout,
        "new_balance": current_balance
    }