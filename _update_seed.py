from pathlib import Path

path = Path(r"C:\Users\Perci Ander\banbif_dashboard\seed_data.py")
text = path.read_text()
text = text.replace("from app import app, get_db, init_db, hash_password, PROJECT_COLUMNS", "from app import app, get_db, init_db, hash_password, PROJECT_COLUMNS, normalize_date")
if "normalize_date(" not in text:
    raise SystemExit("normalize_date not found")
old_loop = "                for key, value in raw.items():\r\n                    norm_key = normalize_key(key)\r\n                    if isinstance(value, str):\r\n                        normalized_row[norm_key] = value.strip()\r\n                    else:\r\n                        normalized_row[norm_key] = value\r\n                record_id = normalized_row.get(\"id\") or normalized_row.get(\"record_id\")\r\n"
if old_loop not in text:
    old_loop = "                for key, value in raw.items():\n                    norm_key = normalize_key(key)\n                    if isinstance(value, str):\n                        normalized_row[norm_key] = value.strip()\n                    else:\n                        normalized_row[norm_key] = value\n                record_id = normalized_row.get(\"id\") or normalized_row.get(\"record_id\")\n"
if old_loop not in text:
    raise SystemExit("raw loop not found")
new_loop = old_loop.replace("record_id = normalized_row.get(\"id\") or normalized_row.get(\"record_id\")\n", "for field in (\"fecha_estado\", \"fecha_programada\", \"fecha_ejecucion\"):\n                    if field in normalized_row:\n                        normalized_row[field] = normalize_date(normalized_row[field])\n                record_id = normalized_row.get(\"id\") or normalized_row.get(\"record_id\")\n")
text = text.replace(old_loop, new_loop)
# adjust uppercase block indexes to also normalize date list
old_adjust = "                db.execute(\n                    \"""\n                    INSERT INTO project_records (\n                        record_id, ubicacion, nom_sede, categoria_trab, nombre_completo,\n                        perfil_imagen, marca, modelo, serial_num, hostname, ip_equipo,\n                        email_trabajo, fecha_estado, estado, estado_coordinacion,\n                        estado_upgrade, fecha_programada, fecha_ejecucion, notas\n                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n                    \"""\n                    params,\n                )\n"
# no change needed here
path.write_text(text)
