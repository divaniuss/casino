import random
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.security import get_current_user
from backend.core.finance import deduct_balance, add_balance, record_transaction

router = APIRouter(prefix="/games/crash", tags=["crash"])


class CrashRequest(BaseModel):
    bet_amount_wei: str = Field(description="Сумма ставки в WEI")
    target_multiplier: float = Field(ge=1.01,
                                     description="Множитель, на котором игрок хочет забрать деньги (минимум 1.01)")


def generate_crash_point(house_edge_percent=5) -> float:

    r = random.uniform(0.0001, 1.0)

    crash_point = (100.0 - house_edge_percent) / 100.0 / r

    crash_point = min(1000.0, max(1.00, crash_point))

    return round(crash_point, 2)


@router.post("/play")
async def play_crash(request: CrashRequest, user: dict = Depends(get_current_user)):
    wallet_address = user["wallet_address"]

    try:
        bet_amount_int = int(request.bet_amount_wei)
    except ValueError:
        raise HTTPException(status_code=400, detail="Ставка должна быть числом")

    if bet_amount_int <= 0:
        raise HTTPException(status_code=400, detail="Ставка должна быть больше 0")
    await deduct_balance(wallet_address, bet_amount_int)


    crash_point = generate_crash_point()

    is_win = request.target_multiplier <= crash_point

    payout_wei = 0
    if is_win:

        payout_wei = int(bet_amount_int * request.target_multiplier)
        await add_balance(wallet_address, payout_wei)

    await record_transaction(
        wallet_address=wallet_address,
        game="crash",
        bet_amount_wei=bet_amount_int,
        is_win=is_win,
        payout_wei=payout_wei,
        game_details={
            "target_multiplier": request.target_multiplier,
            "actual_crash_point": crash_point
        }
    )

    return {
        "actual_crash_point": crash_point,
        "target_multiplier": request.target_multiplier,
        "is_win": is_win,
        "payout_wei": str(payout_wei)
    }