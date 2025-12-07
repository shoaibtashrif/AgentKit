# Voice AI Assignment — Medical Facility Assistant (RAG + Fine-Tuned LLM + Voice)

## Overview

You are building a **voice-based AI assistant** for a medical management facility called **XYZ Pain Management Center**.

The assistant should answer **administrative and informational questions** over the phone, such as:

- Scheduling or rescheduling appointments  
- Explaining hours and locations  
- Clarifying pre-procedure instructions  
- Explaining insurance / coverage basics (without promising coverage)  
- Handling new patient onboarding questions  

The system must combine:

- **Retrieval-Augmented Generation (RAG)** over the clinic’s documents  
- **A fine-tuned local LLM** (e.g., Qwen, LLaMA, DeepSeek, etc.)  
- **Speech-to-Text (STT)** (e.g., Whisper, Deepgram, etc.)  
- **Text-to-Speech (TTS)** (preferably ElevenLabs, or similar)  
- A **low-latency orchestration pipeline** so the conversation feels responsive and human-like  

You may reorganize or extend the repo as needed, but your solution should be **clear, reproducible, and well-documented**.

---

## Facility Context

- Name: **XYZ Pain Management Center**  
- Type: Outpatient **Pain Management** clinic (focus on chronic back / neck / joint pain, post-surgical pain, injections, nerve blocks, radiofrequency ablations, etc.)  
- Hours of Operation:
  - **Monday–Friday**: 8:00 AM – 5:00 PM  
  - **Saturday–Sunday**: Closed  
- Appointments: By appointment only (no walk-ins)  
- Common patient questions:
  - “Do you accept my insurance?”  
  - “Can I schedule / reschedule my injection?”  
  - “Do I need to fast or have a driver?”  
  - “What time is my appointment and which location?”  
  - “Are you open on Saturdays?”  

> **Safety constraint:** The assistant must **never diagnose**, **never adjust medications**, and **never provide treatment decisions**. For emergencies (chest pain, severe shortness of breath, stroke signs, etc.), it should always direct the patient to **call 911 or go to the nearest ER**.

---

## What You Need to Build

At a high level, you will build a **Voice AI agent** that:

1. **Listens** to the caller via STT (speech → text).  
2. **Searches a private knowledge base** using RAG (vector embeddings + semantic search).  
3. **If RAG finds good context** → Answer grounded in retrieved documents.  
4. **If RAG is not confident** → Fall back to a **fine-tuned local LLM** that has been trained on clinic-style Q&A.  
5. **Speaks the answer back** to the caller using TTS (text → speech).  
6. Responds in a **natural, professional tone** with **minimal perceived latency**.

---

## Data Provided

You are given two main datasets plus any additional project files in the repo.

### 1. `data/medical_frontdesk_train.jsonl`

- **Type:** Structured, clean Q&A data for **front-desk style** interactions.  
- **Purpose:** Supervised fine-tuning of your **local LLM** to:
  - Learn the correct tone (warm, professional, calm).  
  - Learn typical pain management clinic policies and wording.  
  - Learn safe behaviors (no diagnosis, proper 911 redirect, etc.).  

**Format (one JSON object per line):**

```jsonc
{
  "messages": [
    {"role": "system", "content": "You are a friendly, professional front-desk assistant for Northview Pain Management Center. ..."},
    {"role": "user", "content": "Hi, what are your clinic hours during the week?"},
    {"role": "assistant", "content": "Hi! Northview Pain Management Center is open Monday through Friday from 8:00 AM to 5:00 PM. ..."}
  ]
}
```

This aligns with common chat fine-tuning formats (e.g., OpenAI-style, many other frameworks).

You can:

- Use it directly for **LLM fine-tuning** (full fine-tune, LoRA/QLoRA, etc.).  
- Extend it with your own additional examples if desired.

---

### 2. `data/pain_calls_whisper_style.jsonl`

- **Type:** Synthetic **STT-style call transcripts** like what a system such as Whisper would output.  
- **Facility:** Northview Pain Management Center.  
- **Scenarios covered (100+ calls):**
  - New patient inquiries  
  - Scheduling / rescheduling appointments and procedures  
  - Insurance acceptance and coverage questions  
  - Hours / location / parking  
  - Pre-procedure instructions (fasting, driver, medications)  
  - Workers’ comp and referral situations  

**Format (one JSON object per line):**

```jsonc
{
  "call_id": "call_006",
  "transcript": "patient: hi there I wanted to see if you accept my insurance clinic: thank you for calling Northview Pain Management Center this is sarah how may I help you ..."
}
```

