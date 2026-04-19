import asyncio
from datetime import datetime, timezone
from web3 import Web3
from bson.objectid import ObjectId
from web3.exceptions import TransactionNotFound
from datetime import timedelta

from backend.core.finance import add_balance, record_transaction
from backend.db.database import db
from backend.blockchain.client import w3, casino_contract
from backend.core.config import ADMIN_PRIVATE_KEY
from backend.core.finance import add_balance


admin_account = w3.eth.account.from_key(ADMIN_PRIVATE_KEY)
admin_address = admin_account.address

print(f"!!! ВНИМАНИЕ: Python думает, что админ это: {admin_address} !!!")

real_owner = casino_contract.functions.owner().call()
print(f"!!! А смарт-контракт думает, что его владелец: {real_owner} !!!")

async def process_withdrawals(poll_interval=5):
    print("Воркер вывода (Broadcaster) запущен...")

    while True:
        try:
            now = datetime.now(timezone.utc)

            timeout_threshold = now - timedelta(minutes=5)
            await db.withdrawals.update_many(
                {"status": "PROCESSING", "locked_at": {"$lt": timeout_threshold}},
                {"$set": {"status": "PENDING", "locked_at": None, "updated_at": now}}
            )


            pending_request = await db.withdrawals.find_one_and_update(
                {"status": "PENDING"},
                {"$set": {
                    "status": "PROCESSING",
                    "locked_at": now,
                    "updated_at": now
                }},
                sort=[("created_at", 1)]
            )

            if not pending_request:
                await asyncio.sleep(poll_interval)
                continue

            req_id = pending_request["_id"]
            wallet_address = pending_request["wallet_address"]

            amount_wei_str = pending_request["amount_wei"]
            amount_wei = int(amount_wei_str)

            print(f"Воркер взял заявку {req_id} для {wallet_address} на сумму {amount_wei} WEI")


            contract_balance_wei = casino_contract.functions.getVaultBalance().call({'from': admin_address})
            if contract_balance_wei < amount_wei:
                print(f"[{req_id}] Ошибка: Недостаточно ликвидности в контракте!")

                await db.withdrawals.update_one(
                    {"_id": req_id},
                    {"$set": {"status": "PENDING", "updated_at": datetime.now(timezone.utc)}}
                )
                await asyncio.sleep(poll_interval)
                continue

            nonce = w3.eth.get_transaction_count(admin_address)
            checksum_address = w3.to_checksum_address(wallet_address)

            tx = casino_contract.functions.withdraw(
                checksum_address,
                amount_wei
            ).build_transaction({
                'from': admin_address,
                'nonce': nonce,
            })


            signed_tx = w3.eth.account.sign_transaction(tx, private_key=ADMIN_PRIVATE_KEY)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            tx_hash_hex = tx_hash.hex()

            print(f"[{req_id}] Транзакция отправлена! Hash: {tx_hash_hex}")


            await db.withdrawals.update_one(
                {"_id": req_id},
                {"$set": {
                    "status": "BROADCASTED",
                    "tx_hash": tx_hash_hex,
                    "updated_at": datetime.now(timezone.utc)
                }}
            )

        except Exception as e:
            print(f"Ошибка в воркере: {e}")
            if pending_request:
                await db.withdrawals.update_one(
                    {"_id": pending_request["_id"]},
                    {"$set": {"status": "PENDING", "updated_at": datetime.now(timezone.utc)}}
                )
            await asyncio.sleep(poll_interval)


async def verify_withdrawals(poll_interval=10):
    print("Воркер проверки (Verifier) запущен...")

    while True:
        try:
            cursor = db.withdrawals.find({"status": "BROADCASTED"})
            broadcasted_requests = await cursor.to_list(length=50)

            for req in broadcasted_requests:
                tx_hash = req["tx_hash"]
                req_id = req["_id"]
                wallet_address = req["wallet_address"]
                amount_wei = int(req["amount_wei"])

                try:
                    receipt = w3.eth.get_transaction_receipt(tx_hash)

                    if receipt.status == 1:
                        print(f"[{req_id}] - Транзакция {tx_hash} подтверждена.")
                        await db.withdrawals.update_one(
                            {"_id": req_id},
                            {"$set": {"status": "COMPLETED", "updated_at": datetime.now(timezone.utc)}}
                        )
                        await record_transaction(
                            wallet_address=wallet_address,
                            game="cashout",
                            bet_amount_wei=0,
                            is_win=True,
                            payout_wei=amount_wei,
                            game_details={"tx_hash": tx_hash}
                        )

                    elif receipt.status == 0:
                        print(f"[{req_id}] Ошибка! Транзакция {tx_hash} отклонена контрактом.")
                        await db.withdrawals.update_one(
                            {"_id": req_id},
                            {"$set": {"status": "FAILED", "updated_at": datetime.now(timezone.utc)}}
                        )

                        await add_balance(wallet_address, amount_wei)

                except TransactionNotFound:
                    now = datetime.now(timezone.utc)
                    broadcasted_time = req.get("updated_at", now)

                    if now - broadcasted_time > timedelta(minutes=15):
                        print(f"[{req_id}] Таймаут транзакции {tx_hash}. Возврат средств.")

                        await db.withdrawals.update_one(
                            {"_id": req_id},
                            {"$set": {"status": "FAILED", "updated_at": now, "error": "Transaction dropped"}}
                        )
                        await add_balance(wallet_address, amount_wei)

        except Exception as e:
            print(f"Ошибка в Verifier: {e}")
        await asyncio.sleep(poll_interval)