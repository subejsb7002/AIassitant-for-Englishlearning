require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.Englishlearningapikey,
});

const SYSTEM_PROMPT = `你是专业的英语文本检查助手，请找出用户输入中的所有错误，分为 grammar、spelling、usage 三类。

重点检查 usage，采取“宁可多标，不可漏标”的原则。只要表达不够自然、地道或符合英语习惯，无论程度轻重，即使语法正确、意思可以理解，也必须标记。重点关注用词、词语搭配、介词、固定表达和中式英语，并提供更自然地道的修改建议。

请只返回合法 JSON，不要输出其他内容：
{
  "errors": [
    {
      "type": "grammar 或 spelling 或 usage",
      "original_text": "原文中的准确片段，必须逐字一致",
      "suggestion": "修改建议",
      "explanation": "中文简要解释"
    }
  ]
}

errors 按原文从左到右排列。同一问题不要重复标记。没有错误时返回空数组。`;

const OPTIMIZE_PROMPT = `你是一位英语写作专家。请把用户输入的英文文本改写得更高级、更地道，同时保持原意。

只返回一个合法的 json 对象，结构：
{
  "optimized": "优化后的完整文本",
  "changes": [
    {
      "original": "原文片段（必须逐字来自原文）",
      "optimized": "优化后的片段",
      "reason": "中文说明为什么这样改"
    }
  ]
}

严格要求：
- changes 中的 original 必须逐字复制原文，能精确搜索到。
- 找不到精确对应片段时，宁可返回空数组，不要编造。
- 原文无需改动则 changes 返回空数组。`;

function splitIntoChunks(text, maxLen = 1800) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    if (end < text.length) {
      const breakPoints = ['\n\n', '. ', '! ', '? ', '\n'];
      for (const bp of breakPoints) {
        const idx = text.lastIndexOf(bp, end);
        if (idx > start + maxLen * 0.5) {
          end = idx + bp.length;
          break;
        }
      }
    }
    chunks.push({ text: text.slice(start, end), offset: start });
    start = end;
  }
  return chunks;
}

function findMatch(text, fragment, searchStart) {
  let idx = text.indexOf(fragment, searchStart);
  if (idx !== -1) return idx;
  idx = text.toLowerCase().indexOf(fragment.toLowerCase(), searchStart);
  if (idx !== -1) return idx;
  return text.indexOf(fragment);
}

async function checkChunk(chunkText) {
  const completion = await openai.chat.completions.create({
    model: 'deepseek-flash',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: chunkText },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_tokens: 8000,
  });
  const parsed = JSON.parse(completion.choices[0].message.content);
  return Array.isArray(parsed.errors) ? parsed.errors : [];
}

app.post('/api/check-grammar', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Please enter some text' });

    const chunks = splitIntoChunks(text);
    const allErrors = [];
    for (const chunk of chunks) {
      let chunkErrors = [];
      try {
        chunkErrors = await checkChunk(chunk.text);
      } catch (e) {
        console.error('分块调用失败：', e.message);
        continue;
      }
      let searchStart = 0;
      for (const err of chunkErrors) {
        if (!err.original_text || !err.type) continue;
        const idx = findMatch(chunk.text, err.original_text, searchStart);
        if (idx === -1) continue;
        allErrors.push({
          type: err.type,
          original_text: err.original_text,
          suggestion: err.suggestion || '',
          explanation: err.explanation || '',
          start: chunk.offset + idx,
          end: chunk.offset + idx + err.original_text.length,
        });
        searchStart = idx + err.original_text.length;
      }
    }
    allErrors.sort((a, b) => a.start - b.start);
    const filtered = [];
    let lastEnd = 0;
    for (const err of allErrors) {
      if (err.start >= lastEnd) {
        filtered.push(err);
        lastEnd = err.end;
      }
    }
    res.json({ errors: filtered, textLength: text.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Grammar check failed, please try again' });
  }
});

