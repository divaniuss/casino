import React, { useState } from 'react';
import { ethers } from 'ethers';

export default function App() {
  const [wallet, setWallet] = useState(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');

    if (!window.ethereum) {
      setError('MetaMask не установлен в браузере!');
      return;
    }

    try {
      // 1. Подключаемся к MetaMask
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      setWallet(address);

      // 2. Просим бэкенд дать нам строку (nonce) для подписи
      const nonceRes = await fetch(`http://127.0.0.1:8000/auth/nonce/${address}`);
      if (!nonceRes.ok) throw new Error('Ошибка при получении nonce с сервера');
      const nonceData = await nonceRes.json();

      // 3. Пользователь подписывает строку
      const message = `Welcome to Beer Shop\n\nNonce: ${nonceData.nonce}`;
      const signature = await signer.signMessage(message);

      // 4. Отправляем подпись на проверку
      const verifyRes = await fetch(`http://127.0.0.1:8000/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: address,
          signature: signature
        })
      });

      if (!verifyRes.ok) throw new Error('Верификация не пройдена');
      const verifyData = await verifyRes.json();

      // 5. Сохраняем токен!
      setToken(verifyData.access_token);

    } catch (err) {
      console.error(err);
      setError(err.message || 'Произошла ошибка при авторизации');
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>🎲 Web3 Casino Test</h1>

      {!token ? (
        <button
          onClick={handleLogin}
          style={{
            padding: '15px 30px',
            fontSize: '18px',
            cursor: 'pointer',
            backgroundColor: '#f6851b',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold'
          }}
        >
          🦊 Войти через MetaMask
        </button>
      ) : (
        <div style={{ backgroundColor: '#e6ffe6', padding: '20px', borderRadius: '8px', border: '1px solid #4caf50' }}>
          <h2 style={{ color: '#2e7d32', marginTop: 0 }}>✅ Авторизация успешна!</h2>
          <p><strong>Твой кошелек:</strong><br/>{wallet}</p>
          <div style={{ marginTop: '20px' }}>
            <strong>Твой JWT Токен (скопируй для Swagger):</strong>
            <textarea
              readOnly
              value={token}
              style={{
                width: '100%',
                height: '100px',
                marginTop: '10px',
                padding: '10px',
                fontFamily: 'monospace',
                borderRadius: '4px',
                border: '1px solid #ccc'
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div style={{ backgroundColor: '#ffe6e6', padding: '15px', color: '#c62828', marginTop: '20px', borderRadius: '8px' }}>
          <strong>Ошибка:</strong> {error}
        </div>
      )}
    </div>
  );
}