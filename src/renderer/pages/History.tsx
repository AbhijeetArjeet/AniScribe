import React, { useState, useEffect } from 'react';
import { DownloadItem } from '../../shared/types/download';
import { formatBytes } from '../components/DownloadCard';
import { Folder, Trash2, Calendar, FileText, CheckCircle, XCircle } from 'lucide-react';

interface HistoryProps {
  onOpenFolder: (path: string) => void;
}

export const History: React.FC<HistoryProps> = ({ onOpenFolder }) => {
  const [historyItems, setHistoryItems] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    if (!window.api) return;
    try {
      const items = await window.api.getHistory();
      setHistoryItems(items);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleClearAll = async () => {
    if (!window.api) return;
    if (window.confirm('Are you sure you want to clear all download history?')) {
      await window.api.clearHistory();
      setHistoryItems([]);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.api) return;
    await window.api.deleteHistoryItem(id);
    setHistoryItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="main-content">
      <div className="page-header">
        <h1 className="page-title">Download History</h1>
        {historyItems.length > 0 && (
          <button className="btn btn-danger" onClick={handleClearAll} style={{ fontSize: '12px', padding: '5px 10px' }}>
            <Trash2 size={14} />
            <span>Clear History</span>
          </button>
        )}
      </div>

      <div className="page-body">
        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
            Loading history...
          </div>
        ) : historyItems.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No history records yet.
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Filename</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Size</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {historyItems.map((item) => (
                  <tr
                    key={item.id}
                    style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}
                    className="history-row"
                  >
                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileText size={16} color="#94a3b8" />
                        <span title={item.filename} style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.filename}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                      {formatBytes(item.totalSize)}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                      {new Date(item.completedAt || item.createdAt).toLocaleDateString()} {new Date(item.completedAt || item.createdAt).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge badge-${item.status.toLowerCase()}`}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <button
                          className="btn-icon"
                          onClick={() => onOpenFolder(`${item.destination}/${item.filename}`)}
                          title="Open in Folder"
                        >
                          <Folder size={15} />
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => handleDeleteItem(item.id)}
                          title="Delete from history"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
