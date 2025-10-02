import os
import sqlite3
import csv
import io
import hashlib
import secrets
import unicodedata
import re
from collections import Counter
from pathlib import Path
from typing import Dict, List, Tuple

from flask import (
    Flask,
    g,
    redirect,
    render_template,
    request,
    session,
    url_for,
    flash,
    jsonify,
    send_from_directory,
    abort,
)


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "dashboard.db"

PROJECT_COLUMNS = [
    "record_id",
    "ubicacion",
    "nom_sede",
    "categoria_trab",
    "nombre_completo",
    "perfil_imagen",
    "marca",
    "modelo",
    "serial_num",
    "hostname",
    "ip_equipo",
    "email_trabajo",
    "fecha_estado",
    "estado",
    "estado_coordinacion",
    "estado_upgrade",
    "fecha_programada",
    "fecha_ejecucion",
    "notas",
]

STATUS_CHOICES = [
    "PROGRAMADO",
    "REPROGRAMADO",
    "EN PROCESO",
    "REALIZADO",
    "USER NO ASISTIO",
    "USER SIN RESPUESTA",
    "NO APLICA UPGRADE",
    "INCIDENCIA UPGRADE",
    "PENDIENTE",
]

DONE_STATUS = {"REALIZADO"}
IN_PROGRESS_STATUS = {"EN PROCESO", "PROGRAMADO", "REPROGRAMADO", "INCIDENCIA UPGRADE"}
PENDING_STATUS = {
    "PENDIENTE",
    "USER SIN RESPUESTA",
    "USER NO ASISTIO",
    "NO APLICA UPGRADE",
}

ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("BANBIF_DASHBOARD_SECRET", secrets.token_hex(16)),
    DATABASE=str(DB_PATH),
    MAX_CONTENT_LENGTH=5 * 1024 * 1024,
    INITIAL_ADMIN_PASSWORD=os.environ.get("BANBIF_ADMIN_CODE"),
)
@app.route("/health")
def health():
    return jsonify({"status": "ok"})








def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def ensure_user_role_column(db: sqlite3.Connection) -> None:
    columns = {row[1] for row in db.execute("PRAGMA table_info(users)")}
    if "role" not in columns:
        db.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'standard'")
        db.commit()


def ensure_project_schema(db: sqlite3.Connection) -> None:
    existing = {row[1] for row in db.execute("PRAGMA table_info(project_records)")}
    expected = set(["id", *PROJECT_COLUMNS, "last_updated"])
    if existing != expected:
        db.execute("DROP TABLE IF EXISTS project_records")
        db.execute(
            """
            CREATE TABLE project_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                record_id TEXT UNIQUE,
                ubicacion TEXT,
                nom_sede TEXT,
                categoria_trab TEXT,
                nombre_completo TEXT,
                perfil_imagen TEXT,
                marca TEXT,
                modelo TEXT,
                serial_num TEXT,
                hostname TEXT,
                ip_equipo TEXT,
                email_trabajo TEXT,
                fecha_estado TEXT,
                estado TEXT,
                estado_coordinacion TEXT,
                estado_upgrade TEXT,
                fecha_programada TEXT,
                fecha_ejecucion TEXT,
                notas TEXT,
                last_updated TEXT DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        db.commit()




def ensure_initial_admin() -> None:
    password = app.config.get("INITIAL_ADMIN_PASSWORD")
    if not password:
        app.logger.warning("BANBIF_ADMIN_CODE no esta definido; no se creo el administrador inicial.")
        return
    db = get_db()
    existing = db.execute("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").fetchone()
    if existing:
        return
    db.execute(
        "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
        ("admin", hash_password(password), "admin"),
    )
    db.commit()
    app.logger.info("Usuario administrador inicial 'admin' creado.")

def init_db() -> None:
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            role TEXT NOT NULL DEFAULT 'standard'
        );
        """
    )
    ensure_user_role_column(db)
    ensure_project_schema(db)
    ensure_initial_admin()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return f"{salt}${hashed.hex()}"