app.post('/api/optimize', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Please enter some text' });

    const MAX_LEN = 6000;
    const inputText = text.length > MAX_LEN ? text.slice(0, MAX_LEN) : text;
    const wasTruncated = text.length > MAX_LEN;

    const completion = await openai.chat.completions.create({
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: OPTIMIZE_PROMPT },
        { role: 'user', content: inputText },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 8000,
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    const rawChanges = Array.isArray(parsed.changes) ? parsed.changes : [];
    const validChanges = rawChanges.filter((c) => {
      if (!c.original || !c.optimized) return false;
      if (!inputText.includes(c.original)) return false;
      return true;
    });

    res.json({
      optimized: parsed.optimized || '',
      changes: validChanges,
      truncated: wasTruncated,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Optimization failed, please try again' });
  }
});

// ==================== 托福写作 Prompts ====================

const TOEFL_TOPIC_PROMPT = `你是一名托福考试出题专家。请生成一道全新的托福学术讨论写作题目（Academic Discussion Task）。

严格按以下 JSON 结构返回，不要返回任何其他内容：
{
  "topic": {
    "professorPost": "教授在学术论坛发的帖子（100词左右的英文），提出一个开放性学术问题，要求学生参与讨论",
    "student1": "第一个学生的回复（50词左右英文），持某一立场并给出理由",
    "student2": "第二个学生的回复（50词左右英文），持相反立场并给出理由",
    "instruction": "写作要求（英文）"
  }
}

要求：
1. 教授的帖子要围绕一个真实的学术话题（如教育、科技、环境、心理学、社会学等）
2. 两个学生的观点必须相互对立
3. instruction 固定为：You have 10 minutes to write a response of at least 100 words in which you contribute meaningfully to the discussion.
4. 所有英文内容语言地道、符合学术讨论风格
5. 每次生成的题目主题和内容都要不同`;

// ==================== 高考写作 Prompts ====================

const GAOKAO_TOPIC_PROMPT = `你是一名中国高考英语命题专家。请生成一道全新的高考英语写作题目（以最核心的高考英语应用文创设真实情境，如：向外国友人/外教写信、建议信、邀请信、感谢信、咨询信、短文投稿、校园英文演讲稿、活动通知等）。

严格按以下 JSON 结构返回，不要返回任何其他内容：
{
  "topic": {
    "title": "题目类型或标题（例如：应用文写作：给留学生朋友写建议信 / Application / Speech 等）",
    "situation": "题目背景情境描述（中文，规范地道的高考命题口吻，例如：假定你是李华，你校将举办一次以“中国传统节气”为主题的文化展览，你的英国留学生朋友 Chris 对此很感兴趣，请你给他写一封邮件...）",
    "points": [
      "活动时间与地点",
      "展览主要内容与亮点",
      "邀请对方参加并询问其意愿"
    ],
    "instruction": "写作要求（例如：注意：1. 词数 80–120 左右；2. 可以适当增加细节，以使行文连贯；3. 格式规范，语言得体。）"
  }
}

要求：
1. 情境贴近高中生生活，融合中外文化交流、校园生活、科技发展、环境保护或志愿服务等高考核心考查主题。
2. 写作要点包含 2-4 条明确要求，符合全国高考英语应用文命题规范。
3. 每次生成的题目主题和情境必须不同。`;

const GAOKAO_SCORE_PROMPT = `你是一名高考英语作文资深阅卷专家。请严格按照高考英语书面表达官方评分标准（满分 25 分，五个档次）对考生的作文进行阅卷评分。切勿使用托福、雅思等其他考试标准。

【高考英语作文评分标准】（满分 25 分）

一、五个档次评分标准
• 第五档（21 - 25分，很好）：完全完成规定任务，覆盖所有要点；语法结构丰富，词汇应用得体，全文结构紧凑。
• 第四档（16 - 20分，好）：虽漏掉一两个次重点，但覆盖主要内容；语法和词汇基本准确，结构较紧凑。
• 第三档（11 - 15分，适当）：基本完成任务但有部分遗漏；有一定语法或词汇错误，但不影响理解，内容基本连贯。
• 第二档（6 - 10分，较差）：未恰当完成任务，遗漏或未描述清楚主要内容；错误较多影响理解，缺乏连贯性。
• 第一档（1 - 5分，差）：未完成任务，明显遗漏主要内容，错误频出，内容不连贯。
• 不得分（0分）：无法传达有效信息、内容过少或全篇与题目无关。

二、考查要点与评分维度
阅卷时从以下三个核心维度综合衡量（各维度评分范围 0 - 25 分）：
1. 任务与要点（Task & Content）：是否完全覆盖题目规定任务和所有写作要点。
2. 语法与词汇（Grammar & Vocabulary）：语法结构是否丰富多样、词汇运用是否得体准确。
3. 结构与连贯（Structure & Cohesion）：全文结构是否紧凑、上下文衔接过渡是否自然连贯。

【输出格式】
只返回合法的 JSON 格式，不要 Markdown 代码块、不要任何多余文字：
{
  "total": 23,
  "tier": "第五档（21 - 25分，很好）",
  "dimensions": {
    "content": 24,
    "language": 22,
    "organization": 23
  },
  "comment": "中文总体评语：明确指出作文归属哪个档次（如：归入第五档），评价要点覆盖情况、词汇句式表现与篇章连贯性，2-3句话",
  "suggestions": [
    "针对要点拓展与表达得体性的具体改进建议（中文）",
    "针对高级词汇与丰富句式（从句、非谓语、倒装等）的提分建议（中文）",
    "针对上下文连贯与过渡词运用的优化建议（中文）"
  ]
}

【评分规则】
- total: 最终总分，必须在 0 到 25 之间（整数）。严格依据五档标准确定。
- dimensions.content: 任务与要点得分（0 到 25 之间整数）。
- dimensions.language: 语法与词汇得分（0 到 25 之间整数）。
- dimensions.organization: 结构与连贯得分（0 到 25 之间整数）。
- tier: 对应的档次名称，例如 "第五档（21 - 25分，很好）"、"第四档（16 - 20分，好）" 等。
- 评语和建议必须针对考生的真实作文，给出切合高考阅卷现场实际的专业指导。`;

const GAOKAO_REWRITE_PROMPT = `你是一名高考英语特级名师与资深写作导师。
请严格按照高考英语作文满分（25分）标准，把考生的作文改写成一篇符合高考第五档满分（25分）的高质量英文示范范文。

【满分（25分）标准】
1. 完全完成规定任务，覆盖题目所有要点，并进行得体合理的细节拓展。
2. 语法结构丰富多样（巧妙运用定语从句、名词性从句、状语从句、非谓语动词、倒装、强调等）。
3. 词汇运用高级且得体，表达地道地气。
4. 全文结构严谨紧凑，逻辑衔接自然流畅。
5. 语法和拼写零失误，词数符合要求（约 80–120 词）。

【改写要求】
1. 保留考生原本的核心交际目的和立意，全面提升语言质量和篇章结构。
2. 不要输出修改过程的说明，直接输出最终版本。
3. 用中文列出 3-5 条关键改动（每条一句话，指出优化了哪些要点、词汇、高级句式或过渡衔接）。

【输出格式】
只返回合法的 JSON 格式，不要 Markdown 代码块、不要任何多余文字：
{
  "rewritten": "范文全文（英文）",
  "keyChanges": [
    "关键改动 1（中文）",
    "关键改动 2（中文）",
    ...
  ]
}`;

// ==================== 托福写作评分标准 ====================
const TOEFL_SCORE_PROMPT = `你是托福学术讨论写作（Academic Discussion）的资深评卷官。请严格按下面的评分标准对学生的作文打分。

【评分维度与标准】（总分 0-6 分，0.5 分档）

一、内容贡献度（Content Contribution）
6分：直接回应教授的问题，立场鲜明；理由充分且有深度，能结合具体例子或知识支撑观点。
5分：回应了问题，立场清晰，理由合理但可能不够深入。
4分：基本回应问题，有立场但理由较浅或不够具体。
3分：部分回应问题，立场模糊或论证薄弱。
2分：几乎没回应问题，或跑题。
1分：内容与话题无关。

二、逻辑组织（Organization）
6分：观点展开有序，与两位同学的讨论互动自然，衔接流畅。
5分：结构清晰，互动合理，但过渡略生硬。
4分：有基本结构，互动不够自然或衔接生硬。
3分：结构松散，与讨论脱节。
2分：缺少清晰结构，段落混乱。
1分：无组织，难以理解。

三、语言运用（Language Use）
6分：词汇丰富且地道，句式多样，几乎无语法/拼写错误。
5分：词汇较丰富，句式有变化，偶有小错误不影响理解。
4分：能表达意思，有词汇或语法错误但不影响整体理解。
3分：错误较多，部分句子需要反复读才能理解。
2分：错误频繁，影响理解。
1分：语言能力严重不足。

【总分计算】
总分 = 三个维度的平均分，四舍五入到最近的 0.5 分。
例如：(5 + 4.5 + 5) / 3 = 4.83 → 总分 5.0

【输出格式】
只返回一个合法的 json，不要 Markdown 代码块、不要任何多余文字：

{
  "total": 4.5,
  "dimensions": {
    "content": 4.5,
    "organization": 5,
    "language": 4
  },
  "comment": "中文总体评语，2-3 句话，指出作文的亮点和主要问题",
  "suggestions": [
    "具体改进建议 1（中文，可操作）",
    "具体改进建议 2",
    "具体改进建议 3"
  ]
}

【重要】
- 每个评分维度与最终总分必须以 0.5 分为最小单位（只能取 0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0 之一），严禁出现其他任何非 0.5 步长的小数。
- 严格按标准打分，不要一律给高分。
- 评语要具体，不要泛泛而谈。
- suggestions 每条要针对学生作文中的真实问题，不能是通用模板。`;

const TOEFL_REWRITE_PROMPT = `你是托福学术讨论写作（Academic Discussion）的资深导师。
请把学生的作文改写成一篇符合 6 分标准的范文。

【6 分标准】（必须逐条满足）

内容贡献度：
- 直接回应教授的问题，立场清晰明确
- 给出至少 2 个具体理由或例子
- 能自然呼应至少一位同学的观点（如 "While Student 1
  argues..., I believe..."），体现讨论互动性
- 论证有说服力，不空泛

逻辑组织：
- 观点展开有序，一段一个中心
- 段落之间有清晰过渡（如 However, Furthermore,
  Building on this 等）
- 开头直接表态，结尾收束观点

语言运用：
- 至少有 3-5 处地道表达（如用 plays a pivotal role
  代替 is important，用 a compelling case 代替 good reason）
- 至少有 1-2 个复杂句（从句、分词、倒装、虚拟语气等）
- 语法和拼写错误极少，且不影响理解
- 字数 120-180 词

【改写要求】
1. 保留学生的核心观点和立场，不要偷换立场
2. 逐条对照上面的 6 分标准，确保每一条都满足
3. 改写完成后，自己按上面标准打分自查一遍：
   如果每个维度都达不到 6 分，就再改一次，直到达标
4. 不要输出修改过程的说明，直接给最终版本
5. 用中文列出 4-6 条关键改动（每条一句话，说明改了什么、
   为什么改）

【输出格式】
只返回一个合法的 json，不要 Markdown 代码块、不要多余文字：
{
  "rewritten": "范文全文（英文）",
  "keyChanges": [
    "关键改动 1（中文）",
    "关键改动 2（中文）",
    ...
  ]
}`;

// ==================== POST /api/toefl/generate-topic ====================
app.post('/api/toefl/generate-topic', async (req, res) => {
  try {
    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: TOEFL_TOPIC_PROMPT },
        { role: 'user', content: '请生成一道新的托福学术讨论写作题目。' },
      ],
      response_format: { type: 'json_object' },
      temperature: 1.2,
      max_tokens: 4000,
    });
    const parsed = JSON.parse(completion.choices[0].message.content);
    if (!parsed.topic) throw new Error('返回结构缺少 topic 字段');
    parsed.topic.type = 'toefl';
    res.json(parsed);
  } catch (err) {
    console.error('生成题目失败：', err);
    res.status(500).json({ error: 'Failed to generate topic, please try again' });
  }
});

