import { Component, type ReactNode } from 'react'

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (!this.state.failed) return this.props.children
    return <section className="access-card" aria-label="Recuperação do aplicativo">
      <h1>Não foi possível abrir esta tela</h1>
      <p role="alert">Confira a conexão e tente carregar novamente.</p>
      <button className="button" type="button" onClick={() => window.location.reload()}>Recarregar aplicativo</button>
    </section>
  }
}
