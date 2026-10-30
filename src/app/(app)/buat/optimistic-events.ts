export const POST_VISIBILITY_EVENT = 'buat:post-visibility'

export function setPostVisible(id: string, visible: boolean) {
  window.dispatchEvent(new CustomEvent(POST_VISIBILITY_EVENT, { detail: { id, visible } }))
}
