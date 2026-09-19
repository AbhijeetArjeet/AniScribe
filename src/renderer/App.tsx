import React, { useState, useEffect } from 'react';
import { Sidebar, PageTab } from './components/Sidebar';
import { Home } from './pages/Home';
import { Downloads } from './pages/Downloads';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { Library } from './pages/Library';
import { TitleDetail } from './pages/TitleDetail';
import { Player } from './pages/Player';
import { ExportPage } from './pages/Export';
import { StoragePage } from './pages/Storage';
import { useDownloads } from './hooks/useDownloads';
import { useSettings } from './hooks/useSettings';
import { useLibrary } from './hooks/useLibrary';
import { LibraryTitle, LibraryEpisode } from '../shared/types/library';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<PageTab>('home');
  const [selectedTitle, setSelectedTitle] = useState<LibraryTitle | null>(null);
  const [activePlayerEpisode, setActivePlayerEpisode] = useState<LibraryEpisode | null>(null);
  const [activePlayerTitleName, setActivePlayerTitleName] = useState<string | undefined>(undefined);

  const {
    downloads,
    stats,
    addDownloads,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    removeDownload,
    reorderDownload,
    openFolder,
    importTxt,
  } = useDownloads();

  const { settings } = useSettings();

  const {
    titles,
    loading: libraryLoading,
    filter: libraryFilter,
    setFilter: setLibraryFilter,
    search: librarySearch,
    setSearch: setLibrarySearch,
    loadTitles: refreshTitles,
    scanLibrary,
  } = useLibrary();

  useEffect(() => {
    if (settings.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (settings.theme === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      // System
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    }
  }, [settings.theme]);

  const refreshSelectedTitle = async () => {
    if (selectedTitle && window.api) {
      const updated = await window.api.getLibraryTitle(selectedTitle.id);
      if (updated) {
        setSelectedTitle(updated);
      }
    }
    refreshTitles();
  };

  const handleSelectTab = (tab: PageTab) => {
    if (tab === 'library' && currentTab === 'library') {
      setSelectedTitle(null);
    }
    setCurrentTab(tab);
    setActivePlayerEpisode(null);
  };

  // If Player is active, render fullscreen player view
  if (activePlayerEpisode) {
    return (
      <div className="app-container" style={{ padding: 0, margin: 0, height: '100vh', width: '100vw' }}>
        <Player
          episode={activePlayerEpisode}
          titleName={activePlayerTitleName}
          onBack={() => {
            setActivePlayerEpisode(null);
            refreshSelectedTitle();
          }}
          onPlayEpisode={(ep) => {
            setActivePlayerEpisode(ep);
          }}
        />
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        activeCount={stats.activeCount}
        queuedCount={stats.queuedCount}
      />

      {currentTab === 'home' && (
        <Home
          downloads={downloads}
          stats={stats}
          onAddUrls={addDownloads}
          onImportTxt={importTxt}
          onPause={pauseDownload}
          onResume={resumeDownload}
          onCancel={cancelDownload}
          onRetry={retryDownload}
          onRemove={removeDownload}
          onOpenFolder={openFolder}
          onNavigateToDownloads={() => setCurrentTab('downloads')}
        />
      )}

      {currentTab === 'library' && (
        selectedTitle ? (
          <TitleDetail
            title={selectedTitle}
            onBack={() => {
              setSelectedTitle(null);
              refreshTitles();
            }}
            onPlayEpisode={(ep) => {
              setActivePlayerTitleName(selectedTitle.name);
              setActivePlayerEpisode(ep);
            }}
            onRefresh={refreshSelectedTitle}
          />
        ) : (
          <Library
            titles={titles}
            loading={libraryLoading}
            filter={libraryFilter}
            onFilterChange={setLibraryFilter}
            search={librarySearch}
            onSearchChange={setLibrarySearch}
            onSelectTitle={(t) => setSelectedTitle(t)}
            onScanLibrary={scanLibrary}
            onNavigateHome={() => setCurrentTab('home')}
          />
        )
      )}

      {currentTab === 'export' && (
        <ExportPage onNavigateToLibrary={() => setCurrentTab('library')} />
      )}

      {currentTab === 'downloads' && (
        <Downloads
          downloads={downloads}
          onPause={pauseDownload}
          onResume={resumeDownload}
          onCancel={cancelDownload}
          onRetry={retryDownload}
          onRemove={removeDownload}
          onReorder={reorderDownload}
          onOpenFolder={openFolder}
        />
      )}

      {currentTab === 'history' && (
        <History onOpenFolder={openFolder} />
      )}

      {currentTab === 'storage' && (
        <StoragePage />
      )}

      {currentTab === 'settings' && (
        <Settings />
      )}
    </div>
  );
};
