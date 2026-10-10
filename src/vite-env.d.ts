/// <reference types="vite/client" />
// No environment variable reaches the bundle by prefix (vite.config.ts sets envPrefix to an
// unused value), so import.meta.env carries only Vite's built-ins (DEV, PROD, MODE, BASE_URL).
// Live-explorer settings arrive as `define` constants, declared in src/live/presence.ts.
