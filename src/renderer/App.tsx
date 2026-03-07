import { useEffect, useRef, useState } from 'react';

import UpdateCheckFeedback from '@/components/UpdateCheckFeedback';
import UpdateNotification from '@/components/UpdateNotification';
import UpdateReadyBanner from '@/components/UpdateReadyBanner';
import Chat from '@/pages/Chat';
import Settings from '@/pages/Settings';
import Skills from '@/pages/Skills';

type View = 'home' | 'settings' | 'skills';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const currentViewRef = useRef<View>('home');

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
      <div className={currentView === 'home' ? 'block' : 'hidden'}>
        <Chat
          onSettingsClick={() => setCurrentView('settings')}
          onSkillsClick={() => setCurrentView('skills')}
        />
      </div>
    </>
  );
}
