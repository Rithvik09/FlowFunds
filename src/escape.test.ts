import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escape'
import app from './index'

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('neutralises an img/onerror payload', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).not.toContain('<img')
  })

  // Ampersand must be replaced first, or the & introduced by a later
  // replacement gets escaped a second time.
  it('escapes & first so entities are not double-escaped', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  // index.tsx ships this function by serialising it with .toString(). That only
  // works if the compiled output is valid standalone JS with no closure references,
  // so verify the mechanism itself rather than trusting it.
  it('survives serialisation to source and re-evaluation', () => {
    const revived = new Function('return ' + escapeHtml.toString())() as (v: unknown) => string
    expect(revived('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
    expect(revived(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })

  it('coerces non-string input rather than throwing', () => {
    expect(escapeHtml(null)).toBe('null')
    expect(escapeHtml(42)).toBe('42')
  })
})

describe('dashboard render path (served artifact)', () => {
  it('never interpolates Plaid-controlled fields into innerHTML unescaped', async () => {
    const html = await (await app.request('/')).text()
    expect(html).not.toMatch(/\+\s*t\.merchant\s*\+/)
    expect(html).not.toMatch(/\+\s*t\.category\s*\+/)
    expect(html).not.toMatch(/\+\s*b\.name\s*\+/)
  })

  it('ships the escape helper to the client and applies it', async () => {
    const html = await (await app.request('/')).text()
    expect(html).toContain('const escapeHtml =')
    expect(html).toMatch(/escapeHtml\(\s*t\.merchant\s*\)/)
  })
})
