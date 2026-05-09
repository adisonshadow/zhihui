/**
 * 创作偏好表单字段（可复用于抽卡表单与偏好编辑弹窗）
 */
import { Flex, Input, Slider, Typography } from 'antd';
import { CheckButtonGroup, type CheckButtonGroupStateStyles } from '@/components/antd-plus/CheckButtonGroup';
import type { ScreenwriterDrawForm } from '@/novelDesign/prompts/screenwriterDrawPrompt';
import {
  AUDIENCE_OPTIONS,
  CONTENT_TYPE_OPTIONS,
  CP_MODE_OPTIONS,
  GENRE_OPTIONS,
  INNOVATION_LEVEL_OPTIONS,
  LENGTH_OPTIONS,
  PACE_OPTIONS,
  STORY_PLOT_OPTIONS,
  TONE_OPTIONS,
  getContentTypeEpisodeGuide,
} from '@/novelDesign/AITools/genOutline/index';

const { Text } = Typography;

export const PREFERENCE_CHECK_STYLES = {
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

export interface ScreenwriterPreferenceFormFieldsProps {
  form: ScreenwriterDrawForm;
  onChange: <K extends keyof ScreenwriterDrawForm>(key: K, value: ScreenwriterDrawForm[K]) => void;
  showGenerationCount?: boolean;
}

export function ScreenwriterPreferenceFormFields({
  form,
  onChange,
  showGenerationCount = false,
}: ScreenwriterPreferenceFormFieldsProps) {
  const episodeGuide = getContentTypeEpisodeGuide(form.contentType, form.customContentType);

  return (
    <Flex vertical gap={14} style={{ width: '100%' }}>
      <div>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>
          作品类型
        </Text>
        <CheckButtonGroup
          size="small"
          gap={8}
          value={form.contentType}
          onChange={(v) => onChange('contentType', v)}
          options={optionsFrom(CONTENT_TYPE_OPTIONS)}
          stateStyles={PREFERENCE_CHECK_STYLES}
          style={{ width: '100%' }}
        />
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, display: 'block', marginTop: 4 }}>
          {episodeGuide}
        </Text>
      </div>

      <div>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>
          创新度
        </Text>
        <CheckButtonGroup
          size="small"
          gap={8}
          value={form.innovation}
          onChange={(v) => onChange('innovation', v)}
          options={optionsFrom(INNOVATION_LEVEL_OPTIONS)}
          stateStyles={PREFERENCE_CHECK_STYLES}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>题材</Text>
        <CheckButtonGroup
          size="small"
          gap={8}
          value={form.genre}
          onChange={(v) => onChange('genre', v)}
          options={optionsFrom(GENRE_OPTIONS)}
          stateStyles={PREFERENCE_CHECK_STYLES}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>受众倾向</Text>
        <CheckButtonGroup
          size="small"
          gap={8}
          value={form.audience}
          onChange={(v) => onChange('audience', v)}
          options={optionsFrom(AUDIENCE_OPTIONS)}
          stateStyles={PREFERENCE_CHECK_STYLES}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>情感 / CP 模式</Text>
        <CheckButtonGroup
          size="small"
          gap={8}
          value={form.cpMode}
          onChange={(v) => onChange('cpMode', v)}
          options={optionsFrom(CP_MODE_OPTIONS)}
          stateStyles={PREFERENCE_CHECK_STYLES}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>故事基调</Text>
        <CheckButtonGroup
          size="small"
          gap={8}
          value={form.tone}
          onChange={(v) => onChange('tone', v)}
          options={optionsFrom(TONE_OPTIONS)}
          stateStyles={PREFERENCE_CHECK_STYLES}
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
          value={form.storyPlots}
          onChange={(next) =>
            onChange('storyPlots', next.length ? next : [STORY_PLOT_OPTIONS[0]])
          }
          options={optionsFrom(STORY_PLOT_OPTIONS)}
          stateStyles={PREFERENCE_CHECK_STYLES}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>叙事节奏</Text>
        <CheckButtonGroup
          size="small"
          gap={8}
          value={form.pace}
          onChange={(v) => onChange('pace', v)}
          options={optionsFrom(PACE_OPTIONS)}
          stateStyles={PREFERENCE_CHECK_STYLES}
          style={{ width: '100%' }}
        />
      </div>

      <div>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>预期篇幅</Text>
        <Flex vertical gap={8}>
          <CheckButtonGroup
            size="small"
            gap={8}
            value={form.length}
            onChange={(v) => {
              onChange('length', v);
              onChange('customLength', undefined);
            }}
            options={optionsFrom(LENGTH_OPTIONS)}
            stateStyles={PREFERENCE_CHECK_STYLES}
            style={{ width: '100%' }}
          />
          <Input
            value={form.customLength ?? ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              onChange('customLength', v || undefined);
              if (v) {
                onChange('length', LENGTH_OPTIONS[0]);
              }
            }}
            placeholder="或自定义，如「80集」「10万字」「3卷」"
            allowClear
          />
        </Flex>
      </div>

      <div>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, display: 'block', marginBottom: 6 }}>灵感关键词（选填）</Text>
        <Input
          value={form.keywords}
          onChange={(e) => onChange('keywords', e.target.value)}
          placeholder="例如：重生、系统、女扮男装、反派洗白……（空格分隔）"
          allowClear
        />
      </div>

      {showGenerationCount && (
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
              value={form.generationCount}
              onChange={(v) => onChange('generationCount', v)}
            />
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, flexShrink: 0, width: 28 }}>
              {form.generationCount}
            </Text>
          </Flex>
        </div>
      )}
    </Flex>
  );
}
