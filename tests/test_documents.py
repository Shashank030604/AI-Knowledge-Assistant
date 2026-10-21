
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_upload_txt_document():
    response = client.post(
        "/documents/upload",
        files={
            "file": (
                "test_document.txt",
                b"Python is a programming language. FastAPI builds APIs.",
                "text/plain",
            )
        },
    )

    assert response.status_code in (200, 201), response.text


def test_reject_unsupported_file():
    response = client.post(
        "/documents/upload",
        files={
            "file": (
                "test_image.jpg",
                b"fake image content",
                "image/jpeg",
            )
        },
    )

    assert response.status_code == 400, response.text
