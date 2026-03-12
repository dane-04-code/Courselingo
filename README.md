# PDF Translation App

Full-stack starter project for translating PDF files.

## Stack

- Frontend: Next.js 14, Tailwind CSS, TypeScript
- Backend: FastAPI

## Project Structure

- `/frontend` — Next.js app
- `/backend`
  - `/services`
    - `deepl.py`
    - `pdf_parser.py`
    - `pdf_builder.py`
  - `main.py`
  - `requirements.txt`
- `.env.example`
- `CONTEXT.md`

## Setup

### 1) Frontend

1. Open a terminal in `/frontend`
2. Install dependencies:
   - `npm install`
3. Start development server:
   - `npm run dev`
4. Visit: `http://localhost:3000`

### 2) Backend

1. Open a terminal in `/backend`
2. Create virtual environment:
   - Windows: `python -m venv .venv`
3. Activate virtual environment:
   - PowerShell: `.\.venv\Scripts\Activate.ps1`
4. Install dependencies:
   - `pip install -r requirements.txt`
5. Run API:
   - `uvicorn main:app --reload`
6. Health check:
   - `http://127.0.0.1:8000/health`

## Environment Variables

Copy `.env.example` to `.env` and fill in real keys:

- `DEEPL_API_KEY`
- `LEMONSQUEEZY_API_KEY`
