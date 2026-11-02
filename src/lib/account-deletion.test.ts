import { beforeEach, describe, expect, it, vi } from 'vitest'
import { archiveAccount, confirmsEmail } from './account-deletion'

const fake = vi.hoisted(() => ({ rpc: vi.fn(), deleteUser: vi.fn() }))

vi.mock('./supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  db: () => ({ rpc: fake.rpc, auth: { admin: { deleteUser: fake.deleteUser } } }),
}))

const USER = { id: 'user-1', email: 'budi@example.com' }

beforeEach(() => {
  vi.resetAllMocks()
  fake.rpc.mockResolvedValue({ data: null, error: null })
  fake.deleteUser.mockResolvedValue({ data: {}, error: null })
})

describe('archiveAccount', () => {
  it('archives the rows, then soft-deletes the Auth user so nothing cascades', async () => {
    await archiveAccount(USER)

    expect(fake.rpc).toHaveBeenCalledWith('archive_account', { p_user_id: 'user-1', p_email: 'budi@example.com' })
    expect(fake.deleteUser).toHaveBeenCalledWith('user-1', true)
    expect(fake.rpc.mock.invocationCallOrder[0]).toBeLessThan(fake.deleteUser.mock.invocationCallOrder[0])
  })

  it('leaves the Auth user alone when the archive fails', async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })

    await expect(archiveAccount(USER)).rejects.toThrow('Supabase: boom')
    expect(fake.deleteUser).not.toHaveBeenCalled()
  })

  it('reports an Auth failure', async () => {
    fake.deleteUser.mockResolvedValue({ data: null, error: { message: 'User not found' } })

    await expect(archiveAccount(USER)).rejects.toThrow('Supabase Auth: User not found')
  })
})

describe('confirmsEmail', () => {
  it('matches the email in any case, ignoring surrounding spaces', () => {
    expect(confirmsEmail(' Budi@Example.COM ', 'budi@example.com')).toBe(true)
    expect(confirmsEmail('budi@example.com', 'Budi@Example.com')).toBe(true)
  })

  it('refuses anything else, and an account without an email', () => {
    expect(confirmsEmail('budi@example', 'budi@example.com')).toBe(false)
    expect(confirmsEmail('', 'budi@example.com')).toBe(false)
    expect(confirmsEmail('', '')).toBe(false)
    expect(confirmsEmail('  ', ' ')).toBe(false)
  })
})
