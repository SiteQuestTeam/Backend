from __future__ import annotations

import json
import os

from .adapters import DeterministicDemoAdapter, OpenAIAdapter
from .flow import ChatFlow
from .models import ScoutIntakeData


def build_adapter():
    if os.environ.get("SIDEQUEST_USE_LLM") == "1":
        print("[REAL LLM MODE] Using configured OpenAI model.")
        return OpenAIAdapter()
    print("[MOCK/DETERMINISTIC MODE] Responses are parsed locally; no LLM is called.")
    return DeterministicDemoAdapter()


def main() -> None:
    flow = ChatFlow(build_adapter())
    state = ScoutIntakeData()
    turns = [
        "Problem: przy bloku jest rura, do której ludzie przypinają rowery; zmiana: chcę normalny stojak rowerowy.",
        "Miasto: tak",
        "Specjalne narzędzia: nie; wsparcie: przyda się zgoda zarządcy terenu.",
    ]

    for user_message in turns:
        print(f"\nGracz: {user_message}")
        result = flow.handle_turn(user_message, state)
        state = result.data
        print(f"Asystent: {result.assistant_message}")

    print("\nKońcowy JSON:")
    print(json.dumps(result.model_dump(mode="json"), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
