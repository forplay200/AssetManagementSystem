import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/geist';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
