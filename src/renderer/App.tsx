import { useEffect, useRef, useState } from 'react';

import DbViewer from '@/components/DbViewer';
import UpdateCheckFeedback from '@/components/UpdateCheckFeedback';
import UpdateNotification from '@/components/UpdateNotification';
import UpdateReadyBanner from '@/components/UpdateReadyBanner';
import Chat from '@/pages/Chat';
import Settings from '@/pages/Settings';
import Skills from '@/pages/Skills';

type View = 'home' | 'settings' | 'skills' | 'db-viewer';

interface DbViewerState {
  appId: string;
  appName: string;
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const currentViewRef = useRef<View>('home');
  const [dbViewerState, setDbViewerState] = useState<DbViewerState | null>(null);

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

  return (
    <>
      <UpdateCheckFeedback />
      <UpdateNotification />
      <UpdateReadyBanner />
      <div className={currentView === 'settings' ? 'block' : 'hidden'}>
        <Settings onBack={() => setCurrentView('home')} />
      </div>
      <div className={currentView === 'skills' ? 'block' : 'hidden'}>
        <Skills onBack={() => setCurrentView('home')} />
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
          onOpenDbViewer={openDbViewer}
        />
      </div>
    </>
  );
}
