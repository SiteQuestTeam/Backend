from __future__ import annotations

import json
import os
import re
from abc import ABC, abstractmethod
from typing import Any

from pydantic import ValidationError

from .models import ModelPatch, ScoutIntakeData
from .prompts import EXTRACTION_PROMPT, SYSTEM_PROMPT


class ModelAdapter(ABC):
    @abstractmethod
    def extract(self, message: str, state: ScoutIntakeData) -> ModelPatch:
        raise NotImplementedError


class DeterministicDemoAdapter(ModelAdapter):
    """Offline parser for deterministic demos/tests. This is NOT an LLM."""

    BOOL_TRUE = {"tak", "tak.", "tak,", "owszem", "potrzebna", "potrzeba"}
    BOOL_FALSE = {"nie", "nie.", "nie,", "niepotrzebna"}

    def extract(self, message: str, state: ScoutIntakeData) -> ModelPatch:
        text = " ".join(message.strip().split())
        lower = text.lower()
        updates: dict[str, Any] = {}

        patterns = {
            "problem_description": r"(?:problem|problemem|widzę|jest problem)\s*[:\-]?\s*(.+?)(?=\s*(?:;|\||zmiana|chcę|miasto|specjalne|wsparcie)\s*[:\-]|$)",
            "desired_change": r"(?:zmiana|chcę|chciałbym|chciałabym)\s*[:\-]?\s*(.+?)(?=\s*(?:;|\||miasto|specjalne|wsparcie)\s*[:\-]|$)",
            "support_needed": r"(?:wsparcie|potrzebuję wsparcia)\s*[:\-]?\s*(.+?)(?=\s*(?:;|\||miasto|specjalne)\s*[:\-]|$)",
        }
        for field, pattern in patterns.items():
            match = re.search(pattern, text, flags=re.IGNORECASE)
            if match:
                value = match.group(1).strip(" .;,|")
                if field == "desired_change":
                    value = re.sub(r"^(?:chcę|chciałbym|chciałabym)\s+", "", value, flags=re.IGNORECASE)
                if value:
                    updates[field] = value

        city = self._extract_bool(lower, ("miasto", "teren miasta", "zgoda miasta", "pieniądze miasta"))
        if city is not None:
            updates["city_property_or_requires_city"] = city

        skills = self._extract_bool(lower, ("specjalne", "narzędzia", "spawanie", "prąd", "wysokości"))
        if skills is not None:
            updates["special_skills_or_tools"] = skills

        stripped = lower.strip(" .,!?")
        if stripped in {"tak", "nie"}:
            if state.city_property_or_requires_city.status.value == "unknown":
                updates["city_property_or_requires_city"] = stripped == "tak"
            elif state.special_skills_or_tools.status.value == "unknown":
                updates["special_skills_or_tools"] = stripped == "tak"

        return ModelPatch(updates=updates)

    @staticmethod
    def _extract_bool(text: str, keywords: tuple[str, ...]) -> bool | None:
        for keyword in keywords:
            match = re.search(rf"{re.escape(keyword)}[^;|]{{0,24}}?\b(tak|nie)\b", text)
            if match:
                return match.group(1) == "tak"
        return None


class OpenAIAdapter(ModelAdapter):
    """Optional real-LLM adapter. Requires OPENAI_API_KEY and `openai`."""

    def __init__(self, model: str | None = None) -> None:
        from openai import OpenAI

        api_key = os.environ.get("OPENAI_API_KEY")
        configured_model = model or os.environ.get("SIDEQUEST_AI_MODEL")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required in real LLM mode")
        if not configured_model:
            raise RuntimeError("SIDEQUEST_AI_MODEL is required in real LLM mode")
        self.client = OpenAI(api_key=api_key)
        self.model = configured_model

    def extract(self, message: str, state: ScoutIntakeData) -> ModelPatch:
        response = self.client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": SYSTEM_PROMPT + "\n" + EXTRACTION_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"current_state": state.model_dump(mode="json"), "user_message": message},
                        ensure_ascii=False,
                    ),
                },
            ],
        )
        raw = response.output_text
        try:
            payload = json.loads(raw)
            return ModelPatch.model_validate(payload)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise ValueError("LLM returned invalid structured output") from exc


class BrokenAdapter(ModelAdapter):
    """Test helper that simulates malformed model output."""

    def extract(self, message: str, state: ScoutIntakeData) -> ModelPatch:
        raise ValueError("simulated invalid model output")
