import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// No StrictMode: the screen measures the DOM on mount (badge width, chip
// overflow) and a double mount in dev would re-run those measurements.
createRoot(document.getElementById('root')).render(<App />);
