import os
import json
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai
from supabase import create_client, Client

app = FastAPI(
    title="MetaPrompt Orchestrator Core API",
    description="Autonomous meta-prompting & schema reflection engine powered by Gemini 2.5 Flash",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
supabase_client: Optional[Client] = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

class PromptOptimizationRequest(BaseModel):
    system_instruction: str = Field(..., description="Initial raw system prompt draft")
    user_input: str = Field(..., description="Sample user query or context payload")
    target_schema: Dict[str, Any] = Field(..., description="Expected JSON Schema structure")
    max_iterations: int = Field(default=3, ge=1, le=5)
    benchmark_threshold: float = Field(default=90.0, ge=0.0, le=100.0)

class OptimizationResponse(BaseModel):
    optimized_prompt: str
    final_output: str
    quality_score: float
    iterations_used: int
    model_used: str
    improvement_percentage: float

def generate_text_with_fallback(prompt: str, user_input: str) -> tuple[str, str]:
    model_cascade = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
    last_exception = None
    
    for model_name in model_cascade:
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=f"System Instruction: {prompt}\n\nUser Input: {user_input}"
            )
            if response.text:
                return response.text, model_name
        except Exception as e:
            last_exception = e
            continue
            
    raise HTTPException(status_code=503, detail=f"All Gemini models in cascade failed: {str(last_exception)}")

def evaluate_quality(output: str, target_schema: Dict[str, Any]) -> tuple[float, str]:
    try:
        parsed_json = json.loads(output.strip().strip("```json").strip("```"))
        missing_keys = [k for k in target_schema.keys() if k not in parsed_json]
        if missing_keys:
            return 60.0, f"Missing required keys in response schema: {missing_keys}"
        return 95.0, "JSON schema validation passed without errors."
    except json.JSONDecodeError as e:
        return 30.0, f"Invalid JSON format produced: {str(e)}"

def get_text_embedding(text: str) -> List[float]:
    try:
        response = gemini_client.models.embed_content(
            model="text-embedding-004",
            contents=text
        )
        return response.embeddings[0].values
    except Exception:
        return [0.0] * 768

@app.post("/api/optimize", response_model=OptimizationResponse)
async def optimize_prompt(req: PromptOptimizationRequest):
    if not gemini_client:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY environment variable is missing.")

    current_prompt = req.system_instruction
    baseline_score = 0.0
    final_score = 0.0
    final_output = ""
    model_used = "gemini-2.5-flash"
    
    for iteration in range(1, req.max_iterations + 1):
        output_text, used_model = generate_text_with_fallback(current_prompt, req.user_input)
        final_output = output_text
        model_used = used_model
        
        score, error_log = evaluate_quality(output_text, req.target_schema)
        if iteration == 1:
            baseline_score = score
        final_score = score

        if score >= req.benchmark_threshold:
            break

        meta_prompt = f"""
[SYSTEM INSTRUCTION: META-PROMPT OPTIMIZER]
You are an expert prompt engineer. Analyze the input prompt, target schema, and output error log.
Rewrite the prompt using Role-Task-Format constraints and dynamic variable tags to eliminate ambiguity and force valid JSON.

ORIGINAL PROMPT:
{current_prompt}

TARGET SCHEMA REQUIREMENT:
{json.dumps(req.target_schema, indent=2)}

FAILED OUTPUT:
{output_text}

VALIDATION ERROR LOG:
{error_log}

TASK: Return ONLY the raw improved system prompt without markdown wrappers or meta-commentary.
"""
        reflection_res = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=meta_prompt
        )
        current_prompt = reflection_res.text.strip()

    improvement = max(0.0, ((final_score - baseline_score) / (baseline_score if baseline_score > 0 else 1)) * 100)

    if supabase_client:
        try:
            prompt_embed = get_text_embedding(current_prompt)
            output_embed = get_text_embedding(final_output)
            supabase_client.table("prompt_benchmark_runs").insert({
                "baseline_prompt": req.system_instruction,
                "optimized_prompt": current_prompt,
                "sample_input": req.user_input,
                "output_text": final_output,
                "quality_score": final_score,
                "iterations_count": iteration,
                "model_used": model_used,
                "prompt_embedding": prompt_embed,
                "output_embedding": output_embed
            }).execute()
        except Exception as e:
            print(f"Supabase persistence error: {e}")

    return OptimizationResponse(
        optimized_prompt=current_prompt,
        final_output=final_output,
        quality_score=final_score,
        iterations_used=iteration,
        model_used=model_used,
        improvement_percentage=round(improvement, 2)
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)