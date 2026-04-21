from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from enum import Enum

class StageStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class Statement(BaseModel):
    id: str
    content: str
    type: str  # claim, evidence, assumption
    confidence: float = 1.0
    metadata: Dict[str, Any] = {}

class LogicLink(BaseModel):
    id: str
    source_id: str
    target_id: str
    relation_type: str  # supports, contradicts, assumes, implies
    strength: float = 0.5
    evidence: Optional[str] = None

class LogicChain(BaseModel):
    id: str
    statements: List[Statement]
    links: List[LogicLink]
    summary: str

class AttackType(str, Enum):
    CAUSAL_INVERSION = "因果倒置"
    SAMPLE_BIAS = "样本偏差"
    UNCONTROLLED_VARIABLE = "未控制变量"
    CORRELATION_NOT_CAUSATION = "相关性不等于因果性"
    SELECTIVE_REPORTING = "选择性报告"
    OVERGENERALIZATION = "过度概括"
    CIRCULAR_ARGUMENT = "循环论证"
    APPEAL_TO_AUTHORITY = "诉诸权威而非证据"

class AttackResult(BaseModel):
    id: str
    target_statement_id: str
    attack_type: AttackType
    question: str
    suggestion: str
    severity: float  # 0.0 - 1.0
    is_valid: bool = True

class StageResult(BaseModel):
    stage_name: str
    status: StageStatus
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    duration_ms: float = 0.0

class PipelineResult(BaseModel):
    overall_status: StageStatus
    stages: List[StageResult]
    final_output: Optional[Dict[str, Any]] = None
    total_duration_ms: float = 0.0
