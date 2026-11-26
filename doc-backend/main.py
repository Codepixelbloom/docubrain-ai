import os
import io
import hashlib
from typing import List
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import PyPDF2
from pinecone import Pinecone
from supabase import create_client, Client
from google import genai

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Configuration ---
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "brain-ai-1024")
PINECONE_NAMESPACE = os.getenv("PINECONE_NAMESPACE", "default")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "docubrain-files")

GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()

if not PINECONE_API_KEY or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError(
        "Missing required environment variables: PINECONE_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_KEY"
    )

# Initialize Pinecone, Supabase, and Gemini clients
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(PINECONE_INDEX_NAME)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None


class QueryRequest(BaseModel):
    query: str


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
    return {
        "status": "ok",
        "service": "DocuBrain AI Backend",
        "rag_enabled": bool(gemini_client),
    }


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        filename = file.filename or "unknown.pdf"
        file_bytes = await file.read()

        file_id = hashlib.sha256(file_bytes).hexdigest()[:32]
        storage_path = f"{file_id}/{filename}"

        existing = index.documents.fetch(
            namespace=PINECONE_NAMESPACE,
            ids=[f"{file_id}_chunk_0"],
        )
        existing_docs = getattr(existing, "documents", None) or (
            existing.get("documents", {}) if isinstance(existing, dict) else {}
        )
        if f"{file_id}_chunk_0" in existing_docs:
            return {
                "file_id": file_id,
                "filename": filename,
                "status": "already_exists",
            }

        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=storage_path,
            file=file_bytes,
            file_options={
                "content-type": file.content_type or "application/octet-stream",
                "upsert": "true",
            },
        )

        if filename.lower().endswith(".pdf"):
            extracted_text = extract_text_from_pdf_bytes(file_bytes)
        else:
            extracted_text = file_bytes.decode("utf-8", errors="ignore")

        chunks = chunk_text(extracted_text)
        if chunks:
            documents = [
                {
                    "_id": f"{file_id}_chunk_{i}",
                    "chunk_text": chunk,
                    "title": filename,
                    "file_id": file_id,
                    "filename": filename,
                    "storage_path": storage_path,
                }
                for i, chunk in enumerate(chunks)
            ]
            for i in range(0, len(documents), 50):
                index.documents.upsert(
                    namespace=PINECONE_NAMESPACE,
                    documents=documents[i : i + 50],
                )

        return {"file_id": file_id, "filename": filename, "status": "indexed"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"UPLOAD ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")


@app.post("/api/search")
async def search_files(request: QueryRequest):
    try:
        try:
            results = index.documents.search(
                namespace=PINECONE_NAMESPACE,
                query={
                    "inputs": {"text": request.query},
                    "top_k": 8,
                },
                fields=["file_id", "filename", "chunk_text"],
            )
        except TypeError:
            results = index.documents.search(
                namespace=PINECONE_NAMESPACE,
                top_k=8,
                score_by=[
                    {
                        "type": "embed",
                        "field": "chunk_text",
                        "query": request.query,
                    }
                ],
                include_fields=["file_id", "filename", "chunk_text"],
            )

        matched_files = []
        seen_keys = set()
        context_blocks = []

        res_dict = (
            results.to_dict()
            if hasattr(results, "to_dict")
            else (results if isinstance(results, dict) else vars(results))
        )

        hits = (
            res_dict.get("result", {}).get("hits")
            or res_dict.get("hits")
            or res_dict.get("matches")
            or []
        )

        for hit in hits:
            hit_dict = (
                hit.to_dict()
                if hasattr(hit, "to_dict")
                else (hit if isinstance(hit, dict) else vars(hit))
            )
            fields = hit_dict.get("fields") or hit_dict.get("metadata") or hit_dict
            if hasattr(fields, "to_dict"):
                fields = fields.to_dict()
            elif not isinstance(fields, dict):
                fields = vars(fields)

            fid = fields.get("file_id")
            fname = fields.get("filename", "Unknown")
            chunk_content = str(fields.get("chunk_text", "")).strip()

            if chunk_content and len(context_blocks) < 5:
                context_blocks.append(f"\n{chunk_content}")

            dedup_key = (fid, fname)
            if fid and dedup_key not in seen_keys and fname not in seen_keys:
                seen_keys.add(dedup_key)
                seen_keys.add(fname)
                matched_files.append(
                    {
                        "id": fid,
                        "name": fname,
                        "relevanceSnippet": chunk_content[:140] + "...",
                    }
                )

        if not matched_files:
            answer = f"I searched your files for '{request.query}', but found no matching topics."
        elif gemini_client and context_blocks:
            joined_context = "\n\n---\n\n".join(context_blocks)
            prompt = (
                "You are DocuBrain AI, a helpful document assistant. Answer the user's question "
                "using ONLY the provided document excerpts below. Cite the source filename(s) when "
                "referencing information. If the excerpts do not contain the answer, say so clearly.\n\n"
                f"User Question: {request.query}\n\n"
                f"Document Excerpts:\n{joined_context}"
            )
            try:
                llm_response = gemini_client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt,
                )
                answer = (
                    llm_response.text
                    or f"I scanned your indexed files and found {len(matched_files)} document(s) matching your request:"
                )
            except Exception as llm_err:
                print(f"GEMINI ERROR: {llm_err}")
                answer = (
                    f"Found {len(matched_files)} matching document(s) "
                    f"(AI summary unavailable: {str(llm_err)}):"
                )
        else:
            answer = f"I scanned your indexed files and found {len(matched_files)} document(s) matching your request:"

        return {
            "answer": answer,
            "matched_files": matched_files,
        }
    except Exception as e:
        print(f"SEARCH ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")


@app.get("/api/download/{file_id}")
async def download_file(file_id: str):
    try:
        res = index.documents.fetch(
            namespace=PINECONE_NAMESPACE,
            ids=[f"{file_id}_chunk_0"],
        )
        docs = getattr(res, "documents", None) or (
            res.get("documents", {}) if isinstance(res, dict) else {}
        )
        chunk_data = docs.get(f"{file_id}_chunk_0")

        if not chunk_data:
            raise HTTPException(status_code=404, detail="File metadata not found")

        fields = getattr(chunk_data, "fields", None) or (
            chunk_data.get("fields", chunk_data)
            if isinstance(chunk_data, dict)
            else vars(chunk_data)
        )
        if not isinstance(fields, dict):
            fields = dict(fields)

        storage_path = fields.get("storage_path")
        if not storage_path:
            raise HTTPException(status_code=404, detail="Storage path missing")

        signed = supabase.storage.from_(SUPABASE_BUCKET).create_signed_url(
            storage_path, 600, {"download": True}
        )
        signed_url = signed.get("signedURL") or signed.get("signedUrl")
        if not signed_url:
            raise HTTPException(status_code=500, detail="Could not generate download URL")

        return RedirectResponse(url=signed_url)
    except HTTPException:
        raise
    except Exception as e:
        print(f"DOWNLOAD ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Download error: {str(e)}")
