import { useState, useContext, useRef, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ethers } from 'ethers';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const MIN_BET_ETH = '0.00000001';
const MAX_BET_ETH = '1';
const MIN_MULTIPLIER = 1.01;

export default function Crash() {
  const { token, updateBalance, balanceEth } = useContext(AuthContext);

  const [betEth, setBetEth] = useState('0.01');
  const [targetMultiplier, setTargetMultiplier] = useState('2.00');
  const [error, setError] = useState(null);

  const [gameState, setGameState] = useState('idle'); // idle, flying, crashed
  const [currentMultiplier, setCurrentMultiplier] = useState(1.00);
  const [hasCashedOut, setHasCashedOut] = useState(false);
  const [payoutStats, setPayoutStats] = useState(null);

  const animationRef = useRef(null);
  const crashDataRef = useRef(null);

  // Ссылка на наш холст для рисования графика
  const canvasRef = useRef(null);

  const handleBetChange = (e) => {
    const val = e.target.value.replace(',', '.');
    if (/^\d*(\.\d{0,18})?$/.test(val)) setBetEth(val);
  };

  const handleTargetChange = (e) => {
    const val = e.target.value.replace(',', '.');
    if (/^\d*(\.\d{0,2})?$/.test(val)) setTargetMultiplier(val);
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // --- МАГИЯ ОТРИСОВКИ CANVAS ---
  const drawChart = (progress, currentVal, isCrashed, isSuccess) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Динамический масштаб (камера отъезжает, если летим высоко/долго)
    const maxT = Math.max(3000, progress);
    const maxM = Math.max(2.0, currentVal);

    // Функции перевода значений в пиксели экрана (оставляем отступы 15%)
    const getX = (t) => (t / maxT) * (W * 0.85);
    const getY = (m) => H - ((m - 1) / (maxM - 1)) * (H * 0.85);

    // 1. Рисуем кривую полета
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(1));

    let lastX = getX(0), lastY = getY(1);

    // Строим график по точкам истории
    for (let t = 0; t <= progress; t += 50) {
      let m = 1.00 + (t / 1000) * (1 + t / 2000);
      lastX = getX(t);
      lastY = getY(m);
      ctx.lineTo(lastX, lastY);
    }

    // Меняем цвет линии при победе или взрыве
    ctx.strokeStyle = isCrashed ? '#ef4444' : (isSuccess ? '#4ade80' : '#3b82f6');
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 2. Рисуем ракету
    ctx.save();
    ctx.translate(lastX, lastY);

    // Вычисляем угол наклона ракеты (по касательной к кривой)
    let prevT = Math.max(0, progress - 100);
    let prevM = 1.00 + (prevT / 1000) * (1 + prevT / 2000);
    let dx = getX(progress) - getX(prevT);
    let dy = getY(currentVal) - getY(prevM);

    // Если стоим на месте (0 кадр), смотрим вправо-вверх
    let angle = (dx === 0 && dy === 0) ? -0.5 : Math.atan2(dy, dx);
    ctx.rotate(angle);

    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Рисуем взрыв или ракету (с корректировкой угла эмодзи)
    if (isCrashed) {
      ctx.fillText('💥', 0, 0);
    } else {
      // Эмодзи ракеты по умолчанию смотрит вверх-вправо, корректируем на 45 градусов (Math.PI/4)
      ctx.rotate(Math.PI / 4);
      ctx.fillText('🚀', 0, 0);
    }

    ctx.restore();
  };

  const startAnimation = (data) => {
    crashDataRef.current = { ...data, cashedOut: false };
    setGameState('flying');
    setHasCashedOut(false);
    setCurrentMultiplier(1.00);

    let startTimestamp = null;

    const animate = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = timestamp - startTimestamp;

      const currentVal = 1.00 + (progress / 1000) * (1 + progress / 2000);

      // Проверка победы (авто-вывод)
      if (data.is_win && currentVal >= data.target_multiplier && !crashDataRef.current.cashedOut) {
        crashDataRef.current.cashedOut = true;
        setHasCashedOut(true);
        updateBalance();
      }

      // Проверка взрыва
      if (currentVal >= data.actual_crash_point) {
        setCurrentMultiplier(data.actual_crash_point);
        setGameState('crashed');
        drawChart(progress, data.actual_crash_point, true, crashDataRef.current.cashedOut);

        if (!data.is_win) updateBalance();
        return;
      }

      setCurrentMultiplier(currentVal);
      drawChart(progress, currentVal, false, crashDataRef.current.cashedOut);

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  const handlePlay = async () => {
    if (gameState === 'flying') return;

    setError(null);
    setPayoutStats(null);

    if (!token) return setError('Сначала войдите в аккаунт.');
    if (!betEth || !targetMultiplier) return setError('Заполните все поля.');

    try {
      const betWei = ethers.parseEther(betEth);
      const minWei = ethers.parseEther(MIN_BET_ETH);
      const maxWei = ethers.parseEther(MAX_BET_ETH);
      const balanceWei = ethers.parseEther(balanceEth || "0");
      const targetNum = Number(targetMultiplier);

      if (betWei < minWei) return setError(`Минимальная ставка ${MIN_BET_ETH} ETH`);
      if (betWei > maxWei) return setError(`Максимальная ставка ${MAX_BET_ETH} ETH`);
      if (betWei > balanceWei) return setError("Недостаточно средств на балансе!");
      if (targetNum < MIN_MULTIPLIER) return setError(`Минимальный множитель ${MIN_MULTIPLIER}x`);

      // Очищаем график перед новым полетом
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      const response = await fetch(`${API_URL}/games/crash/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          bet_amount_wei: betWei.toString(),
          target_multiplier: targetNum
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (Array.isArray(data.detail)) {
          throw new Error(data.detail.map(err => `Поле ${err.loc.join('.')} - ${err.msg}`).join(' | '));
        }
        throw new Error(data.detail || 'Ошибка сервера');
      }

      setPayoutStats(data);
      startAnimation(data);

    } catch (err) {
      console.error('Ошибка Crash:', err);
      setError(err.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 relative">
      <div className="mb-6 text-center">
        <div className="text-5xl mb-3">🚀</div>
        <h1 className="text-3xl font-extrabold text-gray-900">Ракетка</h1>
        <p className="text-gray-500 mt-1 text-sm">Укажите множитель авто-вывода. Ракета не должна взорваться раньше!</p>
      </div>

      <div className="bg-white p-5 sm:p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 items-stretch">

          {/* ПАНЕЛЬ УПРАВЛЕНИЯ */}
          <div className="flex flex-col justify-center space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ставка (ETH)</label>
              <input
                type="text"
                inputMode="decimal"
                value={betEth}
                onChange={handleBetChange}
                disabled={gameState === 'flying'}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                placeholder="0.01"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Авто-вывод на множителе (x)</label>
              <input
                type="text"
                inputMode="decimal"
                value={targetMultiplier}
                onChange={handleTargetChange}
                disabled={gameState === 'flying'}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all text-sm disabled:opacity-50"
                placeholder="2.00"
              />
            </div>

            <button
              onClick={handlePlay}
              disabled={gameState === 'flying' || !token}
              className="w-full bg-gray-900 hover:bg-black text-white py-4 mt-2 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {gameState === 'flying' ? 'В ПОЛЕТЕ...' : 'СТАРТ'}
            </button>

            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm leading-relaxed">
                {error}
              </div>
            )}
          </div>

          {/* ИГРОВОЙ ЭКРАН (CANVAS) */}
          <div className="relative w-full h-80 rounded-[2rem] border border-gray-100 bg-gray-900 overflow-hidden flex shadow-inner">

            {/* Сетка на фоне */}
            <div className="absolute inset-0 opacity-10 bg-[linear-gradient(#ffffff33_1px,transparent_1px),linear-gradient(90deg,#ffffff33_1px,transparent_1px)] bg-[size:40px_40px]" />

            {/* ХОЛСТ ДЛЯ ГРАФИКА */}
            <canvas
              ref={canvasRef}
              width={600}
              height={320}
              className="absolute inset-0 w-full h-full z-0"
            />

            {/* Множитель по центру поверх графика */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className={`z-10 text-6xl md:text-7xl font-black tracking-tighter transition-colors duration-300 ${
                gameState === 'crashed' ? 'text-red-500' :
                hasCashedOut ? 'text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]' : 'text-white'
              }`}>
                {currentMultiplier.toFixed(2)}x
              </div>

              <div className="z-10 mt-2 h-8 text-lg font-bold uppercase tracking-widest">
                {gameState === 'crashed' && <span className="text-red-500 bg-black/50 px-3 py-1 rounded">Busted!</span>}
                {hasCashedOut && gameState === 'flying' && <span className="text-green-400 bg-black/50 px-3 py-1 rounded">Успех!</span>}
                {gameState === 'idle' && <span className="text-gray-500">Готов к запуску</span>}
              </div>
            </div>

            {/* Итоговая выплата */}
            {(gameState === 'crashed' && payoutStats?.is_win) && (
              <div className="z-10 absolute bottom-4 left-1/2 -translate-x-1/2 bg-green-500/20 border border-green-500 text-green-400 px-6 py-2 rounded-full font-bold backdrop-blur-md animate-fade-in-up">
                Выиграно {ethers.formatEther(payoutStats.payout_wei)} ETH!
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}