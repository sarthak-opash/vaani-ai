#!/usr/bin/env python3
"""Test script to verify all services are working"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

print("=" * 60)
print("Testing Vaani AI Backend Services")
print("=" * 60)

# Test 1: Environment Variables
print("\n[1] Checking Environment Variables...")
required_vars = ["GROQ_API_KEY", "CAMB_API_KEY"]
for var in required_vars:
    value = os.getenv(var)
    if value:
        print(f"  ✓ {var}: Found")
    else:
        print(f"  ✗ {var}: Missing")

# Test 2: RAG Service
print("\n[2] Testing RAG Service...")
try:
    from services.rag import get_context, db
    if db:
        print("  ✓ FAISS database loaded")
        # Test retrieval
        test_query = "What are your operating hours?"
        context = get_context(test_query)
        if context and context != "Restaurant knowledge base not available. Please try again.":
            print(f"  ✓ Context retrieval works ({len(context)} chars)")
        else:
            print(f"  ⚠ Context retrieval returned empty or error")
    else:
        print("  ⚠ FAISS database not loaded")
except Exception as e:
    print(f"  ✗ RAG Service Error: {e}")

# Test 3: LLM Service
print("\n[3] Testing LLM Service...")
try:
    from services.llm import generate_response
    test_context = "Urban Spice Bistro is open from 10 AM to 11 PM daily."
    test_query = "When are you open?"
    response = generate_response(test_query, test_context)
    if response:
        print(f"  ✓ LLM response generated ({len(response)} chars)")
        print(f"    Sample: {response[:100]}...")
    else:
        print("  ✗ LLM returned empty response")
except Exception as e:
    print(f"  ✗ LLM Service Error: {e}")
    import traceback
    traceback.print_exc()

# Test 4: TTS Service
print("\n[4] Testing TTS Service...")
try:
    from services.tts import stream_tts, client
    if client:
        print("  ✓ CambAI client initialized")
        test_text = "Hello, welcome to Urban Spice Bistro!"
        chunks = []
        for chunk in stream_tts(test_text):
            if chunk:
                chunks.append(chunk)
        if chunks:
            total_size = sum(len(c) for c in chunks)
            print(f"  ✓ TTS audio generated ({total_size} bytes)")
        else:
            print("  ⚠ TTS returned no audio chunks")
    else:
        print("  ✗ CambAI client not initialized")
except Exception as e:
    print(f"  ✗ TTS Service Error: {e}")

# Test 5: Full Pipeline
print("\n[5] Testing Full Pipeline...")
try:
    from services.rag import get_context
    from services.llm import generate_response
    from services.tts import stream_tts
    
    user_message = "What are your operating hours?"
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
        print("  ✓ Full pipeline works!")
    else:
        print("  ⚠ TTS failed in pipeline")
except Exception as e:
    print(f"  ✗ Pipeline Error: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("Testing Complete!")
print("=" * 60)
