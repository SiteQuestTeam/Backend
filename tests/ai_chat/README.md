# SideQuest AI chat intake — proof of concept

## Cel i ograniczenia

Ten katalog zawiera samodzielny, testowy flow rozmowy AI dla **Zwiadu** w SideQuest. Rozmowa zbiera dane tekstowe od Gracza, aktualizuje stan między turami, dopytuje o braki i wylicza pole **Kto naprawi** w kodzie.

PoC **nie jest** podłączony do endpointów produkcyjnych, bazy danych ani frontendu. Nie analizuje też realnego zdjęcia ani GPS — zgodnie z procesem aplikacji te dane powstają wcześniej. Tryb domyślny jest deterministycznym parserem offline i jest wyraźnie oznaczony jako mock/demonstracja, a nie rzeczywisty LLM.

## Źródła wymagań i wersja kontekstu

Implementacja została oparta o `SiteQuestTeam/Project-context-` z gałęzi `main`, commit drzewa kontekstu:

`902c32310dc8eadaed002222a3116ef7929df9a3`

Przejrzane dokumenty:

- `README.md`
- `BRIEF.md`
- `CONTEXT.md`
- `Use_Cases.md`
- `docs/demo-scenario.md`
- `docs/scope.md`

Istotne wymagania z kontekstu:

- SideQuest jest grą społeczną opartą o Zwiady, Misje i Rajdy.
- Zwiad dokumentuje problem w miejscu i tworzy Szare miejsce.
- Po zdjęciu/GPS przewidziana jest rozmowa AI zbierająca intencję, oczekiwaną zmianę oraz potrzebne wsparcie.
- Pole **Kto naprawi** wynika z dwóch pytań w stałej kolejności: teren/sprzęt/zgoda/pieniądze miasta, a następnie specjalne umiejętności lub narzędzia.

### Założenie PoC

Dokumentacja nie definiuje kompletnego kontraktu JSON rozmowy, więc przyjęto minimalny zestaw demonstracyjny:

Wymagane:

1. `problem_description` — co jest nie tak,
2. `desired_change` — co Gracz chce zmienić,
3. `city_property_or_requires_city` — pierwsze pytanie „Kto naprawi”,
4. `special_skills_or_tools` — drugie pytanie „Kto naprawi”.

Opcjonalne:

- `support_needed` — dodatkowe wsparcie wskazane przez Gracza.

Zdjęcie na żywo, GPS, kierunek kompasu i czas są poza kontraktem rozmowy, bo w opisanym procesie pochodzą z poprzedniego kroku aplikacji.

## Struktura

- `models.py` — modele Pydantic i walidowany wynik,
- `prompts.py` — system prompt i instrukcja ekstrakcji,
- `adapters.py` — interfejs adaptera, deterministyczny mock i opcjonalny OpenAI,
- `flow.py` — aktualizacja stanu, walidacja, kompletność i „Kto naprawi”,
- `demo.py` — wieloturowy przykład,
- `test_flow.py` — testy logiki offline.

## Instalacja

Zależności są odizolowane od produkcyjnego backendu:

```bash
python3 -m venv .venv-ai-chat
source .venv-ai-chat/bin/activate
pip install -r tests/ai_chat/requirements.txt
```

## Uruchomienie demo offline

Z katalogu głównego backendu:

```bash
python -m tests.ai_chat.demo
```

Na początku pojawi się komunikat:

```text
[MOCK/DETERMINISTIC MODE] Responses are parsed locally; no LLM is called.
```

## Uruchomienie testów

```bash
pytest -q tests/ai_chat
```

## Opcjonalny tryb z rzeczywistym LLM

Techniczne założenie PoC: ponieważ dokumentacja projektu nie wskazuje dostawcy AI, przygotowano mały adapter OpenAI bez frameworka agentowego.

```bash
pip install -r tests/ai_chat/requirements-llm.txt
export OPENAI_API_KEY="..."
export SIDEQUEST_USE_LLM=1
export SIDEQUEST_AI_MODEL="<model-dostępny-na-koncie>"
python -m tests.ai_chat.demo
```

Sekret nie jest zapisywany w repo. Testy automatyczne nie wykonują żadnych wywołań sieciowych.

## Przykładowy wynik JSON

```json
{
  "data": {
    "problem_description": {"status": "provided", "value": "przy bloku jest rura, do której ludzie przypinają rowery"},
    "desired_change": {"status": "provided", "value": "chcę normalny stojak rowerowy"},
    "city_property_or_requires_city": {"status": "provided", "value": true},
    "special_skills_or_tools": {"status": "provided", "value": false},
    "support_needed": {"status": "provided", "value": "przyda się zgoda zarządcy terenu"}
  },
  "missing_required_fields": [],
  "is_complete": true,
  "who_fixes": "Miasto",
  "assistant_message": "Dzięki. Mam komplet danych do Zwiadu. Na podstawie dwóch odpowiedzi pole „Kto naprawi” ma wartość: Miasto.",
  "model_output_valid": true
}
```

## Jak dodać kolejne pole

1. Dodaj `FieldValue[...]` do `ScoutIntakeData` w `models.py`.
2. Jeśli pole ma być wymagane, dopisz jego nazwę do `REQUIRED_FIELDS`.
3. Dodaj pytanie do `QUESTION_BY_FIELD` w `flow.py`.
4. Opisz pole w `EXTRACTION_PROMPT` w `prompts.py`.
5. Jeśli ma działać także w demie offline, dodaj jego deterministyczną ekstrakcję do `DeterministicDemoAdapter`.
6. Dodaj test dla aktualizacji, braków i korekty.

## Zmiana promptów

Prompty są celowo oddzielone od logiki. `SYSTEM_PROMPT` definiuje rolę i granice działania, a `EXTRACTION_PROMPT` definiuje kontrakt ekstrakcji. Kompletność i `Kto naprawi` są zawsze liczone w Pythonie po walidacji danych — deklaracja modelu językowego nie może sama zakończyć rozmowy.
