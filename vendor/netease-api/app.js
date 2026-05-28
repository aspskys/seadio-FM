const { serveNcmApi } = require('NeteaseCloudMusicApi');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

serveNcmApi({ port, host })
  .then(() => {
    console.log(`[netease-sidecar] listening on http://${host}:${port}`);
  })
  .catch(err => {
    console.error('[netease-sidecar] failed to start:', err && err.message ? err.message : err);
    process.exit(1);
  });
