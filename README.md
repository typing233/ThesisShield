# ThesisShield - 学术论文对抗性压力测试平台

通过自动解析文本逻辑链并模拟审稿人攻击，帮助学者可视化并修补论证漏洞。

## 功能特性

### 1. 逻辑结构解析
- 自动提取论文中的核心主张
- 识别支撑每个主张的证据
- 可视化展示主张-证据的逻辑关系
- 生成整体逻辑结构摘要

### 2. 审稿人挑战
- 基于常见逻辑漏洞生成尖锐挑战
- 覆盖 8 种常见逻辑漏洞类型：
  - 因果倒置
  - 样本偏差
  - 未控制变量
  - 相关性不等于因果性
  - 选择性报告
  - 过度概括
  - 循环论证
  - 诉诸权威而非证据
- 每个挑战附带具体的修补建议

## 技术栈

- **后端**: Python + FastAPI
- **前端**: HTML + JavaScript + Tailwind CSS
- **AI 模型**: DeepSeek API (deepseek-chat)

## 项目结构

```
ThesisShield/
├── main.py              # FastAPI 主应用
├── config.py            # 配置管理
├── requirements.txt     # Python 依赖
├── README.md            # 本文档
└── static/
    └── index.html       # 前端页面
```

## 快速开始

### 1. 环境准备

确保系统已安装 Python 3.8+，然后创建虚拟环境：

```bash
# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 获取 DeepSeek API Key

1. 访问 [DeepSeek 开放平台](https://platform.deepseek.com/)
2. 注册/登录账号
3. 在 API Keys 页面创建新的 API Key
4. 复制生成的 API Key

### 3. 启动应用

```bash
# 启动后端服务
python main.py
```

服务将在 `http://localhost:8002` 启动。

### 4. 使用应用

1. 打开浏览器访问 `http://localhost:8002`
2. 在 **API 配置** 区域输入您的 DeepSeek API Key 并保存
3. 在 **输入论文核心论述** 区域粘贴论文的摘要、引言或核心论证段落
4. 点击 **解析逻辑结构** 查看主张和证据的可视化展示
5. 点击 **审稿人挑战** 获得潜在逻辑漏洞的挑战问题和修补建议

## API 接口

### POST /api/parse

解析文本，提取核心主张和支撑证据。

**请求体:**
```json
{
    "text": "论文核心论述文本...",
    "api_key": "your-deepseek-api-key"
}
```

**响应:**
```json
{
    "claims": [
        {
            "id": "claim_1",
            "content": "核心主张内容",
            "evidences": [
                {"content": "支撑证据内容", "type": "实验数据/统计数据/..."}
            ]
        }
    ],
    "summary": "逻辑结构摘要"
}
```

### POST /api/challenge

生成审稿人挑战和修补建议。

**请求体:**
```json
{
    "text": "论文核心论述文本...",
    "api_key": "your-deepseek-api-key"
}
```

**响应:**
```json
{
    "challenges": [
        {
            "id": "challenge_1",
            "type": "因果倒置/样本偏差/...",
            "question": "挑战问题",
            "suggestion": "修补建议"
        }
    ],
    "overall_assessment": "总体评估"
}
```

## 配置选项

### 环境变量

可以通过 `.env` 文件或环境变量配置：

```env
DEEPSEEK_API_KEY=your-api-key-here
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
DEEPSEEK_MODEL=deepseek-chat
```

> 注意：用户也可以在前端页面直接输入 API Key，无需配置环境变量。

## 使用示例

### 示例输入

```
本研究通过对500名大学生的问卷调查发现，使用社交媒体的时间越长，抑郁症状评分越高（r=0.32, p<0.001）。因此，我们认为过度使用社交媒体会导致抑郁倾向增加。该发现支持了社会比较理论，即用户在社交媒体上频繁接触他人的完美生活展示，会降低自身的自尊水平，进而引发抑郁情绪。建议教育工作者和家长关注青少年的社交媒体使用行为，适时进行干预。
```

### 预期输出

**逻辑结构解析:**
- **主张 1**: 过度使用社交媒体会导致抑郁倾向增加
  - **证据**: 500名大学生问卷调查显示，社交媒体使用时间与抑郁评分正相关
  - **证据**: 社会比较理论的支持

**审稿人挑战:**
- **因果倒置**: 是否可能是抑郁倾向高的人更倾向于使用社交媒体？
- **未控制变量**: 是否存在其他因素（如孤独感、学业压力）同时影响社交媒体使用和抑郁？
- **相关性不等于因果性**: 观察到的相关性是否能证明因果关系？

## 开发说明

### 本地开发

```bash
# 安装开发依赖
pip install -r requirements.txt

# 使用 uvicorn 开发模式启动
uvicorn main:app --reload --host 0.0.0.0 --port 8002
```

### 生产部署

```bash
# 使用 gunicorn + uvicorn
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8002
```

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 联系方式

如有问题或建议，请通过以下方式联系：
- 提交 GitHub Issue
- 发送邮件至开发者邮箱
