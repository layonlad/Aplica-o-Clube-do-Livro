import release from '../../release.json'

export const version = release.version
export const isStaging = import.meta.env.VITE_APP_ENVIRONMENT === 'staging'
export const environment = isStaging ? 'Staging'
  : import.meta.env.VITE_APP_ENVIRONMENT === 'production' ? 'Produção'
  : import.meta.env.VITE_APP_MODE === 'connected' ? 'Local'
  : 'Demonstração'
