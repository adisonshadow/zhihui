/**
 * 创作偏好编辑弹窗
 */
import { useState } from 'react';
import { Button, Flex, Modal, message } from 'antd';
import type { ScreenwriterDrawForm } from '@/novelDesign/prompts/screenwriterDrawPrompt';
import { DEFAULT_SCREENWRITER_DRAW_FORM } from '@/novelDesign/prompts/screenwriterDrawPrompt';
import { loadCreationPreference, saveCreationPreference } from '@/novelDesign/storage/novelCreationPreferenceStorage';
import { ScreenwriterPreferenceFormFields } from './ScreenwriterPreferenceFormFields';

export interface ScreenwriterDrawPreferencesModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (form: ScreenwriterDrawForm) => void;
}

export function ScreenwriterDrawPreferencesModal({ open, onClose, onSaved }: ScreenwriterDrawPreferencesModalProps) {
  const [f, setF] = useState<ScreenwriterDrawForm>(() => loadCreationPreference());
  const [saving, setSaving] = useState(false);

  const setField = <K extends keyof ScreenwriterDrawForm>(key: K, v: ScreenwriterDrawForm[K]) => {
    setF((p) => ({ ...p, [key]: v }));
  };

  const handleSave = () => {
    setSaving(true);
    try {
      saveCreationPreference(f);
      message.success('创作偏好已保存');
      onSaved?.(f);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setF({ ...DEFAULT_SCREENWRITER_DRAW_FORM });
  };

  return (
    <Modal
      title="编辑创作偏好"
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnHidden
      styles={{ body: { maxHeight: '60vh', overflow: 'auto' } }}
    >
      <Flex vertical gap={14} style={{ marginTop: 8 }}>
        <ScreenwriterPreferenceFormFields form={f} onChange={setField} />
        <Flex justify="space-between" style={{ marginTop: 8 }}>
          <Button onClick={handleReset} size="small">
            恢复默认
          </Button>
          <Flex gap={8}>
            <Button onClick={onClose}>取消</Button>
            <Button type="primary" loading={saving} onClick={handleSave}>
              保存
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Modal>
  );
}
