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

export const appearanceTextSizes = ['sm', 'md', 'lg', 'xl'] as const
export const appearanceDensities = ['compact', 'regular', 'airy'] as const
export const appearanceLineHeights = ['tight', 'normal', 'relaxed'] as const
export const appearanceButtonShapes = ['pill', 'soft', 'square'] as const

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
    background: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .nullable()
      .optional(),
    headingFont: z.enum(appearanceFonts),
    bodyFont: z.enum(appearanceFonts),
    radius: z.enum(['round', 'soft', 'square']),
    // Formatação: opcionais para preferências antigas continuarem válidas.
    textSize: z.enum(appearanceTextSizes).optional(),
    density: z.enum(appearanceDensities).optional(),
    lineHeight: z.enum(appearanceLineHeights).optional(),
    buttons: z.enum(appearanceButtonShapes).optional(),
    // Capa do livro em leitura como fundo do app (o app também adota as cores da capa).
    coverBackdrop: z.boolean().optional(),
    // Cor do texto escolhida em Aparência (null = automática, conforme o fundo).
    textColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .nullable()
      .optional(),
  })
  .strict()
export type Appearance = z.infer<typeof appearanceSchema>
