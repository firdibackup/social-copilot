import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchImage, fetchPublic, isPublicHost, RemoteFetchError } from './web-fetch'

const fetchMock = vi.fn<typeof fetch>()
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

describe('isPublicHost', () => {
  it.each(['localhost', 'app.localhost', 'nas.local', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.5', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', 'intranet'])(
    'rejects %s',
    (host) => {
      expect(isPublicHost(host)).toBe(false)
    },
  )

  it.each(['kopisinar.id', 'scontent.cdninstagram.com', '8.8.8.8', '172.32.0.1', '2001:4860::8888'])('accepts %s', (host) => {
    expect(isPublicHost(host)).toBe(true)
  })
})

describe('fetchPublic', () => {
  it('returns the body, its type and where the redirects ended', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/home' } }))
      .mockResolvedValueOnce(new Response('<html></html>', { headers: { 'content-type': 'text/html' } }))

    const page = await fetchPublic('https://kopisinar.id', 1024)

    expect(new TextDecoder().decode(page.bytes)).toBe('<html></html>')
    expect(page).toMatchObject({ contentType: 'text/html', url: 'https://kopisinar.id/home' })
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://kopisinar.id/home')
  })

  it('refuses a redirect into the local network before following it', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:54321/' } }))

    await expect(fetchPublic('https://kopisinar.id', 1024)).rejects.toThrow('Alamat jaringan lokal atau privat tidak diambil.')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['file:///etc/passwd', 'http://user:pass@kopisinar.id', 'http://192.168.0.1/'])('refuses %s without fetching', async (url) => {
    await expect(fetchPublic(url, 1024)).rejects.toBeInstanceOf(RemoteFetchError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops reading past the size limit', async () => {
    fetchMock.mockResolvedValueOnce(new Response('x'.repeat(2048)))

    await expect(fetchPublic('https://kopisinar.id', 1024)).rejects.toThrow('Ukurannya melebihi batas.')
  })

  it('reports HTTP errors and timeouts without the URL', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }))
    await expect(fetchPublic('https://kopisinar.id/?token=secret', 1024)).rejects.toThrow('Server menjawab HTTP 404.')

    fetchMock.mockRejectedValueOnce(Object.assign(new Error('https://kopisinar.id/?token=secret'), { name: 'TimeoutError' }))
    const error = await fetchPublic('https://kopisinar.id/?token=secret', 1024).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ message: 'Terlalu lama menjawab.' })
  })

  it('gives up after four redirects', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 302, headers: { location: '/again' } }))

    await expect(fetchPublic('https://kopisinar.id', 1024)).rejects.toThrow('Terlalu banyak redirect.')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})

describe('fetchImage', () => {
  it('judges the type by the bytes', async () => {
    fetchMock.mockResolvedValueOnce(new Response(PNG, { headers: { 'content-type': 'image/jpeg' } }))

    await expect(fetchImage('https://kopisinar.id/logo.jpg')).resolves.toMatchObject({ type: 'image/png' })
  })

  it('rejects files that are not JPEG, PNG or WebP', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<svg></svg>', { headers: { 'content-type': 'image/png' } }))

    await expect(fetchImage('https://kopisinar.id/logo.png')).rejects.toThrow('bukan gambar JPEG, PNG, atau WebP')
  })
})
