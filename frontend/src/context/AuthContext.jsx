import { createContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';

export const AuthContext = createContext();

const API_URL = import.meta.env.VITE_API_URL;

export const AuthProvider = ({ children }) => {
    const [walletAddress, setWalletAddress] = useState(null);
    const [token, setToken] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [balanceEth, setBalanceEth] = useState("0");
    const [loading, setLoading] = useState(true);


    const fetchProfile = async (currentToken) => {
        try {
            const response = await fetch(`${API_URL}/users/me`, {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            if (response.ok) {
                const data = await response.json();

                const ethValue = ethers.formatEther(data.balance_wei);

                setBalanceEth(Number(ethValue).toFixed(8));
            } else {
                logout();
            }
        } catch (error) {
            console.error("Ошибка загрузки профиля:", error);
        }
    };

    useEffect(() => {
        const savedToken = localStorage.getItem('token');
        const savedWallet = localStorage.getItem('wallet');
        const savedAdmin = localStorage.getItem('isAdmin') === 'true';

        if (savedToken && savedWallet) {
            setToken(savedToken);
            setWalletAddress(savedWallet);
            setIsAdmin(savedAdmin);
            fetchProfile(savedToken);
        }
        setLoading(false);
    }, []);

    const login = async () => {
        if (!window.ethereum) {
            alert("Пожалуйста, установите MetaMask!");
            return;
        }

        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const account = accounts[0];

            const nonceResponse = await fetch(`${API_URL}/auth/nonce/${account}`);
            if (!nonceResponse.ok) throw new Error("Не удалось получить nonce с сервера");
            const { nonce } = await nonceResponse.json();

            const message = `Sign this message to authenticate.\nNonce: ${nonce}`;

            const signature = await window.ethereum.request({
                method: 'personal_sign',
                params: [message, account]
            });

            const verifyResponse = await fetch(`${API_URL}/auth/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet_address: account, signature: signature })
            });

            if (!verifyResponse.ok) throw new Error("Ошибка проверки подписи на сервере");

            const data = await verifyResponse.json();

            setToken(data.access_token);
            setWalletAddress(account);
            setIsAdmin(data.is_admin || false);

            localStorage.setItem('token', data.access_token);
            localStorage.setItem('wallet', account);
            localStorage.setItem('isAdmin', data.is_admin || false);


            await fetchProfile(data.access_token);

        } catch (error) {
            console.error("Ошибка входа:", error);
            alert("Не удалось войти. Подробности в консоли.");
        }
    };

    const logout = () => {
        setToken(null);
        setWalletAddress(null);
        setIsAdmin(false);
        setBalanceEth("0");
        localStorage.removeItem('token');
        localStorage.removeItem('wallet');
        localStorage.removeItem('isAdmin');
    };

    const updateBalance = async () => {
        if (token) await fetchProfile(token);
    };

    return (
        <AuthContext.Provider value={{
            walletAddress, token, isAdmin, balanceEth,
            login, logout, updateBalance, loading
        }}>
            {children}
        </AuthContext.Provider>
    );
};