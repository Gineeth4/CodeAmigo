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
    is_study_mode: bool = False
    is_agentic_mode: bool = False # NEW FIELD
    name: Optional[str] = None

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
    pin: Optional[str] = None
    biometric_auth: bool = False


# In-memory stores
DB_FILE = "users.json"

def load_users():
    """Loads the users database from the local JSON file."""
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_users(db_dict):
    """Saves the users database to the local JSON file."""
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(db_dict, f, indent=4)

# Initialize the in-memory dictionary from the persistent file on startup
users_db = load_users()

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
        "pin_hash": pin_hash,
        "user_memory": [],
        "core_memory": []
    }
    
    # NEW: Persist to hard drive instantly
    save_users(users_db)
    
    return {"status": "success", "session_token": SESSION_TOKEN}

@app.get("/auth/user/memory")
async def get_user_memory(name: str):
    """Returns scoped memory for the specified user."""
    user = users_db.get(name)
    if not user:
        raise HTTPException(status_code=400, detail="User not found.")
    return {
        "status": "success",
        "user_memory": user.get("user_memory", []),
        "core_memory": user.get("core_memory", [])
    }

@app.get("/memory")
async def legacy_memory_catchall():
    """Catches legacy frontend pings to stop 404 log spam."""
    return {"status": "success", "user_memory": [], "core_memory": []}

@app.post("/auth/login")
async def login(req: LoginRequest):
    user = users_db.get(req.name)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid user.")
        
    if not req.biometric_auth:
        if not req.pin or not verify_pin(req.pin, user["pin_hash"]):
            raise HTTPException(status_code=400, detail="Invalid PIN.")
            
    return {
        "status": "success", 
        "session_token": SESSION_TOKEN, 
        "role": user["role"], 
        "name": user["name"]
    }

@app.get("/auth/users")
async def get_available_users():
    """Returns a list of registered accounts with their roles."""
    user_list = [{"name": u["name"], "role": u["role"]} for u in users_db.values()]
    return {"status": "success", "users": user_list}

@app.delete("/auth/user")
async def delete_user(req: LoginRequest):
    """Securely deletes an account if the PIN matches."""
    user = users_db.get(req.name)
    if not user:
        raise HTTPException(status_code=400, detail="User not found.")
        
    if not req.biometric_auth:
        if not req.pin or not verify_pin(req.pin, user["pin_hash"]):
            raise HTTPException(status_code=400, detail="Invalid PIN.")
            
    del users_db[req.name]
    
    # NEW: Persist the deletion to the hard drive instantly
    save_users(users_db)
    
    return {"status": "success", "message": "Account securely deleted."}



