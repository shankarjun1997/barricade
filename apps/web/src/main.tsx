import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App.js';
import { AppProvider } from './state/AppContext.js';
import { OnlineProvider } from './online/OnlineProvider.js';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

createRoot(container).render(
  <StrictMode>
    <AppProvider>
      <OnlineProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </OnlineProvider>
    </AppProvider>
  </StrictMode>,
);
