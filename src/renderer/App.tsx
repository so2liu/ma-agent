import { useCallback, useEffect, useRef, useState } from 'react';
import { Group, Panel } from 'react-resizable-panels';

import DbViewer from '@/components/DbViewer';
import OnboardingWizard from '@/components/OnboardingWizard';
import ResizeHandle from '@/components/ResizeHandle';
import Sidebar from '@/components/Sidebar';
import UpdateCheckFeedback from '@/components/UpdateCheckFeedback';
import UpdateReadyBanner from '@/components/UpdateReadyBanner';
import Chat from '@/pages/Chat';
import Schedules from '@/pages/Schedules';
import Settings from '@/pages/Settings';
import Skills from '@/pages/Skills';

import type { ChatHandle } from '@/pages/Chat';

type View = 'home' | 'settings' | 'skills' | 'schedules' | 'db-viewer';

interface DbViewerState {
  appId: string;
  appName: string;
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>('home');
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const currentViewRef = useRef<View>('home');
  const [dbViewerState, setDbViewerState] = useState<DbViewerState | null>(null);

  // Lifted state shared between Sidebar and Chat
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const chatRef = useRef<ChatHandle>(null);

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
    currentViewRef.current = currentView;
  }, [currentView]);

  const navigate = useCallback((view: View) => {
    setCurrentView((prev) => (prev === view ? 'home' : view));
  }, []);

  useEffect(() => {
    const unsubscribeNavigate = window.electron.onNavigate((view: string) => {
      navigate(view as View);
    });

    return () => {
      unsubscribeNavigate();
    };
  }, [navigate]);

  // Escape key navigates back to home from any non-home view
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && currentViewRef.current !== 'home') {
        setCurrentView('home');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openDbViewer = (appId: string, appName: string) => {
    setDbViewerState({ appId, appName });
    setCurrentView('db-viewer');
  };

  const handleLoadConversation = useCallback(async (id: string) => {
    if (chatRef.current?.isLoading()) return;
    setCurrentView('home');
    await chatRef.current?.loadConversation(id);
  }, []);

  const handleNewChat = useCallback(async () => {
    if (chatRef.current?.isLoading()) return;
    setCurrentView('home');
    await chatRef.current?.newChat();
  }, []);

  if (showOnboarding === null) return null;
  if (showOnboarding) return <OnboardingWizard onComplete={handleOnboardingComplete} />;

  return (
    <>
      <UpdateCheckFeedback />
      <UpdateReadyBanner />
      {showOnboardingDialog && (
        <OnboardingWizard onComplete={() => setShowOnboardingDialog(false)} mode="dialog" />
      )}
      <div className="flex h-screen bg-transparent">
        <Group className="flex-1 overflow-hidden">
          {/* Global sidebar */}
          <Panel
            defaultSize="220px"
            minSize="160px"
            maxSize="400px"
            className="[-webkit-app-region:no-drag]"
          >
            <Sidebar
              currentView={currentView}
              onLoadConversation={handleLoadConversation}
              currentConversationId={currentConversationId}
              onNewChat={handleNewChat}
              onSettingsClick={() => navigate('settings')}
              onSkillsClick={() => navigate('skills')}
              onSchedulesClick={() => navigate('schedules')}
              onOnboardingClick={() => setShowOnboardingDialog(true)}
              selectedProjectId={selectedProjectId}
              onSelectProject={setSelectedProjectId}
            />
          </Panel>

          <ResizeHandle />

          {/* Content area */}
          <Panel minSize="300px" style={{ background: 'var(--color-content-bg)' }}>
            <div className={currentView === 'home' ? 'block h-full' : 'hidden'}>
              <Chat
                ref={chatRef}
                currentConversationId={currentConversationId}
                setCurrentConversationId={setCurrentConversationId}
                selectedProjectId={selectedProjectId}
                setSelectedProjectId={setSelectedProjectId}
                onOpenDbViewer={openDbViewer}
                onSkillsClick={() => navigate('skills')}
              />
            </div>
            <div className={currentView === 'settings' ? 'block h-full' : 'hidden'}>
              <Settings />
            </div>
            <div className={currentView === 'skills' ? 'block h-full' : 'hidden'}>
              <Skills />
            </div>
            <div className={currentView === 'schedules' ? 'block h-full' : 'hidden'}>
              <Schedules />
            </div>
            {currentView === 'db-viewer' && dbViewerState && (
              <div className="h-full">
                <DbViewer
                  appId={dbViewerState.appId}
                  appName={dbViewerState.appName}
                  onClose={() => setCurrentView('home')}
                />
              </div>
            )}
          </Panel>
        </Group>
      </div>
    </>
  );
}
