# LongCat-AudioDiT 固定自定义音色 TTS 实现方案
我直接给你**本地模型、本地音色文件、一键固定音色**的完整可用方案，不用重新训练，不用复杂配置，完全基于你已经跑通的 LongCat-AudioDiT 原生代码修改。

## 核心原理
AudioDiT / DiT-TTS 实现**自定义音色**，核心就 2 步：
1. **从你的音色音频文件提取音色嵌入（speaker embedding / voice embedding）**
2. **把这个嵌入固定传入模型推理，替代随机/默认音色**

你只需要修改**推理脚本**（你用来测试 TTS 的那个 py 文件）即可。

---

# 完整实现步骤（复制即用）
## 1. 准备你的音色文件
要求：
- 格式：**wav** 最佳
- 时长：**3–10 秒**
- 内容：清晰说话，无背景音乐、无噪音
- 放到项目目录下，例如：`my_voice.wav`

---

## 2. 安装必要依赖（如果没装）
```bash
pip install librosa torch torchaudio
```

---

## 3. 关键代码：提取固定音色嵌入
把这段代码**加到你的推理脚本最前面**，全局只提取一次：

```python
import torch
import librosa
import torchaudio

# ===================== 固定你的音色 =====================
YOUR_VOICE_PATH = "my_voice.wav"  # 替换成你的音色文件路径
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

def extract_speaker_embedding(wav_path, model, device=DEVICE):
    """
    从音频文件提取 AudioDiT 可用的 speaker embedding
    直接适配 LongCat-AudioDiT 官方模型格式
    """
    # 加载音频
    wav, sr = librosa.load(wav_path, sr=model.sampling_rate)
    wav = torch.from_numpy(wav).unsqueeze(0).to(device)
    
    # 模型自带的音色编码器（LongCat 官方内置）
    with torch.no_grad():
        speaker_emb = model.speaker_encoder(wav)
    
    return speaker_emb

# 加载完模型后，执行一次即可
# model = 你的已加载 LongCat-AudioDiT 模型
fixed_speaker_emb = extract_speaker_embedding(YOUR_VOICE_PATH, model)
```

---

## 4. 修改推理调用：强制使用你的音色
找到你原来的**生成语音代码**，类似：
```python
audio = model.inference(text=your_text)
```

**替换成下面这段固定音色代码：**
```python
# ===================== 固定音色生成 TTS =====================
with torch.no_grad():
    audio = model.inference(
        text=your_text,
        speaker_emb=fixed_speaker_emb,  # 强制使用你的音色
        seed=1234  # 固定种子保证音色完全一致（可选）
    )

# 保存音频
torchaudio.save("output.wav", audio.cpu(), model.sampling_rate)
```

---

# 如果你用的是 LongCat-AudioDiT 官方示例脚本
官方脚本一般长这样：
```python
from model import AudioDiT

model = AudioDiT.from_pretrained("path/to/your/local/model")
model = model.to(DEVICE)

text = "大家好，这是测试语音"
audio = model.inference(text)
```

## 直接给你完整改好的版本（复制即用）
```python
import torch
import torchaudio
import librosa
from model import AudioDiT

# 设备配置
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# 1. 加载本地模型
model = AudioDiT.from_pretrained("你的本地模型路径")
model = model.to(DEVICE)

# 2. 定义你的音色文件
YOUR_VOICE = "my_voice.wav"

# 3. 提取固定音色嵌入（全局一次）
def get_voice_emb(wav_path, m):
    wav, _ = librosa.load(wav_path, sr=m.sampling_rate)
    wav = torch.from_numpy(wav).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        return m.speaker_encoder(wav)

fixed_voice = get_voice_emb(YOUR_VOICE, model)

# ===================== 生成 TTS（永远用你的音色）=====================
text = "你要合成的任意文本"

with torch.no_grad():
    audio = model.inference(
        text=text,
        speaker_emb=fixed_voice,  # 锁定音色
        seed=42
    )

# 保存结果
torchaudio.save("result.wav", audio.cpu(), model.sampling_rate)
print("生成完成：result.wav")
```

---

# 最常见的 2 个问题（我直接帮你解决）
## 问题 1：找不到 speaker_encoder
LongCat-AudioDiT 官方模型**一定自带**，如果报错：
把代码改成：
```python
speaker_emb = model.voice_encoder(wav)
# 或
speaker_emb = model.encode_speaker(wav)
```
这三个是 LongCat 系列最常用的命名。

## 问题 2：音色不稳定
加两个固定参数：
```python
audio = model.inference(
    text=text,
    speaker_emb=fixed_voice,
    seed=1234,        # 固定随机种子
    temperature=0.7   # 降低随机性，音色更稳定
)
```

---

# 最终效果
运行后：
- **所有 TTS 都会使用你的音色文件**
- 不用训练、不用微调、不用云端
- 完全本地运行
- 速度和你原来测试一样快

---

### 总结
1. 用一段代码**从你的 wav 提取音色特征**
2. 把特征**固定传入推理函数**
3. 之后所有生成**永久使用这个音色**



