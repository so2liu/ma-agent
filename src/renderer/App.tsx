import { useCallback, useEffect, useRef, useState } from 'react';

import DbViewer from '@/components/DbViewer';
import OnboardingWizard from '@/components/OnboardingWizard';
import UpdateCheckFeedback from '@/components/UpdateCheckFeedback';
import UpdateReadyBanner from '@/components/UpdateReadyBanner';
import Chat from '@/pages/Chat';
import Schedules from '@/pages/Schedules';
import Settings from '@/pages/Settings';
import Skills from '@/pages/Skills';

type View = 'home' | 'settings' | 'skills' | 'schedules' | 'db-viewer';

interface DbViewerState {
  appId: string;
  appName: string;
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const currentViewRef = useRef<View>('home');
  const [dbViewerState, setDbViewerState] = useState<DbViewerState | null>(null);

  useEffect(() => {
    window.electron.config
      .getApiKeyStatus()
      .then(({ status }) => {
        const isFirstLaunch = !status.configured && !localStorage.getItem('onboarding-done');
        setShowOnboarding(isFirstLaunch);
      })
      .catch(() => setShowOnboarding(false));
  }, []);

  const handleOnboardingComplete = useCallback((apiKeySaved: boolean) => {
    if (apiKeySaved) {
      localStorage.setItem('onboarding-done', '1');
    }
    setShowOnboarding(false);
  }, []);

  useEffect(() => {
    // Update ref whenever currentView changes
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    // Listen for navigation events from main process
    const unsubscribeNavigate = window.electron.onNavigate((view: string) => {
      // If navigating to same view, toggle back to home
      if (view === currentViewRef.current) {
        setCurrentView('home');
      } else {
        setCurrentView(view as View);
      }
    });

    return () => {
      unsubscribeNavigate();
    };
  }, []);

  const openDbViewer = (appId: string, appName: string) => {
    setDbViewerState({ appId, appName });
    setCurrentView('db-viewer');
  };

  if (showOnboarding === null) return null;
  if (showOnboarding) return <OnboardingWizard onComplete={handleOnboardingComplete} />;

  return (
    <>
      <UpdateCheckFeedback />
      <UpdateReadyBanner />
      <div className={currentView === 'settings' ? 'block' : 'hidden'}>
        <Settings onBack={() => setCurrentView('home')} />
      </div>
      <div className={currentView === 'skills' ? 'block' : 'hidden'}>
        <Skills onBack={() => setCurrentView('home')} />
      </div>
      <div className={currentView === 'schedules' ? 'block' : 'hidden'}>
        <Schedules onBack={() => setCurrentView('home')} />
      </div>
      {currentView === 'db-viewer' && dbViewerState && (
        <div className="h-screen">
          <DbViewer
            appId={dbViewerState.appId}
            appName={dbViewerState.appName}
            onClose={() => setCurrentView('home')}
          />
        </div>
      )}
      <div className={currentView === 'home' ? 'block' : 'hidden'}>
        <Chat
          onSettingsClick={() => setCurrentView('settings')}
          onSkillsClick={() => setCurrentView('skills')}
          onSchedulesClick={() => setCurrentView('schedules')}
          onOpenDbViewer={openDbViewer}
        />
      </div>
    </>
  );
}
