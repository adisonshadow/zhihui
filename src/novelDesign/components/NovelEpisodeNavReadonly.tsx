import { Input, Flex, Tooltip, ConfigProvider } from 'antd';
import type { NovelEpisode } from '@/novelDesign/storage/novelWorkspaceStorage';
import { formatNovelEpisodeNavLabel } from '@/novelDesign/utils/novelEpisodeDisplay';

interface NovelEpisodeNavReadonlyProps {
  episodes: NovelEpisode[];
  activeEpisodeId: string;
  navQuery: string;
  onNavQueryChange: (q: string) => void;
  onSelectEpisode: (id: string) => void;
}

export function NovelEpisodeNavReadonly({
  episodes,
  activeEpisodeId,
  navQuery,
  onNavQueryChange,
  onSelectEpisode,
}: NovelEpisodeNavReadonlyProps) {
  const q = navQuery.trim().toLowerCase();
  const filtered = q
    ? episodes.filter((ep) => formatNovelEpisodeNavLabel(ep).toLowerCase().includes(q))
    : episodes;

  return (
    <Flex vertical gap={10} style={{ height: '100%', padding: 12, overflow: 'hidden', minHeight: 0 }}>
      <Input.Search
        allowClear
        placeholder="搜索集…"
        value={navQuery}
        onChange={(e) => onNavQueryChange(e.target.value)}
      />
      <div className="novel-episode-scroll">
      <ConfigProvider
        tooltip={{
          unique: true,
          
        }}
      >
          {filtered.map((ep) => {
            const on = activeEpisodeId === ep.id;
            return (
              <Tooltip placement='right' title={formatNovelEpisodeNavLabel(ep)}>
                <button
                  key={ep.id}
                  type="button"
                  className={`novel-episode-item ${on ? 'novel-episode-item-active' : ''}`}
                  onClick={() => onSelectEpisode(ep.id)}
                >
                  <span className="novel-episode-item-title">{formatNovelEpisodeNavLabel(ep)}</span>
                </button>
              </Tooltip>
            );
          })}
        </ConfigProvider>
      </div>
    </Flex>
  );
}
