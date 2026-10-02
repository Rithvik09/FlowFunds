// Escapes HTML-significant characters for safe interpolation into markup.
//
// This function is ALSO shipped to the browser: index.tsx embeds its source via
// `escapeHtml.toString()` so the tested implementation and the shipped one cannot
// drift apart. That imposes one constraint — it must stay entirely self-contained,
// referencing no imports, module scope, or closure variables, or the embedded copy
// will throw a ReferenceError in the browser.
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;') // must run first; the replacements below introduce '&'
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
