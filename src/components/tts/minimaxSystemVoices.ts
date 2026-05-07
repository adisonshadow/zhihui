/**
 * MiniMax 开放平台系统音色（与官方文档一致，便于 TTS 下拉与校验）
 * 文档：https://platform.minimaxi.com/docs/faq/system-voice-id
 */
export interface MinimaxSystemVoice {
  voiceId: string;
  lang: string;
  name: string;
}

export const MINIMAX_SYSTEM_VOICES: MinimaxSystemVoice[] = [
  {
    "voiceId": "male-qn-qingse",
    "lang": "中文 (普通话)",
    "name": "青涩青年音色"
  },
  {
    "voiceId": "male-qn-jingying",
    "lang": "中文 (普通话)",
    "name": "精英青年音色"
  },
  {
    "voiceId": "male-qn-badao",
    "lang": "中文 (普通话)",
    "name": "霸道青年音色"
  },
  {
    "voiceId": "male-qn-daxuesheng",
    "lang": "中文 (普通话)",
    "name": "青年大学生音色"
  },
  {
    "voiceId": "female-shaonv",
    "lang": "中文 (普通话)",
    "name": "少女音色"
  },
  {
    "voiceId": "female-yujie",
    "lang": "中文 (普通话)",
    "name": "御姐音色"
  },
  {
    "voiceId": "female-chengshu",
    "lang": "中文 (普通话)",
    "name": "成熟女性音色"
  },
  {
    "voiceId": "female-tianmei",
    "lang": "中文 (普通话)",
    "name": "甜美女性音色"
  },
  {
    "voiceId": "male-qn-qingse-jingpin",
    "lang": "中文 (普通话)",
    "name": "青涩青年音色-beta"
  },
  {
    "voiceId": "male-qn-jingying-jingpin",
    "lang": "中文 (普通话)",
    "name": "精英青年音色-beta"
  },
  {
    "voiceId": "male-qn-badao-jingpin",
    "lang": "中文 (普通话)",
    "name": "霸道青年音色-beta"
  },
  {
    "voiceId": "male-qn-daxuesheng-jingpin",
    "lang": "中文 (普通话)",
    "name": "青年大学生音色-beta"
  },
  {
    "voiceId": "female-shaonv-jingpin",
    "lang": "中文 (普通话)",
    "name": "少女音色-beta"
  },
  {
    "voiceId": "female-yujie-jingpin",
    "lang": "中文 (普通话)",
    "name": "御姐音色-beta"
  },
  {
    "voiceId": "female-chengshu-jingpin",
    "lang": "中文 (普通话)",
    "name": "成熟女性音色-beta"
  },
  {
    "voiceId": "female-tianmei-jingpin",
    "lang": "中文 (普通话)",
    "name": "甜美女性音色-beta"
  },
  {
    "voiceId": "clever_boy",
    "lang": "中文 (普通话)",
    "name": "聪明男童"
  },
  {
    "voiceId": "cute_boy",
    "lang": "中文 (普通话)",
    "name": "可爱男童"
  },
  {
    "voiceId": "lovely_girl",
    "lang": "中文 (普通话)",
    "name": "萌萌女童"
  },
  {
    "voiceId": "cartoon_pig",
    "lang": "中文 (普通话)",
    "name": "卡通猪小琪"
  },
  {
    "voiceId": "bingjiao_didi",
    "lang": "中文 (普通话)",
    "name": "病娇弟弟"
  },
  {
    "voiceId": "junlang_nanyou",
    "lang": "中文 (普通话)",
    "name": "俊朗男友"
  },
  {
    "voiceId": "chunzhen_xuedi",
    "lang": "中文 (普通话)",
    "name": "纯真学弟"
  },
  {
    "voiceId": "lengdan_xiongzhang",
    "lang": "中文 (普通话)",
    "name": "冷淡学长"
  },
  {
    "voiceId": "badao_shaoye",
    "lang": "中文 (普通话)",
    "name": "霸道少爷"
  },
  {
    "voiceId": "tianxin_xiaoling",
    "lang": "中文 (普通话)",
    "name": "甜心小玲"
  },
  {
    "voiceId": "qiaopi_mengmei",
    "lang": "中文 (普通话)",
    "name": "俏皮萌妹"
  },
  {
    "voiceId": "wumei_yujie",
    "lang": "中文 (普通话)",
    "name": "妩媚御姐"
  },
  {
    "voiceId": "diadia_xuemei",
    "lang": "中文 (普通话)",
    "name": "嗲嗲学妹"
  },
  {
    "voiceId": "danya_xuejie",
    "lang": "中文 (普通话)",
    "name": "淡雅学姐"
  },
  {
    "voiceId": "Chinese (Mandarin)_Reliable_Executive",
    "lang": "中文 (普通话)",
    "name": "沉稳高管"
  },
  {
    "voiceId": "Chinese (Mandarin)_News_Anchor",
    "lang": "中文 (普通话)",
    "name": "新闻女声"
  },
  {
    "voiceId": "Chinese (Mandarin)_Mature_Woman",
    "lang": "中文 (普通话)",
    "name": "傲娇御姐"
  },
  {
    "voiceId": "Chinese (Mandarin)_Unrestrained_Young_Man",
    "lang": "中文 (普通话)",
    "name": "不羁青年"
  },
  {
    "voiceId": "Arrogant_Miss",
    "lang": "中文 (普通话)",
    "name": "嚣张小姐"
  },
  {
    "voiceId": "Robot_Armor",
    "lang": "中文 (普通话)",
    "name": "机械战甲"
  },
  {
    "voiceId": "Chinese (Mandarin)_Kind-hearted_Antie",
    "lang": "中文 (普通话)",
    "name": "热心大婶"
  },
  {
    "voiceId": "Chinese (Mandarin)_HK_Flight_Attendant",
    "lang": "中文 (普通话)",
    "name": "港普空姐"
  },
  {
    "voiceId": "Chinese (Mandarin)_Humorous_Elder",
    "lang": "中文 (普通话)",
    "name": "搞笑大爷"
  },
  {
    "voiceId": "Chinese (Mandarin)_Gentleman",
    "lang": "中文 (普通话)",
    "name": "温润男声"
  },
  {
    "voiceId": "Chinese (Mandarin)_Warm_Bestie",
    "lang": "中文 (普通话)",
    "name": "温暖闺蜜"
  },
  {
    "voiceId": "Chinese (Mandarin)_Male_Announcer",
    "lang": "中文 (普通话)",
    "name": "播报男声"
  },
  {
    "voiceId": "Chinese (Mandarin)_Sweet_Lady",
    "lang": "中文 (普通话)",
    "name": "甜美女声"
  },
  {
    "voiceId": "Chinese (Mandarin)_Southern_Young_Man",
    "lang": "中文 (普通话)",
    "name": "南方小哥"
  },
  {
    "voiceId": "Chinese (Mandarin)_Wise_Women",
    "lang": "中文 (普通话)",
    "name": "阅历姐姐"
  },
  {
    "voiceId": "Chinese (Mandarin)_Gentle_Youth",
    "lang": "中文 (普通话)",
    "name": "温润青年"
  },
  {
    "voiceId": "Chinese (Mandarin)_Warm_Girl",
    "lang": "中文 (普通话)",
    "name": "温暖少女"
  },
  {
    "voiceId": "Chinese (Mandarin)_Kind-hearted_Elder",
    "lang": "中文 (普通话)",
    "name": "花甲奶奶"
  },
  {
    "voiceId": "Chinese (Mandarin)_Cute_Spirit",
    "lang": "中文 (普通话)",
    "name": "憨憨萌兽"
  },
  {
    "voiceId": "Chinese (Mandarin)_Radio_Host",
    "lang": "中文 (普通话)",
    "name": "电台男主播"
  },
  {
    "voiceId": "Chinese (Mandarin)_Lyrical_Voice",
    "lang": "中文 (普通话)",
    "name": "抒情男声"
  },
  {
    "voiceId": "Chinese (Mandarin)_Straightforward_Boy",
    "lang": "中文 (普通话)",
    "name": "率真弟弟"
  },
  {
    "voiceId": "Chinese (Mandarin)_Sincere_Adult",
    "lang": "中文 (普通话)",
    "name": "真诚青年"
  },
  {
    "voiceId": "Chinese (Mandarin)_Gentle_Senior",
    "lang": "中文 (普通话)",
    "name": "温柔学姐"
  },
  {
    "voiceId": "Chinese (Mandarin)_Stubborn_Friend",
    "lang": "中文 (普通话)",
    "name": "嘴硬竹马"
  },
  {
    "voiceId": "Chinese (Mandarin)_Crisp_Girl",
    "lang": "中文 (普通话)",
    "name": "清脆少女"
  },
  {
    "voiceId": "Chinese (Mandarin)_Pure-hearted_Boy",
    "lang": "中文 (普通话)",
    "name": "清澈邻家弟弟"
  },
  {
    "voiceId": "Chinese (Mandarin)_Soft_Girl",
    "lang": "中文 (普通话)",
    "name": "柔和少女"
  },
  {
    "voiceId": "Cantonese_ProfessionalHost（F)",
    "lang": "中文 (粤语)",
    "name": "专业女主持"
  },
  {
    "voiceId": "Cantonese_GentleLady",
    "lang": "中文 (粤语)",
    "name": "温柔女声"
  },
  {
    "voiceId": "Cantonese_ProfessionalHost（M)",
    "lang": "中文 (粤语)",
    "name": "专业男主持"
  },
  {
    "voiceId": "Cantonese_PlayfulMan",
    "lang": "中文 (粤语)",
    "name": "活泼男声"
  },
  {
    "voiceId": "Cantonese_CuteGirl",
    "lang": "中文 (粤语)",
    "name": "可爱女孩"
  },
  {
    "voiceId": "Cantonese_KindWoman",
    "lang": "中文 (粤语)",
    "name": "善良女声"
  },
  {
    "voiceId": "Santa_Claus",
    "lang": "英文",
    "name": "Santa Claus"
  },
  {
    "voiceId": "Grinch",
    "lang": "英文",
    "name": "Grinch"
  },
  {
    "voiceId": "Rudolph",
    "lang": "英文",
    "name": "Rudolph"
  },
  {
    "voiceId": "Arnold",
    "lang": "英文",
    "name": "Arnold"
  },
  {
    "voiceId": "Charming_Santa",
    "lang": "英文",
    "name": "Charming Santa"
  },
  {
    "voiceId": "Charming_Lady",
    "lang": "英文",
    "name": "Charming Lady"
  },
  {
    "voiceId": "Sweet_Girl",
    "lang": "英文",
    "name": "Sweet Girl"
  },
  {
    "voiceId": "Cute_Elf",
    "lang": "英文",
    "name": "Cute Elf"
  },
  {
    "voiceId": "Attractive_Girl",
    "lang": "英文",
    "name": "Attractive Girl"
  },
  {
    "voiceId": "Serene_Woman",
    "lang": "英文",
    "name": "Serene Woman"
  },
  {
    "voiceId": "English_Trustworthy_Man",
    "lang": "英文",
    "name": "Trustworthy Man"
  },
  {
    "voiceId": "English_Graceful_Lady",
    "lang": "英文",
    "name": "Graceful Lady"
  },
  {
    "voiceId": "English_Aussie_Bloke",
    "lang": "英文",
    "name": "Aussie Bloke"
  },
  {
    "voiceId": "English_Whispering_girl",
    "lang": "英文",
    "name": "Whispering girl"
  },
  {
    "voiceId": "English_Diligent_Man",
    "lang": "英文",
    "name": "Diligent Man"
  },
  {
    "voiceId": "English_Gentle-voiced_man",
    "lang": "英文",
    "name": "Gentle-voiced man"
  },
  {
    "voiceId": "Japanese_IntellectualSenior",
    "lang": "日文",
    "name": "Intellectual Senior"
  },
  {
    "voiceId": "Japanese_DecisivePrincess",
    "lang": "日文",
    "name": "Decisive Princess"
  },
  {
    "voiceId": "Japanese_LoyalKnight",
    "lang": "日文",
    "name": "Loyal Knight"
  },
  {
    "voiceId": "Japanese_DominantMan",
    "lang": "日文",
    "name": "Dominant Man"
  },
  {
    "voiceId": "Japanese_SeriousCommander",
    "lang": "日文",
    "name": "Serious Commander"
  },
  {
    "voiceId": "Japanese_ColdQueen",
    "lang": "日文",
    "name": "Cold Queen"
  },
  {
    "voiceId": "Japanese_DependableWoman",
    "lang": "日文",
    "name": "Dependable Woman"
  },
  {
    "voiceId": "Japanese_GentleButler",
    "lang": "日文",
    "name": "Gentle Butler"
  },
  {
    "voiceId": "Japanese_KindLady",
    "lang": "日文",
    "name": "Kind Lady"
  },
  {
    "voiceId": "Japanese_CalmLady",
    "lang": "日文",
    "name": "Calm Lady"
  },
  {
    "voiceId": "Japanese_OptimisticYouth",
    "lang": "日文",
    "name": "Optimistic Youth"
  },
  {
    "voiceId": "Japanese_GenerousIzakayaOwner",
    "lang": "日文",
    "name": "Generous Izakaya Owner"
  },
  {
    "voiceId": "Japanese_SportyStudent",
    "lang": "日文",
    "name": "Sporty Student"
  },
  {
    "voiceId": "Japanese_InnocentBoy",
    "lang": "日文",
    "name": "Innocent Boy"
  },
  {
    "voiceId": "Japanese_GracefulMaiden",
    "lang": "日文",
    "name": "Graceful Maiden"
  },
  {
    "voiceId": "Korean_SweetGirl",
    "lang": "韩文",
    "name": "Sweet Girl"
  },
  {
    "voiceId": "Korean_CheerfulBoyfriend",
    "lang": "韩文",
    "name": "Cheerful Boyfriend"
  },
  {
    "voiceId": "Korean_EnchantingSister",
    "lang": "韩文",
    "name": "Enchanting Sister"
  },
  {
    "voiceId": "Korean_ShyGirl",
    "lang": "韩文",
    "name": "Shy Girl"
  },
  {
    "voiceId": "Korean_ReliableSister",
    "lang": "韩文",
    "name": "Reliable Sister"
  },
  {
    "voiceId": "Korean_StrictBoss",
    "lang": "韩文",
    "name": "Strict Boss"
  },
  {
    "voiceId": "Korean_SassyGirl",
    "lang": "韩文",
    "name": "Sassy Girl"
  },
  {
    "voiceId": "Korean_ChildhoodFriendGirl",
    "lang": "韩文",
    "name": "Childhood Friend Girl"
  },
  {
    "voiceId": "Korean_PlayboyCharmer",
    "lang": "韩文",
    "name": "Playboy Charmer"
  },
  {
    "voiceId": "Korean_ElegantPrincess",
    "lang": "韩文",
    "name": "Elegant Princess"
  },
  {
    "voiceId": "Korean_BraveFemaleWarrior",
    "lang": "韩文",
    "name": "Brave Female Warrior"
  },
  {
    "voiceId": "Korean_BraveYouth",
    "lang": "韩文",
    "name": "Brave Youth"
  },
  {
    "voiceId": "Korean_CalmLady",
    "lang": "韩文",
    "name": "Calm Lady"
  },
  {
    "voiceId": "Korean_EnthusiasticTeen",
    "lang": "韩文",
    "name": "Enthusiastic Teen"
  },
  {
    "voiceId": "Korean_SoothingLady",
    "lang": "韩文",
    "name": "Soothing Lady"
  },
  {
    "voiceId": "Korean_IntellectualSenior",
    "lang": "韩文",
    "name": "Intellectual Senior"
  },
  {
    "voiceId": "Korean_LonelyWarrior",
    "lang": "韩文",
    "name": "Lonely Warrior"
  },
  {
    "voiceId": "Korean_MatureLady",
    "lang": "韩文",
    "name": "Mature Lady"
  },
  {
    "voiceId": "Korean_InnocentBoy",
    "lang": "韩文",
    "name": "Innocent Boy"
  },
  {
    "voiceId": "Korean_CharmingSister",
    "lang": "韩文",
    "name": "Charming Sister"
  },
  {
    "voiceId": "Korean_AthleticStudent",
    "lang": "韩文",
    "name": "Athletic Student"
  },
  {
    "voiceId": "Korean_BraveAdventurer",
    "lang": "韩文",
    "name": "Brave Adventurer"
  },
  {
    "voiceId": "Korean_CalmGentleman",
    "lang": "韩文",
    "name": "Calm Gentleman"
  },
  {
    "voiceId": "Korean_WiseElf",
    "lang": "韩文",
    "name": "Wise Elf"
  },
  {
    "voiceId": "Korean_CheerfulCoolJunior",
    "lang": "韩文",
    "name": "Cheerful Cool Junior"
  },
  {
    "voiceId": "Korean_DecisiveQueen",
    "lang": "韩文",
    "name": "Decisive Queen"
  },
  {
    "voiceId": "Korean_ColdYoungMan",
    "lang": "韩文",
    "name": "Cold Young Man"
  },
  {
    "voiceId": "Korean_MysteriousGirl",
    "lang": "韩文",
    "name": "Mysterious Girl"
  },
  {
    "voiceId": "Korean_QuirkyGirl",
    "lang": "韩文",
    "name": "Quirky Girl"
  },
  {
    "voiceId": "Korean_ConsiderateSenior",
    "lang": "韩文",
    "name": "Considerate Senior"
  },
  {
    "voiceId": "Korean_CheerfulLittleSister",
    "lang": "韩文",
    "name": "Cheerful Little Sister"
  },
  {
    "voiceId": "Korean_DominantMan",
    "lang": "韩文",
    "name": "Dominant Man"
  },
  {
    "voiceId": "Korean_AirheadedGirl",
    "lang": "韩文",
    "name": "Airheaded Girl"
  },
  {
    "voiceId": "Korean_ReliableYouth",
    "lang": "韩文",
    "name": "Reliable Youth"
  },
  {
    "voiceId": "Korean_FriendlyBigSister",
    "lang": "韩文",
    "name": "Friendly Big Sister"
  },
  {
    "voiceId": "Korean_GentleBoss",
    "lang": "韩文",
    "name": "Gentle Boss"
  },
  {
    "voiceId": "Korean_ColdGirl",
    "lang": "韩文",
    "name": "Cold Girl"
  },
  {
    "voiceId": "Korean_HaughtyLady",
    "lang": "韩文",
    "name": "Haughty Lady"
  },
  {
    "voiceId": "Korean_CharmingElderSister",
    "lang": "韩文",
    "name": "Charming Elder Sister"
  },
  {
    "voiceId": "Korean_IntellectualMan",
    "lang": "韩文",
    "name": "Intellectual Man"
  },
  {
    "voiceId": "Korean_CaringWoman",
    "lang": "韩文",
    "name": "Caring Woman"
  },
  {
    "voiceId": "Korean_WiseTeacher",
    "lang": "韩文",
    "name": "Wise Teacher"
  },
  {
    "voiceId": "Korean_ConfidentBoss",
    "lang": "韩文",
    "name": "Confident Boss"
  },
  {
    "voiceId": "Korean_AthleticGirl",
    "lang": "韩文",
    "name": "Athletic Girl"
  },
  {
    "voiceId": "Korean_PossessiveMan",
    "lang": "韩文",
    "name": "Possessive Man"
  },
  {
    "voiceId": "Korean_GentleWoman",
    "lang": "韩文",
    "name": "Gentle Woman"
  },
  {
    "voiceId": "Korean_CockyGuy",
    "lang": "韩文",
    "name": "Cocky Guy"
  },
  {
    "voiceId": "Korean_ThoughtfulWoman",
    "lang": "韩文",
    "name": "Thoughtful Woman"
  },
  {
    "voiceId": "Korean_OptimisticYouth",
    "lang": "韩文",
    "name": "Optimistic Youth"
  },
  {
    "voiceId": "Spanish_SereneWoman",
    "lang": "西班牙文",
    "name": "Serene Woman"
  },
  {
    "voiceId": "Spanish_MaturePartner",
    "lang": "西班牙文",
    "name": "Mature Partner"
  },
  {
    "voiceId": "Spanish_CaptivatingStoryteller",
    "lang": "西班牙文",
    "name": "Captivating Storyteller"
  },
  {
    "voiceId": "Spanish_Narrator",
    "lang": "西班牙文",
    "name": "Narrator"
  },
  {
    "voiceId": "Spanish_WiseScholar",
    "lang": "西班牙文",
    "name": "Wise Scholar"
  },
  {
    "voiceId": "Spanish_Kind-heartedGirl",
    "lang": "西班牙文",
    "name": "Kind-hearted Girl"
  },
  {
    "voiceId": "Spanish_DeterminedManager",
    "lang": "西班牙文",
    "name": "Determined Manager"
  },
  {
    "voiceId": "Spanish_BossyLeader",
    "lang": "西班牙文",
    "name": "Bossy Leader"
  },
  {
    "voiceId": "Spanish_ReservedYoungMan",
    "lang": "西班牙文",
    "name": "Reserved Young Man"
  },
  {
    "voiceId": "Spanish_ConfidentWoman",
    "lang": "西班牙文",
    "name": "Confident Woman"
  },
  {
    "voiceId": "Spanish_ThoughtfulMan",
    "lang": "西班牙文",
    "name": "Thoughtful Man"
  },
  {
    "voiceId": "Spanish_Strong-WilledBoy",
    "lang": "西班牙文",
    "name": "Strong-willed Boy"
  },
  {
    "voiceId": "Spanish_SophisticatedLady",
    "lang": "西班牙文",
    "name": "Sophisticated Lady"
  },
  {
    "voiceId": "Spanish_RationalMan",
    "lang": "西班牙文",
    "name": "Rational Man"
  },
  {
    "voiceId": "Spanish_AnimeCharacter",
    "lang": "西班牙文",
    "name": "Anime Character"
  },
  {
    "voiceId": "Spanish_Deep-tonedMan",
    "lang": "西班牙文",
    "name": "Deep-toned Man"
  },
  {
    "voiceId": "Spanish_Fussyhostess",
    "lang": "西班牙文",
    "name": "Fussy hostess"
  },
  {
    "voiceId": "Spanish_SincereTeen",
    "lang": "西班牙文",
    "name": "Sincere Teen"
  },
  {
    "voiceId": "Spanish_FrankLady",
    "lang": "西班牙文",
    "name": "Frank Lady"
  },
  {
    "voiceId": "Spanish_Comedian",
    "lang": "西班牙文",
    "name": "Comedian"
  },
  {
    "voiceId": "Spanish_Debator",
    "lang": "西班牙文",
    "name": "Debator"
  },
  {
    "voiceId": "Spanish_ToughBoss",
    "lang": "西班牙文",
    "name": "Tough Boss"
  },
  {
    "voiceId": "Spanish_Wiselady",
    "lang": "西班牙文",
    "name": "Wise Lady"
  },
  {
    "voiceId": "Spanish_Steadymentor",
    "lang": "西班牙文",
    "name": "Steady Mentor"
  },
  {
    "voiceId": "Spanish_Jovialman",
    "lang": "西班牙文",
    "name": "Jovial Man"
  },
  {
    "voiceId": "Spanish_SantaClaus",
    "lang": "西班牙文",
    "name": "Santa Claus"
  },
  {
    "voiceId": "Spanish_Rudolph",
    "lang": "西班牙文",
    "name": "Rudolph"
  },
  {
    "voiceId": "Spanish_Intonategirl",
    "lang": "西班牙文",
    "name": "Intonate Girl"
  },
  {
    "voiceId": "Spanish_Arnold",
    "lang": "西班牙文",
    "name": "Arnold"
  },
  {
    "voiceId": "Spanish_Ghost",
    "lang": "西班牙文",
    "name": "Ghost"
  },
  {
    "voiceId": "Spanish_HumorousElder",
    "lang": "西班牙文",
    "name": "Humorous Elder"
  },
  {
    "voiceId": "Spanish_EnergeticBoy",
    "lang": "西班牙文",
    "name": "Energetic Boy"
  },
  {
    "voiceId": "Spanish_WhimsicalGirl",
    "lang": "西班牙文",
    "name": "Whimsical Girl"
  },
  {
    "voiceId": "Spanish_StrictBoss",
    "lang": "西班牙文",
    "name": "Strict Boss"
  },
  {
    "voiceId": "Spanish_ReliableMan",
    "lang": "西班牙文",
    "name": "Reliable Man"
  },
  {
    "voiceId": "Spanish_SereneElder",
    "lang": "西班牙文",
    "name": "Serene Elder"
  },
  {
    "voiceId": "Spanish_AngryMan",
    "lang": "西班牙文",
    "name": "Angry Man"
  },
  {
    "voiceId": "Spanish_AssertiveQueen",
    "lang": "西班牙文",
    "name": "Assertive Queen"
  },
  {
    "voiceId": "Spanish_CaringGirlfriend",
    "lang": "西班牙文",
    "name": "Caring Girlfriend"
  },
  {
    "voiceId": "Spanish_PowerfulSoldier",
    "lang": "西班牙文",
    "name": "Powerful Soldier"
  },
  {
    "voiceId": "Spanish_PassionateWarrior",
    "lang": "西班牙文",
    "name": "Passionate Warrior"
  },
  {
    "voiceId": "Spanish_ChattyGirl",
    "lang": "西班牙文",
    "name": "Chatty Girl"
  },
  {
    "voiceId": "Spanish_RomanticHusband",
    "lang": "西班牙文",
    "name": "Romantic Husband"
  },
  {
    "voiceId": "Spanish_CompellingGirl",
    "lang": "西班牙文",
    "name": "Compelling Girl"
  },
  {
    "voiceId": "Spanish_PowerfulVeteran",
    "lang": "西班牙文",
    "name": "Powerful Veteran"
  },
  {
    "voiceId": "Spanish_SensibleManager",
    "lang": "西班牙文",
    "name": "Sensible Manager"
  },
  {
    "voiceId": "Spanish_ThoughtfulLady",
    "lang": "西班牙文",
    "name": "Thoughtful Lady"
  },
  {
    "voiceId": "Portuguese_SentimentalLady",
    "lang": "葡萄牙文",
    "name": "Sentimental Lady"
  },
  {
    "voiceId": "Portuguese_BossyLeader",
    "lang": "葡萄牙文",
    "name": "Bossy Leader"
  },
  {
    "voiceId": "Portuguese_Wiselady",
    "lang": "葡萄牙文",
    "name": "Wise lady"
  },
  {
    "voiceId": "Portuguese_Strong-WilledBoy",
    "lang": "葡萄牙文",
    "name": "Strong-willed Boy"
  },
  {
    "voiceId": "Portuguese_Deep-VoicedGentleman",
    "lang": "葡萄牙文",
    "name": "Deep-voiced Gentleman"
  },
  {
    "voiceId": "Portuguese_UpsetGirl",
    "lang": "葡萄牙文",
    "name": "Upset Girl"
  },
  {
    "voiceId": "Portuguese_PassionateWarrior",
    "lang": "葡萄牙文",
    "name": "Passionate Warrior"
  },
  {
    "voiceId": "Portuguese_AnimeCharacter",
    "lang": "葡萄牙文",
    "name": "Anime Character"
  },
  {
    "voiceId": "Portuguese_ConfidentWoman",
    "lang": "葡萄牙文",
    "name": "Confident Woman"
  },
  {
    "voiceId": "Portuguese_AngryMan",
    "lang": "葡萄牙文",
    "name": "Angry Man"
  },
  {
    "voiceId": "Portuguese_CaptivatingStoryteller",
    "lang": "葡萄牙文",
    "name": "Captivating Storyteller"
  },
  {
    "voiceId": "Portuguese_Godfather",
    "lang": "葡萄牙文",
    "name": "Godfather"
  },
  {
    "voiceId": "Portuguese_ReservedYoungMan",
    "lang": "葡萄牙文",
    "name": "Reserved Young Man"
  },
  {
    "voiceId": "Portuguese_SmartYoungGirl",
    "lang": "葡萄牙文",
    "name": "Smart Young Girl"
  },
  {
    "voiceId": "Portuguese_Kind-heartedGirl",
    "lang": "葡萄牙文",
    "name": "Kind-hearted Girl"
  },
  {
    "voiceId": "Portuguese_Pompouslady",
    "lang": "葡萄牙文",
    "name": "Pompous lady"
  },
  {
    "voiceId": "Portuguese_Grinch",
    "lang": "葡萄牙文",
    "name": "Grinch"
  },
  {
    "voiceId": "Portuguese_Debator",
    "lang": "葡萄牙文",
    "name": "Debator"
  },
  {
    "voiceId": "Portuguese_SweetGirl",
    "lang": "葡萄牙文",
    "name": "Sweet Girl"
  },
  {
    "voiceId": "Portuguese_AttractiveGirl",
    "lang": "葡萄牙文",
    "name": "Attractive Girl"
  },
  {
    "voiceId": "Portuguese_ThoughtfulMan",
    "lang": "葡萄牙文",
    "name": "Thoughtful Man"
  },
  {
    "voiceId": "Portuguese_PlayfulGirl",
    "lang": "葡萄牙文",
    "name": "Playful Girl"
  },
  {
    "voiceId": "Portuguese_GorgeousLady",
    "lang": "葡萄牙文",
    "name": "Gorgeous Lady"
  },
  {
    "voiceId": "Portuguese_LovelyLady",
    "lang": "葡萄牙文",
    "name": "Lovely Lady"
  },
  {
    "voiceId": "Portuguese_SereneWoman",
    "lang": "葡萄牙文",
    "name": "Serene Woman"
  },
  {
    "voiceId": "Portuguese_SadTeen",
    "lang": "葡萄牙文",
    "name": "Sad Teen"
  },
  {
    "voiceId": "Portuguese_MaturePartner",
    "lang": "葡萄牙文",
    "name": "Mature Partner"
  },
  {
    "voiceId": "Portuguese_Comedian",
    "lang": "葡萄牙文",
    "name": "Comedian"
  },
  {
    "voiceId": "Portuguese_NaughtySchoolgirl",
    "lang": "葡萄牙文",
    "name": "Naughty Schoolgirl"
  },
  {
    "voiceId": "Portuguese_Narrator",
    "lang": "葡萄牙文",
    "name": "Narrator"
  },
  {
    "voiceId": "Portuguese_ToughBoss",
    "lang": "葡萄牙文",
    "name": "Tough Boss"
  },
  {
    "voiceId": "Portuguese_Fussyhostess",
    "lang": "葡萄牙文",
    "name": "Fussy hostess"
  },
  {
    "voiceId": "Portuguese_Dramatist",
    "lang": "葡萄牙文",
    "name": "Dramatist"
  },
  {
    "voiceId": "Portuguese_Steadymentor",
    "lang": "葡萄牙文",
    "name": "Steady Mentor"
  },
  {
    "voiceId": "Portuguese_Jovialman",
    "lang": "葡萄牙文",
    "name": "Jovial Man"
  },
  {
    "voiceId": "Portuguese_CharmingQueen",
    "lang": "葡萄牙文",
    "name": "Charming Queen"
  },
  {
    "voiceId": "Portuguese_SantaClaus",
    "lang": "葡萄牙文",
    "name": "Santa Claus"
  },
  {
    "voiceId": "Portuguese_Rudolph",
    "lang": "葡萄牙文",
    "name": "Rudolph"
  },
  {
    "voiceId": "Portuguese_Arnold",
    "lang": "葡萄牙文",
    "name": "Arnold"
  },
  {
    "voiceId": "Portuguese_CharmingSanta",
    "lang": "葡萄牙文",
    "name": "Charming Santa"
  },
  {
    "voiceId": "Portuguese_CharmingLady",
    "lang": "葡萄牙文",
    "name": "Charming Lady"
  },
  {
    "voiceId": "Portuguese_Ghost",
    "lang": "葡萄牙文",
    "name": "Ghost"
  },
  {
    "voiceId": "Portuguese_HumorousElder",
    "lang": "葡萄牙文",
    "name": "Humorous Elder"
  },
  {
    "voiceId": "Portuguese_CalmLeader",
    "lang": "葡萄牙文",
    "name": "Calm Leader"
  },
  {
    "voiceId": "Portuguese_GentleTeacher",
    "lang": "葡萄牙文",
    "name": "Gentle Teacher"
  },
  {
    "voiceId": "Portuguese_EnergeticBoy",
    "lang": "葡萄牙文",
    "name": "Energetic Boy"
  },
  {
    "voiceId": "Portuguese_ReliableMan",
    "lang": "葡萄牙文",
    "name": "Reliable Man"
  },
  {
    "voiceId": "Portuguese_SereneElder",
    "lang": "葡萄牙文",
    "name": "Serene Elder"
  },
  {
    "voiceId": "Portuguese_GrimReaper",
    "lang": "葡萄牙文",
    "name": "Grim Reaper"
  },
  {
    "voiceId": "Portuguese_AssertiveQueen",
    "lang": "葡萄牙文",
    "name": "Assertive Queen"
  },
  {
    "voiceId": "Portuguese_WhimsicalGirl",
    "lang": "葡萄牙文",
    "name": "Whimsical Girl"
  },
  {
    "voiceId": "Portuguese_StressedLady",
    "lang": "葡萄牙文",
    "name": "Stressed Lady"
  },
  {
    "voiceId": "Portuguese_FriendlyNeighbor",
    "lang": "葡萄牙文",
    "name": "Friendly Neighbor"
  },
  {
    "voiceId": "Portuguese_CaringGirlfriend",
    "lang": "葡萄牙文",
    "name": "Caring Girlfriend"
  },
  {
    "voiceId": "Portuguese_PowerfulSoldier",
    "lang": "葡萄牙文",
    "name": "Powerful Soldier"
  },
  {
    "voiceId": "Portuguese_FascinatingBoy",
    "lang": "葡萄牙文",
    "name": "Fascinating Boy"
  },
  {
    "voiceId": "Portuguese_RomanticHusband",
    "lang": "葡萄牙文",
    "name": "Romantic Husband"
  },
  {
    "voiceId": "Portuguese_StrictBoss",
    "lang": "葡萄牙文",
    "name": "Strict Boss"
  },
  {
    "voiceId": "Portuguese_InspiringLady",
    "lang": "葡萄牙文",
    "name": "Inspiring Lady"
  },
  {
    "voiceId": "Portuguese_PlayfulSpirit",
    "lang": "葡萄牙文",
    "name": "Playful Spirit"
  },
  {
    "voiceId": "Portuguese_ElegantGirl",
    "lang": "葡萄牙文",
    "name": "Elegant Girl"
  },
  {
    "voiceId": "Portuguese_CompellingGirl",
    "lang": "葡萄牙文",
    "name": "Compelling Girl"
  },
  {
    "voiceId": "Portuguese_PowerfulVeteran",
    "lang": "葡萄牙文",
    "name": "Powerful Veteran"
  },
  {
    "voiceId": "Portuguese_SensibleManager",
    "lang": "葡萄牙文",
    "name": "Sensible Manager"
  },
  {
    "voiceId": "Portuguese_ThoughtfulLady",
    "lang": "葡萄牙文",
    "name": "Thoughtful Lady"
  },
  {
    "voiceId": "Portuguese_TheatricalActor",
    "lang": "葡萄牙文",
    "name": "Theatrical Actor"
  },
  {
    "voiceId": "Portuguese_FragileBoy",
    "lang": "葡萄牙文",
    "name": "Fragile Boy"
  },
  {
    "voiceId": "Portuguese_ChattyGirl",
    "lang": "葡萄牙文",
    "name": "Chatty Girl"
  },
  {
    "voiceId": "Portuguese_Conscientiousinstructor",
    "lang": "葡萄牙文",
    "name": "Conscientious Instructor"
  },
  {
    "voiceId": "Portuguese_RationalMan",
    "lang": "葡萄牙文",
    "name": "Rational Man"
  },
  {
    "voiceId": "Portuguese_WiseScholar",
    "lang": "葡萄牙文",
    "name": "Wise Scholar"
  },
  {
    "voiceId": "Portuguese_FrankLady",
    "lang": "葡萄牙文",
    "name": "Frank Lady"
  },
  {
    "voiceId": "Portuguese_DeterminedManager",
    "lang": "葡萄牙文",
    "name": "Determined Manager"
  },
  {
    "voiceId": "French_Male_Speech_New",
    "lang": "法文",
    "name": "Level-Headed Man"
  },
  {
    "voiceId": "French_Female_News Anchor",
    "lang": "法文",
    "name": "Patient Female Presenter"
  },
  {
    "voiceId": "French_CasualMan",
    "lang": "法文",
    "name": "Casual Man"
  },
  {
    "voiceId": "French_MovieLeadFemale",
    "lang": "法文",
    "name": "Movie Lead Female"
  },
  {
    "voiceId": "French_FemaleAnchor",
    "lang": "法文",
    "name": "Female Anchor"
  },
  {
    "voiceId": "French_MaleNarrator",
    "lang": "法文",
    "name": "Male Narrator"
  },
  {
    "voiceId": "Indonesian_SweetGirl",
    "lang": "印尼文",
    "name": "Sweet Girl"
  },
  {
    "voiceId": "Indonesian_ReservedYoungMan",
    "lang": "印尼文",
    "name": "Reserved Young Man"
  },
  {
    "voiceId": "Indonesian_CharmingGirl",
    "lang": "印尼文",
    "name": "Charming Girl"
  },
  {
    "voiceId": "Indonesian_CalmWoman",
    "lang": "印尼文",
    "name": "Calm Woman"
  },
  {
    "voiceId": "Indonesian_ConfidentWoman",
    "lang": "印尼文",
    "name": "Confident Woman"
  },
  {
    "voiceId": "Indonesian_CaringMan",
    "lang": "印尼文",
    "name": "Caring Man"
  },
  {
    "voiceId": "Indonesian_BossyLeader",
    "lang": "印尼文",
    "name": "Bossy Leader"
  },
  {
    "voiceId": "Indonesian_DeterminedBoy",
    "lang": "印尼文",
    "name": "Determined Boy"
  },
  {
    "voiceId": "Indonesian_GentleGirl",
    "lang": "印尼文",
    "name": "Gentle Girl"
  },
  {
    "voiceId": "German_FriendlyMan",
    "lang": "德文",
    "name": "Friendly Man"
  },
  {
    "voiceId": "German_SweetLady",
    "lang": "德文",
    "name": "Sweet Lady"
  },
  {
    "voiceId": "German_PlayfulMan",
    "lang": "德文",
    "name": "Playful Man"
  },
  {
    "voiceId": "Russian_HandsomeChildhoodFriend",
    "lang": "俄文",
    "name": "Handsome Childhood Friend"
  },
  {
    "voiceId": "Russian_BrightHeroine",
    "lang": "俄文",
    "name": "Bright Queen"
  },
  {
    "voiceId": "Russian_AmbitiousWoman",
    "lang": "俄文",
    "name": "Ambitious Woman"
  },
  {
    "voiceId": "Russian_ReliableMan",
    "lang": "俄文",
    "name": "Reliable Man"
  },
  {
    "voiceId": "Russian_CrazyQueen",
    "lang": "俄文",
    "name": "Crazy Girl"
  },
  {
    "voiceId": "Russian_PessimisticGirl",
    "lang": "俄文",
    "name": "Pessimistic Girl"
  },
  {
    "voiceId": "Russian_AttractiveGuy",
    "lang": "俄文",
    "name": "Attractive Guy"
  },
  {
    "voiceId": "Russian_Bad-temperedBoy",
    "lang": "俄文",
    "name": "Bad-tempered Boy"
  },
  {
    "voiceId": "Italian_BraveHeroine",
    "lang": "意大利文",
    "name": "Brave Heroine"
  },
  {
    "voiceId": "Italian_Narrator",
    "lang": "意大利文",
    "name": "Narrator"
  },
  {
    "voiceId": "Italian_WanderingSorcerer",
    "lang": "意大利文",
    "name": "Wandering Sorcerer"
  },
  {
    "voiceId": "Italian_DiligentLeader",
    "lang": "意大利文",
    "name": "Diligent Leader"
  },
  {
    "voiceId": "Arabic_CalmWoman",
    "lang": "阿拉伯文",
    "name": "Calm Woman"
  },
  {
    "voiceId": "Arabic_FriendlyGuy",
    "lang": "阿拉伯文",
    "name": "Friendly Guy"
  },
  {
    "voiceId": "Turkish_CalmWoman",
    "lang": "土耳其文",
    "name": "Calm Woman"
  },
  {
    "voiceId": "Turkish_Trustworthyman",
    "lang": "土耳其文",
    "name": "Trustworthy man"
  },
  {
    "voiceId": "Ukrainian_CalmWoman",
    "lang": "乌克兰文",
    "name": "Calm Woman"
  },
  {
    "voiceId": "Ukrainian_WiseScholar",
    "lang": "乌克兰文",
    "name": "Wise Scholar"
  },
  {
    "voiceId": "Dutch_kindhearted_girl",
    "lang": "荷兰文",
    "name": "Kind-hearted girl"
  },
  {
    "voiceId": "Dutch_bossy_leader",
    "lang": "荷兰文",
    "name": "Bossy leader"
  },
  {
    "voiceId": "Vietnamese_kindhearted_girl",
    "lang": "越南文",
    "name": "Kind-hearted girl"
  },
  {
    "voiceId": "Thai_male_1_sample8",
    "lang": "泰文",
    "name": "Serene Man"
  },
  {
    "voiceId": "Thai_male_2_sample2",
    "lang": "泰文",
    "name": "Friendly Man"
  },
  {
    "voiceId": "Thai_female_1_sample1",
    "lang": "泰文",
    "name": "Confident Woman"
  },
  {
    "voiceId": "Thai_female_2_sample2",
    "lang": "泰文",
    "name": "Energetic Woman"
  },
  {
    "voiceId": "Polish_male_1_sample4",
    "lang": "波兰文",
    "name": "Male Narrator"
  },
  {
    "voiceId": "Polish_male_2_sample3",
    "lang": "波兰文",
    "name": "Male Anchor"
  },
  {
    "voiceId": "Polish_female_1_sample1",
    "lang": "波兰文",
    "name": "Calm Woman"
  },
  {
    "voiceId": "Polish_female_2_sample3",
    "lang": "波兰文",
    "name": "Casual Woman"
  },
  {
    "voiceId": "Romanian_male_1_sample2",
    "lang": "罗马尼亚文",
    "name": "Reliable Man"
  },
  {
    "voiceId": "Romanian_male_2_sample1",
    "lang": "罗马尼亚文",
    "name": "Energetic Youth"
  },
  {
    "voiceId": "Romanian_female_1_sample4",
    "lang": "罗马尼亚文",
    "name": "Optimistic Youth"
  },
  {
    "voiceId": "Romanian_female_2_sample1",
    "lang": "罗马尼亚文",
    "name": "Gentle Woman"
  },
  {
    "voiceId": "greek_male_1a_v1",
    "lang": "希腊文",
    "name": "Thoughtful Mentor"
  },
  {
    "voiceId": "Greek_female_1_sample1",
    "lang": "希腊文",
    "name": "Gentle Lady"
  },
  {
    "voiceId": "Greek_female_2_sample3",
    "lang": "希腊文",
    "name": "Girl Next Door"
  },
  {
    "voiceId": "czech_male_1_v1",
    "lang": "捷克文",
    "name": "Assured Presenter"
  },
  {
    "voiceId": "czech_female_5_v7",
    "lang": "捷克文",
    "name": "Steadfast Narrator"
  },
  {
    "voiceId": "czech_female_2_v2",
    "lang": "捷克文",
    "name": "Elegant Lady"
  },
  {
    "voiceId": "finnish_male_3_v1",
    "lang": "芬兰文",
    "name": "Upbeat Man"
  },
  {
    "voiceId": "finnish_male_1_v2",
    "lang": "芬兰文",
    "name": "Friendly Boy"
  },
  {
    "voiceId": "finnish_female_4_v1",
    "lang": "芬兰文",
    "name": "Assetive Woman"
  },
  {
    "voiceId": "hindi_male_1_v2",
    "lang": "印地文",
    "name": "Trustworthy Advisor"
  },
  {
    "voiceId": "hindi_female_2_v1",
    "lang": "印地文",
    "name": "Tranquil Woman"
  },
  {
    "voiceId": "hindi_female_1_v2",
    "lang": "印地文",
    "name": "News Anchor"
  }
];

/** 合法 voice_id 集合（含文档中带全角括号的条目已按原文收录） */
export const MINIMAX_VOICE_ID_SET: ReadonlySet<string> = new Set(
  MINIMAX_SYSTEM_VOICES.map((v) => v.voiceId)
);

/** TTS 面板 AutoComplete 选项（完整系统音色列表） */
export const MINIMAX_VOICE_AUTOCOMPLETE_OPTIONS = MINIMAX_SYSTEM_VOICES.map((v) => ({
  value: v.voiceId,
  label: `${v.name} (${v.voiceId}) · ${v.lang}`,
}));
