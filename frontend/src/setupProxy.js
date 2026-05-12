const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const target = 'http://localhost:3001';

  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: false,
    ws: false,
    xfwd: true,
    // Forward ALL request headers including Authorization
    headers: {},
    on: {
      error: (err, req, res) => {
        console.error('[CRA-PROXY] Error:', req.method, req.url, err.message);
        if (res && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy error: ' + err.message }));
        }
      },
      proxyReq: (proxyReq, req) => {
        // Ensure Authorization header is forwarded
        if (req.headers['authorization']) {
          proxyReq.setHeader('Authorization', req.headers['authorization']);
        }
      },
    },
  });

  // Proxy all /api/* and /t/* routes to the backend
  app.use('/api', proxy);
  app.use('/t', proxy);
};
