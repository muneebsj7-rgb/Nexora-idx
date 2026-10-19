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
      <div className="min-h-screen bg-[#04060A] flex flex-col items-center justify-center p-2 sm:p-6 text-[#F4F7FC] transition-colors">
        {/* Futuristic Smartphone Chassis Frame in Premium Dark Theme */}
        <div className="w-full max-w-[430px] h-[92vh] max-h-[890px] bg-[#080B12] rounded-[48px] border-[6px] border-[#253144] shadow-[0_25px_80px_-15px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden relative">
          {/* Top Notch / Dynamic Island */}
          <div className="w-full bg-[#0D121C] flex items-center justify-center pt-2.5 pb-1 shrink-0 z-40 border-b border-[#253144]/60">
            <div className="w-28 h-4 bg-[#121925] rounded-full flex items-center justify-end px-3 border border-[#253144]">
              <div className="w-2 h-2 rounded-full bg-[#253144]" />
            </div>
          </div>

          <Navigation />

          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[#080B12]">
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
    <div className="min-h-screen bg-[#080B12] text-[#F4F7FC] flex flex-col selection:bg-[#00D6A3]/20 selection:text-[#00D6A3] font-sans antialiased">
      <Navigation />
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 pt-4">
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
