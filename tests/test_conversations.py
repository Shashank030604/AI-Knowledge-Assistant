
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_create_and_list_conversations():
    # First, upload a real document through the API.
    upload_response = client.post(
        "/documents/upload",
        files={
            "file": (
                "conversation_test.txt",
                b"Python is a programming language used for backend development.",
                "text/plain",
            )
        },
    )

    assert upload_response.status_code in (200, 201), upload_response.text

    upload_data = upload_response.json()

    # Use the actual document ID returned by the API.
    document_id = upload_data["document_id"]
    document_filename = upload_data["filename"]

    # Create a conversation linked to the uploaded document.
    create_response = client.post(
        "/conversations",
        json={
            "title": "Automated Test Conversation",
            "document_id": document_id,
            "document_filename": document_filename,
        },
    )

    assert create_response.status_code in (200, 201), create_response.text

    # Verify that the conversations endpoint responds successfully.
    list_response = client.get("/conversations")

    assert list_response.status_code == 200, list_response.text