Characteristics:

- Call-like, natural language with fillers, run-ons, and imperfect grammar.  
- Includes both patient and “clinic” turns in a single transcript string.  
- Intended to mimic **raw STT output**, not cleaned chat messages.

You can use this dataset in multiple ways, for example:

- As **retrieval data** for your RAG system (chunking the transcripts and embedding them).  
- As test / evaluation queries for your full Voice AI pipeline.  
- As a source to design an **intent / entity labeling** scheme (see below).

---

### 3. Optional Labeled Call Data (Example Schema)

You are **not required** to fully label all calls, but you are encouraged (especially for extra credit / senior-level signal) to:

- Define an **intent schema** for calls, e.g.:
  - `SCHEDULE_APPOINTMENT`  
  - `RESCHEDULE_APPOINTMENT`  
  - `CHECK_INSURANCE`  
  - `CHECK_HOURS`  
  - `CHECK_PREP_INSTRUCTIONS`  
  - `CHECK_APPOINTMENT_DETAILS` (time/location)  
  - `CHECK_AVAILABILITY`  

- Optionally define a small set of **entities**, e.g.:
  - `insurance_provider`  
  - `procedure_type`  
  - `appointment_date`  
  - `appointment_time`  

Below is a **small labeled example** (`data/pain_calls_labeled_example.jsonl`) with 5 calls:

```jsonl
{"call_id": "call_003", "intent": "CHECK_HOURS", "entities": {}, "transcript": "patient: hey good morning I wanted to schedule an appointment for pain management clinic: thank you for calling Northview Pain Management Center ... patient: yeah I was just wondering what your hours are and if you’re open on saturdays ..."}
{"call_id": "call_006", "intent": "CHECK_INSURANCE", "entities": {"insurance_provider": "blue cross blue shield"}, "transcript": "patient: hi there I wanted to see if you accept my insurance clinic: thank you for calling Northview Pain Management Center this is sarah how may I help you patient: yeah do you take blue cross blue shield for new patients ..."}
{"call_id": "call_012", "intent": "RESCHEDULE_APPOINTMENT", "entities": {"procedure_type": "nerve block"}, "transcript": "patient: hi I need to reschedule my injection appointment clinic: northview pain management this is lisa how can I help you patient: I have a nerve block set up for friday afternoon but something came up and I need to move it ..."}
{"call_id": "call_021", "intent": "CHECK_AVAILABILITY", "entities": {}, "transcript": "patient: hi I’m trying to get in to see a doctor for chronic back pain clinic: thank you for calling Northview Pain Management Center how may I assist you patient: my doctor keeps telling me to call you but I just wanted to know how far out you’re booking ..."}
{"call_id": "call_007", "intent": "CHECK_PREP_INSTRUCTIONS", "entities": {"procedure_type": "lumbar injection"}, "transcript": "patient: hi I had a question about my appointment tomorrow clinic: thank you for calling Northview Pain Management Center how can I assist you patient: I think I’m scheduled for an injection in the morning and I wanted to know if I’m supposed to fast ..."}
```

You may:

- Extend this labeled file with more examples.  
- Use it to train a simple **intent classifier** or **router** that sits in front of your RAG / LLM.  
- Or use it purely as reference and handle routing using rule-based or embedding-based approaches.

---

## Core Technical Requirements

### 1. RAG System

Implement a RAG layer that:

- Ingests clinic documents / knowledge (e.g., README/context docs, policy docs, curated FAQs, selected transcripts from `pain_calls_whisper_style.jsonl`, etc.).  
- Splits documents into well-chosen chunks.  
- Generates vector embeddings and stores them in a vector DB of your choice (Qdrant, Chroma, FAISS, PostgreSQL+PGVector, etc.).  
- Implements semantic search for retrieving relevant chunks for each user query.  
- Has a **clear confidence or scoring heuristic** to decide:
  - When you trust RAG and answer from retrieved context.  
  - When to fall back to the fine-tuned local LLM.

When RAG is used:

- The LLM should be instructed to **ground its answer in the retrieved context** and avoid hallucinations.  
- The answer should sound like a **front-desk staff member** at Northview Pain Management Center.

---

### 2. Fine-Tuned Local LLM

Choose a **local language model** that can realistically run on a single machine (e.g., Qwen, LLaMA-derived, DeepSeek, etc.) and:

