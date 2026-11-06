'use strict';
/**
 * Inline SVG icon set (stroke-based, inherits currentColor).
 * Exposed as res.locals.icon(name, size) — trusted static markup, safe for <%- %>.
 */
const PATHS = {
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><line x1="11" y1="18.5" x2="13" y2="18.5"/>',
  chart: '<line x1="4" y1="20" x2="20" y2="20"/><path d="M7 16l4-6 4 4 5-8"/>',
  sparkles: '<path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4L12 3Z"/><path d="M19 13l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/>',
  cloud: '<path d="M17.5 18H7a4.5 4.5 0 1 1 .8-8.93A6 6 0 0 1 18.9 12a3.5 3.5 0 0 1-1.4 6Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'arrow-right': '<line x1="4" y1="12" x2="20" y2="12"/><polyline points="13 5 20 12 13 19"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
};

function icon(name, size = 22) {
  const body = PATHS[name] || PATHS.sparkles;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

module.exports = { icon };
