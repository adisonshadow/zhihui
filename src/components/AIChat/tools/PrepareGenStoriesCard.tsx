/**
 * 故事抽卡：对话内 Form Card（与 A2UI 式交互卡类似，使用 antd Card + Form 实现）
 */
import { useState } from 'react';
import { Button, Card, Flex, Input, Slider, Typography } from 'antd';
import { CheckButtonGroup, type CheckButtonGroupStateStyles } from '@/components/antd-plus/CheckButtonGroup';
import type { PrepareGenStoriesForm } from './prepareGenStoriesPrompt';
import {
  AUDIENCE_OPTIONS,
  CP_MODE_OPTIONS,
  DEFAULT_PREPARE_GEN_STORIES_FORM,
  GENRE_OPTIONS,
  LENGTH_OPTIONS,
  PACE_OPTIONS,
  TONE_OPTIONS,
  buildPrepareGenStoriesPrompt,
} from './prepareGenStoriesPrompt';

const { Text } = Typography;

/** 深色卡片内：与 CheckCard 相近的选中态 */
const CARD_CHECK_STYLES = {
  idle: {
    background: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.75)',
  },
  selected: {
    background: 'rgba(22, 119, 255, 0.22)',
    borderColor: '#1677ff',
    color: 'rgba(255,255,255,0.95)',
  },
  hover: {
    borderColor: 'rgba(255,255,255,0.35)',
  },
  activePress: {
    opacity: 0.88,
  },
} as const satisfies CheckButtonGroupStateStyles;

function optionsFrom<T extends string>(arr: readonly T[]) {
  return arr.map((v) => ({ label: v, value: v }));
}

export interface PrepareGenStoriesCardProps {
  onStart: (userPrompt: string) => void;
}

export function PrepareGenStoriesCard({ onStart }: PrepareGenStoriesCardProps) {
  const [f, setF] = useState<PrepareGenStoriesForm>(DEFAULT_PREPARE_GEN_STORIES_FORM);
  const [submitting, setSubmitting] = useState(false);

  const setField = <K extends keyof PrepareGenStoriesForm>(key: K, v: PrepareGenStoriesForm[K]) => {
    setF((p) => ({ ...p, [key]: v }));
  };

  return (
    <Card
      size="small"
      title="故事抽卡"
      style={{
        // maxWidth: 480,
        background: 'rgba(255,255,255,0.04)',
        borderColor: 'rgba(255,255,255,0.12)',
      }}
      styles={
        { 
          header: { minHeight: 40, color: 'rgba(255,255,255,0.88)' },
          body: { backgroundColor: '#141414' }
        }
      }
    >
      <Flex vertical gap={14} style={{ width: '100%' }}>
        <div>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>
            创新度：常见套路 ◀———▶ 天马行空
          </Text>
          <Slider
            min={0}
            max={100}
            value={f.innovation}
            onChange={(v) => setField('innovation', v)}
            tooltip={{ formatter: (v) => `${v}` }}
          />
        </div>

        <div>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>题材</Text>
          <CheckButtonGroup
            size="small"
            gap={8}
            value={f.genre}
            onChange={(v) => setField('genre', v)}
            options={optionsFrom(GENRE_OPTIONS)}
            stateStyles={CARD_CHECK_STYLES}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>受众倾向</Text>
          <CheckButtonGroup
            size="small"
            gap={8}
            value={f.audience}
            onChange={(v) => setField('audience', v)}
            options={optionsFrom(AUDIENCE_OPTIONS)}
            stateStyles={CARD_CHECK_STYLES}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>情感 / CP 模式</Text>
          <CheckButtonGroup
            size="small"
            gap={8}
            value={f.cpMode}
            onChange={(v) => setField('cpMode', v)}
            options={optionsFrom(CP_MODE_OPTIONS)}
            stateStyles={CARD_CHECK_STYLES}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>故事基调</Text>
          <CheckButtonGroup
            size="small"
            gap={8}
            value={f.tone}
            onChange={(v) => setField('tone', v)}
            options={optionsFrom(TONE_OPTIONS)}
            stateStyles={CARD_CHECK_STYLES}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>叙事节奏</Text>
          <CheckButtonGroup
            size="small"
            gap={8}
            value={f.pace}
            onChange={(v) => setField('pace', v)}
            options={optionsFrom(PACE_OPTIONS)}
            stateStyles={CARD_CHECK_STYLES}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>预期篇幅</Text>
          <CheckButtonGroup
            size="small"
            gap={8}
            value={f.length}
            onChange={(v) => setField('length', v)}
            options={optionsFrom(LENGTH_OPTIONS)}
            stateStyles={CARD_CHECK_STYLES}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>灵感关键词（选填）</Text>
          <Input
            value={f.keywords}
            onChange={(e) => setField('keywords', e.target.value)}
            placeholder="例如：重生、系统、女扮男装、反派洗白……（空格分隔）"
            allowClear
          />
        </div>

        <Button
          type="primary"
          loading={submitting}
          onClick={() => {
            setSubmitting(true);
            try {
              const userPrompt = buildPrepareGenStoriesPrompt(f);
              onStart(userPrompt);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          开始
        </Button>
      </Flex>
    </Card>
  );
}
