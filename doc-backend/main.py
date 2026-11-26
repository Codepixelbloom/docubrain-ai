import os
import io
import uuid
from typing import List
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import PyPDF2
from pinecone import Pinecone
from supabase import create_client, Client

# Automatically loads variables from doc-backend/.env locally
load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration (Reads from .env or Render Environment Variables) ---
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "brain-ai-1024")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "docubrain-files")

if not PINECONE_API_KEY or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError(
        "Missing required environment variables: PINECONE_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_KEY"
    )

# Initialize Pinecone & Supabase clients
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(PINECONE_INDEX_NAME)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


class QueryRequest(BaseModel):
    query: str


def get_embeddings(texts: List[str], input_type: str = "passage") -> List[List[float]]:
    try:
        res = pc.inference.embed(
            model="multilingual-e5-large",
            inputs=texts,
            parameters={"input_type": input_type, "truncate": "END"},
        )
        return [item["values"] for item in res]
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Pinecone embedding error: {str(e)}",
        )


def extract_text_from_pdf_bytes(file_bytes: bytes) -> str:
    text = ""
    reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            text += extracted + "\n"
    return text


def chunk_text(text: str, chunk_size: int = 400, overlap: int = 50) -> List[str]:
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i : i + chunk_size])
        chunks.append(chunk)
    return chunks


@app.get("/")
async def health_check():
    return {"status": "ok", "service": "DocuBrain AI Backend"}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    filename = file.filename or "unknown.pdf"
    storage_path = f"{file_id}/{filename}"
    file_bytes = await file.read()

    # 1. Upload raw file to Supabase Storage
    try:
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=storage_path,
            file=file_bytes,
            file_options={
                "content-type": file.content_type or "application/octet-stream",
                "upsert": "false",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Supabase upload failed: {str(e)}")

    # 2. Extract text from memory
    if filename.lower().endswith(".pdf"):
        extracted_text = extract_text_from_pdf_bytes(file_bytes)
    else:
        extracted_text = file_bytes.decode("utf-8", errors="ignore")

    # 3. Chunk and upsert vectors + storage_path metadata to Pinecone
    chunks = chunk_text(extracted_text)
    if chunks:
        embeddings = get_embeddings(chunks, input_type="passage")
        vectors_to_upsert = []
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            vectors_to_upsert.append(
                {
                    "id": f"{file_id}_chunk_{i}",
                    "values": emb,
                    "metadata": {
                        "file_id": file_id,
                        "filename": filename,
                        "storage_path": storage_path,
                        "text": chunk[:1000],
                    },
                }
            )
        index.upsert(vectors=vectors_to_upsert)

    return {"file_id": file_id, "filename": filename, "status": "indexed"}


@app.post("/api/search")
async def search_files(request: QueryRequest):
    query_embedding = get_embeddings([request.query], input_type="query")[0]

    results = index.query(
        vector=query_embedding,
        top_k=3,
        include_metadata=True,
    )

    matched_files = []
    seen_files = set()

    for match in results.get("matches", []):
        meta = match.get("metadata", {})
        fid = meta.get("file_id")
        if fid and fid not in seen_files:
            seen_files.add(fid)
            matched_files.append(
                {
                    "id": fid,
                    "name": meta.get("filename", "Unknown"),
                    "relevanceSnippet": meta.get("text", "")[:140] + "...",
                }
            )

    if not matched_files:
        answer = f"I searched your files for '{request.query}', but found no matching topics."
    else:
        answer = f"I scanned your indexed files and found {len(matched_files)} document(s) matching your request:"

    return {
        "answer": answer,
        "matched_files": matched_files,
    }


@app.get("/api/download/{file_id}")
async def download_file(file_id: str):
    res = index.fetch(ids=[f"{file_id}_chunk_0"])
    vectors = res.get("vectors", {})
    chunk_data = vectors.get(f"{file_id}_chunk_0")

    if not chunk_data:
        raise HTTPException(status_code=404, detail="File metadata not found")

    storage_path = chunk_data.get("metadata", {}).get("storage_path")
    if not storage_path:
        raise HTTPException(status_code=404, detail="Storage path missing")

    signed = supabase.storage.from_(SUPABASE_BUCKET).create_signed_url(
        storage_path, 600, {"download": True}
    )
    signed_url = signed.get("signedURL") or signed.get("signedUrl")
    if not signed_url:
        raise HTTPException(status_code=500, detail="Could not generate download URL")

    return RedirectResponse(url=signed_url)
