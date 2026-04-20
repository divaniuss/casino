import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ethers } from 'ethers';

// Достаем URL бэкенда так же, как в AuthContext
const API_URL = import.meta.env.VITE_API_URL;

export default function Dice() {
  const { token, updateBalance } = useContext(AuthContext);


  const [betEth, setBetEth] = useState("0.01");
  const [target, setTarget] = useState(50);
  const [rollType, setRollType] = useState("under");


  const [isRolling, setIsRolling] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handlePlay = async () => {
    setError(null);
    setResult(null);

    const safeBetEth = betEth.toString().replace(',', '.');

    if (!safeBetEth || isNaN(safeBetEth) || Number(safeBetEth) <= 0) {
      setError("Введите корректную сумму ставки");
      return;
    }

    setIsRolling(true);

    try {
      const betWei = ethers.parseEther(safeBetEth).toString();

      const response = await fetch(`${API_URL}/games/dice/roll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bet_amount_wei: betWei,
          target: Number(target),
          condition: rollType
        })
      });

      const data = await response.json();
      console.log("ОТВЕТ ОТ БЭКЕНДА:", data);

      if (!response.ok) {
        if (Array.isArray(data.detail)) {
          const messages = data.detail.map(err => `Поле ${err.loc.join('.')} - ${err.msg}`);
          throw new Error(messages.join(' | '));
        }
        throw new Error(data.detail || "Ошибка сервера");
      }

      setResult(data);
      await updateBalance();

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsRolling(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-8 text-center">
        <div className="text-6xl mb-4">🎲</div>
        <h1 className="text-3xl font-extrabold text-gray-900">Кости</h1>
        <p className="text-gray-500 mt-2">Бросьте кости от 1 до 100. Угадайте результат и заберите выигрыш.</p>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Ставка (ETH)</label>
          <input
            type="number"
            step="0.001"
            value={betEth}
            onChange={(e) => setBetEth(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            placeholder="0.01"
          />
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-medium text-gray-700">Целевое число: {target}</label>
            <span className="text-sm font-bold text-blue-600">
              Шанс победы: {rollType === 'under' ? target - 1 : 100 - target}%
            </span>
          </div>
          <input
            type="range"
            min="2" max="99"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => setRollType('under')}
            className={`py-3 rounded-xl font-bold transition-all border-2 ${
              rollType === 'under' 
                ? 'bg-blue-50 border-blue-500 text-blue-700' 
                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            Меньше {target}
          </button>
          <button
            onClick={() => setRollType('over')}
            className={`py-3 rounded-xl font-bold transition-all border-2 ${
              rollType === 'over' 
                ? 'bg-blue-50 border-blue-500 text-blue-700' 
                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            Больше {target}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm text-center">
            {error}
          </div>
        )}

        {result && (
          <div className={`mb-6 p-6 rounded-xl text-center border-2 ${
            result.win ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            <div className="text-4xl font-black mb-2 flex items-center justify-center gap-3">
              {result.roll}
            </div>

            {result.win ? (
              <div className="text-green-700 font-bold">
                Вы выиграли! +{ethers.formatEther(result.payout_wei)} ETH
              </div>
            ) : (
              <div className="text-red-600 font-bold">
                Проигрыш. Попробуйте еще раз!
              </div>
            )}
          </div>
        )}

        <button
          onClick={handlePlay}
          disabled={isRolling || !token}
          className="w-full bg-gray-900 hover:bg-black text-white py-4 rounded-xl font-bold text-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isRolling ? 'Бросаем кости...' : 'СДЕЛАТЬ СТАВКУ'}
        </button>

      </div>
    </div>
  );
}