import React, { useState } from 'react';
import { DownloadItem, DownloadStatus } from '../../shared/types/download';
import { DownloadCard } from './DownloadCard';
import { ArrowUp, ArrowDown, Filter, Inbox } from 'lucide-react';

interface DownloadQueueProps {
  items: DownloadItem[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, newIndex: number) => void;
  onOpenFolder: (path: string) => void;
}

export const DownloadQueue: React.FC<DownloadQueueProps> = ({
  items,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onReorder,
  onOpenFolder,
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const filteredItems = items.filter((item) => {
    if (filter === 'active') {
      return item.status === 'Downloading' || item.status === 'Queued' || item.status === 'Waiting' || item.status === 'Paused';
    }
    if (filter === 'completed') {
      return item.status === 'Completed';
    }
    return true;
  });

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const targetItem = filteredItems[index];
    const newIdx = index - 1;
    onReorder(targetItem.id, newIdx);
  };

  const handleMoveDown = (index: number) => {
    if (index >= filteredItems.length - 1) return;
    const targetItem = filteredItems[index];
    const newIdx = index + 1;
    onReorder(targetItem.id, newIdx);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Filter Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={() => setFilter('all')}
          >
            All ({items.length})
          </button>
          <button
            className={`btn ${filter === 'active' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={() => setFilter('active')}
          >
            Active / Queued ({items.filter((i) => ['Downloading', 'Queued', 'Waiting', 'Paused'].includes(i.status)).length})
          </button>
          <button
            className={`btn ${filter === 'completed' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={() => setFilter('completed')}
          >
            Completed ({items.filter((i) => i.status === 'Completed').length})
          </button>
        </div>
      </div>

      {/* List */}
      {filteredItems.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '40px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}
        >
          <Inbox size={32} />
          <div>No downloads in this view</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredItems.map((item, index) => (
            <div key={item.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Reorder Buttons (only for queued/waiting items) */}
              {(item.status === 'Queued' || item.status === 'Waiting') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button
                    className="btn-icon"
                    onClick={() => handleMoveUp(index)}
                    disabled={index === 0}
                    title="Move Up in Queue"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handleMoveDown(index)}
                    disabled={index === filteredItems.length - 1}
                    title="Move Down in Queue"
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
              )}

              <div style={{ flex: 1 }}>
                <DownloadCard
                  item={item}
                  onPause={onPause}
                  onResume={onResume}
                  onCancel={onCancel}
                  onRetry={onRetry}
                  onRemove={onRemove}
                  onOpenFolder={onOpenFolder}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
