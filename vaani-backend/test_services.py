#!/usr/bin/env python3
"""Test script to verify all services are working"""

import os
import sys
from dotenv import load_dotenv

# Ensure Windows console supports UTF-8 characters
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Load environment variables
load_dotenv()

print("=" * 60)
print("Testing Vaani AI Backend Services")
print("=" * 60)

# Test 1: Environment Variables
print("\n[1] Checking Environment Variables...")
required_vars = ["GROQ_API_KEY"]
for var in required_vars:
    value = os.getenv(var)
    if value:
        print(f"  [OK] {var}: Found")
    else:
        print(f"  [FAIL] {var}: Missing")

# Test 2: RAG Service
print("\n[2] Testing RAG Service...")
try:
    from services.rag import get_context, db
    if db:
        print("  [OK] FAISS database loaded")
        # Test retrieval
        test_query = "How do I file a claim?"
        context = get_context(test_query)
        if context and context != "Esanad Insurance knowledge base not available. Please try again.":
            print(f"  [OK] Context retrieval works ({len(context)} chars)")
        else:
            print(f"  [WARN] Context retrieval returned empty or error")
    else:
        print("  [WARN] FAISS database not loaded")
except Exception as e:
    print(f"  [FAIL] RAG Service Error: {e}")

# Test 3: LLM Service
print("\n[3] Testing LLM Service...")
try:
    from services.llm import generate_response
    test_context = "Success Insurance Services L.L.C. (eSanad) is licensed by the Central Bank of the UAE under license number 273."
    test_query = "What is the CBUAE license number of eSanad?"
    response = generate_response(test_query, test_context)
    if response:
        print(f"  [OK] LLM response generated ({len(response)} chars)")
        print(f"    Sample: {response[:100]}...")
    else:
        print("  [FAIL] LLM returned empty response")
except Exception as e:
    print(f"  [FAIL] LLM Service Error: {e}")
    import traceback
    traceback.print_exc()

# Test 4: TTS Service
print("\n[4] Testing TTS Service...")
try:
    from services.tts import stream_tts
    test_text = "Hello, welcome to eSanad Insurance UAE! How can I help you today?"
    chunks = []
    for chunk in stream_tts(test_text):
        if chunk:
            chunks.append(chunk)
    if chunks:
        total_size = sum(len(c) for c in chunks)
        print(f"  [OK] TTS audio generated ({total_size} bytes)")
    else:
        print("  [WARN] TTS returned no audio chunks. If you saw a terms acceptance warning, please accept terms at: https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english")
except Exception as e:
    print(f"  [FAIL] TTS Service Error: {e}")

# Test 5: Full Pipeline
print("\n[5] Testing Full Pipeline...")
try:
    from services.rag import get_context
    from services.llm import generate_response
    from services.tts import stream_tts
    
    user_message = "How do I file a claim?"
    print(f"  User: {user_message}")
    
    # RAG
    context = get_context(user_message)
    print(f"  Context: {len(context)} chars")
    
    # LLM
    response = generate_response(user_message, context)
    print(f"  AI: {response[:100]}...")
    
    # TTS
    audio_chunks = []
    for chunk in stream_tts(response):
        if chunk:
            audio_chunks.append(chunk)
    
    if audio_chunks:
        total_size = sum(len(c) for c in audio_chunks)
        print(f"  Audio: {total_size} bytes")
        print("  [OK] Full pipeline works!")
    else:
        print("  [WARN] TTS failed in pipeline")
except Exception as e:
    print(f"  [FAIL] Pipeline Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("Testing Complete!")
print("=" * 60)