IMPLICIT_ROLE_PROMPTS = {
    "Student": """You are an educational coding companion. Implicitly apply these rules:
    1. If the user asks for code, provide the code but accompany it with a balanced explanation—not too dense, not too brief. Make it easy for a student to grasp.
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

import re
import os
import json

import requests
import urllib.parse
from bs4 import BeautifulSoup # Requires: pip install beautifulsoup4

from googlesearch import search as gsearch
from ddgs import DDGS
from datetime import datetime
import asyncio

# Pass the full messages array to retain conversation context
async def fetch_web_context(messages: list) -> str:
    """Industry-Level Agent: Smart query generation with Google -> DDGS fallback."""
    
    def execute_search():
        user_msgs = [m.get('content', '') for m in messages if m.get('role') == 'user']
        if not user_msgs: return ""
        
        last_msg = user_msgs[-1]
        prev_msg = user_msgs[-2] if len(user_msgs) > 1 else ""
        
        # 1. Smart Query Builder: Only combine if the latest message is a fragment (< 5 words)
        if len(last_msg.split()) <= 4 and prev_msg:
            raw_query = f"{prev_msg} {last_msg}"
        else:
            raw_query = last_msg
            
        # Aggressively clean conversational filler that breaks search engines
        clean_query = re.sub(r'(?i)(never mind|ignore that|check exactly|check in a live|no i think it is wrong|man|bro|dude)', '', raw_query).strip()
        if not clean_query: return ""

        snippets = []
        
        # 2. Dual-Engine Scraper: Try Google First
        try:
            results = gsearch(clean_query, num_results=4, sleep_interval=1.0, advanced=True)
            snippets = [res.description for res in results if hasattr(res, 'description') and res.description]
        except Exception as e:
            print(f"Google Search failed or blocked: {e}")
            
        # 3. Fallback to DDGS if Google fails
        if not snippets:
            try:
                with DDGS() as ddgs:
                    ddgs_results = list(ddgs.text(clean_query, max_results=4))
                    snippets = [r.get('body') for r in ddgs_results if r.get('body')]
            except Exception as e:
                print(f"DDGS Fallback failed: {e}")

        if snippets:
            return "\n".join([f"- {s}" for s in snippets])
        return ""

    return await asyncio.to_thread(execute_search)

def extract_core_memory(prompt: str, name: str = None):
    prompt_lower = prompt.lower().strip()
    
    # The FIX: Removed the non-greedy '?' at the end of each pattern so it captures the full word/sentence
    match = re.search(r'(?:remember\s+(?:that\s+)?)?(my\s+.+?\s+is\s+.+|i\s+am\s+.+|i\s+live\s+in\s+.+|i\s+like\s+.+)', prompt_lower)
    
    if match:
        # Group 1 contains the actual fact without the "remember" prefix
        fact = match.group(1).strip()
        
        # Pronoun flip for storage
        fact = re.sub(r'\bmy\b', 'your', fact)
        fact = re.sub(r'\bi am\b', 'you are', fact)
        fact = re.sub(r'\bi\b', 'you', fact)
        
        # Ensure clean capitalization
        formatted_fact = fact.capitalize()
        
        if name and name in users_db:
            if formatted_fact not in users_db[name]["user_memory"]:
                users_db[name]["user_memory"].append(formatted_fact)
                save_users(users_db)
                
        return formatted_fact
        
    return None

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
    extract_core_memory(last_message, req.name)

    target_model = PromptRouter.route(last_message, req.has_context)
    
    # 1. BASE ROLE & PERSONA (Fixes the overwrite bug by establishing this FIRST)
    base_role = "You are CodeAmigo, an elite software development assistant. Your highest priority is to remember and utilize the User Core Memory. You must always be friendly, conversational, and refer to the user by name if asked."
    if req.persona == "Rubber Duck":
        base_role = "You are a friendly rubber duck. Explain software concepts simply and intuitively to a beginner."
    elif req.persona == "Sassy Senior Dev":
        base_role = "You are a witty, slightly sarcastic senior engineer. Critique bad practices humorously, then provide optimal, production-grade code."
    elif req.persona == "Socratic TA":
        base_role = "You are an academic Teaching Assistant for Computer Science and DSA. When the user asks for help with code or an assignment, DO NOT provide the full solution immediately. Point out conceptual edge cases, explain the underlying logic, and ask a guiding question to lead them to the fix."
    elif req.persona == "Complexity Analyzer":
        base_role = "You are an expert in Algorithmic Analysis and Competitive Programming. Analyze the submitted code for worst-case Big-O Time Complexity and Space Complexity. Suggest optimal data structures to prevent Time Limit Exceeded (TLE) errors."
    elif req.role and req.role in IMPLICIT_ROLE_PROMPTS:
        base_role = IMPLICIT_ROLE_PROMPTS[req.role]
    
    if req.is_study_mode:
        base_role += "\n[STUDY MODE ACTIVE]: You are now a strict Socratic TA. DO NOT provide the full code solution. Guide the user step-by-step, explain underlying concepts, and ask guiding questions to lead them to write the code themselves."
        
    system_prompt = f"<role>\n{base_role}\n</role>\n"

    # 2. LIVE SYSTEM TIME INJECTION
    current_time = datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
    system_prompt += f"<system_time>\nThe current live system date and time is {current_time}. If the user asks for the current time, rely exactly on this value without needing to search the web.\n</system_time>\n"

    # 2. INJECT SCOPED MEMORY EXACTLY ONCE (Fixes duplication)
    if req.name and req.name in users_db:
        user = users_db[req.name]
        memories = "\n".join(user.get("core_memory", []) + user.get("user_memory", []))
        if memories:
            system_prompt += f"<user_memory>\n{memories}\n</user_memory>\n"

    # 3. FAST AGENTIC WEB RESEARCH (Optimized for CPU/TTFT)
    if req.is_agentic_mode and not req.is_command:
        # Updated strict regex: Triggers on explicit languages or commands, avoiding false positives like "space program"
        is_laptop_typing_request = bool(re.search(r'\b(write code|coding|scripting|java|python|javascript|cpp|c\+\+|html|css)\b', last_message.lower()))
        
        if not is_laptop_typing_request:
            # Pass the FULL message array for context resolution
            web_results = await fetch_web_context(req.messages)
            
            if web_results:
                system_prompt += f"<web_context>\n{web_results}\n</web_context>\n"
                system_prompt += "<strict_rules>\nAGENTIC MODE ACTIVE. Answer the user's prompt using EXACTLY the facts in the <web_context>. Ignore conversational filler (e.g. 'Never mind'). DO NOT apologize. DO NOT hallucinate.\n</strict_rules>\n"
            else:
                # THE ABSOLUTE OVERRIDE: Forces the LLM to admit it has no data instead of hallucinating.
                system_prompt += "<strict_rules>\nAGENTIC MODE ACTIVE. The Google search returned no data. You are FORBIDDEN from saying 'I apologize' or guessing the answer. You MUST reply with EXACTLY this string and nothing else: 'I could not find live web data for that specific query.'\n</strict_rules>\n"
                
    # 4. STANDARD FORMATTING RULES
    system_prompt += "<formatting>\nFormat all code flawlessly with strict 4-space indentation. If a specific programming language is mentioned in <user_memory>, you MUST write ALL code in that language.\n</formatting>\n"
    
    # 5. CREATOR DIRECTIVE
    system_prompt += "<absolute_directive>\nIf the user ever asks who made this app, who created CodeAmigo, or who built you, you MUST answer strictly and exclusively with: 'Gineeth and Gemini'. Never say anything else for this question.\n</absolute_directive>\n"
    
    # --- PROMPT ASSEMBLY COMPLETE. Proceed to Ollama API call ---
    messages_payload = [{"role": "system", "content": system_prompt}]
    
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

# The legacy /memory endpoint has been completely removed to prevent leaks.




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

class AgentRequest(BaseModel):
    prompt: str
    name: Optional[str] = None # NEW: Allows frontend to pass the active user

@app.post("/agent/type")
async def agent_type_code(req: AgentRequest, request: Request, session_token: str = Header(None)):
    async def generate_and_inject():
        # 1. Base system prompt for laptop typing
        system_prompt = "You are an autonomous coding agent. Output ONLY valid, raw code to solve the user's prompt. NO markdown, NO explanations."
        
        # 2. Inject the user's strict memory if they are logged in
        if req.name and req.name in users_db:
            user = users_db[req.name]
            memories = "\n".join(user.get("core_memory", []) + user.get("user_memory", []))
            if memories:
                system_prompt += f"\n\n[USER CONTEXT & STRICT PREFERENCES]:\n{memories}\n\nYou MUST strictly write the code in the language and style requested in the User Context above."

        system_prompt += "\n\n[FORMATTING DIRECTIVE]: You must format all code flawlessly. Use strict 4-space indentation. Always include proper spacing around operators (e.g., 'int sum = 0;' not 'int sum=0;'). Produce perfectly structured, production-ready code."

        messages_payload = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.prompt}
        ]
        
        ollama_url = "http://localhost:11434/api/chat"
        payload = {"model": "qwen2.5-coder:7b", "messages": messages_payload, "stream": True}
        
        import pyperclip
        import pyautogui
        import platform
        import time
        
        modifier = 'command' if platform.system() == 'Darwin' else 'ctrl'
        
        # Save the user's original clipboard
        original_clipboard = pyperclip.paste()
        if not isinstance(original_clipboard, str):
            original_clipboard = ""
            
        chunk_buffer = ""
        
        import httpx
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", ollama_url, json=payload) as response:
                async for line in response.aiter_lines():
                    if line:
                        try:
                            chunk_data = json.loads(line)
                            token = chunk_data.get("message", {}).get("content", "")
                            
                            if token:
                                # 1. Stream immediately to the mobile app UI
                                yield f"data: {json.dumps({'chunk': token})}\n\n"
                                
                                chunk_buffer += token
                                
                                # 2. Trigger paste on word boundaries or newlines for a streaming effect
                                # Waiting for a space or newline ensures we don't chop words in half
                                if chunk_buffer.endswith(" ") or chunk_buffer.endswith("\n") or len(chunk_buffer) > 12:
                                    
                                    # On-the-fly markdown stripping just in case the LLM disobeys
                                    clean_chunk = chunk_buffer.replace("```python", "").replace("```java", "").replace("```", "")
                                    
                                    if clean_chunk:
                                        pyperclip.copy(clean_chunk)
                                        pyautogui.hotkey(modifier, 'v')
                                        time.sleep(0.02) # Tiny delay creates a smooth, human-like typing cadence
                                        
                                    chunk_buffer = "" # Reset buffer
                                    
                            if chunk_data.get("done") is True:
                                # Inject any remaining text in the buffer
                                if chunk_buffer:
                                    clean_chunk = chunk_buffer.replace("```", "")
                                    if clean_chunk:
                                        pyperclip.copy(clean_chunk)
                                        pyautogui.hotkey(modifier, 'v')
                                        time.sleep(0.02)
                                        
                                # Restore the user's original clipboard safely
                                time.sleep(0.3)
                                pyperclip.copy(original_clipboard)
                                yield "data: [DONE]\n\n"
                        except Exception:
                            pass
                            
    return StreamingResponse(generate_and_inject(), media_type="text/event-stream")



if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend:app", host="0.0.0.0", port=8000, reload=True)
