import { useMemo, useState, useContext, useEffect, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ethers } from 'ethers';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const MIN_BET_ETH = '0.00000001';
const MAX_BET_ETH = '1';

const SYMBOLS = ['🍒', '🍋', '🍉', '🔔', '💎'];

const PAYLINE_MAP = {
  0: { points: '10% 25%, 50% 25%, 90% 25%', label: 'Top line' },
  1: { points: '10% 50%, 50% 50%, 90% 50%', label: 'Middle line' },
  2: { points: '10% 75%, 50% 75%, 90% 75%', label: 'Bottom line' },
  3: { points: '12% 22%, 50% 50%, 88% 78%', label: 'Diagonal Down' },
  4: { points: '12% 78%, 50% 50%, 88% 22%', label: 'Diagonal Up' }
};

function buildFallbackGrid() {
  return [
    ['🍒', '🍋', '🍉'],
    ['🔔', '🍒', '🍋'],
    ['🍉', '💎', '🍒']
  ];
}

function getWinningCells(winningLines) {
  const cells = new Set();
  if (!Array.isArray(winningLines)) return cells;

  for (const line of winningLines) {
    if (line.line === 0) { cells.add(0); cells.add(1); cells.add(2); }
    if (line.line === 1) { cells.add(3); cells.add(4); cells.add(5); }
    if (line.line === 2) { cells.add(6); cells.add(7); cells.add(8); }
    if (line.line === 3) { cells.add(0); cells.add(4); cells.add(8); }
    if (line.line === 4) { cells.add(6); cells.add(4); cells.add(2); }
  }
  return cells;
}

function getWinningLineDefs(winningLines) {
  if (!Array.isArray(winningLines)) return [];
  return winningLines
    .map((line) => ({ ...line, ...PAYLINE_MAP[line.line] }))
    .filter((line) => Boolean(line.points));
}

