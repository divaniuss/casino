import random
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.core.security import get_current_user
from backend.core.finance import deduct_balance, add_balance, record_transaction
from backend.db.database import db

router = APIRouter(prefix="/games/slots", tags=["slots"])


class SlotsRequest(BaseModel):
    bet_amount_wei: str = Field(description="Сумма ставки в WEI")


SYMBOL_MULTIPLIERS = {
    "🍒": 1,   # 1x
    "🍋": 2,   # 2x
    "🍉": 3,   # 3x
    "🔔": 10,  # 10x
    "💎": 50   # 50x
}

SYMBOLS = ["🍒", "🍋", "🍉", "🔔", "💎"]
WEIGHTS = [50, 25, 15, 8, 2]

# [0, 1, 2]
# [3, 4, 5]
# [6, 7, 8]
PAYLINES = [
    [0, 1, 2],  # ^--
    [3, 4, 5],  # --
    [6, 7, 8],  # __
    [0, 4, 8],  # \
    [6, 4, 2]  # /
]


@router.post("/spin")
async def spin_slots(request: SlotsRequest, user: dict = Depends(get_current_user)):
    wallet_address = user["wallet_address"]

    try:
        bet_amount_int = int(request.bet_amount_wei)
    except ValueError:
        raise HTTPException(status_code=400, detail="Ставка должна быть числом")

    if bet_amount_int <= 0:
        raise HTTPException(status_code=400, detail="Ставка должна быть больше 0")


    await deduct_balance(wallet_address, bet_amount_int)

    grid = random.choices(SYMBOLS, weights=WEIGHTS, k=9)

    total_multiplier = 0
    winning_lines = []

    for line_index, line in enumerate(PAYLINES):
        sym1, sym2, sym3 = grid[line[0]], grid[line[1]], grid[line[2]]

        if sym1 == sym2 == sym3:
            multiplier = SYMBOL_MULTIPLIERS[sym1]
            total_multiplier += multiplier
            winning_lines.append({
                "line": line_index,
                "symbol": sym1,
                "multiplier": multiplier
            })

    is_win = total_multiplier > 0
    payout_wei = bet_amount_int * total_multiplier


    if is_win:
        await add_balance(wallet_address, payout_wei)

    await record_transaction(
        wallet_address=wallet_address,
        game="slots",
        bet_amount_wei=bet_amount_int,
        is_win=is_win,
        payout_wei=payout_wei,
        game_details={
            "grid": grid,
            "total_multiplier": total_multiplier,
            "winning_lines": winning_lines
        }
    )

    formatted_grid = [
        [grid[0], grid[1], grid[2]],
        [grid[3], grid[4], grid[5]],
        [grid[6], grid[7], grid[8]]
    ]

    return {
        "grid": formatted_grid,
        "is_win": is_win,
        "total_multiplier": total_multiplier,
        "payout_wei": str(payout_wei),
        "winning_lines": winning_lines
    }