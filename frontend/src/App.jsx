import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import Dice from './pages/Dice';
import Profile from './pages/Profile';
import Slots from './pages/Slots.jsx'
import Crash from './pages/Crash.jsx'

const Placeholder = ({ title }) => (
  <div className="min-h-[80vh] flex items-center justify-center text-2xl text-gray-400 font-bold">
    Игра "{title}" в разработке... 🛠️
  </div>
);

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      <Header />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/slots" element={<Slots />} />
        <Route path="/crash" element={<Crash />} />
        <Route path="/dice" element={<Dice />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </div>
  );
}