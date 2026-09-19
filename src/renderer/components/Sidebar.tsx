import React from 'react';
import { Home, Download, History, Settings, Layers, Film, Smartphone, HardDrive, Globe } from 'lucide-react';

export type PageTab = 'home' | 'library' | 'export' | 'downloads' | 'history' | 'storage' | 'settings';

interface SidebarProps {
  currentTab: PageTab;
  onSelectTab: (tab: PageTab) => void;
  activeCount: number;
  queuedCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  activeCount,
  queuedCount,
}) => {
  const totalActive = activeCount + queuedCount;

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Layers size={20} color="#6366f1" />
        <span>AniScribe</span>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${currentTab === 'home' ? 'active' : ''}`}
          onClick={() => onSelectTab('home')}
        >
          <div className="nav-item-left">
            <Home size={16} />
            <span>Home</span>
          </div>
        </button>

        <button
          className={`nav-item ${currentTab === 'library' ? 'active' : ''}`}
          onClick={() => onSelectTab('library')}
        >
          <div className="nav-item-left">
            <Film size={16} />
            <span>Library</span>
          </div>
        </button>

        <button
          className={`nav-item ${currentTab === 'export' ? 'active' : ''}`}
          onClick={() => onSelectTab('export')}
        >
          <div className="nav-item-left">
            <Smartphone size={16} />
            <span>Export</span>
          </div>
        </button>

        <button
          className={`nav-item ${currentTab === 'downloads' ? 'active' : ''}`}
          onClick={() => onSelectTab('downloads')}
        >
          <div className="nav-item-left">
            <Download size={16} />
            <span>Downloads</span>
          </div>
          {totalActive > 0 && (
            <span className={`nav-badge ${activeCount > 0 ? 'active-badge' : ''}`}>
              {totalActive}
            </span>
          )}
        </button>

        <button
          className={`nav-item ${currentTab === 'history' ? 'active' : ''}`}
          onClick={() => onSelectTab('history')}
        >
          <div className="nav-item-left">
            <History size={16} />
            <span>History</span>
          </div>
        </button>

        <button
          className={`nav-item ${currentTab === 'storage' ? 'active' : ''}`}
          onClick={() => onSelectTab('storage')}
        >
          <div className="nav-item-left">
            <HardDrive size={16} />
            <span>Storage</span>
          </div>
        </button>

        <button
          className={`nav-item ${currentTab === 'settings' ? 'active' : ''}`}
          onClick={() => onSelectTab('settings')}
        >
          <div className="nav-item-left">
            <Settings size={16} />
            <span>Settings</span>
          </div>
        </button>

        <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
          <button
            className="nav-item"
            style={{ color: '#818cf8', fontWeight: 600 }}
            onClick={() => window.api.openSniffer()}
            title="Open In-App Browser for Cloudflare Solver and Stream Sniffer"
          >
            <div className="nav-item-left">
              <Globe size={16} />
              <span>Browser / Sniffer</span>
            </div>
          </button>
        </div>
      </nav>
    </aside>
  );
};
