import json
import time
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import httpx
from fastapi import HTTPException

from .models import (
    Statement, LogicLink, LogicChain, AttackResult, 
    AttackType, StageStatus, StageResult
)
from config import settings


class BaseStage(ABC):
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.DEEPSEEK_API_KEY
        self.api_url = settings.DEEPSEEK_API_URL
        self.model = settings.DEEPSEEK_MODEL
        
    async def _call_api(self, messages: List[dict]) -> dict:
        if not self.api_key:
            raise ValueError("API Key 未提供")
            
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2000,
            "response_format": {"type": "json_object"}
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(
                    self.api_url,
                    headers=headers,
                    json=payload
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                raise HTTPException(status_code=e.response.status_code, detail=f"API调用失败: {e.response.text}")
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"请求失败: {str(e)}")
    
    @abstractmethod
    async def execute(self, input_data: Dict[str, Any]) -> StageResult:
        pass


class StatementExtractor(BaseStage):
    """
    阶段1: 提取陈述
    从输入文本中提取所有核心陈述，包括主张、证据和假设
    """
    
    async def execute(self, input_data: Dict[str, Any]) -> StageResult:
        start_time = time.time()
        text = input_data.get("text", "")
        
        if not text:
            return StageResult(
                stage_name="statement_extraction",
                status=StageStatus.FAILED,
                error="输入文本为空"
            )
        
        try:
            system_prompt = """你是一位经验丰富的学术论文逻辑分析专家。你的任务是从给定的学术文本中提取所有核心陈述。

请按照以下JSON格式输出结果：
{
    "statements": [
        {
            "id": "stmt_1",
            "content": "陈述的具体内容",
            "type": "claim/evidence/assumption",
            "confidence": 0.95,
            "metadata": {
                "position": "摘要部分",
                "importance": "核心"
            }
        }
    ],
    "summary": "对提取的陈述的总体描述"
}

要求：
1. 识别文本中的所有核心陈述，包括：
   - claim (主张/结论): 作者试图证明的主要观点
   - evidence (证据): 用来支持主张的数据、实验结果、引用等
   - assumption (假设): 作者默认成立但未明确证明的前提
2. 为每个陈述分配唯一的ID
3. confidence字段表示你对该陈述分类的信心程度(0.0-1.0)
4. metadata可以包含任何有助于理解该陈述的额外信息
5. 确保输出是严格的JSON格式"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"请从以下学术文本中提取所有核心陈述：\n\n{text}"}
            ]
            
            response = await self._call_api(messages)
            content = response["choices"][0]["message"]["content"]
            result = json.loads(content)
            
            statements = []
            for stmt_data in result.get("statements", []):
                statements.append(Statement(**stmt_data))
            
            duration_ms = (time.time() - start_time) * 1000
            
            return StageResult(
                stage_name="statement_extraction",
                status=StageStatus.COMPLETED,
                data={
                    "statements": [s.model_dump() for s in statements],
                    "summary": result.get("summary", "")
                },
                duration_ms=duration_ms
            )
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return StageResult(
                stage_name="statement_extraction",
                status=StageStatus.FAILED,
                error=str(e),
                duration_ms=duration_ms
            )


class LogicChainMatcher(BaseStage):
    """
    阶段2: 配对逻辑链
    分析陈述之间的逻辑关系，构建完整的逻辑链
    """
    
    async def execute(self, input_data: Dict[str, Any]) -> StageResult:
        start_time = time.time()
        statements_data = input_data.get("statements", [])
        original_text = input_data.get("original_text", "")
        
        if not statements_data:
            return StageResult(
                stage_name="logic_chain_matching",
                status=StageStatus.FAILED,
                error="没有可分析的陈述"
            )
        
        try:
            statements = [Statement(**s) for s in statements_data]
            statements_json = json.dumps([s.model_dump() for s in statements], ensure_ascii=False)
            
            system_prompt = """你是一位逻辑分析专家。你的任务是分析陈述之间的逻辑关系，构建完整的逻辑链。

