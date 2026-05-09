/**
 * 故事抽卡表单：选项取自 novelDesign/AITools/genOutline（与大纲工具一致）
 */
import { useState } from 'react';
import { Button, Card, Flex } from 'antd';
import type { ScreenwriterDrawForm } from '../prompts/screenwriterDrawPrompt';
import { buildScreenwriterDrawUserBrief } from '../prompts/screenwriterDrawPrompt';
import { loadCreationPreference, saveCreationPreference } from '../storage/novelCreationPreferenceStorage';
import { ScreenwriterPreferenceFormFields } from './ScreenwriterPreferenceFormFields';

export interface ScreenwriterDrawCardProps {
  onStart: (userPrompt: string) => void;
}

export function ScreenwriterDrawCard({ onStart }: ScreenwriterDrawCardProps) {
  const [f, setF] = useState<ScreenwriterDrawForm>(() => loadCreationPreference());
  const [submitting, setSubmitting] = useState(false);

  const setField = <K extends keyof ScreenwriterDrawForm>(key: K, v: ScreenwriterDrawForm[K]) => {
    setF((p) => ({ ...p, [key]: v }));
  };

  const handleStart = () => {
    setSubmitting(true);
    try {
      saveCreationPreference(f);
      onStart(buildScreenwriterDrawUserBrief(f));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card
      size="small"
      title="故事抽卡"
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.12)',
      }}
      styles={{
        header: { minHeight: 40, color: 'rgba(255,255,255,0.88)' },
        body: { backgroundColor: '#141414' },
      }}
    >
      <Flex vertical gap={14} style={{ width: '100%' }}>
        <ScreenwriterPreferenceFormFields form={f} onChange={setField} showGenerationCount />

        <Button
          type="primary"
          loading={submitting}
          onClick={handleStart}
        >
          开始
        </Button>
      </Flex>
    </Card>
  );
}
