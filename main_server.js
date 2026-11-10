const express = require('express');

const app = express();
const port = Number(process.env.PORT) || 8000;

app.disable('x-powered-by');

// Configuration: override via environment variables if endpoints differ
const SERVICES = {
    recyclifi: {
        label: 'RecycliFi (Edge)',
        url: process.env.RECYCLIFI_URL || 'https://i-s-finals.onrender.com/',
        healthPath: '/api/status',
    },
    recyclifi_ai: {
        label: 'RecycliFi (AI)',
        url: process.env.RECYCLIFI_AI_URL || 'https://ashtray42-recyclifi-ai.hf.space', // Update when you deploy the new AI version
        healthPath: '/',
    },
    nutrition: {
        label: 'Nutrition',
        url: process.env.NUTRITION_URL || 'https://ashtray42-food-analyzer.hf.space',
        healthPath: '/',
    },
    faceid: {
        label: 'FaceID',
        url: process.env.FACEID_URL || 'https://i-s-finals-face-analyzer.onrender.com',
        healthPath: '/',
    },
};

const PROBE_TIMEOUT_MS = 60000;

async function probe(baseUrl, path, timeoutMs = PROBE_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(new URL(path, baseUrl), {
            signal: controller.signal,
            redirect: 'manual',
            headers: { 'user-agent': 'control-hub-healthcheck' },
        });
        if (res.body) res.body.cancel().catch(() => {});
        return { online: true, status: res.status };
    } catch (err) {
        return {
            online: false,
            error: err.name === 'AbortError' ? 'timeout' : 'unreachable',
        };
    } finally {
        clearTimeout(timer);
    }
}

app.get('/api/health', async (_req, res) => {
    const entries = await Promise.all(
        Object.entries(SERVICES).map(async ([id, svc]) => [
            id,
            await probe(svc.url, svc.healthPath),
        ])
    );
    res.set('cache-control', 'no-store').json(Object.fromEntries(entries));
});

const esc = (value) =>
    String(value).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

const panels = Object.entries(SERVICES)
    .map(([id, svc]) => `
        <div class="view-panel" id="panel-${esc(id)}" data-service="${esc(id)}">
            <iframe title="${esc(svc.label)}" data-src="${esc(svc.url)}" allow="camera; microphone; clipboard-write"></iframe>
            <div class="offline-overlay">
                <h2>${esc(svc.label)} is unreachable</h2>
                <p>Could not connect to <code>${esc(svc.url)}</code>.</p>
                <button type="button" class="retry-btn" data-retry="${esc(id)}">Retry</button>
            </div>
        </div>`)
    .join('');

