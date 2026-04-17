import asyncio
from backend.blockchain.client import casino_contract, w3
from backend.db.database import db

LAST_PROCESSED_BLOCK = w3.eth.block_number


async def listen_for_deposits(poll_interval=3):
    global LAST_PROCESSED_BLOCK
    while True:
        try:
            current_block = w3.eth.block_number
            if current_block > LAST_PROCESSED_BLOCK:
                logs = casino_contract.events.DepositReceived.get_logs(
                    from_block=LAST_PROCESSED_BLOCK + 1,
                    to_block=current_block
                )

                for log in logs:
                    user_address = log['args']['user']
                    amount_wei = log['args']['amount']
                    amount_eth = float(w3.from_wei(amount_wei, 'ether'))

                    checksum_address = w3.to_checksum_address(user_address)

                    await db.users.update_one(
                        {"wallet_address": checksum_address},
                        {"$inc": {"balance": amount_eth}},
                        upsert=True
                    )
                    print(f"Deposit processed: {checksum_address} +{amount_eth} ETH")

                LAST_PROCESSED_BLOCK = current_block

        except Exception as e:
            print(f"Listener error: {e}")

        await asyncio.sleep(poll_interval)


async def start_event_listener():
    print(f"Listener started from block {LAST_PROCESSED_BLOCK}...")
    asyncio.create_task(listen_for_deposits())