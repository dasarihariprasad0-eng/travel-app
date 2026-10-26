"""SQLite persistence and bearer-token authentication for the DIRECT API."""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from fastapi import Cookie, Depends, Header, HTTPException
import psycopg
from psycopg.rows import dict_row


JSON_COLUMNS = {"interests", "activities", "dream_destinations", "packing_notes", "items", "payload"}
TABLES = {
    "profiles", "travel_preferences", "connection_requests", "trips", "trip_members",
    "itineraries", "itinerary_days", "trip_progress", "assistant_messages", "weather_snapshots", "web_sources",
}
COLUMNS = {
    "profiles": {"id", "display_name", "home_city", "home_state", "bio", "avatar_url",
                 "age_range", "gender", "verified", "created_at", "updated_at"},
    "travel_preferences": {"user_id", "travel_style", "pace", "budget_level", "group_size",
                           "gender_composition", "accommodation", "food_preference",
                           "climate_preference", "hotel_budget_per_night", "interests", "activities", "smoking",
                           "drinking", "early_riser", "dream_destinations", "updated_at"},
    "connection_requests": {"id", "from_user", "to_user", "message", "status", "created_at"},
    "trips": {"id", "owner_id", "title", "destination", "region", "country", "latitude",
              "longitude", "start_date", "end_date", "budget_level", "travel_style",
              "max_travelers", "description", "visibility", "status", "created_at", "updated_at"},
    "trip_members": {"id", "trip_id", "user_id", "role", "status", "joined_at"},
    "itineraries": {"id", "trip_id", "summary", "weather_overview", "packing_notes",
                    "model", "created_at"},
    "itinerary_days": {"id", "itinerary_id", "trip_id", "day_number", "day_date", "title",
                       "weather_summary", "weather_temp_high", "weather_temp_low",
                       "weather_code", "items", "created_at"},
    "trip_progress": {"id", "trip_id", "day_id", "user_id", "item_index", "done",
                      "note", "updated_at"},
    "assistant_messages": {"id", "trip_id", "user_id", "role", "content", "created_at"},
    "weather_snapshots": {"id", "trip_id", "forecast_date", "source", "payload", "created_at"},
    "web_sources": {"id", "trip_id", "query", "title", "url", "content", "created_at"},
}


def database_url() -> str:
    from .config import get_settings

    return get_settings().database_url.strip() or os.getenv("DATABASE_URL", "").strip()


def connect() -> sqlite3.Connection | psycopg.Connection:
    url = database_url()
    if url:
        try:
            parsed_url = urlsplit(url)
        except ValueError as exc:
            raise ValueError(
                "DATABASE_URL must be a full PostgreSQL URI. In Render, use the "
                "database's Internal Database URL, not only its hostname."
            ) from exc
        if (
            parsed_url.scheme not in {"postgres", "postgresql"}
            or not parsed_url.hostname
            or not parsed_url.path.strip("/")
        ):
            raise ValueError(
                "DATABASE_URL must be a full PostgreSQL URI. In Render, use the "
                "database's Internal Database URL, not only its hostname."
            )
        return psycopg.connect(
            url,
            connect_timeout=10,
            row_factory=dict_row,
            sslmode="require",
        )

    from .config import get_settings

    configured = get_settings().database_path.strip() or os.getenv("DATABASE_PATH", "").strip()
    path = Path(configured or Path(__file__).resolve().parents[1] / "direct.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 15000")
    return db


