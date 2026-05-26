import os
import sys
import json
import time
import hashlib
import requests

# Ensure Windows console supports UTF-8 characters
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
# pyrefly: ignore [missing-import]
from groq import Groq
from enum import Enum
from dotenv import load_dotenv
from typing import Optional, Dict, Tuple, List

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

# Response cache for common queries
RESPONSE_CACHE: Dict[str, Dict] = {}
CACHE_TTL = 3600  # 1 hour

# Esanad domain configuration
ESANAD_DOMAINS = [
    "site:esanad.com",
    "site:esanad.ae",
    "site:www.esanad.com",
]

class IntentType(Enum):
    """Intent classification for fast routing."""
    POLICY_INFO = "policy_info"
    CLAIMS = "claims"
    BILLING = "billing"
    COVERAGE = "coverage"
    GENERAL = "general"
    URGENT = "urgent"

# Industry-grade system prompt
SYSTEM_PROMPT = """You are Vaani, Esanad Insurance UAE's advanced voice assistant.

CORE DIRECTIVES:
1. RESPONSE SPEED: Respond in under 4 seconds for voice delivery
2. CLARITY: Use simple, direct language optimized for audio playback
3. ACCURACY: Reference provided context only; indicate uncertainty
4. NATURALNESS: Write as if speaking, not reading documentation

RESPONSE FORMAT:
- Max 2 sentences, under 280 characters for voice delivery
- Active voice, present tense preferred
- Avoid acronyms unless critical
- Use numbers instead of spelled-out values (e.g., "24" not "twenty-four")

VOICE OPTIMIZATION:
- Use comma pauses for readability (TTS will interpret correctly)
- Avoid complex punctuation (!!, ??)
- Spell out special characters when needed
- Keep responses under 40 words when possible

HANDLING UNKNOWN INFORMATION:
- If uncertain: "I don't have that information. Let me find it for you."
- Never guess or assume facts
- Redirect to support when beyond scope
"""

INTENT_KEYWORDS = {
    IntentType.CLAIMS: ["claim", "file", "submit", "report", "incident", "accident", "damage"],
    IntentType.BILLING: ["bill", "payment", "invoice", "premium", "charges", "cost", "price"],
    IntentType.COVERAGE: ["cover", "covered", "include", "included", "plan", "what does"],
    IntentType.POLICY_INFO: ["policy", "document", "terms", "conditions", "details", "information"],
    IntentType.URGENT: ["emergency", "urgent", "immediately", "now", "asap", "critical"],
}

def get_cache_key(user_text: str) -> str:
    """Generate cache key from query."""
    normalized = user_text.lower().strip()
    return hashlib.md5(normalized.encode()).hexdigest()

def check_cache(user_text: str) -> Optional[str]:
    """Check if response is in cache and valid."""
    key = get_cache_key(user_text)
    if key in RESPONSE_CACHE:
        cached = RESPONSE_CACHE[key]
        if time.time() - cached["timestamp"] < CACHE_TTL:
            return cached["response"]
        else:
            del RESPONSE_CACHE[key]
    return None

def cache_response(user_text: str, response: str) -> None:
    """Store response in cache."""
    key = get_cache_key(user_text)
    RESPONSE_CACHE[key] = {
        "response": response,
        "timestamp": time.time(),
    }

def classify_intent(user_text: str) -> IntentType:
    """Classify user intent for better context handling."""
    text_lower = user_text.lower()
    
    for intent, keywords in INTENT_KEYWORDS.items():
        if any(keyword in text_lower for keyword in keywords):
            if intent == IntentType.URGENT:
                return IntentType.URGENT
            return intent
    
    return IntentType.GENERAL

def extract_context_snippet(context: str, query: str, max_length: int = 500) -> str:
    """Extract most relevant context snippet for faster processing."""
    if not context or len(context.strip()) < 50:
        return ""
    
    # Find lines containing query keywords
    query_words = set(query.lower().split())
    lines = context.split("\n")
    scored_lines = []
    
    for line in lines:
        if not line.strip():
            continue
        score = sum(1 for word in query_words if word in line.lower())
        if score > 0:
            scored_lines.append((score, line.strip()))
    
    if not scored_lines:
        return context[:max_length]
    
    # Sort by relevance and concatenate top results
    scored_lines.sort(reverse=True)
    snippet = " ".join([line for _, line in scored_lines[:3]])
    
    return snippet[:max_length] if snippet else context[:max_length]

def perform_tavily_search(query: str, max_results: int = 2) -> str:
    """
    Perform web search using Tavily API focused on Esanad domain.
    
    Args:
        query: Search query
        max_results: Number of results to return
        
    Returns:
        Search results formatted for knowledge base
    """
    if not TAVILY_API_KEY:
        print("⚠️ TAVILY_API_KEY not found in environment")
        print(f"   Current TAVILY_API_KEY value: {TAVILY_API_KEY}")
        return ""
    
    try:
        # Build search query with Esanad domain focus
        search_query = f"{query} site:esanad.com OR site:esanad.ae"
        
        tavily_url = "https://api.tavily.com/search"
        payload = {
            "api_key": TAVILY_API_KEY,
            "query": search_query,
            "max_results": max_results,
            "include_answer": True,
            "topic": "general"
        }
        
        print(f"📡 Tavily Search: {search_query[:80]}...")
        response = requests.post(tavily_url, json=payload, timeout=10)
        response.raise_for_status()
        
        results = response.json()
        
        if not results.get("results"):
            print("⚠️ No Tavily results found")
            return ""
        
        print(f"✅ Tavily found {len(results['results'])} results")
        
        # Format results
        search_summary = ""
        for result in results["results"][:max_results]:
            title = result.get("title", "")
            content = result.get("content", "")[:200]
            url = result.get("url", "")
            
            if content:
                search_summary += f"{title}: {content}\n"
        
        return search_summary.strip()
        
    except requests.exceptions.Timeout:
        print("⏱️ Tavily search timeout (>10s)")
        return ""
    except requests.exceptions.HTTPError as e:
        print(f"❌ Tavily HTTP error: {e.response.status_code}")
        print(f"   Response: {e.response.text[:200]}")
        return ""
    except Exception as e:
        print(f"❌ Tavily search error: {str(e)}")
        return ""

