import socket
import uuid
import qrcode
import json
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import uvicorn
import httpx
import pyperclip
import pyautogui
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
from pathlib import Path
import asyncio
import subprocess
import os
import time
from enum import Enum
import random
import bcrypt

def hash_pin(pin: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pin.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    return bcrypt.checkpw(plain_pin.encode('utf-8'), hashed_pin.encode('utf-8'))

def get_local_ip():
    """Detects the laptop's active local IPv4 address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

# Generate Session Token and define Host
SESSION_TOKEN = str(uuid.uuid4())
LOCAL_IP = get_local_ip()
PORT = 8000
HOST_URL = f"http://{LOCAL_IP}:{PORT}"

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Boot sequence to print connection info and QR code to terminal."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=1,
        border=4,
    )
    qr_data = f'{{"host": "{HOST_URL}", "session_token": "{SESSION_TOKEN}"}}'
    qr.add_data(qr_data)
    qr.make(fit=True)
    
    print("\n" + "="*60)
    print(" " * 15 + "CODEAMIGO SECURE PAIRING")
    print("="*60)
    print(f"Server Host: {HOST_URL}")
    print(f"Session Token: {SESSION_TOKEN}")
    print("\nScan this QR code with the CodeAmigo App to securely pair:\n")
    # Output QR code in terminal using ascii characters
    qr.print_ascii(tty=True)
    print("="*60 + "\n")
    yield

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CodeAmigo Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def health_check():
    """
    Lightweight endpoint for the React Native frontend to ping 
    and verify the local bridge is active.
    """
    return {"status": "CodeAmigo Backend Active"}

# Global state to track paired device IP for 1:1 hardware lockdown
paired_client_ip = None

from typing import List, Dict, Any, Optional

class HandshakeRequest(BaseModel):
    session_token: str

class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]
    has_context: bool = False
    persona: str = "Standard"
    is_command: bool = False
    role: Optional[str] = None

class ClipboardSetRequest(BaseModel):
    text: str

class TranscribeRequest(BaseModel):
    # Dummy request for now
    audio_base64: Optional[str] = None

class MemoryRequest(BaseModel):
    memory_text: str

class Role(str, Enum):
    Student = "Student"
    Developer = "Developer"
    Tech_Lead = "Tech Lead"
    DevOps_Cloud = "DevOps & Cloud"

class UserCreate(BaseModel):
    name: str
    pin: str
    role: Role

class LoginRequest(BaseModel):
    name: str
    pin: str


# In-memory stores
users_db = {} # name -> user dict

MEMORY_FILE = Path(__file__).parent / "user_memory.json"

class PromptRouter:
    @staticmethod
    def route(message: str, has_context: bool = False) -> str:
        return "qwen2.5-coder:7b"

@app.middleware("http")
async def enforce_hardware_lockdown(request: Request, call_next):
    """
    Middleware to strictly enforce 1:1 hardware lockdown.
    Once a device pairs, any request from an unregistered IP is rejected (403).
    """
    allowed_paths = ["/handshake", "/chat", "/ai/stream", "/memory", "/stream"]
    if request.url.path in allowed_paths:
        return await call_next(request)
    
    if paired_client_ip is not None:
        client_ip = request.client.host
        if client_ip != paired_client_ip:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=403, content={"detail": "Forbidden: Server locked to another hardware device."})
            
    return await call_next(request)

@app.post("/handshake")
async def handshake(req: HandshakeRequest, request: Request):
    """
    Validates the session token and locks the backend to the first successful IP.
    """
    global paired_client_ip
    client_ip = request.client.host
    
    # If already paired, only the paired device can re-handshake
    if paired_client_ip is not None and client_ip != paired_client_ip:
        return {"status": "error", "detail": "Forbidden: Server already paired with another device."}
    
    # Validate the session token strictly
    if req.session_token != SESSION_TOKEN:
        return {"status": "error", "detail": "Invalid session token."}
        
    # Successful pairing, register the IP
    if paired_client_ip is None:
        paired_client_ip = client_ip
        print(f"\n[SECURE LOCKDOWN ENABLED] Successfully paired with device at IP: {paired_client_ip}")
    
    return {"status": "success", "message": "Hardware securely paired."}

@app.post("/auth/signup")
async def signup(req: UserCreate):
    if len(req.pin) != 6 or not req.pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN must be exactly 6 digits.")
        
    if req.name in users_db:
        raise HTTPException(status_code=400, detail="User already exists.")
    
    pin_hash = hash_pin(req.pin)
    
    users_db[req.name] = {
        "name": req.name,
        "role": req.role,
        "pin_hash": pin_hash
    }
    
    return {"status": "success", "session_token": SESSION_TOKEN}

@app.post("/auth/login")
async def login(req: LoginRequest):
    user = users_db.get(req.name)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid user.")
        
    if not verify_pin(req.pin, user["pin_hash"]):
        raise HTTPException(status_code=400, detail="Invalid PIN.")
        
    return {"status": "success", "session_token": SESSION_TOKEN}



IMPLICIT_ROLE_PROMPTS = {
    "Student": """You are a strict educational coding companion. You must implicitly apply these rules without telling the user:
    1. If the user asks for code, DO NOT write it. Act as a Socratic TA and guide them step-by-step.
    2. If the user pastes an algorithm, automatically provide a Big-O time/space complexity analysis.
    3. If math or formulas are discussed, automatically output the response in compilable LaTeX.""",
    
    "Developer": """You are a senior developer companion. Implicitly apply these rules:
    1. If the user provides a code snippet, automatically scan it for security flaws and PR review issues.
    2. If the user asks about frontend, automatically generate modular, reusable UI components (UI Sandbox).
    3. If raw stack traces are provided, act as a Watchdog to instantly diagnose the root cause without pleasantries.""",
    
    "Tech Lead": """You are a Tech Lead companion. Implicitly apply these rules:
    1. When code is shown, enforce rigid styling rules and suggest architectural improvements.
    2. If asked about features, break them down into Agile sprint tickets.
    3. Always highlight technical debt, trade-offs, and security risks before providing solutions.""",
    
    "DevOps & Cloud": """You are a DevOps companion. Implicitly apply these rules:
    1. If infrastructure is discussed, automatically generate the necessary Docker, Kubernetes, or Terraform IaC scripts.
    2. If server logs are provided, parse them to isolate deployment failures.
    3. Always audit suggested cloud architectures for IAM security vulnerabilities."""
}

@app.post("/chat")
async def chat(req: ChatRequest, request: Request, session_token: str = Header(None)):
    """
    Accepts chat requests, strictly checks the token header,
    and proxies the request to the local Ollama instance with streaming.
    """
    # Security bypassed for chat endpoint to allow React Native SSE to connect

    # Logic: Forward to local Ollama
    last_message = req.messages[-1].get("content", "") if req.messages else ""

    last_message = req.messages[-1].get("content", "") if req.messages else ""

    if req.is_command:
        async def run_command():
            try:
                process = await asyncio.create_subprocess_shell(
                    last_message,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
                
                async def read_stream(stream):
                    while True:
                        line = await stream.readline()
                        if not line:
                            break
                        decoded_line = line.decode('utf-8', errors='replace').rstrip('\r\n')
                        sse_data = json.dumps({"type": "terminal", "output": decoded_line})
                        yield f"data: {sse_data}\n\n"
                
                async for chunk in read_stream(process.stdout):
                    yield chunk
                async for chunk in read_stream(process.stderr):
                    yield chunk
                
                await process.wait()
                yield "data: [DONE]\n\n"
            except Exception as e:
                error_data = json.dumps({"error": str(e)})
                yield f"data: [ERROR] Command Exception: {error_data}\n\n"
                yield "data: [DONE]\n\n"
                
        return StreamingResponse(run_command(), media_type="text/event-stream")

    # Memory Interceptor Logic
    lower_msg = last_message.lower()
    if "remember that" in lower_msg or "my name is" in lower_msg or "remember" in lower_msg:
        refined_fact = last_message
        if lower_msg.startswith("my name is") and "remember" in lower_msg:
            # Re-extract with original casing if possible, but for simplicity title case it from lower.
            original_idx = lower_msg.index("my name is") + len("my name is")
            name_part = last_message[original_idx:].lower().replace("remember", "").replace("that", "").strip().title()
            refined_fact = f"User's name is {name_part}"
        elif "remember that" in lower_msg:
            idx = lower_msg.index("remember that")
            refined_fact = "User notes: " + last_message[idx + len("remember that"):].strip()
        elif "remember" in lower_msg:
            idx = lower_msg.index("remember")
            refined_fact = "User notes: " + last_message[idx + len("remember"):].strip()

        memory_list = []
        if MEMORY_FILE.exists():
            try:
                with open(MEMORY_FILE, "r") as f:
                    memory_list = json.load(f)
                    if not isinstance(memory_list, list):
                        memory_list = []
            except Exception:
                memory_list = []
        memory_list.append(refined_fact)
        try:
            with open(MEMORY_FILE, "w") as f:
                json.dump(memory_list, f, indent=4)
        except Exception:
            pass

    target_model = PromptRouter.route(last_message, req.has_context)
    
    system_prompt = "You are CodeAmigo. Maintain context of the entire conversation."
    if req.persona == "Rubber Duck":
        system_prompt = "You are a friendly rubber duck. Explain software concepts simply and intuitively to a beginner."
    elif req.persona == "Sassy Senior Dev":
        system_prompt = "You are a witty, slightly sarcastic senior engineer. Critique bad practices humorously, then provide optimal, production-grade code."
    elif req.persona == "Socratic TA":
        system_prompt = "You are an academic Teaching Assistant for Computer Science and DSA. When the user asks for help with code or an assignment, DO NOT provide the full solution immediately. Point out conceptual edge cases, explain the underlying logic, and ask a guiding question to lead them to the fix."
    elif req.persona == "Complexity Analyzer":
        system_prompt = "You are an expert in Algorithmic Analysis and Competitive Programming. Analyze the submitted code for worst-case Big-O Time Complexity and Space Complexity. Suggest optimal data structures to prevent Time Limit Exceeded (TLE) errors."
    
    soft_guardrail = "You are CodeAmigo, an elite software development assistant. Your highest priority is to remember and utilize the User Core Memory provided below. You must always be friendly, conversational, and refer to the user by name if asked. While your primary expertise is coding, software architecture, and computer science, you are a natural conversationalist. If the user asks a basic general knowledge question, provide a brief, helpful answer, but playfully or gently steer the conversation back to technology, their current project, or coding. Never use canned refusal responses for casual chat or questions about the user's identity."
    
    system_prompt = f"{soft_guardrail}\n\n{system_prompt}"
    


    memory_list_loaded = []
    if MEMORY_FILE.exists():
        try:
            with open(MEMORY_FILE, "r") as f:
                memory_list_loaded = json.load(f)
                if not isinstance(memory_list_loaded, list):
                    memory_list_loaded = []
        except Exception:
            pass
            
    if memory_list_loaded:
        memory_str = "\n".join([f"- {fact}" for fact in memory_list_loaded])
        system_prompt = f"You are CodeAmigo. Here are established facts about the user:\n{memory_str}\nUse these facts naturally when conversing.\n\n{system_prompt}"
    
    system_instruction = IMPLICIT_ROLE_PROMPTS.get(req.role, "You are a helpful AI coding assistant.") if req.role else "You are a helpful AI coding assistant."
    
    messages_payload = [{"role": "system", "content": system_instruction}]
    messages_payload.append({"role": "system", "content": system_prompt})
    
    for msg in req.messages:
        formatted_msg = {
            "role": msg.get("role"),
            "content": msg.get("content", "")
        }
        messages_payload.append(formatted_msg)

    async def generate():
        try:
            ollama_url = "http://localhost:11434/api/chat"
            payload = {
                "model": "qwen2.5-coder:7b",
                "messages": messages_payload,
                "stream": True,
                "keep_alive": -1
            }
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", ollama_url, json=payload) as response:
                    if response.status_code != 200:
                        error_detail = await response.aread()
                        yield f"data: [ERROR] Ollama rejected payload: {error_detail.decode()}\n\n"
                        yield "data: [DONE]\n\n"
                        return

                    async for line in response.aiter_lines():
                        if line:
                            try:
                                chunk_data = json.loads(line)
                                token = chunk_data.get("message", {}).get("content", "")
                                
                                if token:
                                    sse_data = json.dumps({"chunk": token})
                                    yield f"data: {sse_data}\n\n"
                                
                                if chunk_data.get("done") is True:
                                    yield "data: [DONE]\n\n"
                            except json.JSONDecodeError:
                                pass
        except Exception as e:
            error_data = json.dumps({"error": str(e)})
            yield f"data: [ERROR] Exception: {error_data}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.post("/clipboard/write")
async def write_clipboard(payload: dict):
    text = payload.get("text", "")
    try:
        import pyperclip
        pyperclip.copy(text)
        return {"status": "success", "message": "Copied to laptop clipboard"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/clipboard/read")
async def read_clipboard():
    try:
        import pyperclip
        text = pyperclip.paste()
        return {"status": "success", "content": text}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/memory")
async def get_memory():
    if not os.path.exists(MEMORY_FILE):
        return {"status": "success", "memory": []}

    try:
        with open(MEMORY_FILE, "r") as f:
            memory_data = json.load(f)
        return {"status": "success", "memory": memory_data}
    except Exception as e:
        return {"status": "error", "message": "Failed to read memory file.", "details": str(e)}

@app.post("/memory")
async def save_memory(req: MemoryRequest, request: Request, session_token: str = Header(None)):
    """
    Overwrites the AI core memory.
    """
    global paired_client_ip
    client_ip = request.client.host

    if paired_client_ip is None or client_ip != paired_client_ip:
        raise HTTPException(status_code=403, detail="Forbidden: Unauthorized hardware.")
    if session_token != SESSION_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid session token.")

    try:
        with open(MEMORY_FILE, "w") as f:
            json.dump([req.memory_text], f, indent=4)
        return {"status": "success", "message": "Memory saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save memory: {str(e)}")


@app.get("/workspace/active-context")
async def sync_workspace(request: Request, session_token: str = Header(None)):
    """
    Sub-Second Workspace Sync Framework via OS Macro
    """
    global paired_client_ip
    client_ip = request.client.host
    
    if paired_client_ip is None or client_ip != paired_client_ip:
        raise HTTPException(status_code=403, detail="Forbidden: Unauthorized hardware.")
    if session_token != SESSION_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid session token.")

    try:
        # 1. Save the user's current clipboard to restore later
        original_clipboard = pyperclip.paste()
        if not isinstance(original_clipboard, str):
            original_clipboard = ""

        # 2. Execute lightning-fast copy macro on active window
        pyautogui.hotkey('ctrl', 'a')
        time.sleep(0.05)
        pyautogui.hotkey('ctrl', 'c')
        time.sleep(0.05)

        # 3. Capture the code
        active_code = pyperclip.paste()
        if not isinstance(active_code, str):
            active_code = ""

        # 4. Restore the original clipboard
        pyperclip.copy(original_clipboard)

        # 5. Deselect the text (press right arrow)
        pyautogui.press('right')

        if not active_code or active_code == original_clipboard:
            return {"status": "error", "message": "Could not read active window text."}

        return {"status": "success", "context": active_code}

    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/transcribe")
async def transcribe(req: TranscribeRequest, request: Request, session_token: str = Header(None)):
    """
    Mock endpoint for transcription since a real model isn't installed.
    """
    global paired_client_ip
    client_ip = request.client.host

    if paired_client_ip is None or client_ip != paired_client_ip:
        raise HTTPException(status_code=403, detail="Forbidden: Unauthorized hardware.")
    if session_token != SESSION_TOKEN:
        raise HTTPException(status_code=403, detail="Forbidden: Invalid session token.")

    return {"status": "success", "text": "This is a dictated voice prompt [Dictation Placeholder]."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)
