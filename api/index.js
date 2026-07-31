const app = require('../server/server.js');

module.exports = (req, res) => {
  // Normalise req.url for Vercel serverless rewrites
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + req.url;
  }
  return app(req, res);
};
