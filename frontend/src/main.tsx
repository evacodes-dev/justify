import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Web3Provider from './providers/Web3Provider'
import { ToastProvider } from './components/common/Toast'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Web3Provider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </Web3Provider>
  </React.StrictMode>,
)
