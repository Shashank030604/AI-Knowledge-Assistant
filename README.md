
# AI Knowledge Assistant

An AI-powered document question-answering application that allows users to upload PDF and TXT documents, ask questions about their content, and receive answers grounded in relevant document passages.

## Features

- Upload PDF and TXT documents
- Extract text from uploaded documents
- Retrieve relevant passages using TF-IDF
- Generate contextual answers using Amazon Bedrock Nova Lite
- Display relevant source information with answers
- Save and manage chat conversations using SQLite
- Interactive web interface built with HTML, CSS, and JavaScript
- REST APIs developed using FastAPI

## Technology Stack

- **Language:** Python
- **Backend:** FastAPI
- **AI Model:** Amazon Bedrock — Nova Lite
- **Information Retrieval:** TF-IDF and cosine similarity
- **Database:** SQLite
- **Document Processing:** pypdf
- **Frontend:** HTML, CSS, JavaScript
- **Server:** Uvicorn

## Architecture

1. Users upload PDF or TXT documents.
2. The application extracts the document text.
3. TF-IDF retrieval identifies relevant passages for a question.
4. The selected passages are sent to Amazon Bedrock Nova Lite.
5. The model generates an answer based on the retrieved context.
6. The application displays the answer and sources.
7. SQLite stores conversation history.

## Run Locally

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd AI-Knowledge-Assistant
```

### 2. Create and activate a virtual environment

Windows:

```bat
python -m venv .venv
.venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure AWS credentials

Configure AWS credentials using an approved AWS authentication method. Ensure the account has permission to invoke the Amazon Bedrock model in the configured region.

### 5. Start the application

```bash
python -m uvicorn main:app --reload
```

Open the application:

- UI: http://127.0.0.1:8000/ui
- API documentation: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health

## Security Notes

- Never commit AWS credentials, access keys, passwords, or `.env` files.
- Review uploaded-document storage and database files before publishing.
- Configure appropriate file-size limits and input validation.

## Future Improvements

- Add automated tests
- Improve document retrieval accuracy
- Add support for more document formats
- Deploy the application to a cloud platform

## Author

Add your name and professional links here.
