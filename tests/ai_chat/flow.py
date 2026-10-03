from __future__ import annotations

from copy import deepcopy
from typing import Any

from pydantic import ValidationError

from .adapters import ModelAdapter
from .models import (
    ConversationResult,
    FieldValue,
    REQUIRED_FIELDS,
    ScoutIntakeData,
    ValueStatus,
    WhoFixes,
)


QUESTION_BY_FIELD = {
    "problem_description": "Co dokładnie jest nie tak w tym miejscu?",
    "desired_change": "Co chciałbyś/chciałabyś tu zmienić?",
    "city_property_or_requires_city": (
        "Czy to teren lub sprzęt miasta, albo potrzebna jest zgoda lub pieniądze miasta? Odpowiedz tak lub nie."
    ),
    "special_skills_or_tools": (
        "Czy trzeba specjalnych umiejętności albo narzędzi, np. spawania, pracy z prądem lub na wysokości? Odpowiedz tak lub nie."
    ),
}


class ChatFlow:
    def __init__(self, adapter: ModelAdapter) -> None:
        self.adapter = adapter

    def handle_turn(self, message: str, state: ScoutIntakeData | None = None) -> ConversationResult:
        current = deepcopy(state) if state else ScoutIntakeData()
        model_output_valid = True

        try:
            patch = self.adapter.extract(message, current)
            updated = self._apply_patch(current, patch.updates)
        except (ValueError, ValidationError, TypeError):
            updated = current
            model_output_valid = False

        missing = self._missing_required(updated)
        complete = not missing
        who_fixes = self._who_fixes(updated) if complete else None

        if complete:
            message_out = (
                "Dzięki. Mam komplet danych do Zwiadu. "
                f"Na podstawie dwóch odpowiedzi pole „Kto naprawi” ma wartość: {who_fixes.value}."
            )
        elif not model_output_valid:
            message_out = (
                "Nie udało mi się bezpiecznie odczytać tej odpowiedzi. "
                f"{QUESTION_BY_FIELD[missing[0]]}"
            )
        else:
            message_out = QUESTION_BY_FIELD[missing[0]]

        return ConversationResult(
            data=updated,
            missing_required_fields=missing,
            is_complete=complete,
            who_fixes=who_fixes,
            assistant_message=message_out,
            model_output_valid=model_output_valid,
        )

    @staticmethod
    def _apply_patch(state: ScoutIntakeData, updates: dict[str, Any]) -> ScoutIntakeData:
        allowed = set(ScoutIntakeData.model_fields)
        candidate = state.model_copy(deep=True)

        for field, raw_value in updates.items():
            if field not in allowed:
                raise ValueError(f"Unknown field: {field}")
            if raw_value is None:
                continue
            if field in {"city_property_or_requires_city", "special_skills_or_tools"}:
                if not isinstance(raw_value, bool):
                    raise TypeError(f"{field} must be bool")
            else:
                if not isinstance(raw_value, str) or not raw_value.strip():
                    raise TypeError(f"{field} must be non-empty string")
                raw_value = raw_value.strip()

            setattr(candidate, field, FieldValue(status=ValueStatus.PROVIDED, value=raw_value))

        return ScoutIntakeData.model_validate(candidate.model_dump())

    @staticmethod
    def _missing_required(state: ScoutIntakeData) -> list[str]:
        missing: list[str] = []
        for field in REQUIRED_FIELDS:
            value = getattr(state, field)
            if value.status != ValueStatus.PROVIDED or value.value is None:
                missing.append(field)
        return missing

    @staticmethod
    def _who_fixes(state: ScoutIntakeData) -> WhoFixes:
        city = state.city_property_or_requires_city.value
        special = state.special_skills_or_tools.value
        if city is True:
            return WhoFixes.CITY
        if special is True:
            return WhoFixes.GUILD
        return WhoFixes.PLAYERS
