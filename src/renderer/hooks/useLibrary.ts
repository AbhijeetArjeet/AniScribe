import { useState, useEffect, useCallback } from 'react';
import { LibraryTitle, LibraryFilter } from '../../shared/types/library';

export function useLibrary() {
  const [titles, setTitles] = useState<LibraryTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [search, setSearch] = useState('');

  const loadTitles = useCallback(async () => {
    if (!window.api) return;
    try {
      const data = await window.api.getLibraryTitles(filter, search);
      setTitles(data);
    } catch (err) {
      console.error('Failed to load library titles:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    loadTitles();
  }, [loadTitles]);

  // Listen for library updates (e.g. newly organized downloads)
  useEffect(() => {
    if (!window.api?.onLibraryUpdated) return;
    const unsub = window.api.onLibraryUpdated(() => {
      loadTitles();
    });
    return () => {
      unsub();
    };
  }, [loadTitles]);

  const getTitle = useCallback(async (id: string) => {
    if (!window.api) return null;
    return await window.api.getLibraryTitle(id);
  }, []);

  const deleteTitle = useCallback(async (id: string, deleteFiles: boolean = false) => {
    if (!window.api) return false;
    const res = await window.api.deleteLibraryTitle(id, deleteFiles);
    if (res) {
      setTitles((prev) => prev.filter((t) => t.id !== id));
    }
    return res;
  }, []);

  const deleteMediaFile = useCallback(async (mediaFileId: string, deleteDiskFile: boolean = false) => {
    if (!window.api) return false;
    const res = await window.api.deleteMediaFile(mediaFileId, deleteDiskFile);
    if (res) {
      loadTitles();
    }
    return res;
  }, [loadTitles]);

  const scanLibrary = useCallback(async () => {
    if (!window.api) return 0;
    setLoading(true);
    const count = await window.api.scanLibrary();
    await loadTitles();
    return count;
  }, [loadTitles]);

  return {
    titles,
    loading,
    filter,
    setFilter,
    search,
    setSearch,
    loadTitles,
    getTitle,
    deleteTitle,
    deleteMediaFile,
    scanLibrary,
  };
}