def init_db() -> None:
    with connect() as db:
        schema = """
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS password_reset_requests (
          email TEXT PRIMARY KEY COLLATE NOCASE,
          code_hash TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          reset_token_hash TEXT,
          reset_expires_at TEXT
        );
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          display_name TEXT NOT NULL DEFAULT 'Traveler',
          home_city TEXT, home_state TEXT, bio TEXT, avatar_url TEXT, age_range TEXT,
          gender TEXT, verified INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS travel_preferences (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          travel_style TEXT, pace TEXT, budget_level TEXT, group_size TEXT,
          gender_composition TEXT, accommodation TEXT, food_preference TEXT,
          climate_preference TEXT, hotel_budget_per_night INTEGER,
          interests TEXT NOT NULL DEFAULT '[]',
          activities TEXT NOT NULL DEFAULT '[]', smoking TEXT, drinking TEXT,
          early_riser INTEGER, dream_destinations TEXT NOT NULL DEFAULT '[]',
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS connection_requests (
          id TEXT PRIMARY KEY, from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          to_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          message TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
          UNIQUE(from_user, to_user)
        );
        CREATE TABLE IF NOT EXISTS trips (
          id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL, destination TEXT NOT NULL, region TEXT,
          country TEXT NOT NULL DEFAULT 'India', latitude REAL, longitude REAL,
          start_date TEXT NOT NULL, end_date TEXT NOT NULL, budget_level TEXT,
          travel_style TEXT, max_travelers INTEGER NOT NULL DEFAULT 6, description TEXT,
          visibility TEXT NOT NULL DEFAULT 'public', status TEXT NOT NULL DEFAULT 'planning',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS trip_members (
          id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'joined',
          joined_at TEXT NOT NULL, UNIQUE(trip_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS itineraries (
          id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          summary TEXT, weather_overview TEXT, packing_notes TEXT NOT NULL DEFAULT '[]',
          model TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS itinerary_days (
          id TEXT PRIMARY KEY, itinerary_id TEXT NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
          trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          day_number INTEGER NOT NULL, day_date TEXT, title TEXT NOT NULL,
          weather_summary TEXT, weather_temp_high REAL, weather_temp_low REAL, weather_code INTEGER,
          items TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL,
          UNIQUE(itinerary_id, day_number)
        );
        CREATE TABLE IF NOT EXISTS trip_progress (
          id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          day_id TEXT NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item_index INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 1, note TEXT,
          updated_at TEXT NOT NULL, UNIQUE(day_id, user_id, item_index)
        );
        CREATE TABLE IF NOT EXISTS assistant_messages (
          id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS weather_snapshots (
          id TEXT PRIMARY KEY, trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          forecast_date TEXT NOT NULL, source TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL,
          UNIQUE(trip_id, forecast_date, source)
        );
        CREATE TABLE IF NOT EXISTS web_sources (
          id TEXT PRIMARY KEY, trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,
          query TEXT NOT NULL, title TEXT, url TEXT, content TEXT, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS trips_start_idx ON trips(start_date);
        CREATE INDEX IF NOT EXISTS trip_members_user_idx ON trip_members(user_id);
        CREATE INDEX IF NOT EXISTS trip_days_idx ON itinerary_days(trip_id, day_number);
        """
        if isinstance(db, sqlite3.Connection):
            db.executescript(schema)
            preference_columns = {
                row["name"] for row in db.execute("PRAGMA table_info(travel_preferences)").fetchall()
            }
            if "hotel_budget_per_night" not in preference_columns:
                db.execute("ALTER TABLE travel_preferences ADD COLUMN hotel_budget_per_night INTEGER")
        else:
            for statement in schema.split(";"):
                if statement.strip():
                    _execute(db, statement.replace(" COLLATE NOCASE", ""))
            _execute(
                db,
                "ALTER TABLE travel_preferences "
                "ADD COLUMN IF NOT EXISTS hotel_budget_per_night INTEGER",
            )


def _execute(
    db: sqlite3.Connection | psycopg.Connection,
    sql: str,
    parameters: Any = (),
):
    if isinstance(db, sqlite3.Connection):
        return db.execute(sql, parameters)
    return db.execute(sql.replace("?", "%s").replace(" COLLATE NOCASE", ""), parameters)


def _begin_write(db: sqlite3.Connection | psycopg.Connection) -> None:
    if isinstance(db, sqlite3.Connection):
        db.execute("BEGIN IMMEDIATE")
    else:
        db.execute("BEGIN")


def _token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return f"{salt.hex()}:{derived.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        salt_hex, expected = encoded.split(":", 1)
        actual = hash_password(password, bytes.fromhex(salt_hex)).split(":", 1)[1]
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_user(email: str, password: str, display_name: str, created_at: str) -> tuple[str, str]:
    user_id = secrets.token_hex(16)
    token = secrets.token_urlsafe(36)
    with connect() as db:
        try:
            _execute(
                db,
                "INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?)",
                (user_id, email, hash_password(password), created_at),
            )
        except (sqlite3.IntegrityError, psycopg.IntegrityError) as exc:
            raise HTTPException(409, "An account with this email already exists.") from exc
        _execute(
            db,
            "INSERT INTO profiles(id,display_name,created_at,updated_at) VALUES(?,?,?,?)",
            (user_id, display_name, created_at, created_at),
        )
        _execute(
            db,
            "INSERT INTO travel_preferences(user_id,updated_at) VALUES(?,?)",
            (user_id, created_at),
        )
        _execute(
            db,
            "INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)",
            (_token_digest(token), user_id, created_at),
        )
    return user_id, token


