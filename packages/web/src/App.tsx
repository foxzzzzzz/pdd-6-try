import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ActionReview from './pages/ActionReview';
import DailyReport from './pages/DailyReport';
import StoreDetail from './pages/StoreDetail';
import Templates from './pages/Templates';
import StoreConfig from './pages/StoreConfig';
import FactoryView from './pages/FactoryView';
import RuleReviews from './pages/RuleReviews';
import RiskEvents from './pages/RiskEvents';
import WeeklyReport, { MonthlyReport } from './pages/WeeklyReport';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/actions/review" element={<ActionReview />} />
          <Route path="/reports/daily" element={<DailyReport />} />
          <Route path="/stores/:id" element={<StoreDetail />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/risk-events" element={<RiskEvents />} />
          <Route path="/rule-reviews" element={<RuleReviews />} />
          <Route path="/reports/weekly" element={<WeeklyReport />} />
          <Route path="/reports/monthly" element={<MonthlyReport />} />
          <Route path="/stores" element={<StoreConfig />} />
        </Route>
        {/* 工厂协作 - 无需登录 */}
        <Route path="/factory/:token" element={<FactoryView />} />
      </Routes>
    </BrowserRouter>
  );
}