请按照以下JSON格式输出结果：
{
    "logic_chains": [
        {
            "id": "chain_1",
            "statements": ["stmt_1", "stmt_2", "stmt_3"],
            "links": [
                {
                    "id": "link_1",
                    "source_id": "stmt_2",
                    "target_id": "stmt_1",
                    "relation_type": "supports",
                    "strength": 0.8,
                    "evidence": "stmt_2的实验数据直接支持stmt_1的结论"
                }
            ],
            "summary": "这个逻辑链描述了..."
        }
    ],
    "overall_summary": "所有逻辑链的总体描述"
}

关系类型说明：
- supports: 源陈述支持目标陈述
- contradicts: 源陈述与目标陈述矛盾
- assumes: 源陈述是目标陈述的假设前提
- implies: 源陈述隐含目标陈述

要求：
1. 分析所有陈述之间的逻辑关系
2. 构建一个或多个逻辑链来描述论证结构
3. 为每个逻辑关系分配强度值(0.0-1.0)
4. 确保逻辑链能够完整描述原文的论证过程
5. 输出严格的JSON格式"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"请分析以下陈述之间的逻辑关系，构建逻辑链：\n\n陈述列表：\n{statements_json}\n\n原始文本：\n{original_text}"}
            ]
            
            response = await self._call_api(messages)
            content = response["choices"][0]["message"]["content"]
            result = json.loads(content)
            
            logic_chains = []
            for chain_data in result.get("logic_chains", []):
                chain_statements = [s for s in statements if s.id in chain_data.get("statements", [])]
                chain_links = [LogicLink(**link) for link in chain_data.get("links", [])]
                
                logic_chains.append(LogicChain(
                    id=chain_data.get("id", f"chain_{len(logic_chains)+1}"),
                    statements=chain_statements,
                    links=chain_links,
                    summary=chain_data.get("summary", "")
                ))
            
            duration_ms = (time.time() - start_time) * 1000
            
            return StageResult(
                stage_name="logic_chain_matching",
                status=StageStatus.COMPLETED,
                data={
                    "logic_chains": [c.model_dump() for c in logic_chains],
                    "overall_summary": result.get("overall_summary", "")
                },
                duration_ms=duration_ms
            )
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return StageResult(
                stage_name="logic_chain_matching",
                status=StageStatus.FAILED,
                error=str(e),
                duration_ms=duration_ms
            )


