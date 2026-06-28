import React from 'react'
import ReactDOM from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import './index.css'
import './styles/themes.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
)

// PWA service worker registration — guarded to never run in Lovable preview/dev.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      const h = window.location.hostname;
      const inIframe = window.self !== window.top;
      const swOff = new URLSearchParams(window.location.search).has('sw=off');
      const isPreviewOrDev =
        !import.meta.env.PROD ||
        inIframe ||
        swOff ||
        h.startsWith('id-preview--') ||
        h.startsWith('preview--') ||
        h === 'lovableproject.com' ||
        h.endsWith('.lovableproject.com') ||
        h === 'lovableproject-dev.com' ||
        h.endsWith('.lovableproject-dev.com') ||
        h === 'beta.lovable.dev' ||
        h.endsWith('.beta.lovable.dev');

      if (isPreviewOrDev) {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => {
            regs.forEach((r) => {
              if (r.active?.scriptURL?.endsWith('/sw.js')) {
                r.unregister().catch(() => {});
              }
            });
          })
          .catch(() => {});
        return;
      }

      navigator.serviceWorker.register('/sw.js').catch(() => {});
    } catch {
      /* never let SW registration break the app */
    }
  });
}
