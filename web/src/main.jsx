import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './index.css';
import App from './App.jsx';
import { LanguageProvider } from './context/LanguageContext';
import RevealObserver from './components/RevealObserver';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <RevealObserver />
        <App />
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
