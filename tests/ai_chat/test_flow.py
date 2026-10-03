from __future__ import annotations

from .adapters import BrokenAdapter, DeterministicDemoAdapter
from .flow import ChatFlow
from .models import ScoutIntakeData, ValueStatus, WhoFixes


def test_gradual_collection_and_missing_questions() -> None:
    flow = ChatFlow(DeterministicDemoAdapter())
    state = ScoutIntakeData()

    first = flow.handle_turn("Problem: ławka jest złamana", state)
    assert first.data.problem_description.value == "ławka jest złamana"
    assert first.missing_required_fields == [
        "desired_change",
        "city_property_or_requires_city",
        "special_skills_or_tools",
    ]
    assert "Co chciał" in first.assistant_message

    second = flow.handle_turn("Zmiana: chcę naprawioną ławkę", first.data)
    assert second.data.problem_description.value == "ławka jest złamana"
    assert second.data.desired_change.value == "naprawioną ławkę"
    assert not second.is_complete


def test_multiple_values_in_one_message() -> None:
    flow = ChatFlow(DeterministicDemoAdapter())
    result = flow.handle_turn(
        "Problem: brak stojaka; zmiana: stojak na rowery; miasto: tak; specjalne narzędzia: nie"
    )
    assert result.is_complete
    assert result.who_fixes == WhoFixes.CITY


def test_correction_replaces_previous_answer() -> None:
    flow = ChatFlow(DeterministicDemoAdapter())
    initial = flow.handle_turn(
        "Problem: śmieci na skwerze; zmiana: posprzątać skwer; miasto: nie; specjalne narzędzia: nie"
    )
    assert initial.who_fixes == WhoFixes.PLAYERS

    corrected = flow.handle_turn("Miasto: tak", initial.data)
    assert corrected.data.city_property_or_requires_city.value is True
    assert corrected.who_fixes == WhoFixes.CITY


def test_invalid_or_incomplete_input_does_not_guess() -> None:
    flow = ChatFlow(DeterministicDemoAdapter())
    result = flow.handle_turn("Nie wiem jeszcze, muszę się rozejrzeć.")
    assert result.data == ScoutIntakeData()
    assert result.missing_required_fields[0] == "problem_description"
    assert result.is_complete is False


def test_false_is_known_not_missing() -> None:
    flow = ChatFlow(DeterministicDemoAdapter())
    result = flow.handle_turn(
        "Problem: dużo śmieci; zmiana: posprzątać; miasto: nie; specjalne narzędzia: nie"
    )
    assert result.data.city_property_or_requires_city.status == ValueStatus.PROVIDED
    assert result.data.city_property_or_requires_city.value is False
    assert result.is_complete
    assert result.who_fixes == WhoFixes.PLAYERS


def test_broken_model_output_preserves_state_and_never_completes_falsely() -> None:
    good_flow = ChatFlow(DeterministicDemoAdapter())
    partial = good_flow.handle_turn("Problem: dziura w ławce")

    broken_flow = ChatFlow(BrokenAdapter())
    after_error = broken_flow.handle_turn("cokolwiek", partial.data)

    assert after_error.data == partial.data
    assert after_error.model_output_valid is False
    assert after_error.is_complete is False
    assert "bezpiecznie" in after_error.assistant_message


def test_completeness_and_who_fixes_guild() -> None:
    flow = ChatFlow(DeterministicDemoAdapter())
    result = flow.handle_turn(
        "Problem: uszkodzone metalowe ogrodzenie; zmiana: naprawić ogrodzenie; miasto: nie; specjalne narzędzia: tak"
    )
    assert result.missing_required_fields == []
    assert result.is_complete is True
    assert result.who_fixes == WhoFixes.GUILD


def test_null_like_model_update_cannot_erase_known_data() -> None:
    class NullPatchAdapter(DeterministicDemoAdapter):
        def extract(self, message, state):
            from .models import ModelPatch
            return ModelPatch(updates={"problem_description": None})

    good_flow = ChatFlow(DeterministicDemoAdapter())
    partial = good_flow.handle_turn("Problem: brak kosza")
    result = ChatFlow(NullPatchAdapter()).handle_turn("ignoruj", partial.data)
    assert result.data.problem_description.value == "brak kosza"