def authenticate_user(email: str, password: str, created_at: str) -> tuple[str, str]:
    with connect() as db:
        row = _execute(
            db,
            "SELECT id,password_hash FROM users WHERE email=? COLLATE NOCASE",
            (email,),
        ).fetchone()
        if not row or not verify_password(password, row["password_hash"]):
            raise HTTPException(401, "Email or password is incorrect.")
        token = secrets.token_urlsafe(36)
        _execute(
            db,
            "INSERT INTO sessions(token_hash,user_id,created_at) VALUES(?,?,?)",
            (_token_digest(token), row["id"], created_at),
        )
    return row["id"], token


def user_for_token(token: str) -> str | None:
    with connect() as db:
        row = _execute(
            db,
            "SELECT user_id, created_at FROM sessions WHERE token_hash=?",
            (_token_digest(token),),
        ).fetchone()
        if row:
            try:
                created_at = datetime.fromisoformat(row["created_at"])
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)
                expired = (datetime.now(timezone.utc) - created_at).total_seconds() > 14 * 24 * 60 * 60
            except ValueError:
                expired = True
            if expired:
                _execute(db, "DELETE FROM sessions WHERE token_hash=?", (_token_digest(token),))
                return None
    return row["user_id"] if row else None


def delete_session(token: str) -> None:
    with connect() as db:
        _execute(db, "DELETE FROM sessions WHERE token_hash=?", (_token_digest(token),))


def create_password_reset(
    email: str,
    code_hash: str,
    created_at: str,
    expires_at: str,
    cooldown_seconds: int = 60,
) -> bool:
    with connect() as db:
        _begin_write(db)
        user = _execute(
            db,
            "SELECT 1 FROM users WHERE email=? COLLATE NOCASE",
            (email,),
        ).fetchone()
        if not user:
            return False

        previous = _execute(
            db,
            "SELECT created_at FROM password_reset_requests "
            "WHERE email=? COLLATE NOCASE" + (
                " FOR UPDATE" if isinstance(db, psycopg.Connection) else ""
            ),
            (email,),
        ).fetchone()
        if previous:
            try:
                requested_at = datetime.fromisoformat(previous["created_at"])
                current_time = datetime.fromisoformat(created_at)
                if (current_time - requested_at).total_seconds() < cooldown_seconds:
                    return False
            except ValueError:
                pass

        _execute(
            db,
            """
            INSERT INTO password_reset_requests
                (email, code_hash, expires_at, attempts, created_at,
                 reset_token_hash, reset_expires_at)
            VALUES (?, ?, ?, 0, ?, NULL, NULL)
            ON CONFLICT(email) DO UPDATE SET
                code_hash=excluded.code_hash,
                expires_at=excluded.expires_at,
                attempts=0,
                created_at=excluded.created_at,
                reset_token_hash=NULL,
                reset_expires_at=NULL
            """,
            (email, code_hash, expires_at, created_at),
        )
    return True


def invalidate_password_reset(email: str, code_hash: str) -> None:
    with connect() as db:
        _execute(
            db,
            "DELETE FROM password_reset_requests "
            "WHERE email=? COLLATE NOCASE AND code_hash=?",
            (email, code_hash),
        )


def verify_password_reset_code(
    email: str,
    code_hash: str,
    now: str,
    reset_token: str,
    reset_expires_at: str,
) -> bool:
    with connect() as db:
        _begin_write(db)
        row = _execute(
            db,
            "SELECT code_hash, expires_at, attempts FROM password_reset_requests "
            "WHERE email=? COLLATE NOCASE" + (
                " FOR UPDATE" if isinstance(db, psycopg.Connection) else ""
            ),
            (email,),
        ).fetchone()
        if (
            not row
            or row["expires_at"] <= now
            or row["attempts"] >= 5
        ):
            return False
        if not secrets.compare_digest(row["code_hash"], code_hash):
            _execute(
                db,
                "UPDATE password_reset_requests SET attempts=attempts+1 "
                "WHERE email=? COLLATE NOCASE",
                (email,),
            )
            return False
        _execute(
            db,
            "UPDATE password_reset_requests "
            "SET code_hash='', reset_token_hash=?, reset_expires_at=? "
            "WHERE email=? COLLATE NOCASE",
            (_token_digest(reset_token), reset_expires_at, email),
        )
    return True