app.get('/', (req, res) => {
    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>Master Control Hub</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-main: #0b0f19;
            --bg-card: #151c2c;
            --border-color: #232f48;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --accent-blue: #38bdf8;
            --accent-emerald: #10b981;
            --accent-purple: #a855f7;
            --accent-amber: #f59e0b;
            --accent-cyan: #06b6d4;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }

        body, html {
            width: 100%; height: 100vh; height: 100dvh;
            background-color: var(--bg-main); color: var(--text-primary);
            overflow: hidden; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            -webkit-text-size-adjust: 100%;
        }

        .viewport-container { position: relative; width: 100%; height: 100%; }
        .view-panel { position: absolute; inset: 0; display: none; background-color: var(--bg-main); }
        .view-panel.active { display: block; }
        .view-panel iframe { width: 100%; height: 100%; border: 0; display: block; background: var(--bg-main); }
        .view-panel.offline iframe { visibility: hidden; }

        .offline-overlay {
            position: absolute; inset: 0; display: none; flex-direction: column;
            align-items: center; justify-content: center; gap: 0.75rem;
            padding: 2rem; text-align: center; background: var(--bg-main);
        }
        .view-panel.offline .offline-overlay { display: flex; }
        .offline-overlay h2 { font-size: 1.15rem; font-weight: 600; }
        .offline-overlay p { color: var(--text-secondary); font-size: 0.9rem; word-break: break-word; max-width: 100%; }
        .offline-overlay code { font-size: 0.85rem; color: var(--text-muted); }

        .retry-btn {
            margin-top: 0.5rem; padding: 0.55rem 1.25rem; border-radius: 8px;
            border: 1px solid var(--border-color); background: var(--bg-card);
            color: var(--text-primary); font: inherit; font-weight: 600;
            cursor: pointer; min-height: 44px; touch-action: manipulation;
        }
        .retry-btn:hover { border-color: var(--accent-blue); }

        #home-view { 
            padding: 3rem 2rem 7rem 2rem; overflow-y: auto; height: 100%;
            -webkit-overflow-scrolling: touch;
            padding-left: max(2rem, env(safe-area-inset-left));
            padding-right: max(2rem, env(safe-area-inset-right));
        }
        .home-content { max-width: 1100px; margin: 0 auto; }
        .home-header { margin-bottom: 2.5rem; }
        .home-header h1 { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
        .home-header p { color: var(--text-secondary); margin-top: 0.5rem; font-size: 1rem; }

        .grid-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
            gap: 1.5rem;
        }

        .card {
            background-color: var(--bg-card); color: inherit; font: inherit; text-align: left;
            width: 100%; border: 1px solid var(--border-color); border-radius: 12px;
            padding: 1.5rem; cursor: pointer; transition: transform 0.2s ease, border-color 0.2s ease;
            display: flex; flex-direction: column; justify-content: space-between; min-width: 0;
        }
        .card:hover { transform: translateY(-2px); border-color: var(--accent-blue); }
        .card:focus-visible { outline: 2px solid var(--accent-blue); outline-offset: 3px; }

        .card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; gap: 1rem; }
        .card-icon {
            width: 40px; height: 40px; border-radius: 8px; display: flex;
            align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.05); flex-shrink: 0;
        }
        .card-icon svg { width: 22px; height: 22px; }

        .status-indicator {
            display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.75rem;
            font-weight: 600; padding: 0.25rem 0.65rem; border-radius: 9999px;
            background: rgba(100, 116, 139, 0.15); color: var(--text-muted);
            white-space: nowrap; flex-shrink: 0;
        }
        .status-indicator.online { background: rgba(16, 185, 129, 0.12); color: var(--accent-emerald); }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; background-color: currentColor; }

        .card-title { font-size: 1.15rem; font-weight: 600; margin-bottom: 0.35rem; }
        .card-desc { font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; }
        .card-footer { margin-top: 1.5rem; font-size: 0.8rem; color: var(--text-muted); font-family: monospace; }

        /* ---- Floating dock ---- */
        .floating-dock-wrapper {
            position: fixed; bottom: max(1.5rem, env(safe-area-inset-bottom));
            left: 50%; transform: translateX(-50%); z-index: 9999;
            width: max-content; max-width: 100%; padding: 0 1rem;
        }

        .floating-dock {
            background: rgba(21, 28, 44, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.1); padding: 0.5rem;
            border-radius: 9999px; display: flex; align-items: center; gap: 0.5rem;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5); width: 100%; justify-content: center;
        }

        .dock-btn {
            background: transparent; border: none; color: var(--text-secondary);
            padding: 0.6rem 1rem; border-radius: 9999px; font-size: 0.85rem;
            font-weight: 500; font-family: inherit; cursor: pointer; display: flex;
            align-items: center; gap: 0.5rem; transition: all 0.2s ease;
            white-space: nowrap; touch-action: manipulation; min-height: 44px;
        }
        .dock-btn svg { width: 18px; height: 18px; flex-shrink: 0; }
        .dock-btn:hover { color: var(--text-primary); background: rgba(255, 255, 255, 0.05); }
        .dock-btn.active { background: var(--accent-blue); color: #000000; font-weight: 600; }

        .dock-divider { width: 1px; height: 20px; background-color: var(--border-color); flex-shrink: 0; }

        /* ---- Responsive Adjustments ---- */
        @media (max-width: 768px) {
            #home-view { 
                padding: 1.5rem 1rem 7rem 1rem; 
                padding-left: max(1rem, env(safe-area-inset-left));
                padding-right: max(1rem, env(safe-area-inset-right));
            }
            .home-header { margin-bottom: 1.5rem; }
            .home-header h1 { font-size: 1.5rem; }
            .home-header p { font-size: 0.9rem; }
            .grid-cards { gap: 1rem; }
            .card { padding: 1.25rem; }
            
            .floating-dock-wrapper { left: 0; right: 0; transform: none; width: 100%; max-width: 100%; padding: 0 0.5rem; }
            .floating-dock { justify-content: space-between; gap: 0.25rem; padding: 0.4rem; }
            .dock-btn { flex: 1; justify-content: center; padding: 0.6rem 0.25rem; font-size: 0.75rem; gap: 0.25rem; }
            .dock-divider { display: none; }
        }

        @media (max-width: 500px) {
            .dock-btn span { display: none; }
            .dock-btn { padding: 0.6rem; min-height: 48px; }
            .card-top { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
        }
    </style>
</head>
<body>

    <div class="viewport-container">
        <div id="home-view" class="view-panel active">
            <div class="home-content">
                <div class="home-header">
                    <h1>Service Control Center</h1>
                    <p>Select a service from the dock or cards below to switch active views.</p>
                </div>

                <div class="grid-cards">
                    <!-- RecycliFi Edge -->
                    <button class="card" type="button" data-tab="recyclifi">
                        <div>
                            <div class="card-top">
                                <div class="card-icon" style="color: var(--accent-emerald);">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="23 4 23 10 17 10"></polyline>
                                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                                    </svg>
                                </div>
                                <div class="status-indicator" id="status-recyclifi">
                                    <div class="status-dot"></div><span>Checking…</span>
                                </div>
                            </div>
                            <div class="card-title">RecycliFi (Edge)</div>
                            <div class="card-desc">Hardware telemetry, object detection scanner, and local network voucher authorization via ESP32.</div>
                        </div>
                        <div class="card-footer">Port: 3000</div>
                    </button>

                    <!-- RecycliFi AI -->
                    <button class="card" type="button" data-tab="recyclifi_ai">
                        <div>
                            <div class="card-top">
                                <div class="card-icon" style="color: var(--accent-cyan);">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                    </svg>
                                </div>
                                <div class="status-indicator" id="status-recyclifi_ai">
                                    <div class="status-dot"></div><span>Checking…</span>
                                </div>
                            </div>
                            <div class="card-title">RecycliFi (AI)</div>
                            <div class="card-desc">Cloud-based Vision-Language Model inference for high-accuracy material separation without local datasets.</div>
                        </div>
                        <div class="card-footer">Cloud API</div>
                    </button>

                    <!-- Nutrition -->
                    <button class="card" type="button" data-tab="nutrition">
                        <div>
                            <div class="card-top">
                                <div class="card-icon" style="color: var(--accent-amber);">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                        <line x1="3" y1="9" x2="21" y2="9"></line>
                                        <line x1="9" y1="21" x2="9" y2="9"></line>
                                    </svg>
                                </div>
                                <div class="status-indicator" id="status-nutrition">
                                    <div class="status-dot"></div><span>Checking…</span>
                                </div>
                            </div>
                            <div class="card-title">Nutrition Vision</div>
                            <div class="card-desc">Vision language ingredient parsing and USDA nutritional database breakdown.</div>
                        </div>
                        <div class="card-footer">Gradio VLM</div>
                    </button>

                    <!-- Face ID -->
                    <button class="card" type="button" data-tab="faceid">
                        <div>
                            <div class="card-top">
                                <div class="card-icon" style="color: var(--accent-purple);">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M9 3H5a2 2 0 0 0-2 2v4m16-6h-4a2 2 0 0 1 2 2v4M3 15v4a2 2 0 0 0 2 2h4m12-6v4a2 2 0 0 1-2 2h-4"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                </div>
                                <div class="status-indicator" id="status-faceid">
                                    <div class="status-dot"></div><span>Checking…</span>
                                </div>
                            </div>
                            <div class="card-title">Biometric Matrix</div>
                            <div class="card-desc">Real-time facial identification, feature alignment, and vector database registration.</div>
                        </div>
                        <div class="card-footer">OpenCV / Flask</div>
                    </button>
                </div>
            </div>
        </div>

        ${panels}
    </div>

    <div class="floating-dock-wrapper">
        <nav class="floating-dock">
            <button class="dock-btn active" type="button" id="btn-home" data-tab="home">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
                <span>Home</span>
            </button>

            <div class="dock-divider"></div>

            <button class="dock-btn" type="button" id="btn-recyclifi" data-tab="recyclifi">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                <span>Edge</span>
            </button>

            <button class="dock-btn" type="button" id="btn-recyclifi_ai" data-tab="recyclifi_ai">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                <span>AI</span>
            </button>

            <button class="dock-btn" type="button" id="btn-nutrition" data-tab="nutrition">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                </svg>
                <span>Food</span>
            </button>

            <button class="dock-btn" type="button" id="btn-faceid" data-tab="faceid">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 3H5a2 2 0 0 0-2 2v4m16-6h-4a2 2 0 0 1 2 2v4M3 15v4a2 2 0 0 0 2 2h4m12-6v4a2 2 0 0 1-2 2h-4"></path>
                </svg>
                <span>Face</span>
            </button>
        </nav>
    </div>

    <script>
        const HEALTH_POLL_MS = 15000;
        const status = {};
        let currentTab = 'home';

        function setBadge(id, state) {
            const badge = document.getElementById('status-' + id);
            if (!badge) return;
            const online = state === 'online';
            badge.classList.toggle('online', online);
            badge.querySelector('span').textContent = online ? 'Online' : 'Offline';
        }

        function ensureFrame(id) {
            const panel = document.getElementById('panel-' + id);
            if (!panel) return;

            if (status[id] === 'offline') {
                panel.classList.add('offline');
                return;
            }
            panel.classList.remove('offline');

            const frame = panel.querySelector('iframe');
            if (frame.dataset.loaded !== 'true') {
                frame.src = frame.dataset.src;
                frame.dataset.loaded = 'true';
            }
        }

        function switchTab(id) {
            currentTab = id;

            document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));

            const btn = document.getElementById('btn-' + id);
            if (btn) btn.classList.add('active');

            if (id === 'home') {
                document.getElementById('home-view').classList.add('active');
                return;
            }

            document.getElementById('panel-' + id).classList.add('active');
            ensureFrame(id);
        }

        async function refreshHealth() {
            let data;
            try {
                const res = await fetch('/api/health', { cache: 'no-store' });
                if (!res.ok) return;
                data = await res.json();
            } catch (_) {
                return; 
            }

            for (const [id, info] of Object.entries(data)) {
                status[id] = info.online ? 'online' : 'offline';
                setBadge(id, status[id]);
            }

            if (currentTab !== 'home') ensureFrame(currentTab);
        }

        document.addEventListener('click', (event) => {
            const tabBtn = event.target.closest('[data-tab]');
            if (tabBtn) { switchTab(tabBtn.dataset.tab); return; }

            const retryBtn = event.target.closest('[data-retry]');
            if (retryBtn) {
                const id = retryBtn.dataset.retry;
                const frame = document.querySelector('#panel-' + id + ' iframe');
                if (frame) {
                    frame.removeAttribute('src');
                    delete frame.dataset.loaded;
                }
                refreshHealth();
            }
        });

        refreshHealth();
        setInterval(refreshHealth, HEALTH_POLL_MS);
    </script>
</body>
</html>`);
});

app.listen(port, () => {
    console.log(`[Central Control Hub] Online at http://localhost:${port}`);
});
