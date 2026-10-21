
"""TF-IDF-style document retrieval for the AI Knowledge Assistant.

Uses Python's standard library only; no additional package is required.
"""

import math
import re
from collections import Counter


# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------

CHUNK_SIZE_WORDS = 180
CHUNK_OVERLAP_WORDS = 35
DEFAULT_TOP_K = 5


# --------------------------------------------------
# TEXT PROCESSING
# --------------------------------------------------

def tokenize(text: str) -> list[str]:
    """Convert text into lowercase word tokens."""
    return re.findall(r"\b[a-zA-Z0-9_]+\b", text.lower())


def split_into_chunks(
    document_text: str,
    chunk_size: int = CHUNK_SIZE_WORDS,
    overlap: int = CHUNK_OVERLAP_WORDS,
) -> list[str]:
    """Split document text into overlapping word chunks."""

    if not document_text or not document_text.strip():
        return []

    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than zero.")

    if overlap < 0 or overlap >= chunk_size:
        raise ValueError(
            "overlap must be non-negative and smaller than chunk_size."
        )

    words = document_text.split()
    chunks = []
    step = chunk_size - overlap

    for start in range(0, len(words), step):
        chunk_words = words[start:start + chunk_size]

        if not chunk_words:
            break

        chunks.append(" ".join(chunk_words))

        if start + chunk_size >= len(words):
            break

    return chunks


# --------------------------------------------------
# TF-IDF CALCULATIONS
# --------------------------------------------------

def calculate_term_frequency(tokens: list[str]) -> Counter:
    """Calculate normalized term frequency for a token list."""

    counts = Counter(tokens)
    total = len(tokens)

    if total == 0:
        return Counter()

    return Counter({
        term: count / total
        for term, count in counts.items()
    })


def calculate_inverse_document_frequency(
    documents: list[list[str]],
) -> dict[str, float]:
    """Calculate smoothed inverse document frequency."""

    document_count = len(documents)
    document_frequency = Counter()

    for tokens in documents:
        document_frequency.update(set(tokens))

    return {
        term: math.log(
            (1 + document_count) / (1 + frequency)
        ) + 1
        for term, frequency in document_frequency.items()
    }


def create_tfidf_vector(
    tokens: list[str],
    idf: dict[str, float],
) -> dict[str, float]:
    """Create a TF-IDF vector for one document or query."""

    term_frequency = calculate_term_frequency(tokens)

    return {
        term: frequency * idf.get(term, 0.0)
        for term, frequency in term_frequency.items()
        if idf.get(term, 0.0) > 0
    }


def cosine_similarity(
    vector_a: dict[str, float],
    vector_b: dict[str, float],
) -> float:
    """Calculate cosine similarity between two sparse vectors."""

    if not vector_a or not vector_b:
        return 0.0

    common_terms = set(vector_a).intersection(vector_b)

    dot_product = sum(
        vector_a[term] * vector_b[term]
        for term in common_terms
    )

    norm_a = math.sqrt(
        sum(value * value for value in vector_a.values())
    )
    norm_b = math.sqrt(
        sum(value * value for value in vector_b.values())
    )

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return dot_product / (norm_a * norm_b)


# --------------------------------------------------
# MAIN RETRIEVAL FUNCTION
# --------------------------------------------------

def retrieve_relevant_chunks(
    document_text: str,
    question: str,
    top_k: int = DEFAULT_TOP_K,
) -> list[dict]:
    """Return the most relevant document passages for a question.

    Args:
        document_text: Full extracted text from the uploaded document.
        question: User's question.
        top_k: Maximum number of passages to return.

    Returns:
        A list of dictionaries containing:
        - chunk_index: zero-based index of the selected chunk
        - score: cosine similarity score rounded to four decimals
        - text: original chunk text
    """

    if top_k <= 0:
        return []

    if not document_text or not document_text.strip():
        return []

    if not question or not question.strip():
        return []

    chunks = split_into_chunks(document_text)

    if not chunks:
        return []

    tokenized_chunks = [
        tokenize(chunk)
        for chunk in chunks
    ]

    query_tokens = tokenize(question)

    if not query_tokens:
        return []

    # Fit IDF on the document chunks.
    idf = calculate_inverse_document_frequency(tokenized_chunks)

    # Use the same IDF weights for chunks and the query.
    chunk_vectors = [
        create_tfidf_vector(tokens, idf)
        for tokens in tokenized_chunks
    ]

    query_vector = create_tfidf_vector(query_tokens, idf)

    if not query_vector:
        return []

    scored_chunks = []

    for index, chunk in enumerate(chunks):
        score = cosine_similarity(
            chunk_vectors[index],
            query_vector,
        )

        scored_chunks.append({
            "chunk_index": index,
            "score": round(score, 4),
            "text": chunk,
        })

    # Higher-scoring passages appear first.
    scored_chunks.sort(
        key=lambda item: item["score"],
        reverse=True,
    )

    return scored_chunks[:top_k]


# --------------------------------------------------
# OPTIONAL COMMAND-LINE TEST
# --------------------------------------------------

if __name__ == "__main__":
    sample_document = """
    Python is a programming language used for web development,
    automation, data analysis, and artificial intelligence.

    FastAPI is a Python framework used to build APIs.
    It supports request validation and automatic API documentation.

    TF-IDF is a text retrieval technique that measures how important
    terms are within documents relative to a collection of documents.

    Amazon Bedrock provides access to foundation models such as
    Amazon Nova Lite for text generation and question answering.
    """

    sample_question = "What is FastAPI used for?"

    results = retrieve_relevant_chunks(
        sample_document,
        sample_question,
        top_k=3,
    )

    for result in results:
        print(f"\nChunk: {result['chunk_index']}")
        print(f"Score: {result['score']}")
        print(result["text"])
