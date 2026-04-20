import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function Header() {
  const { walletAddress, login, logout, balanceEth } = useContext(AuthContext);

  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <header className="bg-white shadow-sm px-8 py-4 flex justify-between items-center sticky top-0 z-50">
      <Link to="/" className="text-2xl font-bold tracking-tight text-gray-900 hover:opacity-80 transition-opacity">
        Web3<span className="text-blue-600">Casino</span>
      </Link>

      <div>
        {walletAddress ? (
            <div className="flex items-center gap-4">
                <Link to="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <div className="bg-gray-100 px-4 py-2 rounded-lg font-medium text-gray-700">
                        {balanceEth} ETH
                    </div>
                    <div className="text-sm text-gray-500 font-mono bg-white px-2 py-1 rounded border border-gray-200">
                        {formatAddress(walletAddress)}
                    </div>
                </Link>

                <button
                    onClick={logout}
                    className="text-sm font-medium text-red-500 hover:text-red-600 transition-colors"
                >
                    Выйти
                </button>
            </div>
        ) : (
            <button
                onClick={login}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-all shadow-sm"
            >
                Войти через MetaMask
            </button>
        )}
      </div>
    </header>
  );
}