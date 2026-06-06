/**
 * useRecordingLibrary：录音列表加载/刷新
 */
import { useCallback, useEffect, useState } from 'react';
import { listRecordings, deleteRecording, renameRecording, type RecordingEntry } from '../utils/audioRecorderApi';

interface UseRecordingLibraryReturn {
  recordings: RecordingEntry[];
  selected: RecordingEntry | null;
  loading: boolean;
  selectRecording: (r: RecordingEntry | null) => void;
  refresh: () => Promise<void>;
  removeRecording: (entry: RecordingEntry) => Promise<boolean>;
  renameRecordingEntry: (entry: RecordingEntry, newName: string) => Promise<boolean>;
}

export function useRecordingLibrary(): UseRecordingLibraryReturn {
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [selected, setSelected] = useState<RecordingEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listRecordings();
      setRecordings(list);
    } catch {
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectRecording = useCallback((r: RecordingEntry | null) => {
    setSelected(r);
  }, []);

  const removeRecording = useCallback(async (entry: RecordingEntry): Promise<boolean> => {
    const res = await deleteRecording(entry.path);
    if (res.ok) {
      setRecordings((prev) => prev.filter((r) => r.path !== entry.path));
      setSelected((prev) => (prev?.path === entry.path ? null : prev));
      return true;
    }
    return false;
  }, []);

  const renameRecordingEntry = useCallback(async (entry: RecordingEntry, newName: string): Promise<boolean> => {
    const res = await renameRecording(entry.path, newName);
    if (res.ok && res.newPath) {
      setRecordings((prev) =>
        prev.map((r) =>
          r.path === entry.path ? { ...r, name: newName + (r.name.includes('.') ? '.' + r.name.split('.').pop() : ''), path: res.newPath! } : r,
        ),
      );
      setSelected((prev) =>
        prev?.path === entry.path ? { ...prev, name: newName, path: res.newPath! } : prev,
      );
      return true;
    }
    return false;
  }, []);

  return { recordings, selected, loading, selectRecording, refresh, removeRecording, renameRecordingEntry };
}
