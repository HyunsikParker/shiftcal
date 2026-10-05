# ShiftCal

Read your own shift roster with local Gemma, check it against the original, and export a calendar file.

[Try the recorded demo](https://hyunsikparker.github.io/shiftcal/) · [How the checks work](#checks-before-export)

ShiftCal was built for someone close to me who finds it cumbersome to move a rotating shift roster into a calendar. The recipient's name, workplace and actual schedule are not included. All examples and tests use fictional schedules. I have not yet collected recipient feedback.

## Run locally

You need Python 3.10+ and [Ollama](https://ollama.com/). No Python or JavaScript packages are required to run the app. Downloading the open-weight model requires internet access and disk space; inference uses your own hardware. The tested model is `gemma4:12b-it-q4_K_M`.

Download the model once, if it is not already installed:

```sh
ollama pull gemma4:12b-it-q4_K_M
```

In one terminal, start a local-only Ollama instance. Port 11435 should be unused:

```sh
OLLAMA_HOST=127.0.0.1:11435 OLLAMA_NO_CLOUD=1 ollama serve
```

In a second terminal, from this repository:

```sh
python3 server.py --ollama-port 11435
```

Open **http://127.0.0.1:8765**. Stop both terminal processes with Ctrl+C when finished. Do not expose this development server to the internet.

1. Paste only your own shifts, one date and shift per line. Korean descriptions such as `2일 야간` and English descriptions such as `on the 6th I work the morning shift` are supported.
2. Choose the roster month and set your actual shift hours. The supplied D/E/N times are examples, not workplace standards.
3. Read with Gemma. Compare every row with the original; correct or remove uncertain entries, then confirm each row.
4. Download the `.ics` file and import it into a separate calendar. Reimporting may create duplicates, depending on the calendar app.

## Checks before export

Gemma proposes the date and shift type. It does not calculate timestamps or write to a calendar. Each input line remains visible next to its result, including omitted or duplicated model outputs. Explicit uncertainty such as `?`, `maybe` or `미정` stays unresolved.

Deterministic JavaScript validates the month, date and shift times, checks duplicate dates and overlapping shifts, then generates iCalendar events. An end time earlier than the start moves to the next date, including across month and year boundaries. Day-off rows do not create events. Editing the month, hours or a row invalidates the affected confirmations.

The current version uses **Korea Standard Time (UTC+09:00)**, for years 2000–2099. It accepts text, not roster photographs, PDFs or spreadsheets. It does not support split shifts on the same date, automatic sync, daylight-saving zones, or an all-day leave calendar. Do not treat the model's output as an authoritative work schedule.

## Public demo versus local inference

The public page replays [`web/example.json`](web/example.json), a saved response from an actual local Gemma run on fictional input. It lets you correct rows, confirm them and export events. It **does not run a model in your browser**, and its roster input is read-only.

Running the Python server enables new local inference. The server calls only the fixed loopback Ollama address, ignores system proxy variables, rejects foreign origins and Host headers, limits request sizes, and allows one extraction at a time. It does not log or save submitted roster text. Browser state disappears on refresh. There is no analytics, calendar login or API key.

## Validation

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The initial suite has 15 passing tests covering date boundaries, leap years, uncertainty, export gating, overlaps, UTF-8 calendar formatting, omitted model rows, request validation and local-server access restrictions.

Four synthetic extraction fixtures were also sent to the actual Gemma model. Three matched the expected result exactly; 13 of 14 rows matched their expected date/code pair. In the fourth fixture, `주간` had no date: the model returned both date and shift as unresolved, instead of retaining the expected day-shift code. The row remained visible and export stayed blocked. This small check is not a general accuracy benchmark. Inputs, expected outputs and results are in [`validation/`](validation/).

## Why open weights

Roster text can stay on a computer the recipient controls. The extraction prompt, JSON schema and checks are available to inspect. Gemma handles ordinary Korean and English shift descriptions; the calendar rules remain short enough to test directly. After the initial model download, the application has no hosted inference dependency or per-request charge. Hardware and electricity are still required.

## Credits and development

Built during the October 2–5, 2026 Hacktoberfest Weekend Challenge. Gemma by Google, served through Ollama, performs the roster extraction. The app code is MIT licensed; model and runtime retain their own licenses. No model weights are included in this repository.

**AI disclosure:** Codex generated and revised the implementation, tests and prose under the entrant's direction. The entrant supplied the real-person problem and confirmed it. Tests and model responses were executed and checked; no recipient interview, testimonial or field trial is claimed. The DEV submission uses the Fully Autonomous development disclosure.
