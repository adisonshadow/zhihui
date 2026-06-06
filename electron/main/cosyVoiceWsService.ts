/**
 * CosyVoice WebSocket 合成（Electron 主进程）
 * wss://dashscope.aliyuncs.com/api-ws/v1/inference
 */
import WebSocket from 'ws';
import crypto from 'node:crypto';

const WS_URL_CN = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';

export interface CosyVoiceSynthInput {
  apiKey: string;
  model: string;
  voiceId: string;
  text: string;
  format?: 'mp3' | 'wav' | 'pcm';
  sampleRate?: number;
}

function waitForEvent(
  ws: WebSocket,
  eventName: string,
  taskId: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`CosyVoice 等待 ${eventName} 超时`));
    }, timeoutMs);

    const onMessage = (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) return;
      try {
        const msg = JSON.parse(data.toString()) as {
          header?: { event?: string; task_id?: string; error_message?: string };
        };
        if (msg.header?.task_id !== taskId) return;
        if (msg.header?.event === eventName) {
          cleanup();
          resolve();
        } else if (msg.header?.event === 'task-failed') {
          cleanup();
          reject(new Error(msg.header?.error_message || 'CosyVoice task-failed'));
        }
      } catch {
        /* ignore parse errors */
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
    };

    ws.on('message', onMessage);
  });
}

export async function synthesizeCosyVoiceWs(
  input: CosyVoiceSynthInput,
): Promise<{ ok: true; audio: Buffer; format: string } | { ok: false; error: string }> {
  const apiKey = input.apiKey.trim();
  const text = input.text.trim();
  const voice = input.voiceId.trim();
  const model = input.model.trim();
  if (!apiKey) return { ok: false, error: '缺少 DashScope API Key' };
  if (!text) return { ok: false, error: '文本为空' };
  if (!voice) return { ok: false, error: '缺少 voice_id' };
  if (!model) return { ok: false, error: '缺少 model' };

  const taskId = crypto.randomUUID();
  const fmt = input.format ?? 'mp3';
  const sampleRate = input.sampleRate ?? 22050;
  const audioChunks: Buffer[] = [];

  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL_CN, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    let settled = false;
    const finish = (result: { ok: true; audio: Buffer; format: string } | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    const failTimer = setTimeout(() => {
      finish({ ok: false, error: 'CosyVoice WebSocket 合成超时' });
    }, 120_000);

    ws.on('error', (err) => {
      clearTimeout(failTimer);
      finish({ ok: false, error: err.message });
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        audioChunks.push(Buffer.from(data as Buffer));
        return;
      }
      try {
        const msg = JSON.parse(data.toString()) as {
          header?: { event?: string; task_id?: string; error_message?: string };
        };
        if (msg.header?.task_id !== taskId) return;
        if (msg.header?.event === 'task-failed') {
          clearTimeout(failTimer);
          finish({ ok: false, error: msg.header?.error_message || 'CosyVoice task-failed' });
        } else if (msg.header?.event === 'task-finished') {
          clearTimeout(failTimer);
          finish({ ok: true, audio: Buffer.concat(audioChunks), format: fmt });
        }
      } catch {
        /* ignore */
      }
    });

    ws.on('open', async () => {
      try {
        const runTask = {
          header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model,
            parameters: {
              text_type: 'PlainText',
              voice,
              format: fmt,
              sample_rate: sampleRate,
              volume: 50,
              rate: 1,
              pitch: 1,
            },
            input: {},
          },
        };
        ws.send(JSON.stringify(runTask));
        await waitForEvent(ws, 'task-started', taskId, 30_000);

        const continueTask = {
          header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
          payload: { input: { text } },
        };
        ws.send(JSON.stringify(continueTask));

        const finishTask = {
          header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
          payload: { input: {} },
        };
        ws.send(JSON.stringify(finishTask));
      } catch (e) {
        clearTimeout(failTimer);
        finish({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
  });
}
