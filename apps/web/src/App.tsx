import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/Shell.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { ModeSelectScreen } from './screens/ModeSelectScreen.js';
import { ArenaConfigScreen } from './screens/ArenaConfigScreen.js';
import { MatchScreen } from './screens/MatchScreen.js';
import { ResultScreen } from './screens/ResultScreen.js';
import { BotSelectScreen } from './screens/BotSelectScreen.js';
import { PuzzlesScreen } from './screens/PuzzlesScreen.js';
import { ProfileScreen } from './screens/ProfileScreen.js';
import { LeaderboardScreen } from './screens/LeaderboardScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

function NotFoundScreen() {
  return (
    <div className="card">
      <span className="eyebrow">404</span>
      <h1 style={{ margin: '6px 0 8px' }}>That route is walled off</h1>
      <p className="muted small">The page you asked for does not exist. Head back to the board.</p>
      <div className="btn-row" style={{ marginTop: 16 }}>
        <Link className="btn btn-primary" to="/">Home</Link>
        <Link className="btn btn-ghost" to="/play">Play</Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<HomeScreen />} />
          <Route path="play" element={<ModeSelectScreen />} />
          <Route path="config" element={<ArenaConfigScreen />} />
          <Route path="match" element={<MatchScreen />} />
          <Route path="result" element={<ResultScreen />} />
          <Route path="bots" element={<BotSelectScreen />} />
          <Route path="puzzles" element={<PuzzlesScreen />} />
          <Route path="profile" element={<ProfileScreen />} />
          <Route path="leaderboard" element={<LeaderboardScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="*" element={<NotFoundScreen />} />
        </Route>
      </Routes>
    </>
  );
}
