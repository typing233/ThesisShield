from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import httpx
import json
import asyncio
from config import settings
from pipeline import PipelineOrchestrator
from pipeline.models import StageStatus

app = FastAPI(
    title="ThesisShield - 学术论文对抗性压力测试平台",
    description="通过自动解析文本逻辑链并模拟审稿人攻击，帮助学者可视化并修补论证漏洞",
    version="2.0.0"
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

class PipelineProgress(BaseModel):
    stage: str
    status: str
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class DefenseRetestRequest(BaseModel):
    statement_id: str
    original_text: str
    modified_text: str
    attack_type: str
    api_key: Optional[str] = None

class DefenseRetestResponse(BaseModel):
    is_defended: bool
    score: float
    feedback: str
    suggestion: Optional[str] = None

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
    
    orchestrator = PipelineOrchestrator(api_key=api_key)
    result = await orchestrator.execute(request.text)
    
    if result.overall_status == StageStatus.FAILED:
        error_msg = "流水线执行失败"
        for stage in result.stages:
            if stage.status == StageStatus.FAILED and stage.error:
                error_msg = stage.error
                break
        raise HTTPException(status_code=500, detail=error_msg)
    
    if result.final_output and "parse_output" in result.final_output:
        return TextParseResponse(**result.final_output["parse_output"])
    
    raise HTTPException(status_code=500, detail="解析结果格式错误")

@app.post("/api/challenge", response_model=ReviewerChallengeResponse)
async def generate_challenges(request: TextParseRequest):
    api_key = request.api_key or settings.DEEPSEEK_API_KEY
    
    if not api_key:
        raise HTTPException(status_code=400, detail="请提供有效的 DeepSeek API Key")
    
    orchestrator = PipelineOrchestrator(api_key=api_key)
    result = await orchestrator.execute(request.text)
    
    if result.overall_status == StageStatus.FAILED:
        error_msg = "流水线执行失败"
        for stage in result.stages:
            if stage.status == StageStatus.FAILED and stage.error:
                error_msg = stage.error
                break
        raise HTTPException(status_code=500, detail=error_msg)
    
    if result.final_output and "challenge_output" in result.final_output:
        return ReviewerChallengeResponse(**result.final_output["challenge_output"])
    
    raise HTTPException(status_code=500, detail="挑战生成结果格式错误")

@app.post("/api/pipeline/stream")
async def stream_pipeline(request: TextParseRequest):
    """
    流式执行流水线，逐个阶段返回结果
    """
    api_key = request.api_key or settings.DEEPSEEK_API_KEY
    
    if not api_key:
        raise HTTPException(status_code=400, detail="请提供有效的 DeepSeek API Key")
    
    orchestrator = PipelineOrchestrator(api_key=api_key)
    
    async def generate():
        async for event in orchestrator.execute_stream(request.text):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*"
        }
    )

@app.post("/api/pipeline/full")
async def full_pipeline(request: TextParseRequest):
    """
    执行完整流水线，返回所有阶段的详细结果
    """
    api_key = request.api_key or settings.DEEPSEEK_API_KEY
    
    if not api_key:
        raise HTTPException(status_code=400, detail="请提供有效的 DeepSeek API Key")
    
    orchestrator = PipelineOrchestrator(api_key=api_key)
    result = await orchestrator.execute(request.text)
    
    return {
        "overall_status": result.overall_status,
        "total_duration_ms": result.total_duration_ms,
        "stages": [stage.model_dump() for stage in result.stages],
        "final_output": result.final_output
    }

@app.post("/api/defense/retest", response_model=DefenseRetestResponse)
async def defense_retest(request: DefenseRetestRequest):
    """
    防御重测：验证修改后的陈述是否能够抵御特定类型的攻击
    """
    api_key = request.api_key or settings.DEEPSEEK_API_KEY
    
    if not api_key:
        raise HTTPException(status_code=400, detail="请提供有效的 DeepSeek API Key")
    
    system_prompt = """你是一位严谨的学术论文审稿人。你的任务是评估修改后的陈述是否能够抵御特定类型的逻辑漏洞攻击。

请分析以下内容：
1. 原始陈述存在的漏洞类型
2. 修改后的陈述
3. 判断修改是否有效防御了该漏洞

请按照以下JSON格式输出结果：
{
    "is_defended": true/false,
    "score": 0.85,
    "feedback": "修改后的陈述通过增加控制变量的说明，有效防御了未控制变量的攻击...",
    "suggestion": "建议进一步提供具体的控制变量列表和统计检验结果..."
}

要求：
1. is_defended: 布尔值，表示是否成功防御
2. score: 0.0-1.0的分数，表示防御的有效性
3. feedback: 详细的评估反馈
4. suggestion: 可选的进一步改进建议（如果is_defended为false则必须提供）"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"""请评估以下防御修改：

漏洞类型：{request.attack_type}

原始陈述相关上下文：
{request.original_text}

修改后的陈述：
{request.modified_text}

请判断修改是否有效防御了该类型的逻辑漏洞攻击。"""}
    ]
    
    try:
        response = await call_deepseek_api(messages, api_key)
        content = response["choices"][0]["message"]["content"]
        result = json.loads(content)
        
        return DefenseRetestResponse(
            is_defended=result.get("is_defended", False),
            score=result.get("score", 0.0),
            feedback=result.get("feedback", "评估完成"),
            suggestion=result.get("suggestion")
        )
        
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
