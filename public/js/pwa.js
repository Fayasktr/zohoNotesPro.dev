// PWA Registration & Install Prompt Handler for Zoho Notes

(function () {
  'use strict';

  let deferredPrompt = null;

  // 1. Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registered successfully with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  // 2. Listen for Install Prompt Event
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent standard mini-infobar from showing automatically
    e.preventDefault();
    deferredPrompt = e;

    // Check if user previously dismissed
    if (localStorage.getItem('pwa_install_dismissed') === 'true') {
      return;
    }

    // Display custom PWA Install Banner
    showInstallBanner();
  });

  // 3. Render Custom PWA Install Banner UI
  function showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      background: rgba(17, 17, 20, 0.95);
      border: 1px solid rgba(109, 93, 252, 0.3);
      backdrop-filter: blur(12px);
      padding: 16px 20px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 20px rgba(109, 93, 252, 0.2);
      display: flex;
      align-items: center;
      gap: 16px;
      max-width: 420px;
      width: calc(100% - 40px);
      color: #ffffff;
      font-family: 'Inter', system-ui, sans-serif;
      animation: pwaSlideUp 0.4s ease-out;
    `;

    banner.innerHTML = `
      <style>
        @keyframes pwaSlideUp {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .pwa-btn-install {
          background: linear-gradient(135deg, #6d5dfc 0%, #4b3bcb 100%);
          color: #ffffff;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
          box-shadow: 0 2px 10px rgba(109, 93, 252, 0.4);
        }
        .pwa-btn-install:hover {
          transform: scale(1.03);
        }
        .pwa-btn-close {
          background: transparent;
          color: #a0a0a5;
          border: none;
          font-size: 1.25rem;
          cursor: pointer;
          line-height: 1;
          padding: 4px;
        }
        .pwa-btn-close:hover {
          color: #ffffff;
        }
      </style>
      <img src="/images/icon-192.png" alt="App Icon" style="width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;" />
      <div style="flex-grow: 1;">
        <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 2px;">Install Zoho Notes</div>
        <div style="font-size: 0.8rem; color: #a0a0a5;">Add to home screen for desktop & offline notebook access.</div>
      </div>
      <button class="pwa-btn-install" id="pwa-install-btn">Install</button>
      <button class="pwa-btn-close" id="pwa-close-btn" aria-label="Close">&times;</button>
    `;

    document.body.appendChild(banner);

    // Click Handlers
    document.getElementById('pwa-install-btn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[PWA] Install prompt outcome: ${outcome}`);
      deferredPrompt = null;
      banner.remove();
    });

    document.getElementById('pwa-close-btn').addEventListener('click', () => {
      localStorage.setItem('pwa_install_dismissed', 'true');
      banner.remove();
    });
  }

  // 4. Listen for Successful App Installation
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] Zoho Notes installed successfully!');
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.remove();
  });
})();
