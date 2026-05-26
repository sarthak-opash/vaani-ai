import os
import json
import shutil
from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import CharacterTextSplitter
from langchain_community.document_loaders import TextLoader

print("Starting RAG index recreation with business.txt and scraped esanad.com routes...")

# Initialize documents list
documents = []

# 1. Load business data from data/business.txt
if os.path.exists("data/business.txt"):
    print("Loading data/business.txt...")
    loader = TextLoader("data/business.txt", encoding="utf-8")
    documents.extend(loader.load())
else:
    print("Warning: data/business.txt not found!")

# 2. Load Playwright scraped esanad.com pages from scratch json
scraped_json_path = "C:\\Users\\Admin\\.gemini\\antigravity\\brain\\a0293091-d55c-418f-96bd-c71005d6eb92\\scratch\\scraped_esanad.json"
if os.path.exists(scraped_json_path):
    print(f"Loading scraped pages from {scraped_json_path}...")
    try:
        with open(scraped_json_path, "r", encoding="utf-8") as f:
            scraped_data = json.load(f)
        
        scraped_count = 0
        for url, page_data in scraped_data.items():
            title = page_data.get("title", "")
            text = page_data.get("text", "")
            if text.strip():
                # Format page content nicely with title and URL context
                page_content = f"Source URL: {url}\nPage Title: {title}\n\n{text}"
                doc = Document(
                    page_content=page_content,
                    metadata={"source": url, "title": title}
                )
                documents.append(doc)
                scraped_count += 1
        print(f"Successfully loaded {scraped_count} scraped pages from crawler output.")
    except Exception as e:
        print(f"Error loading scraped JSON: {e}")
else:
    print(f"Warning: Scraped pages database not found at {scraped_json_path}!")

# Split documents into chunks for search
# We use a slightly smaller chunk size and double check overlap to ensure query precision
text_splitter = CharacterTextSplitter(
    separator="\n",
    chunk_size=1000,
    chunk_overlap=200
)
docs = text_splitter.split_documents(documents)
print(f"Split {len(documents)} document(s)/page(s) into {len(docs)} chunks.")

# Create embeddings (must exactly match the model used in services/rag.py)
embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-mpnet-base-v2"
)

# Clean up existing index directory to start fresh
if os.path.exists("faiss_index"):
    print("Removing existing FAISS index...")
    shutil.rmtree("faiss_index")

# Create FAISS index from the split chunks
print("Generating embeddings and building FAISS index (this may take a moment)...")
db = FAISS.from_documents(docs, embedding)

# Save the rebuilt FAISS index locally
db.save_local("faiss_index")

print("RAG index created successfully with all scraped pages!")