// ==================== POST /api/gaokao/generate-topic ====================
app.post('/api/gaokao/generate-topic', async (req, res) => {
  try {
    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: GAOKAO_TOPIC_PROMPT },
        { role: 'user', content: '请生成一道新的高考英语写作题目。' },
      ],
      response_format: { type: 'json_object' },
      temperature: 1.2,
      max_tokens: 4000,
    });
    const parsed = JSON.parse(completion.choices[0].message.content);
    if (!parsed.topic) throw new Error('返回结构缺少 topic 字段');
    parsed.topic.type = 'gaokao';
    res.json(parsed);
  } catch (err) {
    console.error('生成高考题目失败：', err);
    res.status(500).json({ error: 'Failed to generate topic, please try again' });
  }
});

// ==================== 评分接口 (托福 / 高考) ====================
const scoreHandler = async (req, res) => {
  try {
    const { topic, essay, mode } = req.body;
    if (!essay || !essay.trim()) return res.status(400).json({ error: 'Please enter your essay' });

    const isGaokao = mode === 'gaokao' || topic?.type === 'gaokao' || Boolean(topic?.situation);
    const scorePrompt = isGaokao ? GAOKAO_SCORE_PROMPT : TOEFL_SCORE_PROMPT;

    let userContent = '';
    if (topic) {
      userContent += `【写作背景与题目】\n`;
      if (topic.title) userContent += `题目类型：${topic.title}\n`;
      if (topic.situation) userContent += `题目情境：${topic.situation}\n\n`;
      if (topic.points) {
        const pts = Array.isArray(topic.points) ? topic.points.join('\n') : topic.points;
        userContent += `写作要点：\n${pts}\n\n`;
      }
      if (topic.professorPost) userContent += `教授的问题：\n${topic.professorPost}\n\n`;
      if (topic.student1) userContent += `学生 A 的观点：\n${topic.student1}\n\n`;
      if (topic.student2) userContent += `学生 B 的观点：\n${topic.student2}\n\n`;
      if (topic.instruction) userContent += `写作要求：\n${topic.instruction}\n\n`;
    }
    userContent += `【学生作文】\n${essay.trim()}`;

    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: scorePrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4000,
    });
    const rawContent = completion.choices[0].message.content;
    const parsed = JSON.parse(rawContent);

    if (isGaokao) {
      // 高考英语评分（满分 25 分，5 个档次）
      const clampScore = (num, min, max) => {
        const n = Number(num);
        if (!Number.isFinite(n)) return min;
        return Math.min(max, Math.max(min, Math.round(n)));
      };

      const c = clampScore(parsed.dimensions?.content, 0, 25);
      const l = clampScore(parsed.dimensions?.language, 0, 25);
      const o = clampScore(parsed.dimensions?.organization, 0, 25);

      parsed.dimensions = {
        content: c,
        language: l,
        organization: o,
      };

      if (Number.isFinite(Number(parsed.total))) {
        parsed.total = clampScore(parsed.total, 0, 25);
      } else {
        parsed.total = Math.round((c + l + o) / 3);
      }
    } else {
      // 托福评分（满分 6.0，0.5 分档，3 个维度：content, organization, language）
      const roundToHalf = (num) => {
        const n = Number(num);
        if (!Number.isFinite(n)) return 0;
        return Math.min(6, Math.max(0, Math.round(n * 2) / 2));
      };

      const keys = ['content', 'organization', 'language'];

      const hasAllDimensions =
        parsed.dimensions &&
        keys.every((key) => Number.isFinite(parsed.dimensions[key]));

      if (hasAllDimensions) {
        // 三个维度齐全时，统一根据维度计算总分
        for (const key of keys) {
          parsed.dimensions[key] = roundToHalf(parsed.dimensions[key]);
        }

        const sum = keys.reduce(
          (total, key) => total + parsed.dimensions[key],
          0
        );

        parsed.total = roundToHalf(sum / keys.length);
      } else if (
        (typeof parsed.total === 'number' &&
          Number.isFinite(parsed.total)) ||
        (typeof parsed.total === 'string' &&
          parsed.total.trim() !== '' &&
          Number.isFinite(Number(parsed.total)))
      ) {
        parsed.total = roundToHalf(parsed.total);
      } else {
        console.error('评分模型返回结构异常：', rawContent);
        throw new Error('返回缺少有效 total 或完整 dimensions 字段');
      }
    }

    res.json(parsed);
  } catch (err) {
    console.error('评分失败：', err);
    res.status(500).json({ error: 'Scoring failed, please try again' });
  }
};