def reset_user_password(
    email: str,
    reset_token: str,
    password: str,
    now: str,
) -> bool:
    with connect() as db:
        _begin_write(db)
        reset = _execute(
            db,
            "SELECT reset_token_hash, reset_expires_at "
            "FROM password_reset_requests WHERE email=? COLLATE NOCASE" + (
                " FOR UPDATE" if isinstance(db, psycopg.Connection) else ""
            ),
            (email,),
        ).fetchone()
        if (
            not reset
            or not reset["reset_token_hash"]
            or not reset["reset_expires_at"]
            or reset["reset_expires_at"] <= now
            or not secrets.compare_digest(
                reset["reset_token_hash"],
                _token_digest(reset_token),
            )
        ):
            return False
        user = _execute(
            db,
            "SELECT id FROM users WHERE email=? COLLATE NOCASE",
            (email,),
        ).fetchone()
        if not user:
            return False
        _execute(
            db,
            "UPDATE users SET password_hash=? WHERE id=?",
            (hash_password(password), user["id"]),
        )
        _execute(db, "DELETE FROM sessions WHERE user_id=?", (user["id"],))
        _execute(
            db,
            "DELETE FROM password_reset_requests WHERE email=? COLLATE NOCASE",
            (email,),
        )
    return True


class Db:
    def __init__(self, user_id: str):
        self.user_id = user_id

    @staticmethod
    def _table(table: str) -> str:
        if table not in TABLES:
            raise HTTPException(400, "Unknown data table.")
        return table

    @staticmethod
    def _encode(row: dict[str, Any]) -> dict[str, Any]:
        result = {}
        for key, value in row.items():
            if key in JSON_COLUMNS and value is not None and not isinstance(value, str):
                value = json.dumps(value)
            elif isinstance(value, bool):
                value = int(value)
            result[key] = value
        return result

    @staticmethod
    def _decode(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        result = dict(row)
        for key in JSON_COLUMNS:
            if key in result and isinstance(result[key], str):
                try:
                    result[key] = json.loads(result[key])
                except json.JSONDecodeError:
                    result[key] = []
        for key in ("verified", "early_riser", "done"):
            if key in result and result[key] is not None:
                result[key] = bool(result[key])
        return result

    def _where(self, table: str, params: dict[str, Any]) -> tuple[str, list[Any]]:
        clauses: list[str] = []
        values: list[Any] = []
        for key, raw in params.items():
            if key in {"select", "limit", "order"}:
                continue
            if key == "or":
                # The API's only OR filter is the user's own connection requests.
                if raw == f"(from_user.eq.{self.user_id},to_user.eq.{self.user_id})":
                    clauses.append("(from_user=? OR to_user=?)")
                    values.extend((self.user_id, self.user_id))
                    continue
                raise HTTPException(400, "Unsupported filter.")
            if key not in COLUMNS[table]:
                raise HTTPException(400, "Unsupported filter.")
            if not key.replace("_", "").isalnum():
                raise HTTPException(400, "Unsupported filter.")
            value = str(raw)
            if value.startswith("eq."):
                clauses.append(f"{key}=?")
                values.append(value[3:])
            elif value.startswith("neq."):
                clauses.append(f"{key}!=?")
                values.append(value[4:])
            elif value.startswith("in.(") and value.endswith(")"):
                items = [item.strip() for item in value[4:-1].split(",") if item.strip()]
                if not items:
                    clauses.append("1=0")
                else:
                    clauses.append(f"{key} IN ({','.join('?' for _ in items)})")
                    values.extend(items)
            elif value.startswith("ilike.*") and value.endswith("*"):
                clauses.append(f"LOWER({key}) LIKE LOWER(?) ESCAPE '\\'")
                values.append("%" + value[7:-1].replace("%", "\\%").replace("_", "\\_") + "%")
            else:
                raise HTTPException(400, "Unsupported filter.")
        return (" WHERE " + " AND ".join(clauses) if clauses else ""), values

    async def select(self, table: str, **params) -> list[dict]:
        table = self._table(table)
        where, values = self._where(table, params)
        columns = params.get("select", "*")
        if columns != "*" and not all(c.strip() in COLUMNS[table] for c in columns.split(",")):
            raise HTTPException(400, "Invalid selected columns.")
        sql = f"SELECT {columns} FROM {table}{where}"
        order = params.get("order")
        if order:
            column, _, direction = order.partition(".")
            if column not in COLUMNS[table] or direction.lower() not in {"asc", "desc"}:
                raise HTTPException(400, "Invalid sort order.")
            sql += f" ORDER BY {column} {direction.upper()}"
        if "limit" in params:
            sql += " LIMIT ?"
            values.append(max(0, min(int(params["limit"]), 500)))
        with connect() as db:
            rows = _execute(db, sql, values).fetchall()
        return [self._decode(row) for row in rows]

    async def one(self, table: str, **params) -> dict | None:
        rows = await self.select(table, limit=1, **params)
        return rows[0] if rows else None

    async def insert(self, table: str, row, upsert_on: str | None = None) -> list[dict]:
        table = self._table(table)
        records = row if isinstance(row, list) else [row]
        result = []
        with connect() as db:
            for record in records:
                data = self._encode(dict(record))
                stamp = datetime.now(timezone.utc).isoformat()
                if table in {"connection_requests", "trips", "trip_members", "itineraries",
                             "itinerary_days", "trip_progress", "assistant_messages", "weather_snapshots", "web_sources"}:
                    data.setdefault("id", secrets.token_hex(16))
                if table in {"connection_requests", "trips", "itineraries", "itinerary_days",
                             "assistant_messages", "weather_snapshots", "web_sources"}:
                    data.setdefault("created_at", stamp)
                if table == "trips":
                    data.setdefault("updated_at", stamp)
                if table == "trip_members":
                    data.setdefault("joined_at", stamp)
                if table == "trip_progress":
                    data.setdefault("updated_at", stamp)
                if not data:
                    raise HTTPException(400, "Cannot insert an empty record.")
                if not data.keys() <= COLUMNS[table]:
                    raise HTTPException(400, "The record contains unsupported fields.")
                columns = list(data)
                sql = f"INSERT INTO {table} ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})"
                if upsert_on:
                    keys = [key.strip() for key in upsert_on.split(",")]
                    if not set(keys) <= COLUMNS[table]:
                        raise HTTPException(400, "Invalid upsert key.")
                    updates = [key for key in columns if key not in keys]
                    if updates:
                        sql += " ON CONFLICT (" + ",".join(keys) + ") DO UPDATE SET " + ",".join(
                            f"{key}=excluded.{key}" for key in updates
                        )
                    else:
                        sql += " ON CONFLICT (" + ",".join(keys) + ") DO NOTHING"
                try:
                    _execute(db, sql, [data[column] for column in columns])
                except (sqlite3.IntegrityError, psycopg.IntegrityError) as exc:
                    raise HTTPException(409, str(exc)) from exc
                primary = data.get("id") or data.get("user_id")
                if primary:
                    key = "id" if "id" in data else "user_id"
                    fetched = _execute(
                        db,
                        f"SELECT * FROM {table} WHERE {key}=?",
                        (primary,),
                    ).fetchone()
                    if fetched:
                        result.append(self._decode(fetched))
        return result

    async def update(self, table: str, values: dict, **filters) -> list[dict]:
        table = self._table(table)
        where, args = self._where(table, filters)
        data = self._encode(values)
        if not data:
            return []
        if not data.keys() <= COLUMNS[table]:
            raise HTTPException(400, "The record contains unsupported fields.")
        with connect() as db:
            _execute(
                db,
                f"UPDATE {table} SET " + ",".join(f"{key}=?" for key in data) + where,
                list(data.values()) + args,
            )
            rows = _execute(db, f"SELECT * FROM {table}{where}", args).fetchall()
        return [self._decode(row) for row in rows]

    async def delete(self, table: str, **filters) -> None:
        table = self._table(table)
        where, args = self._where(table, filters)
        if not where:
            raise HTTPException(400, "A filter is required to delete records.")
        with connect() as db:
            _execute(db, f"DELETE FROM {table}{where}", args)


async def current_db(
    authorization: str = Header(default=""),
    direct_session: str = Cookie(default=""),
) -> Db:
    scheme, _, bearer_token = authorization.partition(" ")
    token = direct_session or (bearer_token if scheme.lower() == "bearer" else "")
    if not token:
        raise HTTPException(401, "Sign in required.")
    user_id = user_for_token(token)
    if not user_id:
        raise HTTPException(401, "Session expired. Please sign in again.")
    return Db(user_id)


DbDep = Depends(current_db)
