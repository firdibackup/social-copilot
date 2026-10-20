import 'server-only'
import path from 'node:path'
import sharp from 'sharp'

export const STORY_WIDTH = 1080
export const STORY_HEIGHT = 1920
/** Instagram draws its own bar and reply box here; nothing that matters goes in these bands. */
const SAFE_TOP = 250
const SAFE_BOTTOM = 340
const SLIDE_MAX_WIDTH = 928
const TEXT_GAP = 48
const TEXT_SIZE = 44
const CORNER_RADIUS = 28
const FONT_FILE = path.join(process.cwd(), 'assets/fonts/Inter-Bold.ttf')

const escapeMarkup = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** What the Story says under the slide: Stories from the API can't carry a link, so it names the account. */
export const storyCaption = (username: string) => `Post baru di @${username.replace(/^@/, '')}`

async function renderText(text: string): Promise<{ input: Buffer; width: number; height: number }> {
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="white">${escapeMarkup(text)}</span>`,
      font: `Inter Bold ${TEXT_SIZE}`,
      fontfile: FONT_FILE,
      width: SLIDE_MAX_WIDTH,
      align: 'centre',
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true })
  return { input: data, width: info.width, height: info.height }
}

/**
 * The feed post's first slide as a 9:16 Story: the slide centred on a blurred, darkened copy of itself, with the
 * account's name under it. Returns a JPEG, the only image type Instagram takes for a Story.
 */
export async function renderStory(slide: Uint8Array, username: string): Promise<Buffer> {
  const source = sharp(slide).rotate()

  const background = await source
    .clone()
    .resize(STORY_WIDTH, STORY_HEIGHT, { fit: 'cover' })
    .blur(48)
    .modulate({ brightness: 0.6 })
    .removeAlpha()
    .toBuffer()

  const text = await renderText(storyCaption(username))
  const maxSlideHeight = STORY_HEIGHT - SAFE_TOP - SAFE_BOTTOM - TEXT_GAP - text.height
  const { data: resized, info } = await source
    .clone()
    .resize(SLIDE_MAX_WIDTH, maxSlideHeight, { fit: 'inside' })
    .removeAlpha()
    .toBuffer({ resolveWithObject: true })
  const mask = Buffer.from(
    `<svg width="${info.width}" height="${info.height}"><rect width="${info.width}" height="${info.height}" rx="${CORNER_RADIUS}" ry="${CORNER_RADIUS}"/></svg>`,
  )
  const rounded = await sharp(resized)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  const blockHeight = info.height + TEXT_GAP + text.height
  const slideTop = SAFE_TOP + Math.round((STORY_HEIGHT - SAFE_TOP - SAFE_BOTTOM - blockHeight) / 2)
  return sharp(background)
    .composite([
      { input: rounded, left: Math.round((STORY_WIDTH - info.width) / 2), top: slideTop },
      {
        input: text.input,
        left: Math.round((STORY_WIDTH - text.width) / 2),
        top: slideTop + info.height + TEXT_GAP,
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer()
}
