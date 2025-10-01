from app import app, get_db, init_db, hash_password, PROJECT_COLUMNS, normalize_date
import csv
from pathlib import Path
import unicodedata

FIELDS = PROJECT_COLUMNS


def normalize_key(key: str) -> str:
    if not key:
        return ""
    cleaned = unicodedata.normalize("NFD", key.replace('\ufeff', ''))
    return "".join(c for c in cleaned if not unicodedata.combining(c)).strip().lower().replace(" ", "_")


def seed():
    csv_path = Path(__file__).resolve().parent / "data" / "sample_avance.csv"
    if not csv_path.exists():
        raise SystemExit("CSV de muestra no encontrado")

    with app.app_context():
        init_db()
        db = get_db()
        user = db.execute("SELECT id FROM users WHERE username = ?", ("demo",)).fetchone()
        if not user:
            db.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                ("demo", hash_password("DemoPass123"), "admin"),
            )
            print("Usuario demo creado (usuario: demo / password: DemoPass123)")
        else:
            db.execute("UPDATE users SET role = 'admin' WHERE username = ?", ("demo",))
        db.commit()

        db.execute("DELETE FROM project_records")

        inserted = 0
        with csv_path.open(encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for raw in reader:
                normalized_row = {}
                for key, value in raw.items():
                    norm_key = normalize_key(key)
                    if isinstance(value, str):
                        normalized_row[norm_key] = value.strip()
                    else:
                        normalized_row[norm_key] = value
                for field in ("fecha_estado", "fecha_programada", "fecha_ejecucion"):
                    if field in normalized_row:
                        normalized_row[field] = normalize_date(normalized_row[field])
                record_id = normalized_row.get("id") or normalized_row.get("record_id")
                if not record_id:
                    continue
                record_id = record_id.strip()
                params = [record_id]
                for field in FIELDS[1:]:
                    params.append(normalized_row.get(field))
                for index in (13, 14, 15):
                    if params[index]:
                        params[index] = params[index].upper()
                db.execute(
                    """
                    INSERT INTO project_records (
                        record_id, ubicacion, nom_sede, categoria_trab, nombre_completo,
                        perfil_imagen, marca, modelo, serial_num, hostname, ip_equipo,
                        email_trabajo, fecha_estado, estado, estado_coordinacion,
                        estado_upgrade, fecha_programada, fecha_ejecucion, notas
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    params,
                )
                inserted += 1
        db.commit()
        print(f"Registros insertados: {inserted}")


if __name__ == "__main__":
    seed()
