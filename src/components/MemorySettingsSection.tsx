import type { Memory } from '../types';

interface MemorySettingsSectionProps {
  memories: Memory[];
  draft: string;
  isLoading: boolean;
  isMutating: boolean;
  onDraftChange: (value: string) => void;
  onCreate: () => void;
  onToggle: (memory: Memory) => void;
  onDelete: (memory: Memory) => void;
}

function getKindLabel(kind: string): string {
  switch (kind) {
    case 'preference':
      return '偏好';
    case 'project':
      return '项目';
    case 'tool':
      return '工具';
    default:
      return '事实';
  }
}

export default function MemorySettingsSection({
  memories,
  draft,
  isLoading,
  isMutating,
  onDraftChange,
  onCreate,
  onToggle,
  onDelete,
}: MemorySettingsSectionProps) {
  return (
    <section className="settings-section">
      <div className="settings-section-head">
        <h3>长期记忆</h3>
        <span>{isLoading ? '加载中' : `已保存 ${memories.length} 条`}</span>
      </div>

      <div className="memory-create-row">
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="添加一条记忆"
          aria-label="添加一条记忆"
        />
        <button type="button" onClick={onCreate} disabled={!draft.trim() || isLoading || isMutating}>
          添加
        </button>
      </div>

      {memories.length === 0 ? (
        <div className="settings-empty">还没有保存的记忆。</div>
      ) : (
        <div className="memory-list">
          {memories.map((memory) => (
            <div key={memory.id} className={`memory-item ${memory.enabled ? '' : 'is-disabled'}`}>
              <div className="memory-item-main">
                <strong>{getKindLabel(memory.kind)}</strong>
                <span>{memory.content}</span>
              </div>
              <div className="memory-item-actions">
                <button type="button" onClick={() => onToggle(memory)} disabled={isLoading || isMutating}>
                  {memory.enabled ? '停用' : '启用'}
                </button>
                <button type="button" onClick={() => onDelete(memory)} disabled={isLoading || isMutating}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
