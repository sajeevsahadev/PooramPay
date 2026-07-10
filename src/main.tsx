import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './styles.css';
import App from './App';
import { AppProvider } from './state/AppContext';
import UpdatePrompt from './components/UpdatePrompt';
import InstallPrompt from './components/InstallPrompt';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
        <UpdatePrompt />
        <InstallPrompt />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
