import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ConfirmProvider, Shell, ToastProvider } from './components/ui';
import { IntroSplash } from './components/IntroSplash';
import { WakeBanner } from './components/WakeBanner';
import { PrefsProvider } from './lib/prefs';
import Hub from './pages/Hub';
import './index.css';
import { sounds } from './lib/sound';

// Phones only allow sound after a tap: unlock audio on the first interaction.
window.addEventListener('pointerdown', () => sounds.unlock(), { once: true });

const Landing = lazy(() => import('./pages/Landing'));
const HostCreate = lazy(() => import('./pages/HostCreate'));
const Join = lazy(() => import('./pages/Join'));
const Room = lazy(() => import('./pages/Room'));
const Display = lazy(() => import('./pages/Display'));
const Guide = lazy(() => import('./pages/Guide'));
const CharadesHome = lazy(() => import('./charades/pages/Home'));
const CharadesHost = lazy(() => import('./charades/pages/HostCreate'));
const CharadesJoin = lazy(() => import('./charades/pages/Join'));
const CharadesRoom = lazy(() => import('./charades/pages/Room'));
const CharadesTV = lazy(() => import('./charades/pages/TV'));

function NotFound() {
  return (
    <Shell>
      <div className="card mx-auto max-w-md p-6 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-gold">Wrong door</h1>
        <p className="mt-2 text-mute">There’s nothing here.</p>
        <Link to="/" className="btn btn-primary mt-4">
          Back to the entrance
        </Link>
      </div>
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <ToastProvider>
        <ConfirmProvider>
          <IntroSplash />
          <WakeBanner />
          <BrowserRouter>
            <Suspense fallback={<div className="grid min-h-dvh place-items-center text-mute">Loading…</div>}>
              <Routes>
                <Route path="/" element={<Hub />} />
                <Route path="/mafia" element={<Landing />} />
                <Route path="/host" element={<HostCreate />} />
                <Route path="/join" element={<Join />} />
                <Route path="/join/:code" element={<Join />} />
                <Route path="/r/:code" element={<Room />} />
                <Route path="/tv/:code" element={<Display />} />
                <Route path="/guide" element={<Guide />} />
                <Route path="/charades" element={<CharadesHome />} />
                <Route path="/charades/host" element={<CharadesHost />} />
                <Route path="/charades/join" element={<CharadesJoin />} />
                <Route path="/charades/join/:code" element={<CharadesJoin />} />
                <Route path="/c/:code" element={<CharadesRoom />} />
                <Route path="/ctv/:code" element={<CharadesTV />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </PrefsProvider>
  </StrictMode>,
);
