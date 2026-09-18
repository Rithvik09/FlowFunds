import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword, signJwt, verifyJwt } from './auth'

describe('password hashing', () => {
  it('verifies the correct password', async () => {
    const { hash, salt } = await hashPassword('correct horse battery staple')
    await expect(verifyPassword('correct horse battery staple', hash, salt)).resolves.toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const { hash, salt } = await hashPassword('correct horse battery staple')
    await expect(verifyPassword('wrong password', hash, salt)).resolves.toBe(false)
  })

  it('produces a different salt (and therefore hash) on every call', async () => {
    const a = await hashPassword('same password')
    const b = await hashPassword('same password')
    expect(a.salt).not.toEqual(b.salt)
    expect(a.hash).not.toEqual(b.hash)
  })
})

describe('JWT sign/verify', () => {
  const secret = 'test-secret'

  it('round-trips a valid token', async () => {
    const token = await signJwt({ sub: 'user-1', email: 'a@b.com', exp: Math.floor(Date.now() / 1000) + 60 }, secret)
    const payload = await verifyJwt(token, secret)
    expect(payload?.sub).toBe('user-1')
    expect(payload?.email).toBe('a@b.com')
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signJwt({ sub: 'user-1', email: 'a@b.com', exp: Math.floor(Date.now() / 1000) + 60 }, secret)
    const payload = await verifyJwt(token, 'a-different-secret')
    expect(payload).toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await signJwt({ sub: 'user-1', email: 'a@b.com', exp: Math.floor(Date.now() / 1000) - 60 }, secret)
    const payload = await verifyJwt(token, secret)
    expect(payload).toBeNull()
  })

  it('rejects a tampered payload', async () => {
    const token = await signJwt({ sub: 'user-1', email: 'a@b.com', exp: Math.floor(Date.now() / 1000) + 60 }, secret)
    const [header, , signature] = token.split('.')
    const tamperedPayload = btoa(JSON.stringify({ sub: 'attacker', email: 'x@x.com', exp: Math.floor(Date.now() / 1000) + 60 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const tampered = `${header}.${tamperedPayload}.${signature}`
    const payload = await verifyJwt(tampered, secret)
    expect(payload).toBeNull()
  })
})

describe('JWT expiry validation', () => {
  const secret = 'test-secret'

  // `exp` is typed `number` on JwtPayload, but nothing validates it on the decode
  // path. A payload with no `exp` yields `undefined * 1000 === NaN`, and
  // `NaN < Date.now()` is false — so the expiry check silently passes.
  it('rejects a validly-signed token whose exp is missing', async () => {
    const token = await signJwt({ sub: 'user-1', email: 'a@b.com' } as any, secret)
    await expect(verifyJwt(token, secret)).resolves.toBeNull()
  })

  it('rejects a validly-signed token whose exp is non-numeric', async () => {
    const token = await signJwt({ sub: 'user-1', email: 'a@b.com', exp: 'tomorrow' } as any, secret)
    await expect(verifyJwt(token, secret)).resolves.toBeNull()
  })
})
