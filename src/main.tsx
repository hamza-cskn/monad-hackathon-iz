import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import './public-pages.css'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { walletConfig } from './chain'

const queryClient = new QueryClient()
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><WagmiProvider config={walletConfig}><QueryClientProvider client={queryClient}><App /></QueryClientProvider></WagmiProvider></React.StrictMode>)
