#!/usr/bin/env python3
"""Локальное desktop-приложение для аккаунтов портала и наклеек (Windows, без браузера)."""

from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, scrolledtext, simpledialog, ttk

from PIL import Image, ImageTk

ROOT = Path(__file__).resolve().parents[1]
SHELL = ROOT / "scripts" / "portal-admin-shell.js"
CONFIG_PATH = ROOT / "data" / "portal-admin-gui.json"
STICKERS_DIR = ROOT / "stickers"
APP_BG = "#f4f6f8"
CARD_BG = "#ffffff"
TEXT_COLOR = "#202124"
MUTED_COLOR = "#667085"
ACCENT_COLOR = "#c62828"
ACCENT_SOFT = "#fee4e2"
ACCENT_DARK = "#8f1d1d"
DELETE_ACCOUNT_CONFIRM_CODE = "545417"


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {"baseUrl": "http://127.0.0.1:3000"}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"baseUrl": "http://127.0.0.1:3000"}


def save_config(config: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def sanitize_sticker_filename(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", value.strip().lower())
    return cleaned or "sticker"


def run_shell(command: str, *args: str) -> dict:
    cmd = ["node", str(SHELL), command, *args]
    result = subprocess.run(
        cmd,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip() or "Ошибка Node.js"
        try:
            payload = json.loads(message)
            message = payload.get("error", message)
        except json.JSONDecodeError:
            pass
        raise RuntimeError(message)
    output = result.stdout.strip()
    if not output:
        return {}
    return json.loads(output)


class PortalAdminApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("SOVTEST — Аккаунты и наклейки")
        self.geometry("1180x760")
        self.minsize(1000, 680)
        self.configure(bg=APP_BG)

        self.config_data = load_config()
        self.equipment_items: list[dict] = []
        self.users: list[dict] = []
        self.selected_login: str | None = None
        self.last_credentials: dict | None = None
        self.last_sticker_path: str | None = None
        self._sticker_preview_image = None

        self.equipment_vars: dict[str, tk.BooleanVar] = {}
        self.equipment_quantity_vars: dict[str, tk.StringVar] = {}
        self.manage_equipment_vars: dict[str, tk.BooleanVar] = {}
        self.manage_equipment_quantity_vars: dict[str, tk.StringVar] = {}
        self.manage_serial_texts: dict[str, scrolledtext.ScrolledText] = {}
        self.displayed_logins: list[str] = []
        self._busy = False

        self._configure_style()
        self._build_ui()
        self.refresh_all()

    def _configure_style(self) -> None:
        style = ttk.Style(self)
        if "vista" in style.theme_names():
            style.theme_use("vista")

        style.configure(".", font=("Segoe UI", 10), foreground=TEXT_COLOR)
        style.configure("TFrame", background=APP_BG)
        style.configure("Card.TFrame", background=CARD_BG)
        style.configure("Header.TFrame", background=APP_BG)
        style.configure("TLabel", background=APP_BG, foreground=TEXT_COLOR)
        style.configure("Card.TLabel", background=CARD_BG, foreground=TEXT_COLOR)
        style.configure("Muted.TLabel", background=APP_BG, foreground=MUTED_COLOR)
        style.configure("Brand.TLabel", background=APP_BG, foreground=ACCENT_COLOR, font=("Segoe UI", 10, "bold"))
        style.configure("Title.TLabel", background=APP_BG, foreground=TEXT_COLOR, font=("Segoe UI", 20, "bold"))
        style.configure("Section.TLabelframe", background=CARD_BG, padding=12)
        style.configure("Section.TLabelframe.Label", background=CARD_BG, foreground=ACCENT_DARK, font=("Segoe UI", 10, "bold"))
        style.configure("Preview.TLabel", background=CARD_BG, foreground=MUTED_COLOR, font=("Segoe UI", 10))
        style.configure("Accent.TButton", foreground=ACCENT_DARK)
        style.configure("Danger.TButton", foreground=ACCENT_COLOR)
        style.configure("TNotebook", background=APP_BG, borderwidth=0)
        style.configure("TNotebook.Tab", padding=(14, 6))
        style.map(
            "TNotebook.Tab",
            foreground=[("selected", ACCENT_DARK)],
            background=[("selected", CARD_BG)],
        )

    def _build_ui(self) -> None:
        header = ttk.Frame(self, padding=(18, 14, 18, 10), style="Header.TFrame")
        header.pack(fill="x")
        ttk.Label(header, text="SOVTEST", style="Brand.TLabel").pack(anchor="w")
        ttk.Label(header, text="Портал администратора", style="Title.TLabel").pack(anchor="w")
        tk.Frame(header, bg=ACCENT_COLOR, height=3).pack(fill="x", pady=(10, 0))

        body = ttk.Panedwindow(self, orient="horizontal")
        body.pack(fill="both", expand=True, padx=18, pady=(0, 12))

        left = ttk.LabelFrame(body, text="Аккаунты", padding=12, style="Section.TLabelframe")
        right = ttk.Frame(body, padding=(12, 0, 0, 0))
        body.add(left, weight=1)
        body.add(right, weight=3)

        search_row = ttk.Frame(left)
        search_row.pack(fill="x", pady=(0, 10))
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", lambda *_: self.render_users())
        ttk.Entry(search_row, textvariable=self.search_var).pack(side="left", fill="x", expand=True, ipady=2)
        self.refresh_button = ttk.Button(search_row, text="Обновить", command=self.refresh_all)
        self.refresh_button.pack(side="left", padx=(6, 0))

        self.users_list = tk.Listbox(
            left,
            height=24,
            exportselection=False,
            bd=0,
            highlightthickness=1,
            highlightbackground="#d0d5dd",
            highlightcolor=ACCENT_COLOR,
            activestyle="none",
            bg=CARD_BG,
            fg=TEXT_COLOR,
            selectbackground=ACCENT_SOFT,
            selectforeground=TEXT_COLOR,
            font=("Segoe UI", 10),
        )
        self.users_list.pack(fill="both", expand=True)
        self.users_list.bind("<<ListboxSelect>>", self.on_user_selected)

        notebook = ttk.Notebook(right)
        notebook.pack(fill="both", expand=True)

        create_tab = ttk.Frame(notebook, padding=14)
        manage_tab = ttk.Frame(notebook, padding=14)
        notebook.add(create_tab, text="Создать аккаунт")
        notebook.add(manage_tab, text="Управление")

        self.login_var = tk.StringVar()
        self.label_var = tk.StringVar()
        self.sticker_title_var = tk.StringVar()
        self.base_url_var = tk.StringVar(value=self.config_data.get("baseUrl", "http://127.0.0.1:3000"))
        self.generate_password_var = tk.BooleanVar(value=True)
        self.manual_password_var = tk.StringVar()

        form = ttk.Frame(create_tab)
        form.pack(fill="both", expand=True)
        self._add_labeled_entry(form, "Логин", self.login_var, 0)
        self._add_labeled_entry(form, "Организация", self.label_var, 1)
        self._add_labeled_entry(form, "Базовый URL портала", self.base_url_var, 2)

        ttk.Label(form, text="Оборудование и кол-во").grid(row=3, column=0, sticky="nw", pady=(10, 4))
        self.create_equipment_frame = ttk.Frame(form)
        self.create_equipment_frame.grid(row=3, column=1, sticky="w", pady=(10, 4))

        ttk.Label(form, text="Надпись на наклейке").grid(row=4, column=0, sticky="w", pady=(8, 0), padx=(0, 12))
        self.sticker_title_combo = ttk.Combobox(
            form,
            textvariable=self.sticker_title_var,
            width=42,
            state="readonly",
        )
        self.sticker_title_combo.grid(row=4, column=1, sticky="ew", pady=(8, 0))

        ttk.Checkbutton(
            form,
            text="Сгенерировать пароль автоматически (12 символов)",
            variable=self.generate_password_var,
            command=self.toggle_manual_password,
        ).grid(row=5, column=1, sticky="w", pady=(8, 0))

        ttk.Label(form, text="Пароль вручную").grid(row=6, column=0, sticky="w", pady=(8, 0))
        self.manual_password_entry = ttk.Entry(form, textvariable=self.manual_password_var, width=40, state="disabled")
        self.manual_password_entry.grid(row=6, column=1, sticky="w", pady=(8, 0))

        self.create_button = ttk.Button(
            form,
            text="Создать и сгенерировать наклейку",
            command=self.create_account,
            style="Accent.TButton",
        )
        self.create_button.grid(row=7, column=1, sticky="w", pady=(16, 0))
        form.columnconfigure(1, weight=1)

        self.manage_info = ttk.Label(manage_tab, text="Выберите аккаунт слева.", wraplength=620)
        self.manage_info.pack(anchor="w")

        self.manage_label_var = tk.StringVar()
        self.manage_sticker_title_var = tk.StringVar()
        manage_form = ttk.Frame(manage_tab)
        manage_form.pack(fill="x", pady=(12, 0))
        self._add_labeled_entry(manage_form, "Организация", self.manage_label_var, 0)

        ttk.Label(manage_form, text="Оборудование и кол-во").grid(row=1, column=0, sticky="nw", pady=(10, 4))
        self.manage_equipment_frame = ttk.Frame(manage_form)
        self.manage_equipment_frame.grid(row=1, column=1, sticky="w", pady=(10, 4))
        ttk.Label(manage_form, text="Серийные номера").grid(row=2, column=0, sticky="nw", pady=(10, 4), padx=(0, 12))
        self.manage_serials_frame = ttk.Frame(manage_form)
        self.manage_serials_frame.grid(row=2, column=1, sticky="ew", pady=(10, 4))
        ttk.Label(manage_form, text="Надпись на наклейке").grid(row=3, column=0, sticky="w", pady=(8, 0), padx=(0, 12))
        self.manage_sticker_title_combo = ttk.Combobox(
            manage_form,
            textvariable=self.manage_sticker_title_var,
            width=42,
            state="readonly",
        )
        self.manage_sticker_title_combo.grid(row=3, column=1, sticky="ew", pady=(8, 0))
        manage_form.columnconfigure(1, weight=1)

        actions = ttk.Frame(manage_tab)
        actions.pack(anchor="w", pady=(14, 0))
        self.save_label_button = ttk.Button(actions, text="Сохранить организацию", command=self.save_label)
        self.save_label_button.grid(row=0, column=0, sticky="w", padx=(0, 8), pady=(0, 8))
        self.save_equipment_button = ttk.Button(
            actions,
            text="Сохранить доступ",
            command=self.save_equipment,
            style="Accent.TButton",
        )
        self.save_equipment_button.grid(row=0, column=1, sticky="w", padx=(0, 8), pady=(0, 8))
        self.save_serials_button = ttk.Button(
            actions,
            text="Сохранить серийные номера",
            command=self.save_serials,
        )
        self.save_serials_button.grid(row=0, column=2, sticky="w", padx=(0, 8), pady=(0, 8))
        self.generate_sticker_button = ttk.Button(
            actions,
            text="Сгенерировать наклейку",
            command=self.generate_sticker,
            style="Accent.TButton",
        )
        self.generate_sticker_button.grid(row=0, column=3, sticky="w", padx=(0, 8), pady=(0, 8))
        self.reset_password_button = ttk.Button(
            actions,
            text="Сбросить пароль и наклейку",
            command=self.reset_password,
        )
        self.reset_password_button.grid(row=0, column=4, sticky="w", padx=(0, 8), pady=(0, 8))
        self.toggle_active_button = ttk.Button(actions, text="Отключить вход", command=self.toggle_active)
        self.toggle_active_button.grid(row=1, column=0, sticky="w", padx=(0, 8))
        self.delete_user_button = ttk.Button(actions, text="Удалить аккаунт", command=self.delete_account, style="Danger.TButton")
        self.delete_user_button.grid(row=1, column=1, sticky="w", padx=(0, 8))

        result = ttk.LabelFrame(right, text="Готово для наклейки", padding=12, style="Section.TLabelframe")
        result.pack(fill="both", expand=True, pady=(12, 0))
        self.result_text = tk.Text(
            result,
            height=4,
            wrap="word",
            bd=0,
            highlightthickness=1,
            highlightbackground="#eaecf0",
            bg=CARD_BG,
            fg=TEXT_COLOR,
            font=("Segoe UI", 10),
        )
        self.result_text.pack(fill="x", ipady=6)
        self.result_text.configure(state="disabled")

        self.sticker_preview_label = ttk.Label(
            result,
            text="Выберите аккаунт слева, чтобы увидеть наклейку.",
            anchor="center",
            style="Preview.TLabel",
            relief="groove",
            padding=8,
        )
        self.sticker_preview_label.pack(fill="both", expand=True, pady=(8, 0))

        result_actions = ttk.Frame(result)
        result_actions.pack(anchor="w", pady=(8, 0))
        ttk.Button(result_actions, text="Скопировать данные", command=self.copy_credentials).pack(side="left")
        ttk.Button(result_actions, text="Открыть PNG", command=self.open_sticker).pack(side="left", padx=(8, 0))
        ttk.Button(result_actions, text="Открыть папку stickers", command=self.open_stickers_dir).pack(side="left", padx=(8, 0))

        footer = ttk.Frame(self, padding=(18, 0, 18, 12))
        footer.pack(fill="x")
        self.status_var = tk.StringVar(value="Готово")
        ttk.Label(footer, textvariable=self.status_var, style="Muted.TLabel").pack(anchor="w")

    def _add_labeled_entry(self, parent, label, variable, row):
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", pady=5, padx=(0, 12))
        ttk.Entry(parent, textvariable=variable, width=44).grid(row=row, column=1, sticky="ew", pady=5)

    def sticker_path_for_login(self, login: str) -> Path:
        return STICKERS_DIR / f"{sanitize_sticker_filename(login)}.png"

    def equipment_title(self, item: dict) -> str:
        sticker = str(item.get("stickerTitle") or "").strip()
        if sticker:
            return sticker
        return f"{item.get('type', '')}\n{item.get('name') or item.get('id', '')}".strip()

    def sticker_title_options(self) -> list[str]:
        return [self.equipment_title(item) for item in self.equipment_items]

    def default_sticker_title(self, equipment_ids: list[str] | set[str] | None = None) -> str:
        ids = list(equipment_ids or [])
        if ids:
            for item in self.equipment_items:
                if item["id"] == ids[0]:
                    return self.equipment_title(item)
        if self.equipment_items:
            return self.equipment_title(self.equipment_items[0])
        return ""

    def refresh_sticker_title_options(self) -> None:
        values = self.sticker_title_options()
        self.sticker_title_combo.configure(values=values)
        self.manage_sticker_title_combo.configure(values=values)
        default_title = self.default_sticker_title(["sdb1106-nm"])
        if values and self.sticker_title_var.get().strip() not in values:
            self.sticker_title_var.set(default_title)
        if values and self.manage_sticker_title_var.get().strip() not in values:
            self.manage_sticker_title_var.set(default_title)

    def set_result_text(self, text: str) -> None:
        self.result_text.configure(state="normal")
        self.result_text.delete("1.0", tk.END)
        self.result_text.insert("1.0", text)
        self.result_text.configure(state="disabled")

    def update_sticker_preview(self, sticker_path: str | Path | None, message: str | None = None) -> None:
        self._sticker_preview_image = None
        if not sticker_path:
            self.sticker_preview_label.configure(image="", text=message or "PNG-наклейка пока не создана.")
            return

        path = Path(sticker_path)
        if not path.exists():
            self.sticker_preview_label.configure(image="", text=message or f"Файл не найден:\n{path}")
            return

        image = Image.open(path).convert("RGB")
        image.thumbnail((620, 320), Image.Resampling.LANCZOS)
        self._sticker_preview_image = ImageTk.PhotoImage(image)
        self.sticker_preview_label.configure(image=self._sticker_preview_image, text="")

    def show_selected_account_sticker(self, login: str) -> None:
        sticker_path = self.sticker_path_for_login(login)
        if sticker_path.exists():
            self.last_sticker_path = str(sticker_path)
            self.set_result_text(
                f"Аккаунт: {login}\n"
                f"Наклейка: {sticker_path}\n"
                "Пароль не менялся. Для новой наклейки с другой надписью нажмите «Сгенерировать наклейку»."
            )
            self.update_sticker_preview(sticker_path)
            return

        self.last_sticker_path = None
        self.set_result_text(
            f"Аккаунт: {login}\n"
            "PNG-наклейка для этого аккаунта не найдена.\n"
            "Нажмите «Сгенерировать наклейку» (пароль не изменится) или «Сбросить пароль и наклейку»."
        )
        self.update_sticker_preview(
            None,
            "Наклейка не найдена.\nНажмите «Сгенерировать наклейку».",
        )

    def set_busy(self, busy: bool, status: str = "") -> None:
        self._busy = busy
        if status:
            self.status_var.set(status)
        elif not busy:
            self.status_var.set("Готово")
        cursor = "wait" if busy else ""
        self.config(cursor=cursor)
        state = "disabled" if busy else "normal"
        for widget in (
            self.refresh_button,
            self.create_button,
            self.save_label_button,
            self.save_equipment_button,
            self.save_serials_button,
            self.generate_sticker_button,
            self.reset_password_button,
            self.toggle_active_button,
            self.delete_user_button,
        ):
            widget.configure(state=state)

    def run_async(self, work, on_success, status: str = "Загрузка...") -> None:
        if self._busy:
            return

        self.set_busy(True, status)

        def worker() -> None:
            try:
                result = work()
                self.after(0, lambda: self._finish_async(result, None, on_success))
            except Exception as error:
                self.after(0, lambda: self._finish_async(None, error, on_success))

        threading.Thread(target=worker, daemon=True).start()

    def _finish_async(self, result, error, on_success) -> None:
        self.set_busy(False)
        if error:
            messagebox.showerror("Ошибка", str(error))
            return
        if on_success:
            on_success(result)

    def toggle_manual_password(self) -> None:
        if self.generate_password_var.get():
            self.manual_password_entry.configure(state="disabled")
        else:
            self.manual_password_entry.configure(state="normal")

    def render_equipment_checks(
        self,
        frame,
        var_map: dict[str, tk.BooleanVar],
        quantity_map: dict[str, tk.StringVar],
        selected: set[str],
        quantities: dict | None = None,
        default=None,
    ) -> None:
        for child in frame.winfo_children():
            child.destroy()
        var_map.clear()
        quantity_map.clear()
        quantities = quantities or {}
        for index, item in enumerate(self.equipment_items):
            item_id = item["id"]
            initial = item_id in selected
            if not selected and default and item_id == default:
                initial = True
            var = tk.BooleanVar(value=initial)
            quantity_var = tk.StringVar(value=str(quantities.get(item_id, 1)))
            var_map[item_id] = var
            quantity_map[item_id] = quantity_var
            text = f"{item['name']} — {item['type']} [{item.get('publicId') or item_id}]"
            ttk.Checkbutton(frame, text=text, variable=var).grid(row=index, column=0, sticky="w", pady=3)
            ttk.Entry(frame, textvariable=quantity_var, width=5).grid(row=index, column=1, sticky="w", padx=(10, 4), pady=3)
            ttk.Label(frame, text="шт.").grid(row=index, column=2, sticky="w", pady=3)

    def selected_equipment_ids(self, var_map: dict[str, tk.BooleanVar]) -> list[str]:
        return [item_id for item_id, var in var_map.items() if var.get()]

    def selected_equipment_quantities(
        self,
        var_map: dict[str, tk.BooleanVar],
        quantity_map: dict[str, tk.StringVar],
    ) -> dict | None:
        out = {}
        for item_id, var in var_map.items():
            if not var.get():
                continue
            quantity = self.parse_equipment_quantity(quantity_map[item_id].get())
            if quantity is None:
                return None
            out[item_id] = quantity
        return out

    def render_serial_fields(self, user: dict | None = None) -> None:
        for child in self.manage_serials_frame.winfo_children():
            child.destroy()
        self.manage_serial_texts.clear()

        serials_by_id = (user or {}).get("equipmentSerials") or {}
        grid_columns = 3
        card_index = 0
        selected_items: list[tuple[dict, str, int, str, int]] = []

        for item in self.equipment_items:
            item_id = item["id"]
            var = self.manage_equipment_vars.get(item_id)
            if not var or not var.get():
                continue
            quantity_var = self.manage_equipment_quantity_vars.get(item_id)
            quantity = self.parse_equipment_quantity(quantity_var.get()) if quantity_var else 1
            if quantity is None:
                quantity = 1

            existing = serials_by_id.get(item_id, [])
            if quantity <= 20:
                lines = [
                    str(existing[index]).strip() if index < len(existing) else ""
                    for index in range(quantity)
                ]
                content = "\n".join(lines)
            else:
                content = "\n".join(
                    str(value).strip()
                    for value in existing
                    if str(value).strip()
                )

            text_height = 4 if quantity <= 20 else min(10, max(6, min(quantity, 10)))
            selected_items.append((item, item_id, quantity, content, text_height))

        if not selected_items:
            ttk.Label(
                self.manage_serials_frame,
                text="Выберите оборудование выше, чтобы указать серийные номера.",
                style="Muted.TLabel",
            ).grid(row=0, column=0, sticky="w")
            return

        for item, item_id, quantity, content, text_height in selected_items:
            grid_row = card_index // grid_columns
            grid_col = card_index % grid_columns
            card_title = f"{item['name']} — {item['type']} ({quantity} шт.)"
            card = ttk.LabelFrame(
                self.manage_serials_frame,
                text=card_title,
                padding=8,
                style="Section.TLabelframe",
            )
            card.grid(row=grid_row, column=grid_col, sticky="nsew", padx=(0, 10), pady=(0, 10))

            ttk.Label(
                card,
                text="По одному номеру на строку. Можно вставить из Excel.",
                style="Muted.TLabel",
                wraplength=240,
            ).pack(anchor="w", pady=(0, 6))

            text_widget = scrolledtext.ScrolledText(
                card,
                width=28,
                height=text_height,
                wrap=tk.WORD,
                font=("Segoe UI", 10),
            )
            if content:
                text_widget.insert("1.0", content)
            text_widget.pack(fill="both", expand=True)
            self.manage_serial_texts[item_id] = text_widget
            card_index += 1

        for col in range(grid_columns):
            self.manage_serials_frame.columnconfigure(col, weight=1, uniform="serial_cards")
        total_rows = (card_index + grid_columns - 1) // grid_columns
        for row in range(total_rows):
            self.manage_serials_frame.rowconfigure(row, weight=1)

    def selected_equipment_serials(self) -> dict[str, list[str]] | None:
        out: dict[str, list[str]] = {}
        for item_id, text_widget in self.manage_serial_texts.items():
            raw = text_widget.get("1.0", "end")
            serials = [line.strip() for line in raw.splitlines()]
            while serials and not serials[-1]:
                serials.pop()
            out[item_id] = serials
        return out

    def format_equipment_quantities(self, user: dict) -> str:
        quantities = user.get("equipmentQuantities") or {}
        parts = []
        names_by_id = {item["id"]: item["name"] for item in self.equipment_items}
        for item_id in user.get("equipmentIds", []):
            name = names_by_id.get(item_id, item_id)
            parts.append(f"{name}: {quantities.get(item_id, 1)} шт.")
        return ", ".join(parts) if parts else "—"

    def parse_equipment_quantity(self, value: str) -> int | None:
        try:
            quantity = int(str(value).strip())
        except ValueError:
            return None
        if quantity < 1:
            return None
        return quantity

    def apply_list_payload(
        self,
        payload: dict,
        reselect_login: str | None = None,
        update_selected_result: bool = True,
    ) -> None:
        if "equipment" in payload:
            self.equipment_items = payload["equipment"]
        if "users" in payload:
            self.users = payload["users"]
        elif payload.get("items") and payload["items"] and "login" in payload["items"][0]:
            self.users = payload["items"]
        self.refresh_sticker_title_options()

        self.render_equipment_checks(
            self.create_equipment_frame,
            self.equipment_vars,
            self.equipment_quantity_vars,
            set(),
            {},
            default="sdb1106-nm",
        )
        self.render_users()

        login = reselect_login or self.selected_login
        if login:
            self.load_selected_user(login, update_result=update_selected_result)
        elif not self.users:
            self.selected_login = None
            self.manage_label_var.set("")
            self.manage_info.configure(text="Выберите аккаунт слева.")
            self.render_equipment_checks(
                self.manage_equipment_frame,
                self.manage_equipment_vars,
                self.manage_equipment_quantity_vars,
                set(),
                {},
            )

    def refresh_all(self) -> None:
        def work():
            return run_shell("list-all")

        def on_success(payload):
            self.apply_list_payload(payload)

        self.run_async(work, on_success, status="Загрузка списка аккаунтов...")

    def filtered_users(self) -> list[dict]:
        query = self.search_var.get().strip().lower()
        if not query:
            return self.users
        filtered = []
        for user in self.users:
            haystack = (
                f"{user.get('login', '')} {user.get('label', '')} "
                f"{user.get('equipmentQuantity', 1)} {' '.join(user.get('equipmentIds', []))}"
            ).lower()
            if query in haystack:
                filtered.append(user)
        return filtered

    def render_users(self) -> None:
        selected_login = self.selected_login
        self.users_list.delete(0, tk.END)
        self.displayed_logins = []
        selected_index = None

        for user in self.filtered_users():
            status = "активен" if user.get("active", True) else "отключён"
            label = f" | {user['label']}" if user.get("label") else ""
            quantity = user.get("equipmentQuantity", 1)
            self.displayed_logins.append(user["login"])
            line = f"{user['login']}{label} — {quantity} шт. — {self.format_equipment_quantities(user)} ({status})"
            index = self.users_list.size()
            self.users_list.insert(tk.END, line)
            if selected_login and user["login"] == selected_login:
                selected_index = index

        if selected_index is not None:
            self.users_list.selection_clear(0, tk.END)
            self.users_list.selection_set(selected_index)
            self.users_list.see(selected_index)

    def on_user_selected(self, _event=None) -> None:
        selection = self.users_list.curselection()
        if not selection:
            return
        index = selection[0]
        if index >= len(self.displayed_logins):
            return
        self.load_selected_user(self.displayed_logins[index])

    def load_selected_user(self, login: str, update_result: bool = True) -> None:
        user = next((item for item in self.users if item["login"] == login), None)
        if not user:
            return

        self.selected_login = user["login"]
        self.manage_label_var.set(user.get("label") or "")
        self.manage_sticker_title_var.set(self.default_sticker_title(user.get("equipmentIds", [])))
        status = "активен" if user.get("active", True) else "отключён"
        self.manage_info.configure(
            text=f"Аккаунт: {user['login']}\nОрганизация: {user.get('label') or '—'}\n"
            f"Всего единиц: {user.get('equipmentQuantity', 1)}\n"
            f"Оборудование: {self.format_equipment_quantities(user)}\nСтатус: {status}"
        )
        self.toggle_active_button.configure(
            text="Отключить вход" if user.get("active", True) else "Включить вход"
        )
        self.render_equipment_checks(
            self.manage_equipment_frame,
            self.manage_equipment_vars,
            self.manage_equipment_quantity_vars,
            set(user.get("equipmentIds", [])),
            user.get("equipmentQuantities", {}),
        )
        self.render_serial_fields(user)
        if update_result:
            self.show_selected_account_sticker(user["login"])

    def persist_base_url(self) -> None:
        self.config_data["baseUrl"] = self.base_url_var.get().strip() or "http://127.0.0.1:3000"
        save_config(self.config_data)

    def show_result(self, result: dict) -> None:
        credentials = result.get("credentials") or {}
        self.last_credentials = credentials
        self.last_sticker_path = result.get("stickerPath")

        lines = [
            f"Логин: {credentials.get('login', '')}",
            f"Пароль: {credentials.get('password', '')}",
            f"URL: {credentials.get('loginUrl', '')}",
        ]
        if credentials.get("label"):
            lines.insert(0, f"Организация: {credentials['label']}")
        if self.last_sticker_path:
            lines.append(f"Файл: {self.last_sticker_path}")
        if result.get("stickerError"):
            lines.append(f"Наклейка: ошибка — {result['stickerError']}")

        self.set_result_text("\n".join(lines))
        self.update_sticker_preview(
            self.last_sticker_path,
            "Наклейка не создана. Проверьте ошибку в блоке с данными.",
        )

    def create_account(self) -> None:
        login = self.login_var.get().strip()
        if not login:
            messagebox.showwarning("Проверка", "Укажите логин.")
            return

        equipment_ids = self.selected_equipment_ids(self.equipment_vars)
        if not equipment_ids:
            messagebox.showwarning("Проверка", "Выберите хотя бы одно оборудование.")
            return
        equipment_quantities = self.selected_equipment_quantities(
            self.equipment_vars,
            self.equipment_quantity_vars,
        )
        if equipment_quantities is None:
            messagebox.showwarning("Проверка", "Количество у выбранного оборудования должно быть целым числом от 1.")
            return

        self.persist_base_url()
        payload = {
            "login": login,
            "label": self.label_var.get().strip() or None,
            "baseUrl": self.config_data["baseUrl"],
            "equipmentIds": equipment_ids,
            "equipmentQuantities": equipment_quantities,
            "stickerTitle": self.sticker_title_var.get().strip() or self.default_sticker_title(equipment_ids),
            "generatePassword": self.generate_password_var.get(),
            "password": self.manual_password_var.get(),
        }

        def work():
            result = run_shell("create-user", json.dumps(payload, ensure_ascii=False))
            list_payload = run_shell("list-all")
            return {"result": result, "list_payload": list_payload}

        def on_success(data):
            result = data["result"]
            self.show_result(result)
            self.apply_list_payload(
                data["list_payload"],
                reselect_login=result["user"]["login"],
                update_selected_result=False,
            )
            messagebox.showinfo("Готово", f"Аккаунт {result['user']['login']} создан.")

        self.run_async(work, on_success, status="Создание аккаунта и наклейки...")

    def generate_sticker(self) -> None:
        if not self.selected_login:
            messagebox.showwarning("Проверка", "Выберите аккаунт слева.")
            return
        self.persist_base_url()
        login = self.selected_login
        payload = {
            "baseUrl": self.config_data["baseUrl"],
            "stickerTitle": self.manage_sticker_title_var.get().strip(),
        }
        credentials = getattr(self, "last_credentials", None) or {}
        if credentials.get("login") == login and credentials.get("password"):
            payload["password"] = credentials["password"]

        def work():
            try:
                return run_shell("generate-sticker", login, json.dumps(payload, ensure_ascii=False))
            except RuntimeError as error:
                if "Пароль для наклейки не сохранён" not in str(error):
                    raise
                return {"__needsPassword": True, "payload": payload}

        def on_success(result):
            if result.get("__needsPassword"):
                password = simpledialog.askstring(
                    "Текущий пароль",
                    "Пароль для наклейки не сохранён локально.\n"
                    "Введите текущий пароль аккаунта (он не изменится):",
                    show="*",
                    parent=self,
                )
                if not password:
                    return
                retry_payload = {**result["payload"], "password": password}

                def retry_work():
                    return run_shell("generate-sticker", login, json.dumps(retry_payload, ensure_ascii=False))

                def retry_success(retry_result):
                    self.show_result(retry_result)
                    messagebox.showinfo("Готово", f"Наклейка для {login} обновлена. Пароль не менялся.")

                self.run_async(retry_work, retry_success, status="Генерация наклейки без смены пароля...")
                return
            self.show_result(result)
            messagebox.showinfo("Готово", f"Наклейка для {login} обновлена. Пароль не менялся.")

        self.run_async(work, on_success, status="Генерация наклейки без смены пароля...")

    def reset_password(self) -> None:
        if not self.selected_login:
            messagebox.showwarning("Проверка", "Выберите аккаунт слева.")
            return
        self.persist_base_url()
        login = self.selected_login
        args = json.dumps(
            {
                "baseUrl": self.config_data["baseUrl"],
                "generatePassword": True,
                "stickerTitle": self.manage_sticker_title_var.get().strip(),
            },
            ensure_ascii=False,
        )

        def work():
            return run_shell("reset-password", login, args)

        def on_success(result):
            self.show_result(result)
            messagebox.showinfo("Готово", f"Новый пароль для {login}.")

        self.run_async(work, on_success, status="Сброс пароля и генерация наклейки...")

    def save_label(self) -> None:
        if not self.selected_login:
            messagebox.showwarning("Проверка", "Выберите аккаунт слева.")
            return
        login = self.selected_login
        args = json.dumps({"label": self.manage_label_var.get().strip()}, ensure_ascii=False)

        def work():
            run_shell("set-label", login, args)
            return run_shell("list-all")

        def on_success(payload):
            self.apply_list_payload(payload, reselect_login=login)
            messagebox.showinfo("Готово", "Организация сохранена.")

        self.run_async(work, on_success, status="Сохранение организации...")

    def save_equipment(self) -> None:
        if not self.selected_login:
            messagebox.showwarning("Проверка", "Выберите аккаунт слева.")
            return
        equipment_ids = self.selected_equipment_ids(self.manage_equipment_vars)
        if not equipment_ids:
            messagebox.showwarning("Проверка", "Выберите хотя бы одно оборудование.")
            return
        equipment_quantities = self.selected_equipment_quantities(
            self.manage_equipment_vars,
            self.manage_equipment_quantity_vars,
        )
        if equipment_quantities is None:
            messagebox.showwarning("Проверка", "Количество у выбранного оборудования должно быть целым числом от 1.")
            return
        login = self.selected_login
        args = json.dumps(
            {"equipmentIds": equipment_ids, "equipmentQuantities": equipment_quantities},
            ensure_ascii=False,
        )

        def work():
            run_shell("set-equipment", login, args)
            return run_shell("list-all")

        def on_success(payload):
            self.apply_list_payload(payload, reselect_login=login)
            messagebox.showinfo("Готово", "Доступ к оборудованию сохранён.")

        self.run_async(work, on_success, status="Сохранение доступа...")

    def save_serials(self) -> None:
        if not self.selected_login:
            messagebox.showwarning("Проверка", "Выберите аккаунт слева.")
            return
        equipment_serials = self.selected_equipment_serials()
        if equipment_serials is None:
            messagebox.showwarning("Проверка", "Не удалось собрать серийные номера.")
            return
        login = self.selected_login
        args = json.dumps({"equipmentSerials": equipment_serials}, ensure_ascii=False)

        def work():
            run_shell("set-equipment-serials", login, args)
            return run_shell("list-all")

        def on_success(payload):
            self.apply_list_payload(payload, reselect_login=login)
            messagebox.showinfo("Готово", "Серийные номера сохранены.")

        self.run_async(work, on_success, status="Сохранение серийных номеров...")

    def toggle_active(self) -> None:
        if not self.selected_login:
            messagebox.showwarning("Проверка", "Выберите аккаунт слева.")
            return
        user = next((item for item in self.users if item["login"] == self.selected_login), None)
        if not user:
            return
        login = self.selected_login
        args = json.dumps({"active": not user.get("active", True)}, ensure_ascii=False)

        def work():
            run_shell("set-active", login, args)
            return run_shell("list-all")

        def on_success(payload):
            self.apply_list_payload(payload, reselect_login=login)
            messagebox.showinfo("Готово", "Статус аккаунта обновлён.")

        self.run_async(work, on_success, status="Обновление статуса...")

    def confirm_delete_account(self, login: str) -> bool:
        dialog = tk.Toplevel(self)
        dialog.title("Подтверждение удаления")
        dialog.configure(bg=CARD_BG)
        dialog.transient(self)
        dialog.grab_set()
        dialog.resizable(False, False)

        frame = ttk.Frame(dialog, style="Card.TFrame", padding=16)
        frame.grid(row=0, column=0, sticky="nsew")

        ttk.Label(
            frame,
            text=f"Удалить аккаунт «{login}»?",
            style="Card.TLabel",
            font=("Segoe UI", 11, "bold"),
            wraplength=420,
        ).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 8))

        ttk.Label(
            frame,
            text=(
                "Это действие удалит пользователя из базы. "
                "Войти под ним больше будет нельзя.\n\n"
                "Для подтверждения введите код из 6 цифр:"
            ),
            style="Card.TLabel",
            wraplength=420,
        ).grid(row=1, column=0, columnspan=2, sticky="w", pady=(0, 10))

        code_var = tk.StringVar()
        code_entry = ttk.Entry(frame, textvariable=code_var, width=18, font=("Segoe UI", 12))
        code_entry.grid(row=2, column=0, columnspan=2, sticky="w", pady=(0, 12))
        code_entry.focus_set()

        error_var = tk.StringVar(value="")
        error_label = ttk.Label(frame, textvariable=error_var, style="Card.TLabel", foreground=ACCENT_COLOR)
        error_label.grid(row=3, column=0, columnspan=2, sticky="w", pady=(0, 8))

        confirmed = {"value": False}

        def close_dialog() -> None:
            dialog.grab_release()
            dialog.destroy()

        def submit() -> None:
            entered = code_var.get().strip()
            if entered != DELETE_ACCOUNT_CONFIRM_CODE:
                error_var.set("Неверный код подтверждения.")
                code_entry.select_range(0, tk.END)
                code_entry.focus_set()
                return
            confirmed["value"] = True
            close_dialog()

        def cancel() -> None:
            close_dialog()

        buttons = ttk.Frame(frame, style="Card.TFrame")
        buttons.grid(row=4, column=0, columnspan=2, sticky="e")

        ttk.Button(buttons, text="Отмена", command=cancel).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(buttons, text="Удалить", command=submit, style="Danger.TButton").grid(row=0, column=1)

        dialog.bind("<Return>", lambda _event: submit())
        dialog.bind("<Escape>", lambda _event: cancel())
        dialog.protocol("WM_DELETE_WINDOW", cancel)

        dialog.update_idletasks()
        dialog_width = dialog.winfo_width()
        dialog_height = dialog.winfo_height()
        parent_x = self.winfo_rootx()
        parent_y = self.winfo_rooty()
        parent_width = self.winfo_width()
        parent_height = self.winfo_height()
        dialog.geometry(
            f"{dialog_width}x{dialog_height}+"
            f"{parent_x + (parent_width - dialog_width) // 2}+"
            f"{parent_y + (parent_height - dialog_height) // 2}"
        )

        self.wait_window(dialog)
        return confirmed["value"]

    def delete_account(self) -> None:
        if not self.selected_login:
            messagebox.showwarning("Проверка", "Выберите аккаунт слева.")
            return
        login = self.selected_login
        if not self.confirm_delete_account(login):
            return

        def work():
            run_shell("delete-user", login)
            return run_shell("list-all")

        def on_success(payload):
            self.selected_login = None
            self.manage_label_var.set("")
            self.manage_info.configure(text="Выберите аккаунт слева.")
            self.render_equipment_checks(
                self.manage_equipment_frame,
                self.manage_equipment_vars,
                self.manage_equipment_quantity_vars,
                set(),
                {},
            )
            self.render_serial_fields()
            self.last_sticker_path = None
            self.set_result_text(f"Аккаунт {login} удалён.")
            self.update_sticker_preview(None, "Аккаунт удалён. Выберите другой аккаунт.")
            self.apply_list_payload(payload)
            messagebox.showinfo("Готово", f"Аккаунт {login} удалён.")

        self.run_async(work, on_success, status="Удаление аккаунта...")

    def copy_credentials(self) -> None:
        if not self.last_credentials:
            messagebox.showwarning("Проверка", "Сначала создайте аккаунт или сбросьте пароль.")
            return
        lines = []
        if self.last_credentials.get("label"):
            lines.append(f"Организация: {self.last_credentials['label']}")
        lines.extend(
            [
                f"URL: {self.last_credentials.get('loginUrl', '')}",
                f"Логин: {self.last_credentials.get('login', '')}",
                f"Пароль: {self.last_credentials.get('password', '')}",
            ]
        )
        text = "\n".join(lines)
        self.clipboard_clear()
        self.clipboard_append(text)
        messagebox.showinfo("Готово", "Данные скопированы в буфер обмена.")

    def open_sticker(self) -> None:
        if not self.last_sticker_path or not Path(self.last_sticker_path).exists():
            messagebox.showwarning("Проверка", "PNG-наклейка пока не создана.")
            return
        os.startfile(self.last_sticker_path)

    def open_stickers_dir(self) -> None:
        STICKERS_DIR.mkdir(parents=True, exist_ok=True)
        os.startfile(STICKERS_DIR)


def main() -> int:
    if not SHELL.exists():
        messagebox.showerror("Ошибка", f"Не найден файл: {SHELL}")
        return 1
    app = PortalAdminApp()
    app.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
