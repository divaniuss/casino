import { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ethers } from 'ethers';

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
const EXPECTED_CHAIN_ID = BigInt(import.meta.env.VITE_CHAIN_ID || 31337);

const MINIMAL_ABI = [
  "function deposit() public payable"
];

export default function Profile() {
  const { walletAddress, token, balanceEth, updateBalance } = useContext(AuthContext);

  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const [depositAmount, setDepositAmount] = useState("0.1");
  const [isDepositing, setIsDepositing] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState("0.05");
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [modal, setModal] = useState({ isOpen: false, type: '', message: '', hash: '' });

  const showModal = (type, message, hash = '') => {
    setModal({ isOpen: true, type, message, hash });
  };

  const closeModal = () => {
    setModal({ isOpen: false, type: '', message: '', hash: '' });
  };

  const handleAmountChange = (e, setter) => {
    let val = e.target.value.replace(',', '.');
    if (/^\d*(\.\d{0,18})?$/.test(val)) {
      setter(val);
    }
  };

  useEffect(() => {
    const fetchHistory = async () => {
      if (!token) return;
      try {
        const response = await fetch(`${API_URL}/users/me/history?limit=20`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setHistory(data.history);
        }
      } catch (err) {
        console.error("Ошибка загрузки истории:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [token]);


  const handleDeposit = async () => {
    if (isDepositing) return;
    if (!CONTRACT_ADDRESS) return showModal('error', "Системная ошибка: адрес контракта не настроен.");
    if (!window.ethereum) return showModal('error', "MetaMask не найден. Пожалуйста, установите расширение.");
    if (!depositAmount || Number(depositAmount) <= 0) return showModal('error', "Введите корректную сумму для депозита.");

    setIsDepositing(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);

      const network = await provider.getNetwork();
      if (network.chainId !== EXPECTED_CHAIN_ID) {
        return showModal('error', `Неверная сеть. Пожалуйста, переключитесь на сеть с ID ${EXPECTED_CHAIN_ID}`);
      }

      const signer = await provider.getSigner();

      //Проверка Wallet Mismatch
      const signerAddress = await signer.getAddress();
      if (signerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return showModal('error', 'Активный кошелек в MetaMask не совпадает с вашим аккаунтом на сайте. Пожалуйста, смените аккаунт в расширении.');
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, MINIMAL_ABI, signer);
      const amountWei = ethers.parseEther(depositAmount);

      const tx = await contract.deposit({ value: amountWei });

      showModal('info', 'Транзакция отправлена! Ждем подтверждения в блокчейне...', tx.hash);
      await tx.wait();

      showModal('success', "Транзакция подтверждена в сети! Ожидаем синхронизации баланса...", tx.hash);

      setTimeout(async () => {
        await updateBalance();
      }, 3000);

    } catch (err) {
      console.error("Ошибка депозита:", err);
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        showModal('error', 'Вы отклонили транзакцию в MetaMask.');
      } else {
        const errMsg = err.reason || err.message || "Транзакция отклонена.";
        showModal('error', `Ошибка депозита: ${errMsg}`);
      }
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (isWithdrawing) return;

    if (!withdrawAmount || Number(withdrawAmount) <= 0) {
      return showModal('error', "Введите корректную сумму для вывода.");
    }

    try {
      const amountWeiBigInt = ethers.parseEther(withdrawAmount);
      const balanceWeiBigInt = ethers.parseEther(balanceEth || "0");

      if (amountWeiBigInt > balanceWeiBigInt) {
        return showModal('error', "У вас недостаточно средств на балансе.");
      }

      setIsWithdrawing(true);
      showModal('info', 'Создаем заявку на вывод...');

      const response = await fetch(`${API_URL}/wallet/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount_wei: amountWeiBigInt.toString() })
      });

      const data = await response.json();

      if (!response.ok) {
        if (Array.isArray(data.detail)) {
          const messages = data.detail.map(err => `Поле ${err.loc.join('.')} - ${err.msg}`);
          throw new Error(messages.join(' | '));
        }
        throw new Error(data.detail || "Ошибка сервера");
      }

      showModal('success', "Заявка успешно создана! Средства скоро поступят на ваш кошелек.");
      await updateBalance();

    } catch (err) {
      console.error("Ошибка вывода:", err);
      showModal('error', err.message);
    } finally {
      setIsWithdrawing(false);
    }
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <div className="max-w-4xl mx-auto px-6 py-12 relative">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-8">Личный Кабинет</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          <div className="md:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
              <div className="text-gray-500 text-sm font-medium mb-1">Ваш баланс</div>
              <div className="text-3xl font-black text-gray-900 mb-4">{balanceEth} ETH</div>
              <div className="text-xs text-gray-400 font-mono break-all bg-gray-50 p-2 rounded-lg">
                {walletAddress}
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-green-600 mb-4 flex items-center gap-2">
                <span>↓</span> Пополнить
              </h2>
              <div className="mb-4">
                <input
                  type="text"
                  inputMode="decimal"
                  value={depositAmount}
                  onChange={(e) => handleAmountChange(e, setDepositAmount)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-500 transition-all"
                  placeholder="0.1"
                />
              </div>
              <button
                onClick={handleDeposit} disabled={isDepositing}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
              >
                {isDepositing ? 'Обработка...' : 'Отправить депозит'}
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span>↑</span> Вывести
              </h2>
              <div className="mb-4">
                <input
                  type="text"
                  inputMode="decimal"
                  value={withdrawAmount}
                  onChange={(e) => handleAmountChange(e, setWithdrawAmount)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-gray-900 transition-all"
                  placeholder="0.05"
                />
              </div>
              <button
                onClick={handleWithdraw} disabled={isWithdrawing || !balanceEth || balanceEth === "0.0000"}
                className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
              >
                {isWithdrawing ? 'Создание заявки...' : 'Вывести средства'}
              </button>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full">
              <h2 className="text-xl font-bold text-gray-900 mb-6">История транзакций</h2>

              {isLoadingHistory ? (
                <div className="text-center text-gray-500 py-8">Загрузка истории...</div>
              ) : history.length === 0 ? (
                <div className="text-center text-gray-500 py-8">У вас пока нет транзакций</div>
              ) : (
                <div className="space-y-4">
                  {history.map((tx) => (
                    <div key={tx._id || tx.id || Math.random()} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-white transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="text-2xl">
                          {tx.game === 'dice' ? '🎲' : tx.game === 'slots' ? '🎰' : tx.game === 'crash' ? '🚀' : '💳'}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 capitalize">
                            {tx.game === 'dice' ? 'Кости' : tx.game || 'Транзакция'}
                          </div>
                          <div className="text-xs text-gray-500">{formatDate(tx.timestamp || tx.created_at)}</div>
                        </div>
                      </div>

                      <div className="text-right">
                        {tx.win || tx.status === 'COMPLETED' ? (
                          <div className="text-green-600 font-bold">
                            +{tx.payout_wei ? ethers.formatEther(tx.payout_wei) : ethers.formatEther(tx.amount_wei || "0")} ETH
                          </div>
                        ) : (
                          <div className="text-gray-900 font-bold">
                            -{ethers.formatEther(tx.bet_amount_wei || "0")} ETH
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 transform transition-all text-center animate-fade-in-up">
            <div className="text-6xl mb-4">
              {modal.type === 'success' && '✅'}
              {modal.type === 'error' && '❌'}
              {modal.type === 'info' && <span className="inline-block animate-spin">⏳</span>}
            </div>
            <h3 className={`text-2xl font-bold mb-2 ${
              modal.type === 'success' ? 'text-green-600' :
              modal.type === 'error' ? 'text-red-600' : 'text-blue-600'
            }`}>
              {modal.type === 'success' ? 'Успешно!' :
               modal.type === 'error' ? 'Ошибка' : 'Подождите...'}
            </h3>
            <p className="text-gray-600 mb-6 leading-relaxed">
              {modal.message}
            </p>
            {modal.hash && (
              <div className="mb-6 bg-gray-50 p-3 rounded-lg text-left border border-gray-100 overflow-hidden">
                <span className="text-xs text-gray-400 block mb-1">Hash транзакции:</span>
                <span className="text-xs font-mono text-gray-600 break-all">{modal.hash}</span>
              </div>
            )}
            {modal.type !== 'info' && (
              <button
                onClick={closeModal}
                className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-xl font-bold transition-colors"
              >
                Закрыть
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}