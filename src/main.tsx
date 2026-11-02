import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes servidas desde la propia app (sin depender de Google Fonts)
import '@fontsource-variable/figtree'
import '@fontsource-variable/bricolage-grotesque'
import './theme.css'
import './index.css'
import { applyMode, readMode } from './lib/appearance'
import Root from './Root.tsx'

// Aplicar colores antes del primer render para que no parpadee
applyMode(readMode(), false)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
