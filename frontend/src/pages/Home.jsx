import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function Home() {
  const { walletAddress, login, loading } = useContext(AuthContext);

  const games = [
    { id: 'slots', path: '/slots', title: 'Слоты', icon: '🎰', desc: 'Классические барабаны 3x3. Собери линию!' },
    { id: 'crash', path: '/crash', title: 'Краш', icon: '🚀', desc: 'Забери прибыль до того, как ракета взорвется.' },
    { id: 'dice', path: '/dice', title: 'Кости', icon: '🎲', desc: 'Угадай число и умножь свою ставку.' }
  ];

  if (loading) {
    return <div className="min-h-[80vh] flex items-center justify-center">Загрузка...</div>;
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-16 flex flex-col items-center">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-4">
          Испытай удачу
        </h1>
        <p className="text-lg text-gray-500">
          Мгновенные выплаты, честная математика и полная прозрачность на смарт-контрактах.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
        {games.map((game) => (
          <div
            key={game.id}
            className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center hover:-translate-y-1 hover:shadow-md transition-all duration-300"
          >
            <div className="text-6xl mb-6">{game.icon}</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{game.title}</h2>
            <p className="text-gray-500 mb-8 flex-grow">{game.desc}</p>

            {walletAddress ? (
              <Link
                to={game.path}
                className="w-full block bg-gray-900 hover:bg-black text-white py-3 rounded-xl font-semibold transition-colors"
              >
                Играть
              </Link>
            ) : (
              <button
                onClick={login}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl font-medium transition-colors"
              >
                Войдите, чтобы играть
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}