def search_vector_database(query: str) -> Tuple[str, float]:
    """
    Search vector database for relevant information.
    
    Args:
        query: Search query
        
    Returns:
        (context, confidence_score)
    """
    try:
        from services.rag import get_context, db
        
        if db is None:
            return "", 0.0
        
        # Similarity search
        docs = db.similarity_search_with_score(query, k=3)
        
        if not docs:
            return "", 0.0
        
        # Calculate confidence based on similarity scores
        # FAISS returns distances, convert to similarity (lower distance = higher similarity)
        best_score = docs[0][1]  # First result score
        confidence = max(0, 1 - (best_score / 2))  # Normalize to 0-1
        
        # Extract context
        context = "\n".join([doc[0].page_content for doc in docs if doc[1] < 1.5])
        
        return context, confidence
        
    except Exception as e:
        print(f"⚠️ Vector database search error: {str(e)}")
        return "", 0.0

def generate_fast_response(
    user_text: str,
    context: str = "",
    conversation_memory: str = ""
) -> str:
    """
    Generate industry-grade response with intelligent search hierarchy.
    
    Search Strategy:
    1. Vector Database (RAG) - Primary source
    2. Tavily Web Search - If vector DB confidence is low
    3. Fallback responses - If all else fails
    
    Args:
        user_text: User's question
        context: Business knowledge base
        conversation_memory: Conversation history
    
    Returns:
        Voice-optimized response
    """
    
    # Check cache first
    cached_response = check_cache(user_text)
    if cached_response:
        return cached_response
    
    # Classify intent for better routing
    intent = classify_intent(user_text)
    
    # TIER 1: Search Vector Database First
    print(f"🔍 Searching vector database for: {user_text}")
    vec_context, confidence = search_vector_database(user_text)
    
    # TIER 2: If vector DB confidence is low, search web
    web_context = ""
    if confidence < 0.5:  # Low confidence threshold
        print(f"⚠️ Vector DB confidence low ({confidence:.2f}), searching Tavily...")
        web_context = perform_tavily_search(user_text, max_results=3)
        if web_context:
            print(f"✅ Found web results from Esanad domains")
    
    # Combine contexts (prioritize vector DB)
    combined_context = vec_context
    if web_context and not vec_context:
        combined_context = web_context
    elif web_context and confidence < 0.3:
        combined_context = f"{vec_context}\n\nAdditional info: {web_context}"
    
    # Extract relevant snippet
    context_snippet = extract_context_snippet(
        combined_context or context, 
        user_text
    )
    
    # Build optimized prompt
    prompt = f"""{SYSTEM_PROMPT}

CONVERSATION HISTORY (if relevant):
{conversation_memory if conversation_memory else "No previous context."}

KNOWLEDGE BASE:
{context_snippet if context_snippet else "No specific information available."}

USER QUERY:
{user_text}

RESPONSE:"""

    try:
        # Fast inference with optimized parameters
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,  # Lower for consistency and speed
            max_tokens=100,   # Shorter for voice delivery
            top_p=0.9,
            frequency_penalty=0.2,  # Reduce repetition
            presence_penalty=0.1,
        )
        
        answer = response.choices[0].message.content.strip()
        
        # Validate response
        if not answer or len(answer) < 5:
            answer = fallback_response(user_text, intent)
        
        # Cache successful response
        cache_response(user_text, answer)
        return answer
        
    except Exception as e:
        print(f"❌ LLM error: {e}")
        return fallback_response(user_text, intent)

def fallback_response(user_text: str, intent: IntentType) -> str:
    """
    Provide fallback responses for various intents when LLM fails.
    """
    fallbacks = {
        IntentType.CLAIMS: "To file a claim, please contact our claims team at 1800-ESANAD or visit our portal.",
        IntentType.BILLING: "For billing inquiries, check your policy statement or contact customer support.",
        IntentType.COVERAGE: "I'll connect you with our coverage specialist to clarify what's included.",
        IntentType.POLICY_INFO: "You can find policy details in your document or call our support team.",
        IntentType.URGENT: "This seems urgent. Let me connect you with an agent immediately.",
        IntentType.GENERAL: "I'm here to help. Could you clarify what you need?",
    }
    
    return fallbacks.get(intent, fallbacks[IntentType.GENERAL])

def generate_response(
    user_text: str,
    context: str = "",
    conversation_memory: str = ""
) -> str:
    """
    Main entry point for response generation.
    Implements industry-grade voice assistant logic.
    """
    
    # Input validation
    if not user_text or len(user_text.strip()) < 3:
        return "I didn't catch that. Could you please repeat?"
    
    # Fast response generation
    response = generate_fast_response(user_text, context, conversation_memory)
    
    return response