class AttackValidator(BaseStage):
    """
    阶段3: 执行专项攻击验证
    针对每个逻辑链，执行多种类型的逻辑漏洞攻击验证
    """
    
    async def execute(self, input_data: Dict[str, Any]) -> StageResult:
        start_time = time.time()
        logic_chains_data = input_data.get("logic_chains", [])
        statements_data = input_data.get("statements", [])
        original_text = input_data.get("original_text", "")
        
        if not logic_chains_data:
            return StageResult(
                stage_name="attack_validation",
                status=StageStatus.FAILED,
                error="没有可分析的逻辑链"
            )
        
        try:
            statements = [Statement(**s) for s in statements_data]
            logic_chains_json = json.dumps(logic_chains_data, ensure_ascii=False)
            statements_json = json.dumps([s.model_dump() for s in statements], ensure_ascii=False)
            
            system_prompt = """你是一位严谨的学术论文审稿人，以发现论证漏洞而闻名。你的任务是针对给定的逻辑链，执行专项攻击验证，找出潜在的逻辑漏洞。

常见逻辑漏洞类型：
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
    "attacks": [
        {
            "id": "attack_1",
            "target_statement_id": "stmt_1",
            "attack_type": "因果倒置",
            "question": "如果X并非导致Y的唯一原因，你目前的证据能否排除Z的干扰？",
            "suggestion": "建议通过控制变量实验或工具变量分析来排除Z的干扰",
            "severity": 0.85,
            "is_valid": true
        }
    ],
    "overall_assessment": "总体而言，这篇论文的论证在...方面较为薄弱"
}

要求：
1. 针对每个逻辑链中的关键陈述，执行2-3种最相关的攻击类型
2. 每个攻击问题都要与具体陈述直接相关，具有针对性
3. 修补建议要具体可行，提供学术研究中常用的解决方案
4. severity字段表示该漏洞的严重程度(0.0-1.0)
5. is_valid字段表示该攻击是否有效（可以全部设为true）
6. 输出严格的JSON格式"""

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"请针对以下逻辑链执行专项攻击验证：\n\n逻辑链：\n{logic_chains_json}\n\n陈述列表：\n{statements_json}\n\n原始文本：\n{original_text}"}
            ]
            
            response = await self._call_api(messages)
            content = response["choices"][0]["message"]["content"]
            result = json.loads(content)
            
            attacks = []
            for attack_data in result.get("attacks", []):
                attacks.append(AttackResult(**attack_data))
            
            duration_ms = (time.time() - start_time) * 1000
            
            return StageResult(
                stage_name="attack_validation",
                status=StageStatus.COMPLETED,
                data={
                    "attacks": [a.model_dump() for a in attacks],
                    "overall_assessment": result.get("overall_assessment", "")
                },
                duration_ms=duration_ms
            )
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return StageResult(
                stage_name="attack_validation",
                status=StageStatus.FAILED,
                error=str(e),
                duration_ms=duration_ms
            )


class OutputFormatter(BaseStage):
    """
    阶段4: 格式化输出
    将所有阶段的结果整合为统一的输出格式
    """
    
    async def execute(self, input_data: Dict[str, Any]) -> StageResult:
        start_time = time.time()
        
        try:
            statements_data = input_data.get("statements", [])
            logic_chains_data = input_data.get("logic_chains", [])
            attacks_data = input_data.get("attacks", [])
            overall_assessment = input_data.get("overall_assessment", "")
            extraction_summary = input_data.get("extraction_summary", "")
            chain_summary = input_data.get("chain_summary", "")
            
            claims = []
            evidences = []
            
            for stmt in statements_data:
                if stmt.get("type") == "claim":
                    claim_evidences = []
                    for chain in logic_chains_data:
                        for link in chain.get("links", []):
                            if link.get("target_id") == stmt.get("id") and link.get("relation_type") == "supports":
                                source_stmt = next((s for s in statements_data if s.get("id") == link.get("source_id")), None)
                                if source_stmt and source_stmt.get("type") == "evidence":
                                    claim_evidences.append({
                                        "content": source_stmt.get("content", ""),
                                        "type": source_stmt.get("metadata", {}).get("evidence_type", "证据")
                                    })
                    
                    claims.append({
                        "id": stmt.get("id"),
                        "content": stmt.get("content"),
                        "evidences": claim_evidences
                    })
            
            challenges = []
            for attack in attacks_data:
                challenges.append({
                    "id": attack.get("id"),
                    "type": attack.get("attack_type"),
                    "question": attack.get("question"),
                    "suggestion": attack.get("suggestion")
                })
            
            duration_ms = (time.time() - start_time) * 1000
            
            return StageResult(
                stage_name="output_formatting",
                status=StageStatus.COMPLETED,
                data={
                    "parse_output": {
                        "claims": claims,
                        "summary": extraction_summary or chain_summary or "逻辑结构分析完成"
                    },
                    "challenge_output": {
                        "challenges": challenges,
                        "overall_assessment": overall_assessment or "论证质量评估完成"
                    },
                    "raw_data": {
                        "statements": statements_data,
                        "logic_chains": logic_chains_data,
                        "attacks": attacks_data
                    }
                },
                duration_ms=duration_ms
            )
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return StageResult(
                stage_name="output_formatting",
                status=StageStatus.FAILED,
                error=str(e),
                duration_ms=duration_ms
            )
