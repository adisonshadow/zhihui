/**
 * 本地 TTS 预览页
 * DEV 模式直接 HTTP 调用 AI 服务 (port 19815)
 */
import {
  Card, Typography, Button, Input, Space, Tag, Divider, App, Flex, Slider, Segmented,
} from 'antd';
import { SoundOutlined } from '@ant-design/icons';
import { useConfigSubscribe } from '@/contexts/ConfigContext';
import {
  LOCAL_TTS_MODEL_OPTIONS,
  localTtsProfileIsSaved,
  restSegmentForLocalTtsModelKey,
} from '@/types/settings';
import { useEffect, useMemo, useState, useCallback, useRef } from 'react';

const { Title, Text, Paragraph } = Typography;

const AI_SERVICE_BASE = 'http://127.0.0.1:19815';
/** 与设置页「测试」一致：按请求体校验；GET …/health 仅读 AI 服务进程内的 YIMAN_LOCAL_TTS_CONFIG，易与前端已保存配置不一致 */
const AI_VALIDATE_URL = `${AI_SERVICE_BASE}/api/v1/tts/validate-profile`;

const DEFAULT_PREVIEW_TEXT_LONGCAT = `[旁白] 在城市寂静的夜晚，两个人在街角偶遇。
[男声] 好久不见，没想到会在这里碰到你。
[女声·温柔] 是啊，时间过得真快。
[男声·低沉感慨] 这几年大家都变化了很多。
[旁白] 晚风轻轻吹过，两人陷入短暂的沉默。`;

const DEFAULT_PREVIEW_TEXT_MOSS = `[spk:0][emo:温柔]
夜色慢慢沉下来，城市的灯火一点点亮起。<#1.2#>
晚风轻轻吹过窗台，安静得刚刚好。
[spk:1][emo:开朗开心]
哇！今天也太舒服了吧！<#0.6#>
好想就这样一直发呆，什么都不用想。
[spk:0][emo:低沉沉稳]
有些路，只能一个人走。<#1.5#>
有些心事，只能藏在心底不说出口。
[spk:1][emo:略带伤感]
明明就在身边，<#0.8#>
却好像隔着很远很远的距离。
[spk:0][emo:严肃认真]
别轻易妥协，<#0.5#>
也别辜负每一个认真努力的自己。`;

