from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import httpx
import json
from config import settings

app = FastAPI(
    title="ThesisShield - 学术论文对抗性压力测试平台",
    description="通过自动解析文本逻辑链并模拟审稿人攻击，帮助学者可视化并修补论证漏洞",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TextParseRequest(BaseModel):
    text: str
    api_key: Optional[str] = None

class Evidence(BaseModel):
    content: str
    type: str

class Claim(BaseModel):
    id: str
    content: str
    evidences: List[Evidence]

class TextParseResponse(BaseModel):
    claims: List[Claim]
    summary: str

class Challenge(BaseModel):
    id: str
    type: str
    question: str
    suggestion: str

class ReviewerChallengeResponse(BaseModel):
    challenges: List[Challenge]
    overall_assessment: str

async def call_deepseek_api(messages: List[dict], api_key: str, model: str = "deepseek-chat") -> dict:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 2000,
        "response_format": {"type": "json_object"}
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                settings.DEEPSEEK_API_URL,
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=f"API调用失败: {e.response.text}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"请求失败: {str(e)}")

@app.post("/api/parse", response_model=TextParseResponse)
async def parse_text(request: TextParseRequest):
    api_key = request.api_key or settings.DEEPSEEK_API_KEY
    
    if not api_key:
        raise HTTPException(status_code=400, detail="请提供有效的 DeepSeek API Key")
    
    system_prompt = """你是一位经验丰富的学术论文审稿人和逻辑分析专家。你的任务是分析给定的学术文本，提取出核心主张和支撑证据。

请按照以下JSON格式输出结果：
{
    "claims": [
        {
            "id": "claim_1",
            "content": "核心主张的内容",
            "evidences": [
                {"content": "支撑证据1的内容", "type": "实验数据/统计数据/理论引用/案例分析等"},
                {"content": "支撑证据2的内容", "type": "..."}
            ]
        }
    ],
    "summary": "对整个文本逻辑结构的简要总结"
}

要求：
1. 识别文本中的所有核心主张（通常是作者的主要观点、假设或结论）
2. 为每个主张找出所有直接支撑的证据
3. 证据类型包括：实验数据、统计数据、理论引用、案例分析、逻辑推理、文献支持等
4. 如果某些证据支撑多个主张，可以重复引用
5. summary部分简要说明文本的整体论证结构和逻辑关系
6. 确保输出是严格的JSON格式，不要有额外的解释文字"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"请分析以下学术文本并提取核心主张和证据：\n\n{request.text}"}
    ]
    
    response = await call_deepseek_api(messages, api_key)
    
    try:
        content = response["choices"][0]["message"]["content"]
        result = json.loads(content)
        return TextParseResponse(**result)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="API返回的JSON格式无效")
    except KeyError:
        raise HTTPException(status_code=500, detail="API返回格式异常")

@app.post("/api/challenge", response_model=ReviewerChallengeResponse)
async def generate_challenges(request: TextParseRequest):
    api_key = request.api_key or settings.DEEPSEEK_API_KEY
    
    if not api_key:
        raise HTTPException(status_code=400, detail="请提供有效的 DeepSeek API Key")
    
    system_prompt = """你是一位严谨的学术论文审稿人，以发现论证漏洞和提出尖锐挑战而闻名。你的任务是基于给定的学术文本，从逻辑漏洞的角度提出2-3个反事实挑战问题，并提供修补建议。

常见逻辑漏洞类型包括：
1. 因果倒置：假设X导致Y，但实际可能是Y导致X
2. 样本偏差：样本选择不具有代表性，或样本量不足
3. 未控制变量：存在混淆变量Z，可能同时影响X和Y
4. 相关性不等于因果性：观察到X和Y相关，但不一定存在因果关系
5. 选择性报告：只报告支持结论的数据，忽略矛盾证据
6. 过度概括：从有限案例得出普遍性结论
7. 循环论证：用结论本身作为论证前提
8. 诉诸权威而非证据：过度依赖权威观点而缺乏实证支持

请按照以下JSON格式输出结果：
{
    "challenges": [
        {
            "id": "challenge_1",
            "type": "因果倒置",
            "question": "如果X并非导致Y的唯一原因，你目前的证据能否排除Z的干扰？",
            "suggestion": "建议通过控制变量实验或工具变量分析来排除Z的干扰，或收集更多纵向数据来确立因果方向。"
        },
        {
            "id": "challenge_2",
            "type": "样本偏差",
            "question": "你的样本选择是否存在潜在偏差？如果扩大样本范围或采用随机抽样，结论是否仍然成立？",
            "suggestion": "建议扩大样本规模，采用随机抽样方法，或对样本特征进行敏感性分析以验证结论的稳健性。"
        },
        {
            "id": "challenge_3",
            "type": "未控制变量",
            "question": "是否存在未观察到的混淆变量同时影响自变量和因变量？你如何排除这种可能性？",
            "suggestion": "建议通过准自然实验设计、双重差分法或倾向得分匹配等方法来减少混淆变量的影响。"
        }
    ],
    "overall_assessment": "总体而言，这篇论文的论证在[某个方面]较为薄弱，主要问题在于[简要说明]。建议重点关注[主要改进方向]以增强论证的说服力。"
}

要求：
1. 分析文本中存在的具体逻辑漏洞，不要泛泛而谈
2. 每个挑战问题都要与文本内容直接相关，具有针对性
3. 修补建议要具体可行，提供学术研究中常用的解决方案
4. 提出2-3个挑战，选择文本中最明显的漏洞
5. overall_assessment部分要客观总结论证的整体质量和主要问题
6. 确保输出是严格的JSON格式，不要有额外的解释文字"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"请作为审稿人分析以下学术文本，找出潜在的逻辑漏洞并提出挑战问题：\n\n{request.text}"}
    ]
    
    response = await call_deepseek_api(messages, api_key)
    
    try:
        content = response["choices"][0]["message"]["content"]
        result = json.loads(content)
        return ReviewerChallengeResponse(**result)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="API返回的JSON格式无效")
    except KeyError:
        raise HTTPException(status_code=500, detail="API返回格式异常")

@app.get("/")
async def root():
    return FileResponse("static/index.html")

app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
