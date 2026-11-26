import os
import io
import re
import json
import hashlib
from typing import List, Any
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import PyPDF2
import docx
from pinecone import Pinecone
from supabase import create_client, Client
from google import genai
from google.genai import types

load_dotenv()

app = FastAPI(title="DocuBrain AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Environment Configuration ---
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "brain-ai-1024")
PINECONE_NAMESPACE = os.getenv("PINECONE_NAMESPACE", "default")
MIN_SIMILARITY_SCORE = float(os.getenv("MIN_SIMILARITY_SCORE", "0.25"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "docubrain-files")

GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()

if not PINECONE_API_KEY or not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError(
        "Missing required environment variables: PINECONE_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_KEY"
    )

# --- Initialize Clients ---
pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(PINECONE_INDEX_NAME)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
gemini_client = (
    genai.Client(
        api_key=GEMINI_API_KEY,
        http_options=types.HttpOptions(timeout=25000),
    )
    if GEMINI_API_KEY
    else None
)


class QueryRequest(BaseModel):
    query: str


# --- Helper Utilities ---
def to_plain_dict(obj: Any) -> dict:
    """Safely converts Pinecone SDK response/model objects into plain Python dicts."""
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    try:
        return dict(obj)
    except Exception:
        result = {}
        for key in (
            "documents",
            "fields",
            "metadata",
            "result",
            "hits",
            "matches",
            "_score",
            "score",
        ):
            if hasattr(obj, key):
                result[key] = getattr(obj, key)
        return result


def extract_text_from_pdf_bytes(file_bytes: bytes) -> str:
    text = ""
    reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            text += extracted + "\n"
    return text


def extract_text_from_docx_bytes(file_bytes: bytes) -> str:
    doc = docx.Document(io.BytesIO(file_bytes))
    parts = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(
                cell.text.strip() for cell in row.cells if cell.text.strip()
            )
            if row_text:
                parts.append(row_text)
    return "\n".join(parts)


def chunk_text(text: str, chunk_size: int = 400, overlap: int = 50) -> List[str]:
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i : i + chunk_size])
        chunks.append(chunk)
    return chunks


def normalize_tokens(text: str) -> set:
    return {t for t in re.split(r"[^a-z0-9]+", text.lower()) if len(t) >= 3}


def query_matches_filename(query: str, filename: str) -> bool:
    q_lower = query.lower()
    f_lower = filename.lower()
    f_stem = os.path.splitext(f_lower)[0]

    if f_lower in q_lower or (len(f_stem) >= 4 and f_stem in q_lower):
        return True

    q_tokens = normalize_tokens(q_lower)
    f_tokens = normalize_tokens(f_stem) - {
        "pdf",
        "docx",
        "txt",
        "doc",
        "file",
        "document",
    }
    if not f_tokens:
        return False
    overlap = q_tokens & f_tokens
    return len(overlap) >= min(2, len(f_tokens))


def is_summary_query(query: str) -> bool:
    q = query.lower()
    summary_keywords = [
        "summarize",
        "summarise",
        "summary",
        "overview",
        "what is in",
        "what's in",
        "about this document",
        "about the document",
        "about these documents",
        "explain the document",
        "key points",
    ]
    return any(kw in q for kw in summary_keywords)


def list_all_stored_files() -> List[dict]:
    """Lists all stored files and metadata from Supabase Storage."""
    files = []
    try:
        folders = supabase.storage.from_(SUPABASE_BUCKET).list()
        for folder in folders or []:
            fid = folder.get("name")
            if not fid:
                continue
            inner = supabase.storage.from_(SUPABASE_BUCKET).list(fid)
            for item in inner or []:
                fname = item.get("name")
                if not fname:
                    continue
                meta = item.get("metadata") or {}
                files.append(
                    {
                        "id": fid,
                        "name": fname,
                        "sizeBytes": meta.get("size", 0),
                        "uploadedAt": item.get("created_at")
                        or item.get("updated_at")
                        or "",
                        "type": os.path.splitext(fname)[1].lower().lstrip(".") or "file",
                    }
                )
    except Exception as e:
        print(f"STORAGE LIST ERROR: {e}")
    return files


