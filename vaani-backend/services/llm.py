import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel("gemini-2.5-flash")

def generate_response(user_text, context):
    prompt = f"""
    You are a business assistant.

    Context:
    {context}

    User:
    {user_text}

    Answer clearly and shortly.
    """

    res = model.generate_content(prompt)
    return res.text