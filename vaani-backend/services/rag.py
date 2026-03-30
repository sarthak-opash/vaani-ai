from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings

embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-mpnet-base-v2"
)

db = FAISS.load_local(
    "faiss_index",
    embedding,
    allow_dangerous_deserialization=True
)

def get_context(query):
    docs = db.similarity_search(query, k=3)
    return " ".join([d.page_content for d in docs])