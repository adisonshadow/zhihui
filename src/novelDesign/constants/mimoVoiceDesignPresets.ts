/**
 * MiMo VoiceDesign：常用音色一键填入、试听文本预设（每项 ≤100 字）
 * 编写约束见 docs/AI-demo/MiMo-V2.5-TTS.md
 */

export interface MimoVoiceDesignPresetRow {
  key: string;
  label: string;
  /** 供「音色描述」：身份锚点 + 质感 + 节奏 + 情绪底色，一两句白描 */
  description: string;
}

export const MIMO_VOICE_DESIGN_PRESETS: MimoVoiceDesignPresetRow[] = [
  
  {
    key: 'girl-youth',
    label: '活波少女',
    description:
      '十六至十八岁国语女声，清甜略带青涩，咬字干净利落，语速略快，像在和朋友分享秘密，底色是雀跃与羞涩。',
  },
  {
    key: 'sweet-girl',
    label: '元气甜妹',
    description:
      '清甜软嫩少女音，语调轻快软糯，日常对话感强，活泼自然，不刻意做作',
  },
  
  {
    key: 'intellectual-female',
    label: '知性女声',
    description:
      '三十岁左右国语女性，声带偏薄但共鸣清晰稳重，语速均匀偏慢半拍，像在讲座里耐心拆解概念，底色是沉静与可信度。',
  },
  {
    key: 'cold-girl',
    label: '冷感御姐',
    description:
      '冷感女性知性中音，声线干练利落，语调冷静平稳，语感独立疏离，职场精英质感，不软不嗲',
  },
  {
    key: 'white-moon',
    label: '清冷白月光',
    description:
      '清冷细腻女中音，声线偏薄干净，语调平淡克制，疏离安静，气质易碎高级',
  },
  {
    key: 'sassy-girl',
    label: '飒爽女主',
    description:
      '利落飒爽女音，语速干脆，语调果决，气场强，独立果敢，不柔弱',
  },
  {
    key: 'soft-girl',
    label: '软萌乖乖女',
    description:
      '软糯柔和轻女音，声线偏细，语气轻柔乖巧，说话轻声慢语，温顺感强',
  },
  {
    key: 'cute-girl',
    label: '娇俏灵动小师妹',
    description:
      '轻快灵动少女音，音色清亮，语调活泼俏皮，叽叽喳喳，元气娇俏',
  },
  {
    key: 'innocent-girl',
    label: '懵懂单纯小师妹',
    description:
      '软嫩懵懂少女音，声线柔和，语气迟疑温顺，有点慢热、怯生生',
  },
  {
    key: 'sexy-girl',
    label: '风情御姐',
    description:
      '成熟妩媚中音，声线饱满，语调慵懒优雅，风情有度，成熟女人质感',
  },
  {
    key: 'stubborn-girl',
    label: '倔强女主',
    description:
      '清亮倔强女音，音色明亮，语调坚定，情绪直接，有韧劲不软弱',
  },
  {
    key: 'kaz-girl',
    label: '夹子',
    description:
      '年轻少女声线，音调偏高，声线细软偏尖，带自然轻微夹子感，轻鼻音，咬字偏软；语调轻柔上扬、尾音微微拖长，娇甜软糯，语气天真无辜，不尖锐刺耳，适合小师妹、甜妹、娇俏型角色对白',
  },
  {
    key: 'loli-girl',
    label: '萝莉',
    description:
      '清脆稚嫩少女音，声线细软偏高，气息轻柔，语调软糯天真，语速轻快，咬字偏软，干净清甜无厚重鼻音，适合乖巧萝莉、年幼小师妹、软萌配角',
  },
  {
    key: 'girl-child',
    label: '奶萌女童',
    description:
      '6岁女童，奶气十足，声线偏软，略带一点鼻音，稚嫩可爱，语速缓慢轻柔，适合哄睡、儿童读物、撒娇语气',
  },
  // {
  //   key: 'doubao',
  //   label: '豆包',
  //   description:
  //     '青年知性柔和女中音，声线温润通透，吐字标准清晰，语调平稳舒缓，语感自然松弛，无尖锐鼻音，情绪克制温和，日常对话感强，适合旁白、温柔女主、知性白领、温婉师姐',
  // },
  // {
  //   key: 'qianwen',
  //   label: '千问',
  //   description:
  //     '清甜细腻青年女音，声线细软柔和，音调适中偏高，语感轻快自然，尾音轻柔，干净不做作，带轻微软甜质感，适合甜妹、小师妹、都市女主、娇俏角色',
  // },



  {
    key: 'elite-male',
    label: '霸总',
    description:
      '声线偏低沉磁性，青年质感，语速利落沉稳，中音干净有底气，语感冷静克制，带轻微成熟疏离感，情绪起伏克制，适合职场、霸总、精英、都市男主对白。',
  },

  {
    key: 'raspy-uncle',
    label: '烟嗓大叔',
    description:
      '四十岁左右国语男性，沙哑低音区略厚烟感，语速偏慢句句落稳，吐字含糊处带懒意的余韵，底色是疏离与漫不经心的笃定。',
  },
  {
    key: 'sunny-boy',
    label: '阳光男孩',
    description:
      '二十岁左右国语男声，音色明亮清透，清爽明亮青年音，声线干净有活力，语速轻快干脆，语气阳光自信，少年感强',
  },
  {
    key: 'xiake-man',
    label: '侠客',
    description:
      '中年男性，武侠小说侠客风，声音洪亮豪爽，带爽朗笑声与江湖气息，语速自然有停顿',
  },
  {
    key: 'gentle-ceo',
    label: '温柔总裁',
    description:
      '温润醇厚青年男声，声线干净柔和，语速舒缓，语气克制温柔，成熟稳重，亲和力强',
  },


  {
    key: 'broadcast-male',
    label: '男主播',
    description:
      '成熟温润沉稳的有声书主播声线，吐字清晰流畅，叙事感强，语速平稳舒缓，人声干净耐听，标准专业说书旁白嗓音。',
  },
  {
    key: 'broadcast-male2',
    label: '成熟男主播',
    description:
      '三十五岁上下国语男性，宽厚胸腔共鸣，语速标准偏稳，起承转合干净利落，像在新闻评述里提纲挈领，底色是威严与分寸感。',
  },
  {
    key: 'broadcast-female',
    label: '温柔女主播',
    description:
      '温柔知性女声，声线柔和干净，语调舒缓平和，叙事清晰温柔，亲和力强，适合种田、年代、言情类小说播讲，听感治愈舒服',
  },
  {
    key: 'broadcast-dahuilang',
    label: '霸总男播',
    description:
      '低沉磁性烟嗓，青年偏成熟质感，中音饱满厚重，咬字利落干脆，自带压迫感与精英气场；语速适中偏稳，情绪克制不浮夸，冷感与温柔切换自然，典型都市霸总、大佬、强势男主声线',
  },
  {
    key: 'broadcast-yetingfeng',
    label: '言情男播',
    description:
      '温润醇厚青年音，声线干净不闷，语感儒雅松弛，叙事感极强；温柔又有力量，适合都市暖男、精英男主、全书旁白，长时间收听耐听舒服',
  },
  {
    key: 'broadcast-shuangwen-male',
    label: '爽文男播',
    description:
      '清亮利落青年男声，声线通透有爆发力，节奏紧凑干脆，语气干练果决，偏阳光强势，适合逆袭男主、创业大佬、热血都市男主',
  },
  {
    key: 'broadcast-mochen',
    label: '大佬男播',
    description:
      '低沉浑厚大叔音，低音质感强，语速平缓沉稳，自带阅历感，适合中年大佬、总裁长辈、都市权谋类角色。',
  },
  {
    key: 'broadcast-wanzi',
    label: '甜宠女播',
    description:
      '清甜软糯青年女音，声线明亮柔和不尖锐，语调轻快自然，日常对话感极强，软萌不做作，适配都市甜妹、普通白领、温柔女主',
  },
  {
    key: 'broadcast-yuntianhe',
    label: '御姐女播',
    description:
      '冷感知性中音，声线利落高级，语感干练疏离，语速平稳冷静，自带职场精英气场，适合御姐女主、女总裁、独立女强人',
  },
  {
    key: 'broadcast-daixiaojiu',
    label: '言情女播',
    description:
      '温柔知性柔和女音，声线温润通透，叙事清晰舒缓，亲和力强，可甜可飒，适配都市日常、婚恋文、家庭向女主',
  },
];

