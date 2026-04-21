import time
from typing import Dict, Any, List, Optional, Callable, AsyncGenerator
from .models import (
    StageStatus, StageResult, PipelineResult
)
from .stages import (
    StatementExtractor, LogicChainMatcher, AttackValidator, OutputFormatter
)


class PipelineOrchestrator:
    """
    流水线编排器
    协调四个处理阶段的执行，提供进度回调和结果汇总
    """
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self.stages = [
            ("statement_extraction", StatementExtractor),
            ("logic_chain_matching", LogicChainMatcher),
            ("attack_validation", AttackValidator),
            ("output_formatting", OutputFormatter)
        ]
    
    async def execute(
        self, 
        text: str, 
        progress_callback: Optional[Callable[[str, StageStatus, Dict], None]] = None
    ) -> PipelineResult:
        """
        执行完整的流水线处理
        """
        start_time = time.time()
        stage_results: List[StageResult] = []
        
        accumulated_data = {
            "original_text": text,
            "text": text
        }
        
        for stage_name, stage_class in self.stages:
            if progress_callback:
                progress_callback(stage_name, StageStatus.RUNNING, {"message": f"正在执行 {stage_name}"})
            
            stage_instance = stage_class(api_key=self.api_key)
            
            try:
                result = await stage_instance.execute(accumulated_data)
                stage_results.append(result)
                
                if result.status == StageStatus.COMPLETED and result.data:
                    if stage_name == "statement_extraction":
                        accumulated_data["statements"] = result.data.get("statements", [])
                        accumulated_data["extraction_summary"] = result.data.get("summary", "")
                    elif stage_name == "logic_chain_matching":
                        accumulated_data["logic_chains"] = result.data.get("logic_chains", [])
                        accumulated_data["chain_summary"] = result.data.get("overall_summary", "")
                    elif stage_name == "attack_validation":
                        accumulated_data["attacks"] = result.data.get("attacks", [])
                        accumulated_data["overall_assessment"] = result.data.get("overall_assessment", "")
                    elif stage_name == "output_formatting":
                        accumulated_data["final_output"] = result.data
                
                if progress_callback:
                    progress_callback(stage_name, result.status, result.data or {})
                
                if result.status == StageStatus.FAILED:
                    break
                    
            except Exception as e:
                error_result = StageResult(
                    stage_name=stage_name,
                    status=StageStatus.FAILED,
                    error=str(e),
                    duration_ms=0
                )
                stage_results.append(error_result)
                
                if progress_callback:
                    progress_callback(stage_name, StageStatus.FAILED, {"error": str(e)})
                break
        
        total_duration_ms = (time.time() - start_time) * 1000
        
        final_output = accumulated_data.get("final_output")
        overall_status = StageStatus.COMPLETED if all(
            r.status == StageStatus.COMPLETED for r in stage_results
        ) else StageStatus.FAILED
        
        return PipelineResult(
            overall_status=overall_status,
            stages=stage_results,
            final_output=final_output,
            total_duration_ms=total_duration_ms
        )
    
    async def execute_stream(
        self, 
        text: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        流式执行流水线，逐个阶段返回结果
        """
        accumulated_data = {
            "original_text": text,
            "text": text
        }
        
        for stage_name, stage_class in self.stages:
            yield {
                "type": "stage_start",
                "stage": stage_name,
                "status": StageStatus.RUNNING,
                "message": f"开始执行 {stage_name}"
            }
            
            stage_instance = stage_class(api_key=self.api_key)
            
            try:
                result = await stage_instance.execute(accumulated_data)
                
                if result.status == StageStatus.COMPLETED and result.data:
                    if stage_name == "statement_extraction":
                        accumulated_data["statements"] = result.data.get("statements", [])
                        accumulated_data["extraction_summary"] = result.data.get("summary", "")
                    elif stage_name == "logic_chain_matching":
                        accumulated_data["logic_chains"] = result.data.get("logic_chains", [])
                        accumulated_data["chain_summary"] = result.data.get("overall_summary", "")
                    elif stage_name == "attack_validation":
                        accumulated_data["attacks"] = result.data.get("attacks", [])
                        accumulated_data["overall_assessment"] = result.data.get("overall_assessment", "")
                    elif stage_name == "output_formatting":
                        accumulated_data["final_output"] = result.data
                
                yield {
                    "type": "stage_complete",
                    "stage": stage_name,
                    "status": result.status,
                    "data": result.data,
                    "duration_ms": result.duration_ms
                }
                
                if result.status == StageStatus.FAILED:
                    yield {
                        "type": "pipeline_error",
                        "stage": stage_name,
                        "error": result.error
                    }
                    break
                    
            except Exception as e:
                yield {
                    "type": "stage_error",
                    "stage": stage_name,
                    "error": str(e)
                }
                break
        
        yield {
            "type": "pipeline_complete",
            "final_output": accumulated_data.get("final_output")
        }
