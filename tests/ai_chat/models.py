from __future__ import annotations

from enum import Enum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator


T = TypeVar("T")


class ValueStatus(str, Enum):
    UNKNOWN = "unknown"
    PROVIDED = "provided"


class FieldValue(BaseModel, Generic[T]):
    """A value plus explicit knowledge state.

    `provided` means the user intentionally supplied the value. This is
    important for booleans, where False is still a valid, known answer.
    """

    model_config = ConfigDict(extra="forbid")

    status: ValueStatus = ValueStatus.UNKNOWN
    value: T | None = None

    @field_validator("value")
    @classmethod
    def reject_empty_strings(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @classmethod
    def unknown(cls) -> "FieldValue[T]":
        return cls(status=ValueStatus.UNKNOWN, value=None)

    @classmethod
    def provided(cls, value: T) -> "FieldValue[T]":
        return cls(status=ValueStatus.PROVIDED, value=value)


class ScoutIntakeData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    problem_description: FieldValue[str] = Field(default_factory=FieldValue[str].unknown)
    desired_change: FieldValue[str] = Field(default_factory=FieldValue[str].unknown)
    city_property_or_requires_city: FieldValue[bool] = Field(default_factory=FieldValue[bool].unknown)
    special_skills_or_tools: FieldValue[bool] = Field(default_factory=FieldValue[bool].unknown)
    support_needed: FieldValue[str] = Field(default_factory=FieldValue[str].unknown)


class WhoFixes(str, Enum):
    CITY = "Miasto"
    GUILD = "Gildia"
    PLAYERS = "Gracze"


REQUIRED_FIELDS = (
    "problem_description",
    "desired_change",
    "city_property_or_requires_city",
    "special_skills_or_tools",
)


class ConversationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data: ScoutIntakeData
    missing_required_fields: list[str]
    is_complete: bool
    who_fixes: WhoFixes | None = None
    assistant_message: str
    model_output_valid: bool = True


class ModelPatch(BaseModel):
    """The only structure an AI adapter may propose for one user turn."""

    model_config = ConfigDict(extra="forbid")

    updates: dict[str, Any] = Field(default_factory=dict)