1. Build a **small but high-quality training dataset**:
   - Start from `medical_frontdesk_train.jsonl`.  
   - Optionally add more examples that cover:
     - Pain-specific workflows (injections, nerve blocks, RF ablations).  
     - Insurance / referral language.  
     - Safety language (no diagnosis, redirect emergencies).  

2. Fine-tune the model:
   - Use any reasonable method (full fine-tune, LoRA/QLoRA, etc.).  
   - Document your **hyperparameters, hardware assumptions, and training process**.

3. Use the fine-tuned model as a **fallback** when:
   - RAG isn’t confident, or  
   - A more general conversational response is needed.

The model should:

- Speak in a warm, professional tone.  
- Avoid diagnosis and medication changes.  
- Provide safe, realistic clinic information and set expectations clearly.

---

### 3. Voice Pipeline (STT + TTS)

Implement an **end-to-end voice pipeline**:

- **STT**: Use Whisper, Deepgram, or a comparable STT system.
  - Input: audio call / microphone.
  - Output: text transcripts similar in style to the provided call data.

- **TTS**: Use **ElevenLabs** (preferred) or another high-quality TTS.
  - Input: the assistant’s text response.
  - Output: natural-sounding audio for the caller.

- **Latency / UX**:
  - You do **not** need literal zero latency, but aim for a **snappy, realistic experience**.  
  - You may discuss tradeoffs you made (e.g., streaming vs. batch, chunk sizes, etc.) in your design doc.

---

### 4. Orchestration & Backend / Demo

Create a small but complete system that orchestrates:

> **Audio in → STT → NLU / RAG / LLM routing → TTS → Audio out**

You may implement this as:

- A **web API** (e.g., FastAPI, Flask) with endpoints for starting a call / sending audio.  
- A simple **CLI demo** that reads an audio file and plays back a response.  
- A **minimal web UI** (if you prefer).

Requirements:

- The demo must support at least a **single-turn voice interaction** end-to-end.  
- Multi-turn conversation is a **plus** (but not strictly required).

---

## Deliverables

### A. Source Code

Organize your code clearly. At minimum, include:

- `rag/` or `retrieval/`:  
  - Ingestion scripts  
  - Embedding scripts  
  - Vector DB setup and query logic  

- `models/`:  
  - Fine-tuning scripts or notebooks  
  - Inference wrapper for the fine-tuned local LLM  

- `voice/`:  
  - STT integration (Whisper, Deepgram, etc.)  
  - TTS integration (ElevenLabs or equivalent)  

- `server/` or `app/`:  
  - Orchestration logic (RAG vs. LLM routing)  
  - API / CLI / UI entry points  

You do **not** need to commit large model weights, but you must clearly explain how to obtain and load them.

---

### B. Design Document (1 Page)

Provide a short design doc (Markdown, PDF, or similar) that includes:

- **Architecture diagram** of your system.  
- **Rationale** for:
  - Choice of base model and fine-tuning approach.  
  - RAG design (chunking, embedding model, vector DB, confidence thresholds).  
  - STT / TTS providers and any streaming vs. batch decisions.  
- **Latency considerations**: What you did (or would do) to keep responses fast.  
- **Limitations & future improvements** you’d prioritize if this went to production.

---

### C. Project README (Implementation-Specific)

In addition to this assignment README, include a **project-specific README** in your submission that explains:

- How to set up your environment (Python version, dependencies, GPU/CPU assumptions).  
- How to:
  - Ingest documents and build the vector store.  
  - Run fine-tuning (or how you did it, if it’s not fully reproducible locally).  
  - Start the backend / demo.  
  - Test the system with example prompts or audio files.
- Twilio Number to call which triggers the agent and let us test your work.

---

## Evaluation Criteria

We will evaluate your submission on **System Design Quality**, **RAG Implementation & Quality**, **Fallback Logic & LLM Usage** and **Latency in response during the call**

---

## Notes & Suggestions

- You are **not** expected to build a production system. Focus on a **solid, well-reasoned prototype**.  
- If you cannot fully train a model due to hardware constraints, you may:
  - Use a smaller base model or fewer training steps.  
  - Clearly **explain what you would do at scale**.  
- Use the datasets creatively:
  - `medical_frontdesk_train.jsonl` for LLM supervised fine-tuning.  
  - `pain_calls_whisper_style.jsonl` for retrieval, robustness testing, and optional intent modeling.  
  - `pain_calls_labeled_example.jsonl` as a template if you choose to expand labeled data.

Good luck!
