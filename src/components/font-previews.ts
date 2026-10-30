import {
  DM_Sans,
  DM_Serif_Display,
  Fraunces,
  Inter,
  Lato,
  Libre_Baskerville,
  Lora,
  Manrope,
  Merriweather,
  Montserrat,
  Nunito_Sans,
  Open_Sans,
  Outfit,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Poppins,
  Roboto,
  Rubik,
  Sora,
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
const sora = Sora({ subsets: ['latin'], preload: false })
const rubik = Rubik({ subsets: ['latin'], preload: false })
const nunitoSans = Nunito_Sans({ subsets: ['latin'], preload: false })
const roboto = Roboto({ subsets: ['latin'], preload: false })
const openSans = Open_Sans({ subsets: ['latin'], preload: false })
const lato = Lato({ subsets: ['latin'], weight: ['400', '700'], preload: false })
const playfair = Playfair_Display({ subsets: ['latin'], preload: false })
const dmSerif = DM_Serif_Display({ subsets: ['latin'], weight: '400', preload: false })
const fraunces = Fraunces({ subsets: ['latin'], preload: false })
const lora = Lora({ subsets: ['latin'], preload: false })
const merriweather = Merriweather({ subsets: ['latin'], preload: false })
const libreBaskerville = Libre_Baskerville({ subsets: ['latin'], weight: ['400', '700'], preload: false })

/** The CSS font-family of each font the owner can pick. */
export const FONT_FAMILY: Record<FontName, string> = {
  'Plus Jakarta Sans': plusJakarta.style.fontFamily,
  Poppins: poppins.style.fontFamily,
  Montserrat: montserrat.style.fontFamily,
  Inter: inter.style.fontFamily,
  'DM Sans': dmSans.style.fontFamily,
  Manrope: manrope.style.fontFamily,
  Sora: sora.style.fontFamily,
  'Space Grotesk': spaceGrotesk.style.fontFamily,
  Outfit: outfit.style.fontFamily,
  Rubik: rubik.style.fontFamily,
  'Nunito Sans': nunitoSans.style.fontFamily,
  Roboto: roboto.style.fontFamily,
  'Open Sans': openSans.style.fontFamily,
  Lato: lato.style.fontFamily,
  'Playfair Display': playfair.style.fontFamily,
  'DM Serif Display': dmSerif.style.fontFamily,
  Fraunces: fraunces.style.fontFamily,
  Lora: lora.style.fontFamily,
  Merriweather: merriweather.style.fontFamily,
  'Libre Baskerville': libreBaskerville.style.fontFamily,
}

/** A font the owner typed that isn't one of the choices falls back to the app's own. */
export const fontFamilyOf = (name: string): string | undefined =>
  Object.hasOwn(FONT_FAMILY, name) ? FONT_FAMILY[name as FontName] : undefined
