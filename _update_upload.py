from pathlib import Path

path = Path(r"C:\Users\Perci Ander\banbif_dashboard\app.py")
text = path.read_text()
old_snippet = "            normalized_row[key] = value.strip() if isinstance(value, str) else value\n        if not normalized_row.get(\"record_id\"):\n            continue\n        mapped_rows.append(normalized_row)\n"
if old_snippet not in text:
    raise SystemExit("upload snippet not found")
new_snippet = "            normalized_row[key] = value.strip() if isinstance(value, str) else value\n        if not normalized_row.get(\"record_id\"):\n            continue\n        for field in (\"fecha_estado\", \"fecha_programada\", \"fecha_ejecucion\"):\n            if field in normalized_row:\n                normalized_row[field] = normalize_date(normalized_row[field])\n        mapped_rows.append(normalized_row)\n"
text = text.replace(old_snippet, new_snippet, 1)
path.write_text(text)
