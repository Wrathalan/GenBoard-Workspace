import React from 'react';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import { createRoot } from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import { App } from './App';
import '@xyflow/react/dist/style.css';
import './style.css';
import { installBrowserAPI, protectBrowserChanges } from './browser-api';
import { flush, hasUnsavedChanges } from './store';
installBrowserAPI();
protectBrowserChanges(hasUnsavedChanges, flush);
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </React.StrictMode>,
);
