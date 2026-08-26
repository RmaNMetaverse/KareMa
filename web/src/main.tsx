import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './store/app';
import { applyPrefs, loadLocalPrefs } from './lib/theme';
import { BASE } from './lib/base';
import './styles/index.css';

// paint the saved theme before React mounts, so there is no flash
applyPrefs(loadLocalPrefs());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={BASE}>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