def verify_password(stored: str, password: str) -> bool:
    try:
        salt, hashed_hex = stored.split("$")
    except ValueError:
        return False
    new_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return secrets.compare_digest(hashed_hex, new_hash.hex())


def normalize_header(header: str) -> str:
    if header is None:
        return ""
    normalized = unicodedata.normalize("NFD", header)
    ascii_only = "".join(c for c in normalized if not unicodedata.combining(c))
    return ascii_only.strip().lower().replace(" ", "_")

def normalize_date(value: str) -> str:
    if not value:
        return ""
    value = value.strip()
    if not value:
        return ""
    from datetime import datetime

    candidates = [value]
    for separator in (" ", "T"):
        if separator in value:
            head = value.split(separator, 1)[0].strip()
            if head:
                candidates.append(head)

    for candidate in list(candidates):
        if len(candidate) >= 10:
            slice_ = candidate[:10]
            if len(slice_) == 10 and slice_[4] in ("-", "/", ".") and slice_ not in candidates:
                candidates.append(slice_)

    unique_candidates = []
    for candidate in candidates:
        candidate = candidate.strip()
        if candidate and candidate not in unique_candidates:
            unique_candidates.append(candidate)

    for candidate in unique_candidates:
        try:
            dt = datetime.fromisoformat(candidate)
        except ValueError:
            pass
        else:
            return dt.date().isoformat()

    patterns = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y.%m.%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%m/%d/%Y",
        "%m-%d-%Y",
    ]
    for candidate in unique_candidates:
        for pattern in patterns:
            try:
                dt = datetime.strptime(candidate, pattern)
            except ValueError:
                continue
            return dt.strftime("%Y-%m-%d")

    return value


def coerce_iso_date(value: str) -> str:
    if not value:
        return ""
    normalized = normalize_date(value)
    if normalized and ISO_DATE_PATTERN.match(normalized):
        return normalized
    return ""


CSV_FIELD_MAP = {
    "id": "record_id",
    "record_id": "record_id",
    "ubicacion": "ubicacion",
    "nom_sede": "nom_sede",
    "categoria_trab": "categoria_trab",
    "categoria": "categoria_trab",
    "nombre_completo": "nombre_completo",
    "nombre": "nombre_completo",
    "perfil_imagen": "perfil_imagen",
    "perfil": "perfil_imagen",
    "marca": "marca",
    "modelo": "modelo",
    "serial_num": "serial_num",
    "serialnumber": "serial_num",
    "hostname": "hostname",
    "ip_equipo": "ip_equipo",
    "email_trabajo": "email_trabajo",
    "correo": "email_trabajo",
    "fecha_estado": "fecha_estado",
    "estado": "estado",
    "estado_coordinacion": "estado_coordinacion",
    "estado_coordinacin": "estado_coordinacion",
    "estado_upgrade": "estado_upgrade",
    "fecha_programada": "fecha_programada",
    "fecha_programacion": "fecha_programada",
    "fecha_ejecucion": "fecha_ejecucion",
    "fecha_upgrade": "fecha_ejecucion",
    "notas": "notas",
}


