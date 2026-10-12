import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '@fontsource-variable/geist';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import { NavigationGuard, UnsavedChangesProvider } from './context/UnsavedChangesContext';
import './styles/index.css';

const router = createBrowserRouter([{ path: '*', element: <ErrorBoundary><AuthProvider><UnsavedChangesProvider><NavigationGuard /><App /></UnsavedChangesProvider></AuthProvider></ErrorBoundary> }]);

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>);
