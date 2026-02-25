"""
Chat service: wraps the LLM client and injects project-study context
into every conversation so the AI can answer questions grounded in
the user's saved research.
"""

from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()

API_KEY = os.getenv("API_KEY")

client = OpenAI(
    api_key=API_KEY,
    base_url="https://ellm.nrp-nautilus.io/v1"
)

_SYSTEM_BASE = """You are a knowledgeable microbiome research assistant integrated into the Qiita Study Explorer platform.

Qiita is an open-source platform for managing, analyzing, and sharing microbiome data. It contains thousands of studies covering gut microbiome, soil ecology, ocean microbiology, skin microbiome, and more.

You help researchers:
- Understand and discuss microbiome studies
- Compare methodologies across studies
- Explain bioinformatics concepts (16S rRNA, shotgun metagenomics, OTU/ASV, alpha/beta diversity, etc.)
- Suggest relevant study connections and research directions
- Interpret findings and discuss implications

Be concise, scientifically accurate, and helpful. When the user has saved studies in their project, use that context to give more relevant answers."""


def _build_system_prompt(saved_studies: list[dict]) -> str:
    if not saved_studies:
        return _SYSTEM_BASE

    studies_text = "\n\n".join([
        f"Study ID {s['study_id']}: \"{s['study_title']}\"\n"
        f"PI: {s.get('pi_name', 'Unknown')} ({s.get('pi_affiliation', '')})\n"
        f"Abstract: {(s.get('study_abstract') or 'Not available')[:400]}..."
        for s in saved_studies
    ])

    return f"""{_SYSTEM_BASE}

══ SAVED STUDIES IN THIS PROJECT ══
The user has saved the following {len(saved_studies)} studies to their project. Reference these when answering questions:

{studies_text}

When discussing these studies, refer to them by their title or Study ID."""


def chat_with_llm(messages: list[dict], saved_studies: list[dict]) -> str:
    """
    Send a conversation to the LLM and return the assistant's reply.

    Parameters
    ----------
    messages : list[dict]
        Conversation history as [{role, content}, ...] — should NOT include
        the system message (we build that here from saved studies).
    saved_studies : list[dict]
        Studies saved to the current project, used to ground the assistant.

    Returns
    -------
    str
        The assistant's reply text.
    """
    system_prompt = _build_system_prompt(saved_studies)

    response = client.chat.completions.create(
        model="gemma3",
        messages=[
            {"role": "system", "content": system_prompt},
            *messages
        ],
        max_tokens=1024,
        temperature=0.7,
    )

    return response.choices[0].message.content.strip()