@app.before_request
def load_logged_in_user():
    user_id = session.get("user_id")
    if user_id is None:
        g.user = None
    else:
        g.user = get_db().execute(
            "SELECT id, username, role FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()


def login_required(view):
    from functools import wraps

    @wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            flash("Inicia sesion para continuar", "warning")
            return redirect(url_for("login"))
        return view(**kwargs)

    return wrapped_view


def admin_required(view):
    from functools import wraps

    @wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None or g.user["role"] != "admin":
            flash("Requiere privilegios administrativos", "warning")
            return redirect(url_for("dashboard"))
        return view(**kwargs)

    return wrapped_view


def attempt_user_creation(
    username: str,
    password: str,
    confirm: str,
    role: str,
) -> Tuple[bool, str]:
    username = (username or "").strip()
    role = (role or "standard").strip()
    if not username:
        return False, "El usuario es obligatorio"
    if not password:
        return False, "La contrasena es obligatoria"
    if password != confirm:
        return False, "Las contrasenas no coinciden"
    if len(password) < 8:
        return False, "La contrasena debe tener al menos 8 caracteres"
    if role not in {"standard", "admin"}:
        return False, "Rol invalido"

    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (username, hash_password(password), role),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return False, "Este usuario ya existe"
    return True, ""


@app.context_processor
def inject_globals():
    return {"current_user": g.get("user")}


@app.route("/register", methods=["GET", "POST"])
def register():
    abort(404)
@app.route("/admin/usuarios/nuevo", methods=["GET", "POST"])
@login_required
@admin_required
def admin_new_user():
    selected_role = request.form.get("role", "standard")
    if request.method == "POST":
        success, error = attempt_user_creation(
            username=request.form.get("username", ""),
            password=request.form.get("password", ""),
            confirm=request.form.get("confirm", ""),
            role=selected_role,
        )
        if success:
            flash("Usuario creado correctamente", "success")
            return redirect(url_for("admin_new_user"))
        flash(error, "danger")
    return render_template(
        "register.html",
        admin_mode=True,
        selected_role=selected_role,
    )


@app.route("/login", methods=["GET", "POST"])
def login():
    if g.user:
        return redirect(url_for("dashboard"))
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        error = "Credenciales invalidas"
        user = get_db().execute(
            "SELECT id, password_hash FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if user and verify_password(user["password_hash"], password):
            session.clear()
            session["user_id"] = user["id"]
            flash("Bienvenido de nuevo", "success")
            return redirect(url_for("dashboard"))
        flash(error, "danger")
    return render_template("login.html")


@app.route("/logout")
@login_required
def logout():
    session.clear()
    flash("Sesion finalizada", "info")
    return redirect(url_for("login"))


@app.route("/")
def index():
    if g.user:
        return redirect(url_for("dashboard"))
    return redirect(url_for("login"))


@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html")


def build_filters_payload(filters: Dict[str, str]) -> Dict[str, Dict[str, List[str]]]:
    db = get_db()
    payload: Dict[str, Dict[str, List[str]]] = {}
    for field in ("ubicacion", "nom_sede", "categoria_trab"):
        rows = db.execute(
            f"SELECT DISTINCT {field} FROM project_records WHERE {field} IS NOT NULL AND {field} <> '' ORDER BY {field}"
        ).fetchall()
        payload[field] = {
            "options": [row[0] for row in rows],
            "selected": filters.get(field) or "",
        }
    payload["estado"] = {
        "options": STATUS_CHOICES,
        "selected": filters.get("estado") or "",
    }
    return payload


def status_bucket(value: str) -> str:
    if not value:
        return "Sin estado"
    upper_value = value.strip().upper()
    if upper_value in DONE_STATUS:
        return "Completado"
    if upper_value in IN_PROGRESS_STATUS:
        return "En progreso"
    if upper_value in PENDING_STATUS:
        return "Pendiente"
    return "Otro"


@app.route("/upload", methods=["GET", "POST"])
@login_required
@admin_required
def upload():
    summary = None
    if request.method == "POST":
        file = request.files.get("file")
        if not file or not file.filename:
            flash("Selecciona un archivo CSV", "danger")
            return render_template("upload.html", summary=summary)
        if not file.filename.lower().endswith(".csv"):
            flash("El archivo debe tener formato .csv", "danger")
            return render_template("upload.html", summary=summary)

        try:
            stream = io.StringIO(file.stream.read().decode("utf-8-sig"))
        except UnicodeDecodeError:
            flash("No se pudo decodificar el archivo. Usa UTF-8.", "danger")
            return render_template("upload.html", summary=summary)

        reader = csv.DictReader(stream)
        mapped_rows: List[Dict[str, str]] = []
        for raw_row in reader:
            normalized_row: Dict[str, str] = {}
            for header, value in raw_row.items():
                key = CSV_FIELD_MAP.get(normalize_header(header))
                if not key:
                    continue
                if isinstance(value, str):
                    value = value.strip()
                normalized_row[key] = value
            if not normalized_row.get("record_id"):
                continue
            for field in ("estado", "estado_coordinacion", "estado_upgrade"):
                if field in normalized_row and isinstance(normalized_row[field], str):
                    normalized_row[field] = normalized_row[field].upper()
            for field in ("fecha_estado", "fecha_programada", "fecha_ejecucion"):
                if field in normalized_row:
                    normalized_row[field] = normalize_date(normalized_row[field])
            mapped_rows.append(normalized_row)

        if not mapped_rows:
            flash("No se encontraron registros validos en el CSV.", "warning")
            return render_template("upload.html", summary=summary)

        db = get_db()
        inserted = 0
        updated = 0
        for row in mapped_rows:
            params = [row.get(column) for column in PROJECT_COLUMNS]
            cursor = db.execute(
                """
                INSERT INTO project_records (
                    record_id, ubicacion, nom_sede, categoria_trab, nombre_completo,
                    perfil_imagen, marca, modelo, serial_num, hostname, ip_equipo,
                    email_trabajo, fecha_estado, estado, estado_coordinacion,
                    estado_upgrade, fecha_programada, fecha_ejecucion, notas
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(record_id) DO UPDATE SET
                    ubicacion=excluded.ubicacion,
                    nom_sede=excluded.nom_sede,
                    categoria_trab=excluded.categoria_trab,
                    nombre_completo=excluded.nombre_completo,
                    perfil_imagen=excluded.perfil_imagen,
                    marca=excluded.marca,
                    modelo=excluded.modelo,
                    serial_num=excluded.serial_num,
                    hostname=excluded.hostname,
                    ip_equipo=excluded.ip_equipo,
                    email_trabajo=excluded.email_trabajo,
                    fecha_estado=excluded.fecha_estado,
                    estado=excluded.estado,
                    estado_coordinacion=excluded.estado_coordinacion,
                    estado_upgrade=excluded.estado_upgrade,
                    fecha_programada=excluded.fecha_programada,
                    fecha_ejecucion=excluded.fecha_ejecucion,
                    notas=excluded.notas,
                    last_updated=CURRENT_TIMESTAMP
                """,
                params,
            )
            if cursor.rowcount == 1:
                inserted += 1
            else:
                updated += 1
        db.commit()
        summary = {"inserted": inserted, "updated": updated, "total": inserted + updated}
        flash("Carga procesada correctamente", "success")
    return render_template("upload.html", summary=summary)


@app.route("/api/summary")
@login_required
def api_summary():
    db = get_db()
    filters = {
        "ubicacion": request.args.get("ubicacion", "").strip() or None,
        "nom_sede": request.args.get("nom_sede", "").strip() or None,
        "categoria_trab": request.args.get("categoria_trab", "").strip() or None,
        "estado": request.args.get("estado", "").strip() or None,
    }
    raw_fecha_inicio = request.args.get("fecha_inicio", "").strip()
    raw_fecha_fin = request.args.get("fecha_fin", "").strip()
    fecha_inicio = coerce_iso_date(raw_fecha_inicio) or None
    fecha_fin = coerce_iso_date(raw_fecha_fin) or None
    nombre = request.args.get("nombre", "").strip() or None
    hostname = request.args.get("hostname", "").strip() or None

    query = (
        "SELECT record_id, ubicacion, nom_sede, categoria_trab, nombre_completo, perfil_imagen, "
        "marca, modelo, serial_num, hostname, ip_equipo, email_trabajo, fecha_estado, estado, "
        "estado_coordinacion, estado_upgrade, fecha_programada, fecha_ejecucion, notas, last_updated "
        "FROM project_records"
    )
    conditions = []
    params: List[str] = []
    for key, value in filters.items():
        if value:
            if key == "estado":
                conditions.append("UPPER(estado) = UPPER(?)")
            else:
                conditions.append(f"{key} = ?")
            params.append(value)
    if fecha_inicio:
        conditions.append("fecha_estado >= ?")
        params.append(fecha_inicio)
    if fecha_fin:
        conditions.append("fecha_estado <= ?")
        params.append(fecha_fin)
    if nombre:
        conditions.append("UPPER(nombre_completo) LIKE UPPER(?)")
        params.append(f"%{nombre}%")
    if hostname:
        conditions.append("hostname LIKE ?")
        params.append(f"%{hostname}%")
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY last_updated DESC"

    records = db.execute(query, params).fetchall()

    total = len(records)
    status_counts: Dict[str, int] = {}
    bucket_counts: Dict[str, int] = {}
    schedule_map: Dict[str, int] = {}
    schedule_brands: Dict[str, Dict[str, int]] = {}
    recent_updates = []

    for row in records:
        estado = (row["estado"] or "").strip().upper() or "SIN ESTADO"
        status_counts[estado] = status_counts.get(estado, 0) + 1
        bucket = status_bucket(estado)
        bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1

        if row["fecha_estado"]:
            schedule_map[row["fecha_estado"]] = schedule_map.get(row["fecha_estado"], 0) + 1
            schedule_brands.setdefault(row["fecha_estado"], []).append(row["marca"] or "")

        recent_updates.append(
            {
                "record_id": row["record_id"],
                "nombre_completo": row["nombre_completo"],
                "ubicacion": row["ubicacion"],
                "nom_sede": row["nom_sede"],
                "hostname": row["hostname"],
                "categoria_trab": row["categoria_trab"],
                "estado": estado,
                "estado_coordinacion": row["estado_coordinacion"],
                "estado_upgrade": row["estado_upgrade"],
                "fecha_programada": row["fecha_programada"],
                "fecha_ejecucion": row["fecha_ejecucion"],
                "fecha_estado": row["fecha_estado"],
                "marca": row["marca"],
                "modelo": row["modelo"],
                "notas": row["notas"],
                "last_updated": row["last_updated"],
            }
        )

    if not nombre:
        recent_updates = recent_updates[:10]

    schedule_brands_counts = {
        date: {brand: count for brand, count in Counter(brands).items() if brand}
        for date, brands in schedule_brands.items()
    }

    data = {
        "total": total,
        "status_counts": status_counts,
        "status_buckets": bucket_counts,
        "schedule": schedule_map,
        "schedule_brands": schedule_brands_counts,
        "recent_updates": recent_updates,
        "status_catalog": STATUS_CHOICES,
        "filters": build_filters_payload(filters),
        "date_filters": {
            "fecha_inicio": fecha_inicio or "",
            "fecha_fin": fecha_fin or "",
        },
        "hostname_filter": hostname or "",
        "name_filter": nombre or "",
        "estado_filter": filters.get("estado") or "",
        "estado_options": STATUS_CHOICES,
    }

    return jsonify(data)


@app.route("/api/download-template")
@login_required
@admin_required
def download_template():
    template_path = BASE_DIR / "static" / "templates" / "avance_template.csv"
    template_path.parent.mkdir(parents=True, exist_ok=True)
    with open(template_path, "w", encoding="utf-8", newline="") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow([
            "id",
            "ubicacion",
            "nom_sede",
            "categoria_trab",
            "nombre_completo",
            "perfil_imagen",
            "marca",
            "modelo",
            "serial_num",
            "hostname",
            "ip_equipo",
            "email_trabajo",
            "fecha_estado",
            "estado",
            "estado_coordinacion",
            "estado_upgrade",
            "fecha_programada",
            "fecha_ejecucion",
            "notas",
        ])
        writer.writerow([
            "001",
            "SEDE PRINCIPAL",
            "Centro Corporativo",
            "UPGRADE + WIN11",
            "Nombre Ejemplo",
            "OFICINA PRINCIPAL ADMINISTRATIVO",
            "HP",
            "EliteBook 840",
            "5CD3051HBZ",
            "BANCAINMOBIOP01",
            "10.10.2.15",
            "usuario@banbif.com",
            "2025-09-29",
            "REALIZADO",
            "REALIZADO",
            "PROGRAMADO",
            "2025-09-27",
            "2025-09-29",
            "Observaciones",
        ])
    return send_from_directory(template_path.parent, template_path.name, as_attachment=True)


@app.cli.command("init-db")
def init_db_command():
    init_db()
    print("Base de datos inicializada.")


if __name__ == "__main__":
    with app.app_context():
        init_db()
    app.run(debug=True)