export interface MimoVoiceDesignPreviewSnippet {
  key: string;
  label: string;
  /** 试听朗读文本（≤100 字）；勿写括号动作描写，仅用口语内容 */
  text: string;
}

export const MIMO_VOICE_DESIGN_PREVIEW_SNIPPETS: MimoVoiceDesignPreviewSnippet[] = [
  {
    key: 'confession',
    label: '表白',
    text:
      '其实我犹豫了很久才敢开口——和你在一起的每一秒，我都觉得像在发光。你不用马上回答我，但我想让你知道：你是我认真想过以后要一起走的人。',
  },
  {
    key: 'thriller',
    label: '惊悚',
    text: '别出声。你听，门外有脚步声停了。灯还在闪，别把背对着那条缝——它刚刚自己开了一条细细的线。',
  },
  {
    key: 'poem-moon',
    label: '朗诵《明月几时有》',
    text: '[缓缓吐字]明月几时有，[语速稍提]把酒问青天。[稍有疑惑]不知天上宫阙，[缓缓吐字]今夕是何年。[声音增大，语速加快]我欲乘风归去，[骤然收势，轻叹喘息]又恐琼楼玉宇，[缓缓沉音]高处不胜寒。',
  },
  {
    key: 'bargain',
    label: '砍价',
    text: '老板你看看这成色，再给抹个零行不行？我真的是诚心要，但今天预算就卡在那一百块上头，行不行您一句话。',
  },
  {
    key: 'conversation',
    label: '日常对话',
    text: '今天天气真不错，适合出去走走。你呢，有什么计划吗？我昨天刚看完那本小说，结局有点出乎意料。你最近在追哪个剧？我推荐你看看那个新出的悬疑片，剧情很烧脑。',
  },
  {
    key: 'sing-haidi',
    label: '唱歌《我是一只小小鸟》',
    text: '大家好，我给大家唱首歌，（唱歌）我是一只小小小小鸟，想要飞呀飞，却飞也飞不高，我寻寻觅觅，寻寻觅觅一个温暖的怀抱',
  },
  {
    key: 'chaos-man',
    label: '语无伦次',
    text: '（语无伦次）我我我不是那个意思，我就是、就是有点没想好……（惊呼）不是？？？你在逗我呢兄弟！！！你说你搞了这么久，结果就这？？？？？？',
  },
];
