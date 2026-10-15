import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ConfirmProvider, Shell, ToastProvider } from './components/ui';
import { PrefsProvider } from './lib/prefs';
import Landing from './pages/Landing';
import './index.css';

const HostCreate = lazy(() => import('./pages/HostCreate'));
const Join = lazy(() => import('./pages/Join'));
const Room = lazy(() => import('./pages/Room'));
const Display = lazy(() => import('./pages/Display'));
const Guide = lazy(() => import('./pages/Guide'));

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
          <BrowserRouter>
            <Suspense fallback={<div className="grid min-h-dvh place-items-center text-mute">Loading…</div>}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/host" element={<HostCreate />} />
                <Route path="/join" element={<Join />} />
                <Route path="/join/:code" element={<Join />} />
                <Route path="/r/:code" element={<Room />} />
                <Route path="/tv/:code" element={<Display />} />
                <Route path="/guide" element={<Guide />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </PrefsProvider>
  </StrictMode>,
);
