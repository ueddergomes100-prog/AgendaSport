import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function disableBrowserTranslation() {
  document.documentElement.lang = 'pt-BR'
  document.documentElement.translate = false
  document.documentElement.classList.add('notranslate')
  document.body.translate = false
  document.body.classList.add('notranslate')
  document.getElementById('root')?.setAttribute('translate', 'no')
}

disableBrowserTranslation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
