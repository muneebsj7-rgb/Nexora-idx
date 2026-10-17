/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navigation } from './components/Navigation';
import { ToastContainer } from './components/Toast';
import { AuthModal } from './components/modals/AuthModal';
import { SvgIconGradients } from './components/ui/SvgIconGradients';
import { HomeScreen } from './components/screens/HomeScreen';
import { MiningScreen } from './components/screens/MiningScreen';
import { MarketsScreen } from './components/screens/MarketsScreen';
import { WalletScreen } from './components/screens/WalletScreen';
import { EarnScreen } from './components/screens/EarnScreen';
import { ProfileScreen } from './components/screens/ProfileScreen';

const MainLayout: React.FC = () => {
  const { activeTab, isMobileDeviceFrame } = useApp();

  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen />;
      case 'mining':
        return <MiningScreen />;
      case 'markets':
        return <MarketsScreen />;
      case 'wallet':
        return <WalletScreen />;
      case 'earn':
        return <EarnScreen />;
      case 'profile':
        return <ProfileScreen />;
      default:
        return <HomeScreen />;
    }
  };

  if (isMobileDeviceFrame) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-2 sm:p-6 text-slate-100">
        {/* Smartphone Chassis Frame */}
        <div className="w-full max-w-[430px] h-[92vh] max-h-[890px] bg-slate-950 rounded-[48px] border-[10px] border-slate-800 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden relative">
          {/* Top Notch / Dynamic Island */}
          <div className="w-full bg-slate-950 flex items-center justify-center pt-2 pb-1 shrink-0 z-40">
            <div className="w-28 h-4 bg-slate-900 rounded-full flex items-center justify-end px-3">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" />
            </div>
          </div>

          <Navigation />

          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            {renderActiveScreen()}
          </main>
        </div>

        <ToastContainer />
        <AuthModal />
        <SvgIconGradients />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col">
      <Navigation />
      <main className="flex-1 max-w-7xl w-full mx-auto px-2 sm:px-6 pt-4">
        {renderActiveScreen()}
      </main>
      <ToastContainer />
      <AuthModal />
      <SvgIconGradients />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
