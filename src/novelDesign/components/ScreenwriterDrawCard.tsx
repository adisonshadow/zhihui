/**
 * 故事抽卡表单：选项取自 novelDesign/AITools/genOutline（与大纲工具一致）
 */
import { useState } from 'react';
import { Button, Card, Flex, Input, Slider, Typography } from 'antd';
import { CheckButtonGroup, type CheckButtonGroupStateStyles } from '@/components/antd-plus/CheckButtonGroup';
import type { ScreenwriterDrawForm } from '../prompts/screenwriterDrawPrompt';
import { DEFAULT_SCREENWRITER_DRAW_FORM, buildScreenwriterDrawUserBrief } from '../prompts/screenwriterDrawPrompt';
import {
  AUDIENCE_OPTIONS,
  CP_MODE_OPTIONS,
  GENRE_OPTIONS,
  INNOVATION_LEVEL_OPTIONS,
  LENGTH_OPTIONS,
  PACE_OPTIONS,
  STORY_PLOT_OPTIONS,
  TONE_OPTIONS,
} from '../AITools/genOutline/index';

const { Text } = Typography;

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

export interface ScreenwriterDrawCardProps {
  onStart: (userPrompt: string) => void;
}

export function ScreenwriterDrawCard({ onStart }: ScreenwriterDrawCardProps) {
  const [f, setF] = useState<ScreenwriterDrawForm>(DEFAULT_SCREENWRITER_DRAW_FORM);
  const [submitting, setSubmitting] = useState(false);

  const setField = <K extends keyof ScreenwriterDrawForm>(key: K, v: ScreenwriterDrawForm[K]) => {
    setF((p) => ({ ...p, [key]: v }));
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
        <div>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>
            创新度
          </Text>
          <CheckButtonGroup
            size="small"
            gap={8}
            value={f.innovation}
            onChange={(v) => setField('innovation', v)}
            options={optionsFrom(INNOVATION_LEVEL_OPTIONS)}
            stateStyles={CARD_CHECK_STYLES}
            style={{ width: '100%' }}
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
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>故事情节（可多选）</Text>
          <CheckButtonGroup
            multiple
            exclusiveValues={[STORY_PLOT_OPTIONS[0]]}
            size="small"
            gap={8}
            value={f.storyPlots}
            onChange={(next) =>
              setField('storyPlots', next.length ? next : [STORY_PLOT_OPTIONS[0]])
            }
            options={optionsFrom(STORY_PLOT_OPTIONS)}
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

        <div>
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>
            生成数量（每个小说雏形独立一套）
          </Text>
          <Flex align="center" gap={12}>
            <Slider
              style={{ flex: 1, minWidth: 0 }}
              min={1}
              max={20}
              step={1}
              value={f.generationCount}
              onChange={(v) => setField('generationCount', v)}
            />
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, flexShrink: 0, width: 28 }}>
              {f.generationCount}
            </Text>
          </Flex>
        </div>

        <Button
          type="primary"
          loading={submitting}
          onClick={() => {
            setSubmitting(true);
            try {
              onStart(buildScreenwriterDrawUserBrief(f));
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
