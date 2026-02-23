from flask import Flask, render_template, request, jsonify
import io
import json
import os
import re
import requests
import shutil
import subprocess
import tempfile
import zipfile
from xml.etree import ElementTree

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


def _extract_json_block(text):
    if not text:
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.replace("json", "", 1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        return None


def _extract_sections_from_text(text):
    if not text:
        return None
    sections = {"technique": "", "findings": "", "impression": ""}
    current = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            if current:
                sections[current] += "\n"
            continue
        upper = line.upper()
        if "TÉCNICA" in upper or "TECNICA" in upper or upper.startswith("TECHNIQUE"):
            current = "technique"
            continue
        if "ACHADOS" in upper or "FINDINGS" in upper:
            current = "findings"
            continue
        if "IMPRESSÃO" in upper or "IMPRESSAO" in upper or "IMPRESSION" in upper:
            current = "impression"
            continue
        if current:
            sections[current] += (line + "\n")

    for key in sections:
        sections[key] = sections[key].strip()
    if any(sections.values()):
        return sections
    return {"technique": "", "findings": text.strip(), "impression": ""}


def _coerce_text(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return "\n".join([str(item) for item in value if item is not None])
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _normalize_sections(parsed, raw_content):
    if not isinstance(parsed, dict):
        return None

    technique = _coerce_text(parsed.get("technique", "")).strip()
    findings = _coerce_text(parsed.get("findings", "")).strip()
    impression = _coerce_text(parsed.get("impression", "")).strip()

    combined = "\n".join([technique, findings, impression]).strip()
    if combined:
        upper = combined.upper()
        if "TÉCNICA" in upper or "TECNICA" in upper or "ACHADOS" in upper or "IMPRESSÃO" in upper or "IMPRESSAO" in upper:
            parsed_sections = _extract_sections_from_text(combined)
            if parsed_sections:
                return parsed_sections

    if not (technique or findings or impression) and raw_content:
        parsed_sections = _extract_sections_from_text(raw_content)
        if parsed_sections:
            return parsed_sections

    return {"technique": technique, "findings": findings, "impression": impression}


def _decode_bytes_to_text(data):
    if not data:
        return ""
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1", errors="ignore")


def _clean_extracted_text(text):
    if not text:
        return ""
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = cleaned.replace("\x00", " ")
    cleaned = re.sub(r"[ \t]+\n", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _extract_text_from_docx_bytes(data):
    if not data:
        return ""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            xml_data = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile, RuntimeError):
        return ""

    try:
        root = ElementTree.fromstring(xml_data)
    except ElementTree.ParseError:
        return ""

    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    paragraphs = []
    for paragraph in root.iter(f"{ns}p"):
        chunks = []
        for node in paragraph.iter():
            if node.tag == f"{ns}t" and node.text:
                chunks.append(node.text)
            elif node.tag == f"{ns}tab":
                chunks.append("\t")
            elif node.tag in (f"{ns}br", f"{ns}cr"):
                chunks.append("\n")
        paragraph_text = "".join(chunks).strip()
        if paragraph_text:
            paragraphs.append(paragraph_text)
    return "\n".join(paragraphs).strip()


def _extract_text_with_textutil(data, suffix):
    if not data or not shutil.which("textutil"):
        return ""

    source_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as source_file:
            source_file.write(data)
            source_path = source_file.name

        result = subprocess.run(
            ["textutil", "-convert", "txt", "-stdout", source_path],
            capture_output=True,
            text=True,
            timeout=25,
            check=False,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""
    finally:
        if source_path and os.path.exists(source_path):
            try:
                os.unlink(source_path)
            except OSError:
                pass
    return ""


def _extract_text_from_doc_bytes(data):
    if not data:
        return ""

    converted = _extract_text_with_textutil(data, ".doc")
    if converted:
        return converted

    # Fallback simples para arquivos antigos quando textutil não estiver disponível.
    decoded = _decode_bytes_to_text(data)
    decoded = re.sub(r"[^\x09\x0A\x0D\x20-\x7EÀ-ÿ]", " ", decoded)
    decoded = re.sub(r"[ \t]{2,}", " ", decoded)
    return decoded.strip()


def _extract_text_from_pdf_bytes(data):
    if not data:
        return ""

    text_chunks = []
    try:
        try:
            from pypdf import PdfReader  # type: ignore
        except ImportError:
            from PyPDF2 import PdfReader  # type: ignore
        reader = PdfReader(io.BytesIO(data))
        for page in reader.pages:
            text = page.extract_text() or ""
            if text.strip():
                text_chunks.append(text.strip())
    except Exception:
        text_chunks = []

    if text_chunks:
        return "\n\n".join(text_chunks).strip()

    if not shutil.which("pdftotext"):
        return ""

    source_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as source_file:
            source_file.write(data)
            source_path = source_file.name

        result = subprocess.run(
            ["pdftotext", "-layout", source_path, "-"],
            capture_output=True,
            text=True,
            timeout=25,
            check=False,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ""
    finally:
        if source_path and os.path.exists(source_path):
            try:
                os.unlink(source_path)
            except OSError:
                pass
    return ""


def _extract_template_text(filename, content):
    extension = os.path.splitext((filename or "").lower())[1]
    if extension == ".txt":
        return _decode_bytes_to_text(content)
    if extension == ".docx":
        return _extract_text_from_docx_bytes(content)
    if extension == ".doc":
        return _extract_text_from_doc_bytes(content)
    if extension == ".pdf":
        return _extract_text_from_pdf_bytes(content)
    return ""


@app.route("/extract-template-text", methods=["POST"])
def extract_template_text():
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Arquivo não enviado."}), 400

    extension = os.path.splitext(uploaded.filename.lower())[1]
    allowed = {".txt", ".doc", ".docx", ".pdf"}
    if extension not in allowed:
        return jsonify({"error": "Formato não suportado. Use .txt, .doc, .docx ou .pdf."}), 400

    content = uploaded.read()
    if not content:
        return jsonify({"error": "Arquivo vazio."}), 400

    if len(content) > 8 * 1024 * 1024:
        return jsonify({"error": "Arquivo muito grande. Limite: 8 MB."}), 413

    extracted = _extract_template_text(uploaded.filename, content)
    cleaned = _clean_extracted_text(extracted)
    if not cleaned:
        return jsonify({
            "error": "Não foi possível extrair texto do arquivo.",
            "detail": "Verifique se o arquivo não está protegido e se contém texto selecionável.",
        }), 422

    return jsonify({"text": cleaned, "filename": uploaded.filename})


@app.route("/generate", methods=["POST"])
def generate_report():
    try:
        data = request.get_json(silent=True) or {}
        provider = data.get("provider", "openai")
        model = data.get("model", "").strip()
        base_url = data.get("baseUrl", "").strip()
        api_key = data.get("apiKey", "").strip()
        payload = data.get("payload", {}) or {}

        if not model:
            return jsonify({"error": "Modelo não informado."}), 400

        if provider in ("openai", "gemini") and not api_key:
            return jsonify({"error": "API Key é obrigatória para API externa."}), 400

        if not base_url:
            if provider == "lmstudio":
                base_url = "http://localhost:1234/v1"
            elif provider == "gemini":
                base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
            else:
                base_url = "https://api.openai.com/v1"

        dictation = payload.get("dictation", {}) or {}
        mode = payload.get("mode", "")
        region = payload.get("region", "")
        contrast = payload.get("contrast", "")

        system_prompt = (
            "Você é um radiologista senior experiente. Sua função é gerar laudos precisos e objetivos "
            "para as modalidades de TC e RM. Organize as frases para que o médico solicitante tenha "
            "clareza na descrição dos achados. "
            "Retorne APENAS um JSON válido com as chaves: technique, findings, impression. "
            "Cada valor deve conter apenas o conteúdo da sua seção, sem títulos ou rótulos. "
            "A impressão deve ser coerente e derivada exclusivamente dos achados apresentados "
            "(se a impressão ditada estiver vazia ou incompleta, sintetize a partir dos achados). "
            "Evite inventar achados não mencionados; se faltar informação, use linguagem cautelosa."
        )

        user_prompt = (
            "Contexto do exame:\n"
            f"- Modalidade: {mode}\n"
            f"- Região: {region}\n"
            f"- Contraste: {contrast}\n\n"
            "Frases ditadas pelo médico (podem estar incompletas):\n"
            f"- Indicação clínica: {dictation.get('indication', '')}\n"
            f"- Informações adicionais: {dictation.get('extraInfo', '')}\n"
            f"- Técnica ditada: {dictation.get('technique', '')}\n"
            f"- Achados ditados: {dictation.get('findings', '')}\n"
            f"- Impressão ditada: {dictation.get('impression', '')}\n\n"
            "Transforme essas frases em um laudo coeso, preservando o conteúdo dito."
        )

        url = base_url.rstrip("/") + "/chat/completions"
        headers = {"Content-Type": "application/json"}
        if api_key:
            if provider == "gemini":
                headers["Authorization"] = f"Bearer {api_key}"
            else:
                headers["Authorization"] = f"Bearer {api_key}"

        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "max_tokens": 900,
        }

        response = requests.post(url, headers=headers, json=body, timeout=90)
        if not response.ok:
            detail = ""
            try:
                payload = response.json()
                if isinstance(payload, dict) and "error" in payload:
                    detail = payload["error"]
                else:
                    detail = payload
            except ValueError:
                detail = response.text[:600]
            return jsonify({
                "error": f"Erro do provedor ({response.status_code}).",
                "detail": detail,
            }), 502

        data_out = response.json()
        content = ""
        try:
            content = data_out["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            content = ""

        parsed = _extract_json_block(content)
        if not parsed:
            parsed = _extract_sections_from_text(content)

        parsed = _normalize_sections(parsed, content)
        if not parsed:
            return jsonify({"error": "Resposta do modelo inválida.", "raw": content}), 502

        return jsonify({
            "technique": parsed.get("technique", ""),
            "findings": parsed.get("findings", ""),
            "impression": parsed.get("impression", ""),
        })
    except requests.RequestException as exc:
        return jsonify({"error": f"Erro ao chamar modelo: {exc}"}), 502
    except Exception as exc:
        return jsonify({"error": f"Erro interno no servidor: {exc}"}), 500


@app.route("/models", methods=["POST"])
def list_models():
    data = request.get_json(silent=True) or {}
    provider = data.get("provider", "openai")
    base_url = data.get("baseUrl", "").strip()
    api_key = data.get("apiKey", "").strip()
    loaded_only = bool(data.get("loadedOnly"))

    if provider in ("openai", "gemini") and not api_key:
        return jsonify({"error": "API Key é obrigatória para listar modelos."}), 400

    if not base_url:
        if provider == "lmstudio":
            base_url = "http://localhost:1234/v1"
        elif provider == "gemini":
            base_url = "https://generativelanguage.googleapis.com/v1beta/openai"
        else:
            base_url = "https://api.openai.com/v1"

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = None
    used_url = ""
    base_clean = base_url.rstrip("/")
    model_urls = []
    if provider == "lmstudio" and loaded_only:
        model_urls.extend([
            f"{base_clean}/models?loaded=true",
            f"{base_clean}/models/loaded",
            f"{base_clean}/models/active",
        ])
    model_urls.append(f"{base_clean}/models")

    for url in model_urls:
        try:
            response = requests.get(url, headers=headers, timeout=30)
        except requests.RequestException:
            continue
        if not response.ok:
            continue
        try:
            payload = response.json()
            if payload:
                used_url = url
                break
        except ValueError:
            continue

    if payload is None:
        return jsonify({"error": "Resposta inválida ao listar modelos."}), 502

    models = []
    data_list = None
    if isinstance(payload, dict):
        data_list = payload.get("data")
        if isinstance(data_list, list):
            for item in data_list:
                if isinstance(item, dict) and item.get("id"):
                    models.append(item["id"])
                elif isinstance(item, str):
                    models.append(item)
        elif isinstance(payload.get("models"), list):
            for item in payload["models"]:
                if isinstance(item, dict) and item.get("id"):
                    models.append(item["id"])
                elif isinstance(item, str):
                    models.append(item)
        if isinstance(payload.get("active_model"), str):
            models.append(payload["active_model"])
        if isinstance(payload.get("loaded_model"), str):
            models.append(payload["loaded_model"])
    elif isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict) and item.get("id"):
                models.append(item["id"])
            elif isinstance(item, str):
                models.append(item)

    if provider == "lmstudio" and loaded_only:
        is_loaded_endpoint = (
            "loaded=true" in used_url or
            used_url.endswith("/models/loaded") or
            used_url.endswith("/models/active")
        )
        if is_loaded_endpoint and models:
            models = [m for m in models if m]
        else:
            loaded = []
            for item in data_list or []:
                if not isinstance(item, dict):
                    continue
                if item.get("loaded") is True or item.get("is_loaded") is True:
                    loaded.append(item.get("id"))
                status = str(item.get("status", "")).lower()
                state = str(item.get("state", "")).lower()
                if status in ("loaded", "active", "ready") or state in ("loaded", "active", "ready"):
                    loaded.append(item.get("id"))
            loaded = [m for m in loaded if m]
            models = loaded

    warning = ""
    if not models and provider == "lmstudio" and loaded_only:
        warning = "Nenhum modelo carregado detectado no LM Studio."
    if not models and provider == "gemini":
        models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"]
    models = sorted(set([m for m in models if m]))
    response = {"models": models}
    if warning:
        response["warning"] = warning
    return jsonify(response)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0").strip().lower() in ("1", "true", "yes", "on")
    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=debug)

