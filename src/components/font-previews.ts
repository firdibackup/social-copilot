import {
  DM_Sans,
  DM_Serif_Display,
  Fraunces,
  Inter,
  Manrope,
  Montserrat,
  Outfit,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Poppins,
  Space_Grotesk,
} from 'next/font/google'
import type { FontName } from '@/lib/design-styles'

// Only the pages that show font previews import this file; none is preloaded, so they load when first drawn.
const plusJakarta = Plus_Jakarta_Sans({ subsets: ['latin'], preload: false })
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '700'], preload: false })
const montserrat = Montserrat({ subsets: ['latin'], preload: false })
const inter = Inter({ subsets: ['latin'], preload: false })
const dmSans = DM_Sans({ subsets: ['latin'], preload: false })
const manrope = Manrope({ subsets: ['latin'], preload: false })
const outfit = Outfit({ subsets: ['latin'], preload: false })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], preload: false })
const playfair = Playfair_Display({ subsets: ['latin'], preload: false })
const dmSerif = DM_Serif_Display({ subsets: ['latin'], weight: '400', preload: false })
const fraunces = Fraunces({ subsets: ['latin'], preload: false })

/** The CSS font-family of each font the owner can pick. */
export const FONT_FAMILY: Record<FontName, string> = {
  'Plus Jakarta Sans': plusJakarta.style.fontFamily,
  Poppins: poppins.style.fontFamily,
  Montserrat: montserrat.style.fontFamily,
  Inter: inter.style.fontFamily,
  'DM Sans': dmSans.style.fontFamily,
  Manrope: manrope.style.fontFamily,
  Outfit: outfit.style.fontFamily,
  'Space Grotesk': spaceGrotesk.style.fontFamily,
  'Playfair Display': playfair.style.fontFamily,
  'DM Serif Display': dmSerif.style.fontFamily,
  Fraunces: fraunces.style.fontFamily,
}

/** A font the owner typed that isn't one of the choices falls back to the app's own. */
export const fontFamilyOf = (name: string): string | undefined =>
  Object.hasOwn(FONT_FAMILY, name) ? FONT_FAMILY[name as FontName] : undefined