app.post('/api/toefl/score', scoreHandler);
app.post('/api/gaokao/score', scoreHandler);

// ==================== 范文改写接口 (托福 / 高考) ====================
const rewriteHandler = async (req, res) => {
  try {
    const { topic, essay, score, mode } = req.body;
    if (!essay || !essay.trim()) return res.status(400).json({ error: 'Please enter your essay' });

    const isGaokao = mode === 'gaokao' || topic?.type === 'gaokao' || Boolean(topic?.situation);
    const rewritePrompt = isGaokao ? GAOKAO_REWRITE_PROMPT : TOEFL_REWRITE_PROMPT;

    let userContent = '';
    if (topic) userContent += `题目信息：\n${JSON.stringify(topic)}\n\n`;
    userContent += `学生原文（当前得分 ${score?.total || '未知'}）：\n${essay}`;

    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: rewritePrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 8000,
    });
    const parsed = JSON.parse(completion.choices[0].message.content);
    if (!parsed.rewritten) throw new Error('返回结构缺少 rewritten 字段');
    res.json(parsed);
  } catch (err) {
    console.error('改写失败：', err);
    res.status(500).json({ error: 'Rewrite failed, please try again' });
  }
};

app.post('/api/toefl/rewrite', rewriteHandler);
app.post('/api/gaokao/rewrite', rewriteHandler);

