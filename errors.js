'use strict';
/**
 * Flash-message middleware, 404 handler and centralized error handler.
 */

/** Move one-time flash messages from the session into res.locals for rendering. */
function popFlash(req, res, next) {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
}

function notFound(req, res) {
  if ((req.headers.accept || '').includes('application/json')) {
    return res.status(404).json({ ok: false, error: 'Not found' });
  }
  res.status(404).render('error', {
    title: 'Page not found — Nexora Digital',
    code: 404,
    message: 'The page you are looking for does not exist or has moved.',
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[error]', err);
  const wantsJson = (req.headers.accept || '').includes('application/json') || req.xhr;
  if (wantsJson) return res.status(500).json({ ok: false, error: 'Internal server error' });
  res.status(500).render('error', {
    title: 'Something went wrong — Nexora Digital',
    code: 500,
    message: 'An unexpected error occurred. The incident has been logged. Please try again shortly.',
  });
}

module.exports = { popFlash, notFound, errorHandler };
