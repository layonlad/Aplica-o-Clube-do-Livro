import { environment, version } from './release'

export function ReleaseFooter() {
  return (
    <footer className="settings-hub__release" aria-label="Informações do aplicativo">
      <span>Versão {version}</span>
      <span>{environment}</span>
    </footer>
  )
}
