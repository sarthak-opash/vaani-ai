from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.document_loaders import TextLoader

# Load your business data
loader = TextLoader("data/business.txt")
documents = loader.load()

# Create embeddings
embedding = HuggingFaceEmbeddings()

# Create FAISS index
db = FAISS.load_local(
    "faiss_index",
    embedding,
    allow_dangerous_deserialization=True
)
# Save locally
db.save_local("faiss_index")

print("RAG index created successfully!")