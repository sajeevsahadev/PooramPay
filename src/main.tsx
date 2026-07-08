import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './styles.css';
import App from './App';
import { AppProvider } from './state/AppContext';
import UpdatePrompt from './components/UpdatePrompt';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
        <UpdatePrompt />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
