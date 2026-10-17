import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { App } from './App'

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider><App /></ThemeProvider>
    </MemoryRouter>,
  )
}

describe('protótipo do Clube do Livro', () => {
  it('entra pela demonstração e exibe a leitura do mês', async () => {
    const user = userEvent.setup()
    renderApp()

    expect(screen.getByRole('heading', { name: 'Clube Aurora' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /entrar na demonstração/i }))

    expect(await screen.findByRole('heading', { name: 'Nosso livro do mês' })).toBeInTheDocument()
    expect(screen.getByText('Torto Arado')).toBeInTheDocument()
  })

  it('filtra a biblioteca e mantém a navegação principal acessível', async () => {
    const user = userEvent.setup()
    renderApp('/app/library')

    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Buscar na biblioteca' }), 'Clarice')

    expect(screen.getByText('Água Viva')).toBeInTheDocument()
    expect(screen.queryByText('Cem Anos de Solidão')).not.toBeInTheDocument()
  })

  it('aplica e persiste uma personalização de nome do clube', async () => {
    const user = userEvent.setup()
    renderApp('/app/theme')
    const input = screen.getByRole('textbox', { name: 'Nome do clube' })

    await user.clear(input)
    await user.type(input, 'Clube Ipê')

    expect(screen.getAllByText('Clube Ipê')).toHaveLength(2)
    expect(localStorage.getItem('clube-aurora-demo-theme')).toContain('Clube Ipê')
  })
})
