import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import StoreDetail from './pages/StoreDetail';
import Templates from './pages/Templates';
import StoreConfig from './pages/StoreConfig';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stores/:id" element={<StoreDetail />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/stores" element={<StoreConfig />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
