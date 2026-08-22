import os
import time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from google import genai

app = FastAPI()
start_time = time.time()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# --- MEMORY STORES FOR CONVERSATIONS ---
social_chats = {}
code_chats = {}
canvas_chats = {}

# --- MULTI-MODEL FALLBACK CASCADE ---
# Uses official, active Gemini API models in order of priority
MODEL_CASCADE = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b"
]

class PostRequest(BaseModel):
    session_id: str
    topic: str
    platform: str
    tone: str
    edit_instruction: str = ""

class CodeRequest(BaseModel):
    session_id: str
    code: str
    edit_instruction: str = ""

class ChatRequest(BaseModel):
    session_id: str = "default_canvas"
    message: str


def send_chat_with_fallback(chat_store: dict, session_id: str, prompt: str):
    """
    Sends a message to an active chat session.
    If rate-limited (429), overloaded (503), or unavailable (404),
    cascades through candidate models while retaining history.
    """
    history = []
    
    # Check if an active session exists
    if session_id in chat_store:
        current_model = chat_store[session_id]["model"]
        try:
            return chat_store[session_id]["chat"].send_message(prompt)
        except Exception as e:
            print(f"[Warning] Model '{current_model}' failed ({e}). Extracting history for fallback...")
            try:
                history = chat_store[session_id]["chat"].get_history()
            except Exception:
                history = []
            
            # Resume searching candidate models right after the failed model
            start_index = MODEL_CASCADE.index(current_model) + 1 if current_model in MODEL_CASCADE else 0
    else:
        start_index = 0

    # Iterate through fallback models
    for model_name in MODEL_CASCADE[start_index:]:
        try:
            print(f"[Fallback Active] Initializing session '{session_id}' with '{model_name}'...")
            new_chat = client.chats.create(model=model_name, history=history)
            response = new_chat.send_message(prompt)
            
            # Store updated chat instance and active model
            chat_store[session_id] = {
                "chat": new_chat,
                "model": model_name
            }
            return response
        except Exception as err:
            print(f"[Warning] '{model_name}' failed ({err}). Cascading to next candidate...")

    raise HTTPException(
        status_code=500,
        detail="All configured Gemini fallback models hit rate limits or failed."
    )


# --- API ROUTES ---

@app.get("/api/health")
def health_check():
    return {
        "status": "Operational",
        "uptime": time.time() - start_time
    }


@app.post("/api/chat")
def general_chat(req: ChatRequest):
    if not client:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY environment variable is missing.")
    
    response = send_chat_with_fallback(canvas_chats, req.session_id, req.message)
    active_model = canvas_chats[req.session_id]["model"]
    return {
        "reply": response.text.strip(),
        "model_used": active_model
    }


@app.post("/api/generate")
def generate_post(req: PostRequest):
    if not client:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY missing.")
    
    s_id = req.session_id

    if s_id not in social_chats:
        prompt = (
            f"You are an expert social media manager. Write a complete, ready-to-publish {req.platform} post.\n"
            f"Topic: {req.topic}\n"
            f"Tone: {req.tone}\n\n"
            f"Format rules:\n"
            f"- Format specifically for {req.platform} (include line breaks, emojis, and relevant hashtags).\n"
            f"- Do NOT include conversational intros."
        )
    else:
        prompt = (
            f"Modify the social media post according to these new user editing instructions: '{req.edit_instruction}'.\n"
            f"Maintain the core theme layout constraints for {req.platform} and keep a {req.tone} voice profile."
        )

    response = send_chat_with_fallback(social_chats, s_id, prompt)
    return {"post": response.text.strip()}


@app.post("/api/correct-code")
def correct_python_code(req: CodeRequest):
    if not client:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY missing.")
    
    s_id = req.session_id

    if s_id not in code_chats:
        prompt = (
            "You are an elite Python compiler and debugging assistant. Analyze the following broken Python code:\n\n"
            f"```python\n{req.code}\n```\n\n"
            "Provide your response exactly in this format:\n"
            "1. FIXED CODE: Provide the complete, fully corrected clean code block inside a code fence.\n"
            "2. WHAT WAS WRONG: A brief bulleted summary explaining the bugs you fixed."
        )
    else:
        prompt = (
            f"Apply the following new modifications or feature additions to the previous code workspace: '{req.edit_instruction}'.\n"
            "Return the full complete code file block along with a description summary of the changes."
        )

    response = send_chat_with_fallback(code_chats, s_id, prompt)
    return {"fixed_explanation": response.text.strip()}


# --- STATIC DASHBOARD MOUNTING ---
DASHBOARD_DIR = os.path.abspath("artifacts/echo-dashboard")

@app.get("/")
def serve_index():
    if os.path.exists(os.path.join(DASHBOARD_DIR, "index.html")):
        return FileResponse(os.path.join(DASHBOARD_DIR, "index.html"))
    return {"status": "Backend running. Dashboard static files not found."}

if os.path.exists(DASHBOARD_DIR):
    app.mount("/", StaticFiles(directory=DASHBOARD_DIR, html=True), name="static")