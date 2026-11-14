import { z } from 'zod'

/** Fontes oferecidas na personalização. Todas com licença SIL Open Font License. */
export const appearanceFonts = [
  'fraunces',
  'playfair',
  'lora',
  'merriweather',
  'jakarta',
  'inter',
  'manrope',
  'dm-sans',
  'poppins',
] as const
export const appearancePresets = [
  'padrao',
  'roxo',
  'coral',
  'azul',
  'verde',
  'dourado',
  'personalizado',
] as const

/**
 * Preferências visuais da conta. Ficam em `personal_workspaces.preferences.appearance` (coluna já existente),
 * separadas das preferências do leitor EPUB.
 */
export const appearanceSchema = z
  .object({
    preset: z.enum(appearancePresets),
    mode: z.enum(['light', 'dark', 'system']),
    accent: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .nullable(),
    headingFont: z.enum(appearanceFonts),
    bodyFont: z.enum(appearanceFonts),
    radius: z.enum(['round', 'soft', 'square']),
  })
  .strict()
export type Appearance = z.infer<typeof appearanceSchema>
