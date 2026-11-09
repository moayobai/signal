import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { shouldRetry } from './lib/api';
import './styles.css';

const qc = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry } },
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter basename="/dashboard">
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
