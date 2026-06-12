"""One-shot: add `type="button"` to plain <button> opens missing one.

React Doctor flags 20 sites; this script does the safe bulk-fix and skips
buttons that already declare a type (submit/reset/button).
"""
import re
from pathlib import Path

FILES = [
    "src/routes/DriverRoute.tsx",
    "src/routes/CalendarRoute.tsx",
    "src/components/panels/OvertakeFeed.tsx",
    "src/routes/StandingsRoute.tsx",
    "src/routes/ReplayRoute.tsx",
    "src/components/panels/ReplayPicker.tsx",
    "src/components/cards/SeasonResultsGrid.tsx",
    "src/components/ui/Tabs.tsx",
    "src/components/ui/Button.tsx",
    "src/components/panels/ReplayControls.tsx",
    "src/routes/ApexRoute.tsx",
    "src/components/panels/DriverTelemetry.tsx",
    "src/components/panels/TrackMap.tsx",
]

PAT = re.compile(r"<button\b((?:[^>])*?)>", re.DOTALL)

total = 0
for f in FILES:
    p = Path(f)
    if not p.exists():
        print(f"skip (missing): {f}")
        continue
    text = p.read_text(encoding="utf-8")
    counter = {"n": 0}

    def repl(m):
        attrs = m.group(1)
        if "type=" in attrs:
            return m.group(0)
        counter["n"] += 1
        return '<button type="button"' + attrs + ">"

    new_text = PAT.sub(repl, text)
    if counter["n"]:
        p.write_text(new_text, encoding="utf-8")
        print(f"{f}: added type=\"button\" to {counter['n']} site(s)")
        total += counter["n"]
print(f"TOTAL: {total} buttons fixed")
