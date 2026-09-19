import React from 'react';
import { DownloadStatus } from '../../shared/types/download';

interface ProgressBarProps {
  percentage: number;
  status: DownloadStatus;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ percentage, status }) => {
  const clamped = Math.max(0, Math.min(100, percentage));

  let statusClass = '';
  if (status === 'Completed') statusClass = 'completed';
  else if (status === 'Waiting') statusClass = 'waiting';
  else if (status === 'Failed') statusClass = 'failed';
  else if (status === 'Paused') statusClass = 'paused';

  return (
    <div className="progress-container">
      <div
        className={`progress-bar-fill ${statusClass}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};
