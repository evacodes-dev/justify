import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import Web3Provider from './providers/Web3Provider'
import { ToastProvider } from './components/common/Toast'

// Shared query cache for all backend reads (markets, price history, …). Polling
// hooks set their own refetchInterval; these are the conservative defaults.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Web3Provider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </Web3Provider>
    </QueryClientProvider>
  </React.StrictMode>,
)
