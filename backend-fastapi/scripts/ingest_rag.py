import csv
import json
import os
import sys
from dataclasses import dataclass
from typing import Iterable, List, Optional

from sentence_transformers import SentenceTransformer
from supabase import create_client

from dotenv import load_dotenv

load_dotenv()

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL") or "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
DEFAULT_CATEGORY = "general"
DEFAULT_CHUNK_SIZE = 1800  # chars
DEFAULT_OVERLAP = 200      # chars


@dataclass
class Post:
    parent_id: str
    category: str
    title: str
    content: str


def chunk_text(text: str, chunk_size: int, overlap: int) -> List[str]:
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        chunks.append(text[start:end].strip())
        if end == len(text):
            break
        start = max(0, end - overlap)
    return [c for c in chunks if c]


def embed_texts(model: SentenceTransformer, texts: List[str]) -> List[List[float]]:
    if not texts:
        return []
    vectors = model.encode(texts, normalize_embeddings=True)
    return [v.tolist() for v in vectors]


def insert_chunks(sb, chunks: List[dict]) -> None:
    if not chunks:
        return
    sb.table("rag_chunks").insert(chunks).execute()


def read_csv(path: str) -> List[Post]:
    posts: List[Post] = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            posts.append(
                Post(
                    parent_id=row.get("parent_id", "").strip(),
                    category=row.get("category", DEFAULT_CATEGORY).strip() or DEFAULT_CATEGORY,
                    title=(row.get("title") or "").strip(),
                    content=(row.get("content") or "").strip(),
                )
            )
    return posts


def read_jsonl(path: str) -> List[Post]:
    posts: List[Post] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            obj = json.loads(line)
            posts.append(
                Post(
                    parent_id=str(obj.get("parent_id", "")).strip(),
                    category=str(obj.get("category", DEFAULT_CATEGORY)).strip() or DEFAULT_CATEGORY,
                    title=str(obj.get("title", "")).strip(),
                    content=str(obj.get("content", "")).strip(),
                )
            )
    return posts


def read_interactive() -> List[Post]:
    posts: List[Post] = []
    print("Paste posts. Leave parent_id empty to stop.\n")
    while True:
        parent_id = input("parent_id: ").strip()
        if not parent_id:
            break
        category = input("category (resume/interview/etc): ").strip() or DEFAULT_CATEGORY
        title = input("title (optional): ").strip()
        print("content (finish with a single line containing only END):")
        lines: List[str] = []
        while True:
            line = input()
            if line.strip() == "END":
                break
            lines.append(line)
        content = "\n".join(lines).strip()
        posts.append(Post(parent_id=parent_id, category=category, title=title, content=content))
        print("Saved locally. Add another or press Enter on parent_id to finish.\n")
    return posts


def validate_posts(posts: Iterable[Post]) -> List[Post]:
    valid: List[Post] = []
    for p in posts:
        if not p.parent_id:
            print("Skipping post with empty parent_id")
            continue
        if not p.content:
            print(f"Skipping {p.parent_id} (empty content)")
            continue
        valid.append(p)
    return valid


def main() -> int:
    supabase_url = os.getenv("REACT_APP_SUPABASE_URL")
    supabase_key = os.getenv("REACT_APP_SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_key:
        print("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars")
        return 1

    if len(sys.argv) >= 2:
        path = sys.argv[1]
        if path.lower().endswith(".csv"):
            posts = read_csv(path)
        elif path.lower().endswith(".jsonl"):
            posts = read_jsonl(path)
        else:
            print("Unsupported file format. Use .csv or .jsonl")
            return 1
    else:
        posts = read_interactive()

    posts = validate_posts(posts)
    if not posts:
        print("No valid posts to ingest.")
        return 0

    model = SentenceTransformer(EMBEDDING_MODEL)
    sb = create_client(supabase_url, supabase_key)

    chunk_size = DEFAULT_CHUNK_SIZE
    overlap = DEFAULT_OVERLAP

    total_chunks = 0
    for p in posts:
        chunks = chunk_text(p.content, chunk_size, overlap)
        embeddings = embed_texts(model, chunks)
        payload = []
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            payload.append(
                {
                    "parent_id": p.parent_id,
                    "chunk_index": i,
                    "category": p.category,
                    "title": p.title,
                    "content": chunk,
                    "embedding": emb,
                }
            )
        insert_chunks(sb, payload)
        total_chunks += len(payload)
        print(f"Inserted {len(payload)} chunks for {p.parent_id}")

    print(f"Done. Total chunks inserted: {total_chunks}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