def fetch_chunks_for_file(file_id: str, max_chunks: int = 6) -> List[str]:
    """Fetches the first N sequential chunks for a specific file_id from Pinecone."""
    chunk_ids = [f"{file_id}_chunk_{i}" for i in range(max_chunks)]
    fetched = index.documents.fetch(
        namespace=PINECONE_NAMESPACE,
        ids=chunk_ids,
    )
    fetched_dict = to_plain_dict(fetched)
    docs = to_plain_dict(fetched_dict.get("documents"))

    texts = []
    for cid in chunk_ids:
        cdata = docs.get(cid)
        if not cdata:
            continue
        cdata_dict = to_plain_dict(cdata)
        fields = to_plain_dict(
            cdata_dict.get("fields") or cdata_dict.get("metadata") or cdata_dict
        )
        text = str(fields.get("chunk_text", "")).strip()
        if text:
            texts.append(text)
    return texts


# --- API Routes ---
@app.get("/")
async def health_check():
    return {
        "status": "ok",
        "service": "DocuBrain AI Backend",
        "rag_enabled": bool(gemini_client),
    }


@app.get("/api/files")
async def get_all_files(sort_by: str = "newest"):
    """Returns all uploaded files from Supabase Storage for the My Drive view."""
    try:
        files = list_all_stored_files()
        if sort_by == "name":
            files.sort(key=lambda x: x["name"].lower())
        elif sort_by == "size":
            files.sort(key=lambda x: x["sizeBytes"], reverse=True)
        elif sort_by == "oldest":
            files.sort(key=lambda x: x["uploadedAt"])
        else:
            files.sort(key=lambda x: x["uploadedAt"], reverse=True)
        return {"files": files}
    except Exception as e:
        print(f"LIST FILES ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Could not list files: {str(e)}")


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Extracts text, stores the raw file in Supabase, and indexes chunks in Pinecone."""
    try:
        filename = file.filename or "unknown.pdf"
        file_bytes = await file.read()

        file_id = hashlib.sha256(file_bytes).hexdigest()[:32]
        storage_path = f"{file_id}/{filename}"

        # 1. Extract clean text BEFORE storing/indexing
        lower_name = filename.lower()
        if lower_name.endswith(".pdf"):
            extracted_text = extract_text_from_pdf_bytes(file_bytes)
        elif lower_name.endswith(".docx"):
            try:
                extracted_text = extract_text_from_docx_bytes(file_bytes)
            except Exception as docx_err:
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not parse DOCX file (ensure it is a valid .docx, not legacy .doc): {docx_err}",
                )
        elif lower_name.endswith(
            (".txt", ".md", ".csv", ".py", ".js", ".ts", ".json")
        ):
            extracted_text = file_bytes.decode("utf-8", errors="ignore")
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file format. Please upload PDF, DOCX, or TXT files.",
            )

        if not extracted_text.strip():
            raise HTTPException(
                status_code=400,
                detail="No readable text found in file (scanned image PDFs without OCR are not supported).",
            )

        print(f"UPLOAD PARSED: {filename} -> {len(extracted_text)} characters")

        # 2. Upload raw file to Supabase Storage
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=storage_path,
            file=file_bytes,
            file_options={
                "content-type": file.content_type or "application/octet-stream",
                "upsert": "true",
            },
        )

        # 3. Chunk and upsert to Pinecone in batches of 50
        chunks = chunk_text(extracted_text)
        if chunks:
            documents = [
                {
                    "_id": f"{file_id}_chunk_{i}",
                    "chunk_text": f"Document Filename: {filename}\n\n{chunk}",
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

        return {
            "file_id": file_id,
            "filename": filename,
            "chunks_indexed": len(chunks),
            "status": "indexed",
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"UPLOAD ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")


@app.post("/api/search")
async def search_files(request: QueryRequest):
    """Searches documents by filename, summary intent, or semantic vector similarity."""
    try:
        summary_mode = is_summary_query(request.query)
        stored_files = list_all_stored_files()
        named_files = [
            f for f in stored_files if query_matches_filename(request.query, f["name"])
        ]

        candidate_files = []
        seen_keys = set()
        context_blocks = []
        chunks_per_file = {}

        # A. Direct fetch when searching or summarizing by filename
        if named_files:
            for nf in named_files:
                fid = nf["id"]
                fname = nf["name"]
                try:
                    texts = fetch_chunks_for_file(fid, max_chunks=6)
                    for text in texts:
                        chunks_per_file[fname] = chunks_per_file.get(fname, 0) + 1
                        context_blocks.append(f"\n{text[:1500]}")

                    if texts and (fid, fname) not in seen_keys:
                        seen_keys.add((fid, fname))
                        seen_keys.add(fname)
                        candidate_files.append(
                            {
                                "id": fid,
                                "name": fname,
                                "relevanceSnippet": texts[0][:140] + "...",
                            }
                        )
                except Exception as fetch_err:
                    print(f"DIRECT FETCH ERROR ({fname}): {fetch_err}")

        # B. Broad summary across all stored documents when no specific filename is given
        if summary_mode and not named_files and stored_files:
            for sf in stored_files:
                fid = sf["id"]
                fname = sf["name"]
                try:
                    texts = fetch_chunks_for_file(fid, max_chunks=3)
                    for text in texts:
                        chunks_per_file[fname] = chunks_per_file.get(fname, 0) + 1
                        context_blocks.append(f"\n{text[:1200]}")

                    if texts and (fid, fname) not in seen_keys:
                        seen_keys.add((fid, fname))
                        seen_keys.add(fname)
                        candidate_files.append(
                            {
                                "id": fid,
                                "name": fname,
                                "relevanceSnippet": texts[0][:140] + "...",
                            }
                        )
                except Exception as sum_err:
                    print(f"SUMMARY FETCH ERROR ({fname}): {sum_err}")

        # C. Semantic vector search for topic-based queries
        if not named_files and not summary_mode:
            try:
                results = index.documents.search(
                    namespace=PINECONE_NAMESPACE,
                    query={
                        "inputs": {"text": request.query},
                        "top_k": 12,
                    },
                    fields=["file_id", "filename", "chunk_text"],
                )
            except TypeError:
                results = index.documents.search(
                    namespace=PINECONE_NAMESPACE,
                    top_k=12,
                    score_by=[
                        {
                            "type": "embed",
                            "field": "chunk_text",
                            "query": request.query,
                        }
                    ],
                    include_fields=["file_id", "filename", "chunk_text"],
                )

            res_dict = to_plain_dict(results)
            result_inner = to_plain_dict(res_dict.get("result"))
            hits = (
                result_inner.get("hits")
                or res_dict.get("hits")
                or res_dict.get("matches")
                or []
            )

            for hit in hits:
                hit_dict = to_plain_dict(hit)

                score = (
                    hit_dict.get("_score")
                    if "_score" in hit_dict
                    else hit_dict.get("score")
                )
                if score is not None and float(score) < MIN_SIMILARITY_SCORE:
                    continue

                fields = to_plain_dict(
                    hit_dict.get("fields") or hit_dict.get("metadata") or hit_dict
                )

                fid = fields.get("file_id")
                fname = fields.get("filename", "Unknown")
                chunk_content = str(fields.get("chunk_text", "")).strip()

                file_count = chunks_per_file.get(fname, 0)
                if chunk_content and file_count < 3 and len(context_blocks) < 10:
                    chunks_per_file[fname] = file_count + 1
                    context_blocks.append(f"\n{chunk_content[:1200]}")

                dedup_key = (fid, fname)
                if fid and dedup_key not in seen_keys and fname not in seen_keys:
                    seen_keys.add(dedup_key)
                    seen_keys.add(fname)
                    candidate_files.append(
                        {
                            "id": fid,
                            "name": fname,
                            "relevanceSnippet": chunk_content[:140] + "...",
                        }
                    )

        if not candidate_files:
            return {
                "answer": f"No documents were found covering '{request.query}'.",
                "matched_files": [],
            }

        # D. Gemini RAG Synthesis & Strict File Relevance Filtering
        if gemini_client and context_blocks:
            joined_context = "\n\n---\n\n".join(context_blocks)
            prompt = (
                "You are DocuBrain AI, a helpful document retrieval and summarization assistant. "
                "Analyze the user's request and the provided document excerpts.\n"
                "Return ONLY valid JSON with two keys:\n"
                '1. "answer": A clear, well-structured response answering or summarizing based ONLY on the excerpts. '
                "If the user asked for a summary or matched a file by name, provide a comprehensive summary covering all excerpts provided for those files. "
                "If the user asked for a specific topic and NONE of the excerpts cover that topic, state clearly that no uploaded documents cover that topic.\n"
                '2. "relevant_files": A JSON array of exact source filenames (from the headers) that match the user\'s request or summary. '
                "If NO documents match, return an empty array [].\n\n"
                f"User Request: {request.query}\n\n"
                f"Document Excerpts:\n{joined_context}"
            )

            parsed_result = None
            for model_name in ["gemini-3.5-flash-lite", "gemini-3.8-flash"]:
                try:
                    llm_response = gemini_client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                        ),
                    )
                    if llm_response.text:
                        parsed_result = json.loads(llm_response.text)
                        break
                except Exception as llm_err:
                    print(f"GEMINI ERROR ({model_name}): {llm_err}")

            if isinstance(parsed_result, dict):
                answer = str(
                    parsed_result.get("answer")
                    or f"No documents were found covering '{request.query}'."
                )
                relevant_names = {
                    str(name).strip().lower()
                    for name in parsed_result.get("relevant_files", [])
                }
                matched_files = [
                    f
                    for f in candidate_files
                    if f["name"].strip().lower() in relevant_names
                ]
                return {
                    "answer": answer,
                    "matched_files": matched_files,
                }

        return {
            "answer": f"I scanned your indexed files and found {len(candidate_files)} document(s) matching your request:",
            "matched_files": candidate_files,
        }
    except Exception as e:
        print(f"SEARCH ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")


@app.get("/api/download/{file_id}")
async def download_file(file_id: str):
    """Generates a temporary signed download URL from Supabase Storage."""
    try:
        res = index.documents.fetch(
            namespace=PINECONE_NAMESPACE,
            ids=[f"{file_id}_chunk_0"],
        )
        res_dict = to_plain_dict(res)
        docs = to_plain_dict(res_dict.get("documents"))
        chunk_data = docs.get(f"{file_id}_chunk_0")

        if not chunk_data:
            raise HTTPException(status_code=404, detail="File metadata not found")

        chunk_dict = to_plain_dict(chunk_data)
        fields = to_plain_dict(
            chunk_dict.get("fields") or chunk_dict.get("metadata") or chunk_dict
        )

        storage_path = fields.get("storage_path")
        if not storage_path:
            raise HTTPException(status_code=404, detail="Storage path missing")

        signed = supabase.storage.from_(SUPABASE_BUCKET).create_signed_url(
            storage_path, 600, {"download": True}
        )
        signed_url = signed.get("signedURL") or signed.get("signedUrl")
        if not signed_url:
            raise HTTPException(
                status_code=500, detail="Could not generate download URL"
            )

        return RedirectResponse(url=signed_url)
    except HTTPException:
        raise
    except Exception as e:
        print(f"DOWNLOAD ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Download error: {str(e)}")


@app.delete("/api/files/{file_id}")
async def delete_file(file_id: str):
    """Deletes a file from both Supabase Storage and Pinecone."""
    try:
        inner = supabase.storage.from_(SUPABASE_BUCKET).list(file_id)
        paths_to_remove = [
            f"{file_id}/{item['name']}" for item in (inner or []) if item.get("name")
        ]
        if paths_to_remove:
            supabase.storage.from_(SUPABASE_BUCKET).remove(paths_to_remove)

        try:
            index.documents.delete(
                namespace=PINECONE_NAMESPACE,
                filter={"file_id": {"$eq": file_id}},
            )
        except Exception:
            chunk_ids = [f"{file_id}_chunk_{i}" for i in range(200)]
            index.documents.delete(
                namespace=PINECONE_NAMESPACE,
                ids=chunk_ids,
            )

        return {"status": "deleted", "file_id": file_id}
    except Exception as e:
        print(f"DELETE FILE ERROR: {e}")
        raise HTTPException(status_code=500, detail=f"Delete error: {str(e)}")