export default function LocalTtsPreview() {
  const { message } = App.useApp();
  const config = useConfigSubscribe();
  const localTts = config?.localTts;

  const [previewModelKey, setPreviewModelKey] = useState<string>('longcat_audio_dit');
  const previewInitRef = useRef(false);

  useEffect(() => {
    if (previewInitRef.current) return;
    const mk = localTts?.modelKey;
    if (mk && LOCAL_TTS_MODEL_OPTIONS.some((o) => o.key === mk)) {
      setPreviewModelKey(mk);
      previewInitRef.current = true;
    }
  }, [localTts]);

  useEffect(() => {
    setText(
      previewModelKey === 'moss_tts' ? DEFAULT_PREVIEW_TEXT_MOSS : DEFAULT_PREVIEW_TEXT_LONGCAT,
    );
  }, [previewModelKey]);

  const previewProfile = localTts?.profiles?.[previewModelKey];
  const restSegment = useMemo(
    () => restSegmentForLocalTtsModelKey(previewModelKey),
    [previewModelKey],
  );

  const [text, setText] = useState(DEFAULT_PREVIEW_TEXT_LONGCAT);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<{
    checked: boolean;
    ok: boolean;
    message?: string;
  }>({ checked: false, ok: false });
  const [speed, setSpeed] = useState(1.0);

  const configOk = localTts?.enabled === true && !!previewProfile?.modelPath?.trim();

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(AI_VALIDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelKey: previewModelKey,
          profile: {
            modelPath: previewProfile?.modelPath?.trim(),
            idleTimeoutMinutes: previewProfile?.idleTimeoutMinutes ?? 3,
            mossAudioTokenizerPath:
              previewModelKey === 'moss_tts'
                ? previewProfile?.mossAudioTokenizerPath?.trim() || undefined
                : undefined,
          },
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      setHealthStatus({ checked: true, ok: data.ok === true, message: data.message });
    } catch (e) {
      setHealthStatus({
        checked: true,
        ok: false,
        message: `连接失败: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }, [previewModelKey, previewProfile]);

  const handleRun = async () => {
    if (!text.trim()) {
      message.warning('请输入文本');
      return;
    }
    setLoading(true);
    setAudioUrl(null);
    try {
      const res = await fetch(`${AI_SERVICE_BASE}/api/v1/tts/${restSegment}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), speed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        message.error((err as { error?: string }).error || `HTTP ${res.status}`);
        return;
      }
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
      message.success('合成完成');
    } catch (e) {
      message.error(`请求失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <Title level={4} style={{ marginTop: 0 }}>
        本地 TTS 预览
      </Title>
      <Paragraph type="secondary">
        直接 HTTP 调用 AI 服务 <code>{AI_SERVICE_BASE}</code>。需先在
        <a href="/settings" style={{ margin: '0 4px' }}>设置 &gt; 本地TTS</a> 中为对应模型填写目录并启用。
      </Paragraph>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>预览模型</Text>
            <Segmented
              block
              value={previewModelKey}
              onChange={(v) => {
                setPreviewModelKey(v as string);
                setHealthStatus({ checked: false, ok: false });
              }}
              options={LOCAL_TTS_MODEL_OPTIONS.map((m) => ({
                value: m.key,
                label: localTtsProfileIsSaved(localTts, m.key) ? `✅ ${m.label}` : m.label,
              }))}
            />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
              {LOCAL_TTS_MODEL_OPTIONS.find((m) => m.key === previewModelKey)?.description}
            </Text>
          </div>
        </Space>
      </Card>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Flex justify="space-between" align="center" wrap gap={8}>
          <Space>
            <Text strong>状态：</Text>
            {configOk ? <Tag color="green">已配置</Tag> : <Tag color="red">未配置</Tag>}
            {configOk && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {previewModelKey} | {previewProfile?.modelPath}
              </Text>
            )}
          </Space>
          <Button size="small" onClick={checkHealth}>健康检查</Button>
        </Flex>
        {healthStatus.checked && (
          <div style={{ marginTop: 8 }}>
            <Tag color={healthStatus.ok ? 'green' : 'red'}>
              {healthStatus.ok ? '服务就绪' : '服务异常'}
            </Tag>
            {healthStatus.message && (
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{healthStatus.message}</Text>
            )}
          </div>
        )}
      </Card>

      <Card size="small" title={`合成参数（${LOCAL_TTS_MODEL_OPTIONS.find((m) => m.key === previewModelKey)?.label ?? previewModelKey}）`} style={{ marginBottom: 16 }}>
        <Space orientation="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>文本</Text>
            <Input.TextArea
              rows={previewModelKey === 'moss_tts' ? 16 : 8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                previewModelKey === 'moss_tts'
                  ? 'MOSS：支持 [spk:n][emo:…]、停顿 <#秒#> 等标签（以模型 README 为准）'
                  : 'LongCat：支持 [旁白] [男声] [女声] 等多音色标签'
              }
              maxLength={previewModelKey === 'moss_tts' ? 6000 : 2000}
              showCount
            />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 4 }}>语速: {speed.toFixed(1)}x</Text>
            <Slider min={0.5} max={2.0} step={0.1} value={speed} onChange={setSpeed} style={{ maxWidth: 300 }} />
          </div>
          <Button
            type="primary" icon={<SoundOutlined />} onClick={handleRun}
            loading={loading} disabled={!configOk || !text.trim()} size="large"
          >
            {loading ? '合成中...' : '开始合成'}
          </Button>
        </Space>
      </Card>

      {audioUrl && (
        <Card size="small" title="合成结果">
          <audio controls autoPlay style={{ width: '100%' }} src={audioUrl} />
        </Card>
      )}

      <Divider />
      <Card size="small" title="API">
        <Paragraph type="secondary" style={{ fontSize: 12 }}>
          <code>POST {AI_SERVICE_BASE}/api/v1/tts/{restSegment}</code><br />
          Body: <code>{`{"text": "...", "speed": 1.0}`}</code>
        </Paragraph>
      </Card>
    </div>
  );
}
