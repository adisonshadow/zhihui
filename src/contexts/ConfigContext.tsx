/**
 * 配置订阅上下文（见 docs/配置订阅使用.md）
 * 配置面板以 Modal 打开，配置修改后通知订阅者
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AISettings } from '@/types/settings';
import Settings from '@/pages/Settings';

interface ConfigContextValue {
  config: AISettings | null;
  /** 重新加载配置（如保存成功后刷新） */
  refreshConfig: () => Promise<void>;
  /** 打开配置 Modal */
  openConfigModal: () => void;
  /** 保存成功后由 Settings 调用，用于通知订阅者 */
  onConfigSaved: (next: AISettings) => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AISettings | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const refreshConfig = useCallback(async () => {
    if (!window.yiman?.settings?.get) return;
    try {
      const data = await window.yiman.settings.get();
      setConfig(data);
    } catch (e) {
      console.error('refreshConfig:', e);
    }
  }, []);

  useEffect(() => {
    refreshConfig();
  }, [refreshConfig]);

  const openConfigModal = useCallback(() => setModalOpen(true), []);
  const onConfigSaved = useCallback((next: AISettings) => {
    setConfig(next);
    // 不自动关闭 Modal，用户可继续编辑或点击关闭
  }, []);

  return (
    <ConfigContext.Provider
      value={{
        config,
        refreshConfig,
        openConfigModal,
        onConfigSaved,
      }}
    >
      {children}
      {modalOpen && (
        <Settings
          modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSaved={onConfigSaved}
        />
      )}
    </ConfigContext.Provider>
  );
}

export function useConfigModal() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfigModal must be used within ConfigProvider');
  return { openConfigModal: ctx.openConfigModal };
}

/** 订阅配置变化，配置保存后自动获取最新值 */
export function useConfigSubscribe(): AISettings | null {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfigSubscribe must be used within ConfigProvider');
  return ctx.config;
}

/** 仅读取当前配置（不强制订阅更新，可用于非订阅场景） */
export function useConfig() {
  return useConfigSubscribe();
}
