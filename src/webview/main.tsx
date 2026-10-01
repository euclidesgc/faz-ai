import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { FiltersApp } from './FiltersApp';
import './styles.css';

const root = document.getElementById('root')!;
const isFilters = root.dataset.view === 'filters';
if (isFilters) document.body.classList.add('sidebar-view');

createRoot(root).render(<React.StrictMode>{isFilters ? <FiltersApp /> : <App />}</React.StrictMode>);
