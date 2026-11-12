import React from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';
import { StoreProvider, useStore } from './context/StoreContext';
import { TopBar } from './components/TopBar';
import { SidebarNav } from './components/SidebarNav';
import { CharacterView } from './views/CharacterView';
import { LorebookView } from './views/LorebookView';
import { ThemesAndTagsView } from './views/ThemesAndTagsView';
import { JsonInspectorView } from './views/JsonInspectorView';
import { OptionsView } from './views/OptionsView';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage:
        error instanceof Error
          ? error.message
          : 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    console.error('TavernSmith ErrorBoundary caught error:', error, errorInfo);
  }

  handleSafeRecovery = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  handleHardResetView = (): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('tavernsmith_store_v2');
      }
    } catch {
      // Ignore storage restriction
    }
    this.setState({ hasError: false, errorMessage: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#09090b] text-[#f4f4f5] p-6">
          <div className="max-w-md w-full rounded-xl border border-indigo-500/40 bg-zinc-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-bold text-white">
                  TavernSmith Safe Recovery Mode
                </h1>
                <p className="text-xs text-zinc-400">
                  A rendering error was caught before it could blank the screen.
                </p>
              </div>
            </div>

            {this.state.errorMessage && (
              <pre className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-rose-300 whitespace-pre-wrap break-words max-h-36 overflow-y-auto">
                {this.state.errorMessage}
              </pre>
            )}

            <p className="text-xs text-zinc-400 leading-relaxed">
              Your saved AI provider API keys remain safely stored. Click{' '}
              <strong className="text-zinc-200">Safe Recovery</strong> to resume
              your view, or <strong className="text-zinc-200">Reset Workspace View</strong>{' '}
              if a corrupted card file caused this error.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleSafeRecovery}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white cursor-pointer transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Safe Recovery / Resume View</span>
              </button>

              <button
                type="button"
                onClick={this.handleHardResetView}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 hover:border-rose-500/60 bg-zinc-800 px-3.5 py-2 text-xs font-semibold text-zinc-200 cursor-pointer transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset View</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

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
    <AppErrorBoundary>
      <StoreProvider>
        <WorkspaceShell />
      </StoreProvider>
    </AppErrorBoundary>
  );
}