// ==================== 数据存档系统 ====================

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const DEFAULT_HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const MAX_HISTORY = 100;

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CONFIG_PATH)) {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify({ historyFilePath: DEFAULT_HISTORY_PATH }, null, 2), 'utf-8');
    }
    const historyPath = getHistoryPath();
    const historyDir = path.dirname(historyPath);
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
    if (!fs.existsSync(historyPath)) {
      fs.writeFileSync(historyPath, '[]', 'utf-8');
    }
  } catch (err) {
    console.error('初始化数据目录失败：', err.message);
  }
}

function getHistoryPath() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    const p = config.historyFilePath || DEFAULT_HISTORY_PATH;
    return path.isAbsolute(p) ? p : path.join(__dirname, p);
  } catch {
    return DEFAULT_HISTORY_PATH;
  }
}

function readHistory() {
  try {
    const raw = fs.readFileSync(getHistoryPath(), 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeHistory(items) {
  const historyPath = getHistoryPath();
  const dir = path.dirname(historyPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(items, null, 2), 'utf-8');
}

ensureDataDir();

// GET /api/history
app.get('/api/history', (req, res) => {
  try {
    const items = readHistory();
    items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    res.json({ items });
  } catch (err) {
    console.error('读取历史失败：', err.message);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// POST /api/history
app.post('/api/history', (req, res) => {
  try {
    const { record } = req.body;
    if (!record) return res.status(400).json({ error: 'Missing record field' });
    const items = readHistory();
    const id = String(Date.now());
    const newRecord = { id, timestamp: Date.now(), ...record };
    items.push(newRecord);
    // 超过上限删最旧
    items.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    while (items.length > MAX_HISTORY) items.shift();
    writeHistory(items);
    res.json({ id });
  } catch (err) {
    console.error('保存历史失败：', err.message);
    res.status(500).json({ error: 'Failed to save history' });
  }
});

// PUT /api/history/:id
app.put('/api/history/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { updates } = req.body;
    if (!updates) return res.status(400).json({ error: 'Missing updates field' });
    const items = readHistory();
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Record not found' });
    // 把 updates 合并到 result 字段
    if (items[idx].result && typeof updates === 'object') {
      Object.assign(items[idx].result, updates);
    }
    writeHistory(items);
    res.json({ success: true });
  } catch (err) {
    console.error('更新历史失败：', err.message);
    res.status(500).json({ error: 'Failed to update history' });
  }
});

// DELETE /api/history?all=true  或  DELETE /api/history?id=xxx
app.delete('/api/history', (req, res) => {
  try {
    if (req.query.all === 'true') {
      writeHistory([]);
      return res.json({ success: true });
    }
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id parameter' });
    const items = readHistory();
    const filtered = items.filter(item => item.id !== id);
    if (filtered.length === items.length) return res.status(404).json({ error: 'Record not found' });
    writeHistory(filtered);
    res.json({ success: true });
  } catch (err) {
    console.error('删除历史失败：', err.message);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

// GET /api/settings
app.get('/api/settings', (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// GET /api/settings/default
app.get('/api/settings/default', (req, res) => {
  res.json({ historyFilePath: DEFAULT_HISTORY_PATH });
});

// POST /api/settings
app.post('/api/settings', (req, res) => {
  try {
    const { historyFilePath } = req.body;
    if (!historyFilePath || !historyFilePath.trim()) {
      return res.status(400).json({ error: 'Path cannot be empty' });
    }
    const absPath = path.isAbsolute(historyFilePath) ? historyFilePath : path.join(__dirname, historyFilePath);
    const dir = path.dirname(absPath);
    // 验证目录存在且可写
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        return res.status(400).json({ error: `Cannot create directory: ${dir}` });
      }
    }
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      return res.status(400).json({ error: `Directory is not writable: ${dir}` });
    }
    // 如果文件不存在，创建空文件
    if (!fs.existsSync(absPath)) {
      fs.writeFileSync(absPath, '[]', 'utf-8');
    }
    // 写入 config
    const config = { historyFilePath: absPath };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (err) {
    console.error('保存设置失败：', err.message);
    res.status(500).json({ error: 'Failed to save settings: ' + err.message });
  }
});

// ⭐⭐⭐ 关键：这两行决定服务器是否监听端口 ⭐⭐⭐
app.listen(3000, () => {
  console.log('✅ 服务器已启动！请打开浏览器访问 http://localhost:3000');
});