function SlotCell({ symbol, isWinning, isSpinning, delay }) {
  return (
    <div
      className={`relative aspect-square flex items-center justify-center rounded-2xl border text-4xl sm:text-5xl font-black overflow-hidden transition-all duration-300 ${
        isWinning
          ? 'bg-amber-50 border-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.35)] scale-[1.04]' 
          : 'bg-white border-gray-200'
      } ${isSpinning ? 'animate-pulse' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={`transition-all duration-500 ${
          isSpinning ? 'translate-y-0 blur-[1px] scale-95 opacity-75' : 'translate-y-0 blur-0 scale-100 opacity-100'
        } ${isWinning ? 'animate-[slot-pop_700ms_ease-in-out_infinite]' : ''}`}
      >
        {symbol}
      </div>
      {isWinning && (
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-yellow-200/25 to-transparent animate-[shine-sweep_1.2s_linear_infinite]" />
      )}
    </div>
  );
}

export default function Slots() {
  const { token, updateBalance, balanceEth } = useContext(AuthContext);

  const [betEth, setBetEth] = useState('0.001');
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [isCelebrating, setIsCelebrating] = useState(false);
  const [flash, setFlash] = useState(false);
  const celebrationTimer = useRef(null);

  // Очистка таймера при уходе со страницы (Memory Leak Fix)
  useEffect(() => {
    return () => {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    };
  }, []);

  const normalizeAmount = (value) => value.toString().replace(',', '.').trim();

  const handleAmountChange = (e) => {
    const value = normalizeAmount(e.target.value);
    if (/^\d*(\.\d{0,18})?$/.test(value)) {
      setBetEth(value);
    }
  };

  const winningCells = useMemo(() => getWinningCells(result?.winning_lines), [result]);
  const winningLineDefs = useMemo(() => getWinningLineDefs(result?.winning_lines), [result]);
  const grid = result?.grid || buildFallbackGrid();

  const showCelebration = (multiplier) => {
    if (multiplier >= 10) { // Радуемся на множителях 10 и 50
      setIsCelebrating(true);
      setFlash(true);
      celebrationTimer.current = setTimeout(() => {
        setIsCelebrating(false);
        setFlash(false);
      }, 2200);
    }
  };

  const handleSpin = async () => {
    if (isSpinning) return; // Guard от двойного клика

    setError(null);
    setResult(null);

    if (!token) {
      setError('Сначала войдите в аккаунт.');
      return;
    }

    const safeBetEth = normalizeAmount(betEth);
    if (!safeBetEth) {
      setError('Введите сумму ставки.');
      return;
    }

    try {
      const betWei = ethers.parseEther(safeBetEth);
      const minWei = ethers.parseEther(MIN_BET_ETH);
      const maxWei = ethers.parseEther(MAX_BET_ETH);
      const balanceWei = ethers.parseEther(balanceEth || "0");

      if (betWei < minWei) {
        setError(`Минимальная ставка ${MIN_BET_ETH} ETH`);
        return;
      }
      if (betWei > maxWei) {
        setError(`Максимальная ставка ${MAX_BET_ETH} ETH`);
        return;
      }
      if (betWei > balanceWei) {
        setError("Недостаточно средств на балансе!");
        return;
      }

      setIsSpinning(true);

      const response = await fetch(`${API_URL}/games/slots/spin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ bet_amount_wei: betWei.toString() })
      });

      const data = await response.json();

      if (!response.ok) {
        if (Array.isArray(data.detail)) {
          const messages = data.detail.map((err) => `Поле ${err.loc.join('.')} - ${err.msg}`);
          throw new Error(messages.join(' | '));
        }
        throw new Error(data.detail || 'Ошибка сервера');
      }

      setResult(data);
      await updateBalance();
      showCelebration(Number(data.total_multiplier || 0));

    } catch (err) {
      console.error('Ошибка слотов:', err);
      setError(err.message || 'Ошибка при запуске слотов');
    } finally {
      setIsSpinning(false);
    }
  };

  return (
    // Уменьшили контейнер с max-w-5xl до max-w-4xl
    <div className="max-w-4xl mx-auto px-6 py-10 relative">
      <style>{`
        @keyframes slot-pop {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes shine-sweep {
          0% { transform: translateX(-120%) skewX(-18deg); opacity: 0; }
          15% { opacity: 1; }
          50% { opacity: 1; }
          100% { transform: translateX(120%) skewX(-18deg); opacity: 0; }
        }
        @keyframes reel-shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          50% { transform: translateX(2px); }
          75% { transform: translateX(-1px); }
        }
        @keyframes jackpot-glow {
          0%, 100% { box-shadow: 0 0 0 rgba(245, 158, 11, 0); }
          50% { box-shadow: 0 0 70px rgba(245, 158, 11, 0.45); }
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg) scale(0.8); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(320px) rotate(720deg) scale(1); opacity: 0; }
        }
        @keyframes jackpot-burst {
          0% { transform: scale(0.5); opacity: 0; }
          20% { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes line-draw {
          0% { stroke-dashoffset: 400; opacity: 0; }
          12% { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; }
        }
        .reel-shake { animation: reel-shake 0.28s ease-in-out infinite; }
        .jackpot-panel { animation: jackpot-glow 1.1s ease-in-out infinite; }
        .line-draw {
          stroke-dasharray: 400;
          animation: line-draw 900ms ease-out forwards;
        }
      `}</style>

      {isCelebrating && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-amber-300/40 blur-3xl animate-[jackpot-burst_1.4s_ease-out_infinite]" />
              <div className="relative px-8 py-6 rounded-full border border-amber-200 bg-white/10 text-white text-center shadow-2xl backdrop-blur-md">
                <div className="text-5xl font-black tracking-[0.25em] text-amber-300">JACKPOT</div>
                <div className="mt-2 text-lg font-semibold">x{result?.total_multiplier}</div>
              </div>
            </div>
          </div>
          {Array.from({ length: 24 }).map((_, index) => {
            const left = (index * 4.1) % 100;
            const delay = (index % 6) * 120;
            const duration = 1400 + (index % 5) * 140;
            return (
              <div
                key={index}
                className="absolute top-0 text-2xl sm:text-3xl"
                style={{ left: `${left}%`, animation: `confetti-fall ${duration}ms linear ${delay}ms infinite` }}
              >
                {SYMBOLS[index % SYMBOLS.length]}
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-6 text-center">
        <div className="text-5xl mb-3">🎰</div>
        <h1 className="text-3xl font-extrabold text-gray-900">Слоты</h1>
        <p className="text-gray-500 mt-1 text-sm">Делайте ставку. Крутите. Побеждайте.</p>
      </div>

      <div className={`bg-white p-5 sm:p-6 rounded-[2rem] shadow-sm border border-gray-100 ${flash ? 'jackpot-panel' : ''}`}>
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-center">

          {/* Левая панель со ставками */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ставка (ETH)</label>
              <input
                type="text"
                inputMode="decimal"
                value={betEth}
                onChange={handleAmountChange}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-gray-900 transition-all text-sm"
                placeholder="0.001"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-2 px-1">
                <span>Min: {MIN_BET_ETH}</span>
                <span>Max: {MAX_BET_ETH}</span>
              </div>
            </div>

            <button
              onClick={handleSpin}
              disabled={isSpinning || !token}
              className="w-full bg-gray-900 hover:bg-black text-white py-3.5 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSpinning ? 'Крутим...' : 'КРУТИТЬ'}
            </button>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm leading-relaxed">
                {error}
              </div>
            )}

            {result && (
              <div className={`p-4 rounded-xl border text-sm leading-relaxed ${
                result.is_win ? 'bg-green-50 border-green-100 text-green-700' : 'bg-gray-50 border-gray-100 text-gray-700'
              }`}>
                <div className="font-bold mb-1">{result.is_win ? 'Выигрыш!' : 'Повезет в следующий раз'}</div>
                {result.is_win && (
                  <>
                    <div className="flex justify-between mt-1">
                      <span>Множитель:</span> <span>x{result.total_multiplier}</span>
                    </div>
                    <div className="flex justify-between mt-1 font-bold">
                      <span>Выплата:</span> <span>{ethers.formatEther(result.payout_wei || '0')} ETH</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Правая панель с барабанами (уменьшена max-w) */}
          <div className="flex justify-center items-center">
            <div className={`relative w-full max-w-md rounded-[2rem] border border-gray-100 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 p-4 shadow-2xl ${isSpinning ? 'reel-shake' : ''}`}>
              <div className="absolute inset-x-0 top-0 h-12 rounded-t-[2rem] bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 h-12 rounded-b-[2rem] bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />

              <div className="relative rounded-[1.25rem] bg-white/95 p-3 overflow-hidden">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 bg-amber-300/10 blur-2xl pointer-events-none" />

                <div className="relative grid grid-cols-3 gap-2 sm:gap-3">
                  {grid.map((row, rowIndex) =>
                    row.map((symbol, colIndex) => {
                      const flatIndex = rowIndex * 3 + colIndex;
                      return (
                        <SlotCell
                          key={`${rowIndex}-${colIndex}`}
                          symbol={symbol}
                          isWinning={winningCells.has(flatIndex)}
                          isSpinning={isSpinning}
                          delay={(rowIndex * 3 + colIndex) * 45}
                        />
                      );
                    })
                  )}
                </div>

                <svg className="pointer-events-none absolute inset-0 h-full w-full">
                  {winningLineDefs.map((line) => (
                    <polyline
                      key={`${line.line}-${line.symbol}`}
                      points={line.points}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="line-draw"
                    />
                  ))}
                </svg>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}