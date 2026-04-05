import { initSentryRenderer } from './lib/sentry';
import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

initSentryRenderer();

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
