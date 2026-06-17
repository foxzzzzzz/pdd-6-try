import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import StoreDetail from './pages/StoreDetail';
import Templates from './pages/Templates';
import StoreConfig from './pages/StoreConfig';
import FactoryView from './pages/FactoryView';

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
        {/* 工厂协作 - 无需登录 */}
        <Route path="/factory/:token" element={<FactoryView />} />
      </Routes>
    </BrowserRouter>
  );
}
