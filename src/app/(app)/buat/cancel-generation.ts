export type CancelTarget = 'content' | 'images' | 'slide' | 'edit'

export async function cancelGeneration(postId: string, target: CancelTarget, id?: string): Promise<{ cancelled: boolean; error?: string }> {
  try {
    const response = await fetch('/api/generation/cancel', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ postId, target, id }),
    })
    const result = await response.json()
    if (!response.ok || typeof result.cancelled !== 'boolean') {
      return { cancelled: false, error: result.error ?? 'Proses belum berhasil dibatalkan. Coba lagi.' }
    }
    return result
  } catch {
    return { cancelled: false, error: 'Gagal menghubungi server. Coba batalkan lagi.' }
  }
}
