import { Check, Moon, Palette, RotateCcw, SunMedium, Type } from 'lucide-react'
import { Button, Card, DemoBadge } from '../components/ui'
import { defaultTheme, useTheme } from '../app/ThemeProvider'

const presets = [
  { name: 'Aurora', primary: '#5b3a73', accent: '#d7a85c', surface: '#f8f4ef' },
  { name: 'Bosque', primary: '#265c4b', accent: '#d79a55', surface: '#f3f1e8' },
  { name: 'Oceano', primary: '#235b78', accent: '#e08e6d', surface: '#f3f6f7' },
  { name: 'Terracota', primary: '#984f45', accent: '#e2b05f', surface: '#faf3eb' },
]

export function ThemePage() {
  const { theme, setTheme, updateTheme, resetTheme } = useTheme()
  return (
    <div className="stack-lg">
      <div className="page-intro"><div><DemoBadge /><h1>A cara do nosso clube</h1><p>Alterações salvas apenas neste navegador.</p></div><Palette className="title-icon" /></div>
      <Card className="theme-preview">
        <span className="eyebrow">PRÉVIA AO VIVO</span>
        <div className="preview-brand"><span className="brand-mark brand-mark--large">{theme.monogram}</span><div><strong>{theme.clubName}</strong><span>Leituras que aproximam</span></div></div>
        <div className="preview-card"><span>Leitura do mês</span><strong>Uma história à nossa espera</strong><div><i /><i /><i /></div></div>
      </Card>

      <section><div className="section-heading"><div><span className="eyebrow">PALETAS</span><h2>Escolha um ponto de partida</h2></div></div><div className="palette-grid">
        {presets.map((preset) => { const selected = theme.primary === preset.primary; return <button key={preset.name} className={selected ? 'selected' : ''} onClick={() => setTheme({ ...theme, primary: preset.primary, accent: preset.accent, surface: preset.surface })}><span className="swatches"><i style={{ background: preset.primary }} /><i style={{ background: preset.accent }} /><i style={{ background: preset.surface }} /></span><strong>{preset.name}</strong>{selected && <Check />}</button> })}
      </div></section>

      <Card className="theme-controls">
        <div className="control-group"><label htmlFor="club-name">Nome do clube</label><input id="club-name" value={theme.clubName} onChange={(event) => updateTheme('clubName', event.target.value)} /></div>
        <div className="control-row"><div className="control-group"><label htmlFor="monogram">Monograma</label><input id="monogram" maxLength={3} value={theme.monogram} onChange={(event) => updateTheme('monogram', event.target.value.toUpperCase())} /></div><div className="control-group"><label htmlFor="primary-color">Cor principal</label><span className="color-input"><input id="primary-color" type="color" value={theme.primary} onChange={(event) => updateTheme('primary', event.target.value)} /><code>{theme.primary}</code></span></div></div>
        <div className="control-group"><label><Type size={16} /> Tipografia</label><div className="option-row">{(['humanist', 'editorial', 'modern'] as const).map((font) => <button key={font} className={theme.font === font ? 'active' : ''} onClick={() => updateTheme('font', font)}>{font === 'humanist' ? 'Acolhedora' : font === 'editorial' ? 'Editorial' : 'Moderna'}</button>)}</div></div>
        <div className="control-group"><label>Formato dos cartões</label><div className="option-row">{(['round', 'soft', 'square'] as const).map((radius) => <button key={radius} className={theme.radius === radius ? 'active' : ''} onClick={() => updateTheme('radius', radius)}>{radius === 'round' ? 'Redondo' : radius === 'soft' ? 'Suave' : 'Reto'}</button>)}</div></div>
        <div className="mode-toggle"><span>{theme.mode === 'light' ? <SunMedium /> : <Moon />}<strong>Modo {theme.mode === 'light' ? 'claro' : 'escuro'}</strong></span><button role="switch" aria-checked={theme.mode === 'dark'} onClick={() => updateTheme('mode', theme.mode === 'light' ? 'dark' : 'light')}><i /></button></div>
      </Card>
      <Button variant="ghost" onClick={resetTheme}><RotateCcw size={17} /> Restaurar tema {defaultTheme.clubName}</Button>
    </div>
  )
}
