import React from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { TopBar } from './components/TopBar';
import { SidebarNav } from './components/SidebarNav';
import { CharacterView } from './views/CharacterView';
import { LorebookView } from './views/LorebookView';
import { ThemesAndTagsView } from './views/ThemesAndTagsView';
import { JsonInspectorView } from './views/JsonInspectorView';
import { OptionsView } from './views/OptionsView';

const WorkspaceShell: React.FC = () => {
  const { activeTab, settings, isMainSidebarOpen } = useStore();

  return (
    <div
      className={`min-h-screen w-full flex flex-col transition-colors ${
        settings.appearance === 'dark'
          ? 'dark bg-[#09090b] text-[#f4f4f5]'
          : 'light bg-[#f4f4f5] text-[#09090b]'
      }`}
    >
      <TopBar />

      <div className="flex-1 flex flex-col md:flex-row min-h-0 min-w-0 w-full">
        {isMainSidebarOpen && <SidebarNav />}

        <main className="flex-1 min-w-0 w-full p-4 md:p-6 lg:p-7">
          {activeTab === 'character' && <CharacterView />}
          {activeTab === 'lorebook' && <LorebookView />}
          {activeTab === 'themes_tags' && <ThemesAndTagsView />}
          {activeTab === 'json_inspector' && <JsonInspectorView />}
          {activeTab === 'options' && <OptionsView />}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <WorkspaceShell />
    </StoreProvider>
  );
}
