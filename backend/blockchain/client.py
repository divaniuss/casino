import json
import os
from web3 import Web3
from eth_account import Account
from backend.core.config import WEB3_PROVIDER_URI, CONTRACT_ADDRESS, ADMIN_PRIVATE_KEY


w3 = Web3(Web3.HTTPProvider(WEB3_PROVIDER_URI))

if not w3.is_connected():
    print("Ошибка: Не удалось подключиться к Web3 провайдеру (Ganache)")
else:
    print("Успешное подключение к Ganache")


admin_account = Account.from_key(ADMIN_PRIVATE_KEY)
admin_address = admin_account.address


BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ABI_PATH = os.path.join(BASE_DIR, "contracts", "CasinoVault.json")

with open(ABI_PATH, "r") as f:
    contract_abi = json.load(f)

checksum_address = w3.to_checksum_address(CONTRACT_ADDRESS)
casino_contract = w3.eth.contract(address=checksum_address, abi=contract_abi)


def get_vault_balance_wei() -> int:
    try:
        balance_wei = casino_contract.functions.getVaultBalance().call({'from': admin_address})
        return balance_wei
    except Exception as e:
        print(f"Ошибка при получении баланса пула: {e}")
        return 0

