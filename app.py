from flask import Flask, render_template, request, jsonify, send_file, session, redirect
from functools import wraps
import io
import json
import os
import re
import requests
import shutil
import sqlite3
import subprocess
import tempfile
import uuid
import zipfile
import unicodedata
from datetime import date, datetime, timezone
from html import escape
from werkzeug.security import check_password_hash, generate_password_hash
from xml.etree import ElementTree

app = Flask(__name__)
app.secret_key = (
    os.getenv("APP_SECRET_KEY")
    or os.getenv("SECRET_KEY")
    or "radiologia-laudos-secret-change-me"
)
TEMPLATE_DB_PATH = os.getenv(
    "APP_DB_PATH",
    os.getenv("TEMPLATE_DB_PATH", os.path.join(app.root_path, "templates.db")),
)
ALLOWED_TEMPLATE_MODES = {"ct", "mri"}
ALLOWED_TEMPLATE_REGIONS = {
    "cranio",
    "pescoco",
    "torax",
    "abdomen",
    "abdome_pelve",
    "coluna",
    "pelve",
    "osteo",
    "vascular",
}
API_KEY_PROVIDERS = {"openai", "gemini"}
USER_ROLES = {"admin", "radiologist"}
REPORT_CONTRAST_OPTIONS = {"sem", "com", "misto"}
REPORT_LOGO_PATH = os.path.join(app.static_folder, "report_logo.png")
REPORT_FOOTER_BAND_PATH = os.path.join(app.static_folder, "report_footer_band.png")


@app.route("/")
def index():
    return render_template("index.html")


def _extract_json_block(text):
    if not text:
        return None
    cleaned = text.strip()

    # 1) Tentativa direta.
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 2) Trechos dentro de fence markdown.
    for match in re.finditer(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, flags=re.IGNORECASE):
        fenced_content = match.group(1).strip()
        try:
            return json.loads(fenced_content)
        except json.JSONDecodeError:
            continue

    # 3) Primeiro objeto JSON balanceado no texto.
    start = cleaned.find("{")
    if start != -1:
        depth = 0
        in_string = False
        escape_next = False
        for idx in range(start, len(cleaned)):
            ch = cleaned[idx]
            if in_string:
                if escape_next:
                    escape_next = False
                elif ch == "\\":
                    escape_next = True
                elif ch == '"':
                    in_string = False
                continue

            if ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = cleaned[start : idx + 1]
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError:
                        break

    # 4) Fallback simples: do primeiro { ao último }.
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        tolerant = _extract_sections_from_json_like_text(cleaned)
        if tolerant:
            return tolerant
        return None
    try:
        return json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError:
        tolerant = _extract_sections_from_json_like_text(cleaned)
        if tolerant:
            return tolerant
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
        if "ACHADOS" in upper or "FINDINGS" in upper or "ANÁLISE" in upper or "ANALISE" in upper or upper.startswith("LAUDO"):
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


def _strip_markdown_fences(text):
    if not text:
        return ""
    cleaned = str(text).strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned, flags=re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return cleaned


def _extract_sections_from_json_like_text(text):
    if not text:
        return None
    cleaned = _strip_markdown_fences(text)
    if not cleaned:
        return None

    key_pattern = re.compile(
        r'"?(technique|tecnica|técnica|findings|laudo|achados|impression|impressao|impressão)"?\s*:',
        flags=re.IGNORECASE,
    )
    matches = list(key_pattern.finditer(cleaned))
    if not matches:
        return None

    sections = {"technique": "", "findings": "", "impression": ""}
    for index, match in enumerate(matches):
        raw_key = match.group(1).strip().lower()
        value_start = match.end()
        value_end = matches[index + 1].start() if index + 1 < len(matches) else len(cleaned)
        raw_value = cleaned[value_start:value_end].strip()

        # Remove separadores JSON comuns.
        raw_value = re.sub(r"^[\s:]+", "", raw_value)
        raw_value = re.sub(r",\s*$", "", raw_value)
        raw_value = re.sub(r"}\s*$", "", raw_value)
        raw_value = re.sub(r"^\{", "", raw_value).strip()

        # Captura conteúdo entre aspas quando existir.
        quoted = re.match(r'^"([\s\S]*)"$', raw_value)
        if quoted:
            value = quoted.group(1)
        else:
            value = raw_value

        value = value.replace('\\"', '"').replace("\\n", "\n").replace("\\t", "\t").strip()
        if not value:
            continue

        if raw_key in ("technique", "tecnica", "técnica"):
            sections["technique"] = value
        elif raw_key in ("findings", "laudo", "achados"):
            sections["findings"] = value
        elif raw_key in ("impression", "impressao", "impressão"):
            sections["impression"] = value

    if any(sections.values()):
        return sections
    return None


def _extract_sections_from_dict(parsed):
    if not isinstance(parsed, dict):
        return None

    aliases = {
        "technique": ["technique", "tecnica", "técnica", "metodo", "método"],
        "findings": ["findings", "laudo", "report", "descricao", "descrição", "achados", "body"],
        "impression": ["impression", "impressao", "impressão", "conclusion", "conclusao", "conclusão"],
    }

    extracted = {"technique": "", "findings": "", "impression": ""}
    lower_map = {str(key).strip().lower(): key for key in parsed.keys()}

    for canonical_key, key_aliases in aliases.items():
        for alias in key_aliases:
            real_key = lower_map.get(alias.lower())
            if real_key is not None:
                extracted[canonical_key] = _coerce_text(parsed.get(real_key, "")).strip()
                if extracted[canonical_key]:
                    break

    # Procura também em subobjetos comuns.
    for nested_key in ("sections", "data", "result", "output", "response"):
        nested = parsed.get(nested_key)
        if isinstance(nested, dict):
            nested_sections = _extract_sections_from_dict(nested)
            if nested_sections:
                for key in extracted:
                    if not extracted[key] and nested_sections.get(key):
                        extracted[key] = nested_sections[key]

    if any(extracted.values()):
        return extracted
    return None


def _normalize_sections(parsed, raw_content):
    if not isinstance(parsed, dict):
        return None

    extracted = _extract_sections_from_dict(parsed) or {}
    technique = _coerce_text(extracted.get("technique", "")).strip()
    findings = _coerce_text(extracted.get("findings", "")).strip()
    impression = _coerce_text(extracted.get("impression", "")).strip()

    combined = "\n".join([technique, findings, impression]).strip()
    if combined:
        upper = combined.upper()
        if (
            "TÉCNICA" in upper
            or "TECNICA" in upper
            or "ACHADOS" in upper
            or upper.startswith("LAUDO")
            or "IMPRESSÃO" in upper
            or "IMPRESSAO" in upper
        ):
            parsed_sections = _extract_sections_from_text(combined)
            if parsed_sections:
                return parsed_sections

    if raw_content:
        parsed_sections = _extract_sections_from_text(raw_content) or {}
        raw_technique = _clean_inline_text(parsed_sections.get("technique", ""))
        raw_findings = _clean_inline_text(parsed_sections.get("findings", ""))
        raw_impression = _clean_inline_text(parsed_sections.get("impression", ""))

        if _is_json_like_text(raw_findings):
            raw_findings = ""
        if _is_json_like_text(raw_impression):
            raw_impression = ""

        technique = technique or raw_technique
        findings = findings or raw_findings
        impression = impression or raw_impression

    return {"technique": technique, "findings": findings, "impression": impression}


def _clean_inline_text(value):
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip().strip(",;").strip()

    # Remove artefatos comuns de respostas em JSON/markdown.
    text = re.sub(r"^\s*```(?:json|text|markdown)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```\s*$", "", text)
    text = re.sub(r"^\s*json\s*\n", "", text, flags=re.IGNORECASE)
    text = text.strip()

    # Remove pares de aspas/crases que envolvem o texto inteiro.
    for _ in range(3):
        if len(text) >= 2 and text[0] == text[-1] and text[0] in ('"', "'", "`"):
            text = text[1:-1].strip()

    # Remove aspas soltas na borda.
    text = re.sub(r'^["\'`]+\s*', "", text)
    text = re.sub(r'\s*["\'`]+$', "", text)

    return text.strip()


def _strip_accents(text):
    normalized = unicodedata.normalize("NFD", str(text or ""))
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _normalize_mode(mode):
    value = _strip_accents(mode).strip().lower()
    if value in ("mri", "mr", "rm", "ressonancia", "ressonancia magnetica"):
        return "mri"
    if value in ("ct", "tc", "tomografia", "tomografia computadorizada"):
        return "ct"
    return ""


def _normalize_region(region):
    value = _strip_accents(region).strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "cabeca": "cranio",
        "encefalo": "cranio",
        "cerebro": "cranio",
        "pescoco": "pescoco",
        "torax": "torax",
        "abdome": "abdomen",
        "abdomen": "abdomen",
        "abdome_e_pelve": "abdome_pelve",
        "abdomen_e_pelve": "abdome_pelve",
        "abdomino_pelvico": "abdome_pelve",
        "abdominopelvico": "abdome_pelve",
        "coluna": "coluna",
        "pelve": "pelve",
        "osteo": "osteo",
        "osteoarticular": "osteo",
        "musculoesqueletico": "osteo",
        "vascular": "vascular",
    }
    normalized = aliases.get(value, value)
    return normalized if normalized in ALLOWED_TEMPLATE_REGIONS else ""


def _region_display_label(region):
    labels = {
        "cranio": "crânio",
        "pescoco": "pescoço",
        "torax": "tórax",
        "abdomen": "abdome",
        "abdome_pelve": "abdome e pelve",
        "coluna": "coluna",
        "pelve": "pelve",
        "osteo": "segmento ósteoarticular",
        "vascular": "segmento vascular",
    }
    return labels.get(_normalize_region(region), str(region or "segmento avaliado").replace("_", " "))


def _infer_mode_region_from_request(request_prompt, mode, region):
    req = _strip_accents(request_prompt).lower()
    mode_clean = _normalize_mode(mode)
    region_clean = _normalize_region(region)

    if req:
        if re.search(r"\b(rm|ressonancia|ressonancia magnetica|mri)\b", req):
            mode_clean = "mri"
        elif re.search(r"\b(tc|ct|tomografia|tomografia computadorizada)\b", req):
            mode_clean = "ct"

        region_map = [
            ("abdome_pelve", ("abdome e pelve", "abdomen e pelve", "abdomino pelvico", "abdominopelvico")),
            ("cranio", ("cranio", "encefalo", "encefalico", "cerebro", "cabeca")),
            ("pescoco", ("pescoco", "cervical")),
            ("torax", ("torax", "toracico", "pulmao", "pulmonar")),
            ("abdomen", ("abdome", "abdomen")),
            ("coluna", ("coluna", "vertebral", "lombar", "toracica", "torácica", "cervical")),
            ("pelve", ("pelve", "pelvico", "pélvico")),
            ("osteo", ("osteo", "osseo", "ósseo", "articular", "musculoesqueletico", "musculoesquelético", "ombro", "joelho", "quadril", "punho", "cotovelo", "tornozelo")),
            ("vascular", ("vascular", "angiografia", "angio")),
        ]
        for mapped_region, keywords in region_map:
            if any(keyword in req for keyword in keywords):
                region_clean = mapped_region
                break

    if mode_clean not in ALLOWED_TEMPLATE_MODES:
        mode_clean = "ct"
    if not region_clean:
        region_clean = "cranio"
    return mode_clean, region_clean


def _is_json_like_text(text):
    if not text:
        return False
    lowered = text.strip().lower()
    return (
        lowered.startswith("```json")
        or (lowered.startswith("{") and lowered.endswith("}"))
        or '"technique"' in lowered
        or '"findings"' in lowered
        or '"impression"' in lowered
        or '"laudo"' in lowered
    )


def _build_default_technique(mode, region, contrast):
    mode_clean = str(mode or "").strip().lower()
    region_label = _region_display_label(region)
    contrast_clean = str(contrast or "").strip().lower()

    if mode_clean == "ct":
        if contrast_clean == "com":
            contrast_text = "com contraste intravenoso"
        elif contrast_clean == "misto":
            contrast_text = "sem e com contraste intravenoso"
        else:
            contrast_text = "sem contraste intravenoso"
        return (
            "Aquisição helicoidal multislice de "
            f"{region_label}, com cortes finos e reconstruções multiplanares, {contrast_text}."
        )

    if contrast_clean == "com":
        contrast_text = "com gadolínio"
    elif contrast_clean == "misto":
        contrast_text = "sem e com gadolínio"
    else:
        contrast_text = "sem gadolínio"
    return (
        "Sequências multiplanares ponderadas em T1, T2, FLAIR e DWI de "
        f"{region_label}, {contrast_text}."
    )


def _is_low_quality_findings(text):
    clean = _clean_inline_text(text)
    if not clean:
        return True
    if _is_json_like_text(clean):
        return True
    normalized = _strip_accents(clean).lower()
    bad_markers = (
        "laudo elaborado conforme solicitacao",
        "laudo elaborado de acordo com solicitacao",
        "conforme solicitacao",
        "de acordo com a solicitacao",
        "solicitacao do usuario",
    )
    if any(marker in normalized for marker in bad_markers):
        return True
    if len(clean) < 20:
        return True
    return False


def _fallback_laudo_text(dictation, request_prompt, mode="", region=""):
    req = _strip_accents(request_prompt).lower()
    mode_guess, region_guess = _infer_mode_region_from_request(request_prompt, mode, region)

    pieces = []
    if isinstance(dictation, dict):
        if dictation.get("findings"):
            findings_text = _clean_inline_text(dictation.get("findings"))
            if not _is_low_quality_findings(findings_text):
                pieces.append(findings_text)
        if dictation.get("extraInfo"):
            extra_text = _clean_inline_text(dictation.get("extraInfo"))
            if extra_text and len(extra_text) >= 20:
                pieces.append(extra_text)
    dictation_combined = "\n".join([item for item in pieces if item]).strip()

    if mode_guess == "mri" and region_guess == "cranio":
        if any(token in req for token in ("avc", "acidente vascular", "isquem", "hemorrag")):
            return (
                "Parênquima encefálico sem efeito de massa significativo, sem coleções extra-axiais e sem desvio da linha média.\n"
                "Não se observam sinais de hemorragia intracraniana aguda nem restrição difusional extensa neste exame.\n"
                "Sistema ventricular e espaços liquóricos sem desvio da linha média."
            )
        if any(token in req for token in ("idos", "senil", "envelhecimento")):
            return (
                "Discretas alterações involutivas encefálicas, com alargamento dos sulcos corticais e leve proeminência ventricular.\n"
                "Pequenos focos de hipersinal em substância branca profunda, compatíveis com gliose microangiopática crônica.\n"
                "Sem lesões expansivas, sem sangramento recente e sem restrição à difusão."
            )
        if any(token in req for token in ("neonat", "recem nascido", "recém nascido", "rn")):
            return (
                "Parênquima encefálico com sinal e morfologia preservados para a faixa etária neonatal.\n"
                "Sistema ventricular sem dilatação e sem coleções intracranianas.\n"
                "Sem evidências de hemorragia intracraniana ou restrição à difusão."
            )
        if dictation_combined:
            return dictation_combined
        return (
            "Parênquima encefálico com morfologia e intensidade de sinal preservadas para a faixa etária.\n"
            "Sem lesões expansivas, sem restrição à difusão e sem sinais de sangramento recente.\n"
            "Sistema ventricular e espaços liquóricos de dimensões habituais."
        )

    if mode_guess == "ct" and region_guess == "cranio":
        if any(token in req for token in ("avc", "acidente vascular", "isquem", "hemorrag")):
            return (
                "Ausência de hemorragia intracraniana aguda e de efeito de massa significativo.\n"
                "Sem desvio da linha média e sem coleções extra-axiais volumosas.\n"
                "Ventrículos e cisternas da base preservados no estudo atual."
            )
        if dictation_combined:
            return dictation_combined
        return (
            "Parênquima encefálico sem sinais de hemorragia aguda ou efeito de massa.\n"
            "Ventrículos e cisternas da base preservados.\n"
            "Calota craniana sem fraturas evidentes."
        )

    region_defaults = {
        ("ct", "torax"): (
            "Pulmões sem consolidações focais, derrame pleural ou pneumotórax.\n"
            "Mediastino sem linfonodomegalias de dimensões patológicas.\n"
            "Arcabouço ósseo torácico sem alterações agudas evidentes."
        ),
        ("mri", "torax"): (
            "Sem massas mediastinais evidentes no campo avaliado.\n"
            "Sem derrame pleural significativo.\n"
            "Estruturas torácicas avaliadas sem alterações focais relevantes."
        ),
        ("ct", "abdomen"): (
            "Fígado, baço, pâncreas e adrenais sem alterações focais agudas evidentes.\n"
            "Rins sem dilatação pielocalicial significativa.\n"
            "Sem líquido livre abdominal em volume relevante."
        ),
        ("mri", "abdomen"): (
            "Fígado de sinal homogêneo, sem lesões focais suspeitas no exame atual.\n"
            "Pâncreas, baço, adrenais e rins sem alterações relevantes.\n"
            "Sem ascite ou coleções abdominais."
        ),
        ("ct", "abdome_pelve"): (
            "Órgãos abdominais e pélvicos sem alterações agudas relevantes.\n"
            "Sem coleções intra-abdominais e sem líquido livre em volume significativo.\n"
            "Sem linfonodomegalias volumosas no território avaliado."
        ),
        ("mri", "abdome_pelve"): (
            "Estruturas abdominais e pélvicas com morfologia preservada no estudo atual.\n"
            "Sem lesões focais suspeitas ou coleções.\n"
            "Sem líquido livre pélvico em volume relevante."
        ),
        ("ct", "coluna"): (
            "Alinhamento vertebral preservado, sem colapso vertebral agudo.\n"
            "Sem fraturas ou listeses agudas evidentes.\n"
            "Canal vertebral sem estreitamento crítico no segmento avaliado."
        ),
        ("mri", "coluna"): (
            "Alinhamento vertebral preservado no segmento examinado.\n"
            "Sem compressão medular e sem sinais de lesão expansiva intrarraquidiana.\n"
            "Discos intervertebrais sem hérnia extrusa significativa."
        ),
        ("ct", "pelve"): (
            "Bexiga com paredes de espessura preservada.\n"
            "Sem líquido livre pélvico significativo.\n"
            "Sem alterações agudas dos órgãos pélvicos no exame atual."
        ),
        ("mri", "pelve"): (
            "Órgãos pélvicos com morfologia preservada no campo avaliado.\n"
            "Sem coleções, sem massas pélvicas evidentes e sem líquido livre relevante.\n"
            "Estruturas musculoesqueléticas pélvicas sem edema significativo."
        ),
        ("ct", "osteo"): (
            "Estruturas ósseas do segmento avaliado sem fraturas agudas evidentes.\n"
            "Interlinhas articulares preservadas, sem desalinhamentos significativos.\n"
            "Partes moles sem coleções."
        ),
        ("mri", "osteo"): (
            "Sem sinais de edema ósseo difuso ou fratura oculta no segmento avaliado.\n"
            "Tendões e ligamentos principais sem descontinuidades evidentes.\n"
            "Sem derrame articular volumoso."
        ),
        ("ct", "vascular"): (
            "Vasos do território avaliado com calibres preservados e sem ectasias significativas.\n"
            "Sem sinais de coleções perivasculares.\n"
            "Sem achados agudos evidentes no estudo atual."
        ),
        ("mri", "vascular"): (
            "Fluxo preservado nos principais vasos do território examinado.\n"
            "Sem sinais de oclusão proximal evidente no estudo atual.\n"
            "Sem coleções perivasculares."
        ),
    }
    region_fallback = region_defaults.get((mode_guess, region_guess))
    if dictation_combined:
        return dictation_combined
    if region_fallback:
        return region_fallback

    return "Sem alterações significativas descritas no estudo atual."


def _fallback_impression_text(laudo_text, dictation):
    if isinstance(dictation, dict) and dictation.get("impression"):
        dictated = _clean_inline_text(dictation.get("impression"))
        if dictated and not _is_json_like_text(dictated):
            return dictated

    clean_laudo = _clean_inline_text(laudo_text)
    if not clean_laudo:
        return "Sem alterações significativas."
    if _is_json_like_text(clean_laudo):
        return "Correlacionar com dados clínicos e com o conteúdo do laudo."

    normalized = clean_laudo.lower()
    negative_markers = [
        "sem alteração",
        "sem alteracao",
        "sem achados",
        "sem evidência",
        "sem evidencia",
        "normal",
        "sem sinais",
    ]
    if any(marker in normalized for marker in negative_markers):
        return "Sem alterações significativas no estudo."

    first_sentence = re.split(r"[.!?]\s+", clean_laudo, maxsplit=1)[0].strip()
    if first_sentence:
        return first_sentence.rstrip(".") + "."
    return "Correlacionar com dados clínicos."


def _ensure_required_sections(parsed_sections, raw_content, mode, region, contrast, dictation, request_prompt):
    base = {"technique": "", "findings": "", "impression": ""}
    if isinstance(parsed_sections, dict):
        base["technique"] = _clean_inline_text(parsed_sections.get("technique", ""))
        base["findings"] = _clean_inline_text(parsed_sections.get("findings", ""))
        base["impression"] = _clean_inline_text(parsed_sections.get("impression", ""))

    # Se alguma seção vier com JSON bruto, tenta reprocessar para extrair os campos corretos.
    for candidate_key in ("findings", "impression", "technique"):
        candidate_value = base.get(candidate_key, "")
        if candidate_value and _is_json_like_text(candidate_value):
            embedded = _extract_json_block(candidate_value)
            embedded_norm = _normalize_sections(embedded, candidate_value) if embedded else None
            if embedded_norm:
                if embedded_norm.get("technique"):
                    base["technique"] = _clean_inline_text(embedded_norm.get("technique"))
                if embedded_norm.get("findings"):
                    base["findings"] = _clean_inline_text(embedded_norm.get("findings"))
                if embedded_norm.get("impression"):
                    base["impression"] = _clean_inline_text(embedded_norm.get("impression"))

    if raw_content:
        parsed_from_raw = _extract_sections_from_text(raw_content) or {}
        base["technique"] = base["technique"] or _clean_inline_text(parsed_from_raw.get("technique", ""))
        base["findings"] = base["findings"] or _clean_inline_text(parsed_from_raw.get("findings", ""))
        base["impression"] = base["impression"] or _clean_inline_text(parsed_from_raw.get("impression", ""))

    if not base["technique"]:
        dictated_technique = _clean_inline_text((dictation or {}).get("technique", "")) if isinstance(dictation, dict) else ""
        base["technique"] = dictated_technique or _build_default_technique(mode, region, contrast)

    if _is_low_quality_findings(base["findings"]):
        base["findings"] = _fallback_laudo_text(dictation, request_prompt, mode=mode, region=region)

    if (not base["impression"]) or _is_json_like_text(base["impression"]):
        base["impression"] = _fallback_impression_text(base["findings"], dictation)

    return {
        "technique": base["technique"] or _build_default_technique(mode, region, contrast),
        "findings": base["findings"] or "Sem alterações significativas descritas no estudo.",
        "impression": base["impression"] or "Sem alterações significativas.",
    }


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


def _db_connect():
    db_dir = os.path.dirname(TEMPLATE_DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(TEMPLATE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_table_columns(conn, table_name, column_definitions):
    existing = _table_columns(conn, table_name)
    for column_name, sql_definition in column_definitions.items():
        if column_name.lower() in existing:
            continue
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {sql_definition}")


def _table_columns(conn, table_name):
    return {
        str(row["name"]).strip().lower()
        for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    }


def _default_base_url_for_provider(provider):
    clean_provider = _normalize_provider(provider)
    if clean_provider == "lmstudio":
        return "http://localhost:1234/v1"
    if clean_provider == "gemini":
        return "https://generativelanguage.googleapis.com/v1beta/openai"
    return "https://api.openai.com/v1"


def _normalize_username(value):
    return str(value or "").strip().lower()


def _normalize_user_role(value):
    clean_role = str(value or "").strip().lower()
    return clean_role if clean_role in USER_ROLES else ""


def _normalize_crm(value):
    return str(value or "").strip()


def _normalize_subspecialty(value):
    clean_value = str(value or "").strip()
    return clean_value or "Radiologista"


def _user_signature_role(user_like):
    if not user_like:
        return "Radiologista"
    if isinstance(user_like, sqlite3.Row):
        return _normalize_subspecialty(user_like["subspecialty"])
    return _normalize_subspecialty(user_like.get("subspecialty"))


def _user_row_to_json(row):
    return {
        "id": row["id"],
        "username": row["username"],
        "role": row["role"],
        "fullName": row["full_name"],
        "crm": row["crm"],
        "subspecialty": _normalize_subspecialty(row["subspecialty"]),
        "signatureRole": _user_signature_role(row),
        "isActive": bool(row["is_active"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _get_setting_with_connection(conn, key, default=""):
    row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (str(key or "").strip(),)).fetchone()
    if not row:
        return default
    return str(row["value"] or "").strip() or default


def _set_setting_with_connection(conn, key, value):
    now = _now_iso_utc()
    conn.execute(
        """
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        """,
        (str(key or "").strip(), str(value or "").strip(), now),
    )


def _get_default_ai_settings_with_connection(conn):
    provider = _normalize_provider(_get_setting_with_connection(conn, "default_ai_provider", "lmstudio")) or "lmstudio"
    model = _get_setting_with_connection(conn, "default_ai_model", "")
    base_url = _get_setting_with_connection(conn, "default_ai_base_url", _default_base_url_for_provider(provider))
    if not base_url:
        base_url = _default_base_url_for_provider(provider)
    return {
        "provider": provider,
        "model": model,
        "baseUrl": base_url,
        "keyConfigured": bool(_get_global_api_key(provider)) if provider in API_KEY_PROVIDERS else True,
    }


def _get_default_ai_settings():
    with _db_connect() as conn:
        return _get_default_ai_settings_with_connection(conn)


def _save_default_ai_settings(provider, model, base_url):
    clean_provider = _normalize_provider(provider)
    if clean_provider not in {"lmstudio", "openai", "gemini"}:
        raise ValueError("Provedor padrão inválido.")

    clean_model = str(model or "").strip()
    if not clean_model:
        raise ValueError("Modelo padrão é obrigatório.")

    clean_base_url = str(base_url or "").strip() or _default_base_url_for_provider(clean_provider)
    with _db_connect() as conn:
        _set_setting_with_connection(conn, "default_ai_provider", clean_provider)
        _set_setting_with_connection(conn, "default_ai_model", clean_model)
        _set_setting_with_connection(conn, "default_ai_base_url", clean_base_url)
        return _get_default_ai_settings_with_connection(conn)


def _get_user_by_id_with_connection(conn, user_id):
    clean_user_id = str(user_id or "").strip()
    if not clean_user_id:
        return None
    return conn.execute(
        "SELECT * FROM users WHERE id = ? AND is_active = 1",
        (clean_user_id,),
    ).fetchone()


def _get_user_by_username_with_connection(conn, username):
    clean_username = _normalize_username(username)
    if not clean_username:
        return None
    return conn.execute(
        "SELECT * FROM users WHERE username = ? AND is_active = 1",
        (clean_username,),
    ).fetchone()


def _get_current_user():
    user_id = str(session.get("user_id") or "").strip()
    if not user_id:
        return None
    with _db_connect() as conn:
        return _get_user_by_id_with_connection(conn, user_id)


def _is_admin_user(user_row):
    return bool(user_row and str(user_row["role"]).strip().lower() == "admin")


def _override_signature_fields_for_user(fields, user_row):
    clean_fields = dict(fields or {})
    if not user_row or str(user_row["role"]).strip().lower() != "radiologist":
        return clean_fields
    clean_fields["radiologistName"] = str(user_row["full_name"] or "").strip()
    clean_fields["radiologistCrm"] = str(user_row["crm"] or "").strip()
    clean_fields["radiologistRole"] = _user_signature_role(user_row)
    clean_fields["electronicSignature"] = True
    return clean_fields


def _current_user_payload(user_row):
    if not user_row:
        return None
    payload = _user_row_to_json(user_row)
    payload["displayName"] = payload["fullName"] or payload["username"]
    payload["isAdmin"] = payload["role"] == "admin"
    return payload


def _session_payload(user_row=None):
    user = user_row or _get_current_user()
    if not user:
        return {"authenticated": False}

    with _db_connect() as conn:
        ai_settings = _get_default_ai_settings_with_connection(conn)

    return {
        "authenticated": True,
        "user": _current_user_payload(user),
        "aiSettings": ai_settings,
    }


def _json_auth_required(role=None):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user = _get_current_user()
            if not user:
                return jsonify({"error": "Sessão expirada. Faça login novamente."}), 401
            if role and str(user["role"]).strip().lower() != role:
                return jsonify({"error": "Acesso restrito."}), 403
            return func(*args, current_user=user, **kwargs)

        return wrapper

    return decorator


def _page_auth_required(role=None):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user = _get_current_user()
            if not user:
                return redirect("/")
            if role and str(user["role"]).strip().lower() != role:
                return redirect("/")
            return func(*args, current_user=user, **kwargs)

        return wrapper

    return decorator


def _create_or_update_radiologist_user(conn, payload, existing_user=None):
    if not isinstance(payload, dict):
        raise ValueError("Payload inválido para usuário.")

    username = _normalize_username(payload.get("username"))
    full_name = str(payload.get("fullName", "")).strip()
    crm = _normalize_crm(payload.get("crm"))
    subspecialty = _normalize_subspecialty(payload.get("subspecialty"))
    password = str(payload.get("password", "") or "")

    if not username:
        raise ValueError("Login é obrigatório.")
    if not full_name:
        raise ValueError("Nome completo é obrigatório.")
    if not crm:
        raise ValueError("CRM é obrigatório.")
    if existing_user is None and not password.strip():
        raise ValueError("Senha é obrigatória para novo usuário.")

    conflict = conn.execute(
        "SELECT id FROM users WHERE username = ? AND is_active = 1",
        (username,),
    ).fetchone()
    if conflict and (existing_user is None or conflict["id"] != existing_user["id"]):
        raise ValueError("Já existe um usuário ativo com este login.")

    now = _now_iso_utc()
    password_hash = existing_user["password_hash"] if existing_user else ""
    if password.strip():
        password_hash = generate_password_hash(password.strip())

    user_id = existing_user["id"] if existing_user else str(uuid.uuid4())
    created_at = existing_user["created_at"] if existing_user else now
    conn.execute(
        """
        INSERT INTO users (
            id,
            username,
            password_hash,
            role,
            full_name,
            crm,
            subspecialty,
            is_active,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, 'radiologist', ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            password_hash = excluded.password_hash,
            full_name = excluded.full_name,
            crm = excluded.crm,
            subspecialty = excluded.subspecialty,
            is_active = 1,
            updated_at = excluded.updated_at
        """,
        (user_id, username, password_hash, full_name, crm, subspecialty, created_at, now),
    )
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone(), existing_user is None


def _bootstrap_admin_user():
    admin_username = _normalize_username(os.getenv("ADMIN_USERNAME", "admin"))
    admin_password = str(os.getenv("ADMIN_PASSWORD", "admin123") or "").strip() or "admin123"
    admin_full_name = str(os.getenv("ADMIN_FULL_NAME", "Administrador do Sistema") or "").strip()

    with _db_connect() as conn:
        existing_admin = conn.execute(
            "SELECT id FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 1"
        ).fetchone()
        if existing_admin:
            return

        now = _now_iso_utc()
        conn.execute(
            """
            INSERT INTO users (
                id,
                username,
                password_hash,
                role,
                full_name,
                crm,
                subspecialty,
                is_active,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, 'admin', ?, '', 'Administrador', 1, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                admin_username,
                generate_password_hash(admin_password),
                admin_full_name,
                now,
                now,
            ),
        )


def _user_password_matches(conn, user_row, password):
    if not user_row:
        return False

    provided_password = str(password or "")
    row_keys = {str(key).strip().lower() for key in user_row.keys()}
    password_hash = str(user_row["password_hash"] or "").strip() if "password_hash" in row_keys else ""
    if password_hash and check_password_hash(password_hash, provided_password):
        return True

    legacy_plain_password = str(user_row["password"] or "") if "password" in row_keys else ""
    if legacy_plain_password and legacy_plain_password == provided_password:
        if "password_hash" in row_keys:
            conn.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (generate_password_hash(provided_password), _now_iso_utc(), user_row["id"]),
            )
        return True
    return False


def _migrate_legacy_user_passwords(conn):
    user_columns = _table_columns(conn, "users")
    if "password" not in user_columns or "password_hash" not in user_columns:
        return

    rows = conn.execute(
        "SELECT id, password, password_hash FROM users"
    ).fetchall()
    for row in rows:
        legacy_password = str(row["password"] or "")
        password_hash = str(row["password_hash"] or "").strip()
        if legacy_password and not password_hash:
            conn.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (generate_password_hash(legacy_password), _now_iso_utc(), row["id"]),
            )


def _init_templates_db():
    with _db_connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY,
                mode TEXT NOT NULL,
                region TEXT NOT NULL,
                title TEXT NOT NULL,
                technique TEXT NOT NULL DEFAULT '',
                findings TEXT NOT NULL DEFAULT '',
                impression TEXT NOT NULL DEFAULT '',
                source_text TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(mode, region, title)
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_templates_mode_region ON templates (mode, region)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS api_keys (
                provider TEXT PRIMARY KEY,
                api_key TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                mode TEXT NOT NULL,
                region TEXT NOT NULL,
                contrast TEXT NOT NULL DEFAULT 'sem',
                status TEXT NOT NULL DEFAULT 'finalized',
                patient_name TEXT NOT NULL DEFAULT '',
                patient_id TEXT NOT NULL DEFAULT '',
                patient_age TEXT NOT NULL DEFAULT '',
                patient_sex TEXT NOT NULL DEFAULT '',
                study_date TEXT NOT NULL DEFAULT '',
                referrer TEXT NOT NULL DEFAULT '',
                indication TEXT NOT NULL DEFAULT '',
                extra_info TEXT NOT NULL DEFAULT '',
                technique TEXT NOT NULL DEFAULT '',
                findings TEXT NOT NULL DEFAULT '',
                impression TEXT NOT NULL DEFAULT '',
                final_text TEXT NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_updated_at ON reports (updated_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_patient_id ON reports (patient_id)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                full_name TEXT NOT NULL,
                crm TEXT NOT NULL DEFAULT '',
                subspecialty TEXT NOT NULL DEFAULT 'Radiologista',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        _ensure_table_columns(
            conn,
            "users",
            {
                "username": "username TEXT NOT NULL DEFAULT ''",
                "password_hash": "password_hash TEXT NOT NULL DEFAULT ''",
                "role": "role TEXT NOT NULL DEFAULT 'radiologist'",
                "full_name": "full_name TEXT NOT NULL DEFAULT ''",
                "crm": "crm TEXT NOT NULL DEFAULT ''",
                "subspecialty": "subspecialty TEXT NOT NULL DEFAULT 'Radiologista'",
                "is_active": "is_active INTEGER NOT NULL DEFAULT 1",
                "created_at": "created_at TEXT NOT NULL DEFAULT ''",
                "updated_at": "updated_at TEXT NOT NULL DEFAULT ''",
            },
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_users_role_active ON users (role, is_active)"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL
            )
            """
        )
        _ensure_table_columns(
            conn,
            "reports",
            {
                "created_by_user_id": "created_by_user_id TEXT NOT NULL DEFAULT ''",
                "updated_by_user_id": "updated_by_user_id TEXT NOT NULL DEFAULT ''",
            },
        )
        _migrate_legacy_user_passwords(conn)


def _clean_template_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("Payload inválido.")

    mode = str(payload.get("mode", "")).strip().lower()
    region = str(payload.get("region", "")).strip().lower()
    title = str(payload.get("title", "")).strip()
    template_id = str(payload.get("id", "")).strip()

    if mode not in ALLOWED_TEMPLATE_MODES:
        raise ValueError("Modalidade inválida. Use ct ou mri.")
    if not region:
        raise ValueError("Área anatômica é obrigatória.")
    if not title:
        raise ValueError("Título do template é obrigatório.")

    def _text(key):
        value = payload.get(key, "")
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, (list, tuple)):
            return "\n".join([str(item) for item in value if item is not None]).strip()
        return str(value).strip()

    cleaned = {
        "id": template_id,
        "mode": mode,
        "region": region,
        "title": title,
        "technique": _text("technique"),
        "findings": _text("findings"),
        "impression": _text("impression"),
        "source_text": _text("sourceText"),
    }
    if not (cleaned["technique"] or cleaned["findings"] or cleaned["impression"] or cleaned["source_text"]):
        raise ValueError("Template sem conteúdo.")
    return cleaned


def _template_row_to_json(row):
    return {
        "id": row["id"],
        "mode": row["mode"],
        "region": row["region"],
        "title": row["title"],
        "technique": row["technique"],
        "findings": row["findings"],
        "impression": row["impression"],
        "sourceText": row["source_text"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _now_iso_utc():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _ui_region_label(region):
    labels = {
        "cranio": "Crânio",
        "pescoco": "Pescoço",
        "torax": "Tórax",
        "abdomen": "Abdome",
        "abdome_pelve": "Abdome e pelve",
        "coluna": "Coluna",
        "pelve": "Pelve",
        "osteo": "Ósteoarticular",
        "vascular": "Vascular",
    }
    return labels.get(_normalize_region(region), str(region or "Segmento avaliado").replace("_", " ").title())


def _contrast_label(mode, contrast):
    mode_clean = _normalize_mode(mode) or "ct"
    contrast_clean = str(contrast or "sem").strip().lower()
    if contrast_clean not in REPORT_CONTRAST_OPTIONS:
        contrast_clean = "sem"
    if mode_clean == "ct":
        if contrast_clean == "com":
            return "Com contraste intravenoso"
        if contrast_clean == "misto":
            return "Sem e com contraste intravenoso"
        return "Sem contraste intravenoso"
    if contrast_clean == "com":
        return "Com gadolínio"
    if contrast_clean == "misto":
        return "Sem e com gadolínio"
    return "Sem gadolínio"


def _coerce_payload_text(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (list, tuple)):
        return "\n".join(str(item) for item in value if item is not None).strip()
    return str(value).strip()


def _coerce_payload_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    normalized = _coerce_payload_text(value).lower()
    return normalized in {"1", "true", "sim", "yes", "on"}


def _format_date_for_report(value):
    raw = _coerce_payload_text(value)
    if not raw:
        return ""
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", raw)
    if match:
        return f"{match.group(3)}/{match.group(2)}/{match.group(1)}"
    return raw


def _parse_iso_date(value):
    raw = _coerce_payload_text(value)
    if not raw:
        return None
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", raw)
    if not match:
        return None
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


def _format_age_for_report(years, months):
    if years < 0 or months < 0:
        return ""
    if years == 0:
        return f"{months}M"
    if months == 0:
        return f"{years}A"
    return f"{years}A {months}M"


def _calculate_age_text(birth_date_value, study_date_value=""):
    birth_date = _parse_iso_date(birth_date_value)
    if not birth_date:
        return ""

    reference_date = _parse_iso_date(study_date_value) or date.today()
    if reference_date < birth_date:
        return ""

    years = reference_date.year - birth_date.year
    months = reference_date.month - birth_date.month
    if reference_date.day < birth_date.day:
        months -= 1
    if months < 0:
        years -= 1
        months += 12
    if years < 0:
        return ""
    return _format_age_for_report(years, months)


def _default_exam_title(mode, region):
    mode_clean = _normalize_mode(mode) or "ct"
    region_clean = _normalize_region(region) or "cranio"
    titles = {
        "ct": {
            "cranio": "TOMOGRAFIA COMPUTADORIZADA DO CRÂNIO",
            "pescoco": "TOMOGRAFIA COMPUTADORIZADA DO PESCOÇO",
            "torax": "TOMOGRAFIA COMPUTADORIZADA DO TÓRAX",
            "abdomen": "TOMOGRAFIA COMPUTADORIZADA DO ABDOME",
            "abdome_pelve": "TOMOGRAFIA COMPUTADORIZADA DE ABDOME E PELVE",
            "coluna": "TOMOGRAFIA COMPUTADORIZADA DA COLUNA",
            "pelve": "TOMOGRAFIA COMPUTADORIZADA DA PELVE",
            "osteo": "TOMOGRAFIA COMPUTADORIZADA DO SEGMENTO ÓSTEO-ARTICULAR",
            "vascular": "TOMOGRAFIA COMPUTADORIZADA VASCULAR",
        },
        "mri": {
            "cranio": "RESSONÂNCIA MAGNÉTICA DO CRÂNIO",
            "pescoco": "RESSONÂNCIA MAGNÉTICA DO PESCOÇO",
            "torax": "RESSONÂNCIA MAGNÉTICA DO TÓRAX",
            "abdomen": "RESSONÂNCIA MAGNÉTICA DO ABDOME",
            "abdome_pelve": "RESSONÂNCIA MAGNÉTICA DE ABDOME E PELVE",
            "coluna": "RESSONÂNCIA MAGNÉTICA DA COLUNA",
            "pelve": "RESSONÂNCIA MAGNÉTICA DA PELVE",
            "osteo": "RESSONÂNCIA MAGNÉTICA DO SEGMENTO ÓSTEO-ARTICULAR",
            "vascular": "RESSONÂNCIA MAGNÉTICA VASCULAR",
        },
    }
    return titles.get(mode_clean, {}).get(region_clean) or (
        ("TOMOGRAFIA COMPUTADORIZADA " if mode_clean == "ct" else "RESSONÂNCIA MAGNÉTICA ")
        + _ui_region_label(region_clean).upper()
    )


def _compose_report_text(mode, region, contrast, fields):
    lines = []
    exam_title = _coerce_payload_text(fields.get("examTitle")) or _default_exam_title(mode, region)
    patient_name = _coerce_payload_text(fields.get("patientName"))
    patient_id = _coerce_payload_text(fields.get("patientId"))
    patient_age = _calculate_age_text(fields.get("patientBirthDate"), fields.get("studyDate")) or _coerce_payload_text(fields.get("patientAge"))
    study_date = _format_date_for_report(fields.get("studyDate"))
    birth_date = _format_date_for_report(fields.get("patientBirthDate"))
    referrer = _coerce_payload_text(fields.get("referrer"))
    radiologist_name = _coerce_payload_text(fields.get("radiologistName"))
    radiologist_crm = _coerce_payload_text(fields.get("radiologistCrm"))
    radiologist_role = _coerce_payload_text(fields.get("radiologistRole"))
    electronic_signature = _coerce_payload_bool(fields.get("electronicSignature"))
    indication = _coerce_payload_text(fields.get("indication"))
    extra_info = _coerce_payload_text(fields.get("extraInfo"))
    technique = _coerce_payload_text(fields.get("technique"))
    findings = _coerce_payload_text(fields.get("findings"))
    impression = _coerce_payload_text(fields.get("impression"))

    lines.append(exam_title)
    lines.append("")
    if patient_name:
        lines.append(f"Paciente: {patient_name}")
    if study_date:
        lines.append(f"Data do Exame: {study_date}")
    if referrer:
        lines.append(f"Médico solicitante: {referrer}")
    if patient_id:
        lines.append(f"Same: {patient_id}")
    if patient_age:
        lines.append(f"Idade: {patient_age}")
    if birth_date:
        lines.append(f"Data de Nascimento: {birth_date}")
    lines.append("")
    if indication:
        lines.extend(["INDICAÇÃO CLÍNICA:", indication, ""])
    if extra_info:
        lines.extend(["INFORMAÇÕES ADICIONAIS:", extra_info, ""])
    if technique:
        lines.extend(["Técnica:", technique, ""])
    if findings:
        lines.extend(["Análise:", findings, ""])
    if impression:
        lines.extend(["Impressão diagnóstica:", impression, ""])
    if radiologist_name or radiologist_crm:
        lines.append("Assinatura eletrônica:" if electronic_signature else "Radiologista responsável:")
        if radiologist_name:
            lines.append(f"Dr(a).: {radiologist_name}")
        if radiologist_role:
            lines.append(radiologist_role)
        if radiologist_crm:
            lines.append(f"CRM {radiologist_crm}")
    return "\n".join(lines).strip()


def _clean_report_payload(payload, current_user=None):
    if not isinstance(payload, dict):
        raise ValueError("Payload inválido para laudo.")

    fields = payload.get("fields") or {}
    if not isinstance(fields, dict):
        fields = {}

    mode = _normalize_mode(payload.get("mode")) or "ct"
    region = _normalize_region(payload.get("region")) or "cranio"
    contrast = str(payload.get("contrast", "sem")).strip().lower()
    if contrast not in REPORT_CONTRAST_OPTIONS:
        contrast = "sem"

    report_id = str(payload.get("id", "") or "").strip()
    status = str(payload.get("status", "finalized") or "finalized").strip().lower() or "finalized"

    clean_fields = {
        "examTitle": _coerce_payload_text(fields.get("examTitle")),
        "patientName": _coerce_payload_text(fields.get("patientName")),
        "patientId": _coerce_payload_text(fields.get("patientId")),
        "patientAge": _coerce_payload_text(fields.get("patientAge")),
        "patientSex": _coerce_payload_text(fields.get("patientSex")),
        "studyDate": _coerce_payload_text(fields.get("studyDate")),
        "patientBirthDate": _coerce_payload_text(fields.get("patientBirthDate")),
        "referrer": _coerce_payload_text(fields.get("referrer")),
        "radiologistName": _coerce_payload_text(fields.get("radiologistName")),
        "radiologistCrm": _coerce_payload_text(fields.get("radiologistCrm")),
        "radiologistRole": _coerce_payload_text(fields.get("radiologistRole")),
        "electronicSignature": _coerce_payload_bool(fields.get("electronicSignature")),
        "indication": _coerce_payload_text(fields.get("indication")),
        "extraInfo": _coerce_payload_text(fields.get("extraInfo")),
        "aiRequest": _coerce_payload_text(fields.get("aiRequest")),
        "technique": _coerce_payload_text(fields.get("technique")),
        "findings": _coerce_payload_text(fields.get("findings")),
        "impression": _coerce_payload_text(fields.get("impression")),
    }
    clean_fields = _override_signature_fields_for_user(clean_fields, current_user)
    derived_age = _calculate_age_text(clean_fields["patientBirthDate"], clean_fields["studyDate"])
    clean_fields["patientAge"] = derived_age or clean_fields["patientAge"]
    final_text = _coerce_payload_text(payload.get("finalText"))
    if not final_text:
        final_text = _compose_report_text(mode, region, contrast, clean_fields)
    if not final_text:
        raise ValueError("O laudo final está vazio.")

    return {
        "id": report_id,
        "mode": mode,
        "region": region,
        "contrast": contrast,
        "status": status,
        "fields": clean_fields,
        "final_text": final_text,
        "payload_json": json.dumps(
            {
                "mode": mode,
                "region": region,
                "contrast": contrast,
                "status": status,
                "fields": clean_fields,
                "finalText": final_text,
            },
            ensure_ascii=False,
        ),
    }


def _report_row_to_json(row):
    try:
        payload = json.loads(row["payload_json"] or "{}")
    except json.JSONDecodeError:
        payload = {}
    fields = payload.get("fields") if isinstance(payload, dict) else {}
    if not isinstance(fields, dict):
        fields = {}
    fields = {
        "examTitle": _coerce_payload_text(fields.get("examTitle")),
        "patientName": _coerce_payload_text(fields.get("patientName") or row["patient_name"]),
        "patientId": _coerce_payload_text(fields.get("patientId") or row["patient_id"]),
        "patientAge": _coerce_payload_text(fields.get("patientAge") or row["patient_age"]),
        "patientSex": _coerce_payload_text(fields.get("patientSex") or row["patient_sex"]),
        "studyDate": _coerce_payload_text(fields.get("studyDate") or row["study_date"]),
        "patientBirthDate": _coerce_payload_text(fields.get("patientBirthDate")),
        "referrer": _coerce_payload_text(fields.get("referrer") or row["referrer"]),
        "radiologistName": _coerce_payload_text(fields.get("radiologistName")),
        "radiologistCrm": _coerce_payload_text(fields.get("radiologistCrm")),
        "radiologistRole": _coerce_payload_text(fields.get("radiologistRole")),
        "electronicSignature": _coerce_payload_bool(fields.get("electronicSignature")),
        "indication": _coerce_payload_text(fields.get("indication") or row["indication"]),
        "extraInfo": _coerce_payload_text(fields.get("extraInfo") or row["extra_info"]),
        "aiRequest": _coerce_payload_text(fields.get("aiRequest")),
        "technique": _coerce_payload_text(fields.get("technique") or row["technique"]),
        "findings": _coerce_payload_text(fields.get("findings") or row["findings"]),
        "impression": _coerce_payload_text(fields.get("impression") or row["impression"]),
    }
    derived_age = _calculate_age_text(fields.get("patientBirthDate"), fields.get("studyDate"))
    fields["patientAge"] = derived_age or fields["patientAge"]
    return {
        "id": row["id"],
        "mode": row["mode"],
        "region": row["region"],
        "regionLabel": _ui_region_label(row["region"]),
        "contrast": row["contrast"],
        "contrastLabel": _contrast_label(row["mode"], row["contrast"]),
        "status": row["status"],
        "fields": fields,
        "finalText": row["final_text"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def _upsert_report_with_connection(conn, payload, current_user=None):
    item = _clean_report_payload(payload, current_user=current_user)
    now = _now_iso_utc()
    report_id = item["id"] or str(uuid.uuid4())
    existing = conn.execute("SELECT id, created_at FROM reports WHERE id = ?", (report_id,)).fetchone()
    created_at = existing["created_at"] if existing else now
    current_user_id = str(current_user["id"]).strip() if current_user else ""
    existing_author = conn.execute(
        "SELECT created_by_user_id FROM reports WHERE id = ?",
        (report_id,),
    ).fetchone()
    created_by_user_id = (
        str(existing_author["created_by_user_id"] or "").strip()
        if existing_author and str(existing_author["created_by_user_id"] or "").strip()
        else current_user_id
    )

    conn.execute(
        """
        INSERT INTO reports (
            id,
            mode,
            region,
            contrast,
            status,
            patient_name,
            patient_id,
            patient_age,
            patient_sex,
            study_date,
            referrer,
            indication,
            extra_info,
            technique,
            findings,
            impression,
            final_text,
            payload_json,
            created_by_user_id,
            updated_by_user_id,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            mode = excluded.mode,
            region = excluded.region,
            contrast = excluded.contrast,
            status = excluded.status,
            patient_name = excluded.patient_name,
            patient_id = excluded.patient_id,
            patient_age = excluded.patient_age,
            patient_sex = excluded.patient_sex,
            study_date = excluded.study_date,
            referrer = excluded.referrer,
            indication = excluded.indication,
            extra_info = excluded.extra_info,
            technique = excluded.technique,
            findings = excluded.findings,
            impression = excluded.impression,
            final_text = excluded.final_text,
            payload_json = excluded.payload_json,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_at = excluded.updated_at
        """,
        (
            report_id,
            item["mode"],
            item["region"],
            item["contrast"],
            item["status"],
            item["fields"]["patientName"],
            item["fields"]["patientId"],
            item["fields"]["patientAge"],
            item["fields"]["patientSex"],
            item["fields"]["studyDate"],
            item["fields"]["referrer"],
            item["fields"]["indication"],
            item["fields"]["extraInfo"],
            item["fields"]["technique"],
            item["fields"]["findings"],
            item["fields"]["impression"],
            item["final_text"],
            item["payload_json"],
            created_by_user_id,
            current_user_id,
            created_at,
            now,
        ),
    )
    row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    return _report_row_to_json(row), existing is None


def _slugify_filename(value):
    slug = _strip_accents(value).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return slug or "laudo-radiologia"


def _report_filename(payload):
    if not isinstance(payload, dict):
        return "laudo-radiologia.pdf"
    fields = payload.get("fields") if isinstance(payload.get("fields"), dict) else {}
    patient_name = _coerce_payload_text(fields.get("patientName"))
    exam_title = _coerce_payload_text(fields.get("examTitle"))
    study_date = _coerce_payload_text(fields.get("studyDate"))
    base_name = patient_name or exam_title or f"{_normalize_mode(payload.get('mode')) or 'ct'}-{_normalize_region(payload.get('region')) or 'cranio'}"
    if study_date:
        return f"{_slugify_filename(base_name)}-{_slugify_filename(study_date)}.pdf"
    return f"{_slugify_filename(base_name)}.pdf"


def _build_report_pdf_bytes(payload):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfgen import canvas as pdf_canvas
    from reportlab.platypus import BaseDocTemplate, Frame, KeepTogether, PageTemplate, Paragraph, Spacer, Table, TableStyle

    item = _clean_report_payload(payload)
    fields = item["fields"]
    buffer = io.BytesIO()
    page_width, page_height = A4
    left_margin = 18 * mm
    right_margin = 18 * mm
    footer_reserved = 58 * mm
    first_header_reserved = 98 * mm
    later_header_reserved = 20 * mm
    footer_image_y = 8 * mm
    footer_image_height = 28 * mm
    footer_image_width = page_width - left_margin - right_margin
    footer_image_x = left_margin

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=13.5,
        leading=16,
        alignment=TA_CENTER,
        spaceAfter=10,
    )
    section_style = ParagraphStyle(
        "SectionStyle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=14,
        alignment=TA_JUSTIFY,
        spaceAfter=8,
    )
    signature_style = ParagraphStyle(
        "SignatureStyle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=12,
        alignment=TA_RIGHT,
    )
    signature_label_style = ParagraphStyle(
        "SignatureLabelStyle",
        parent=signature_style,
        fontName="Helvetica-Bold",
        spaceAfter=3,
    )

    exam_title = _coerce_payload_text(fields.get("examTitle")) or _default_exam_title(item["mode"], item["region"])
    study_date = _format_date_for_report(fields.get("studyDate"))
    birth_date = _format_date_for_report(fields.get("patientBirthDate"))
    patient_age = _calculate_age_text(fields.get("patientBirthDate"), fields.get("studyDate")) or _coerce_payload_text(fields.get("patientAge"))
    disclaimer_text = (
        "Informamos que o exame, composto por laudo e imagens, deve ser apresentado ao médico solicitante "
        "para a avaliação e conduta. A Casa de Saúde São José não realiza contato com pacientes para "
        "agendamento de consultas baseado no laudo do exame realizado."
    )
    electronic_signature = _coerce_payload_bool(fields.get("electronicSignature"))
    signature_lines = []
    radiologist_name = _coerce_payload_text(fields.get("radiologistName"))
    raw_radiologist_role = _coerce_payload_text(fields.get("radiologistRole"))
    radiologist_crm = _coerce_payload_text(fields.get("radiologistCrm"))
    has_signature_identity = bool(radiologist_name or radiologist_crm or raw_radiologist_role)
    radiologist_role = raw_radiologist_role or ("Radiologista" if has_signature_identity else "")
    if radiologist_name:
        signature_lines.append(f"Dr(a).: {radiologist_name}")
    if radiologist_role:
        signature_lines.append(radiologist_role)
    if radiologist_crm:
        signature_lines.append(f"CRM {radiologist_crm}")
    if electronic_signature and has_signature_identity:
        signature_lines.append(datetime.now().strftime("%d/%m/%Y %H:%M:%S"))

    logo_reader = ImageReader(REPORT_LOGO_PATH) if os.path.exists(REPORT_LOGO_PATH) else None
    footer_reader = ImageReader(REPORT_FOOTER_BAND_PATH) if os.path.exists(REPORT_FOOTER_BAND_PATH) else None

    def _draw_page_header(canvas_obj, first_page=False):
        canvas_obj.saveState()
        if logo_reader:
            logo_width = 55 * mm if first_page else 38 * mm
            logo_height = 17 * mm if first_page else 12 * mm
            logo_y = page_height - (26 * mm if first_page else 16 * mm)
            canvas_obj.drawImage(
                logo_reader,
                left_margin,
                logo_y,
                width=logo_width,
                height=logo_height,
                preserveAspectRatio=True,
                mask="auto",
            )

        if first_page:
            label_font = "Helvetica-Bold"
            value_font = "Helvetica"
            text_size = 8.4
            line_height = 4.7 * mm
            column_gap = 10 * mm
            header_top = page_height - 37 * mm
            content_width = page_width - left_margin - right_margin
            column_width = (content_width - column_gap) / 2
            left_column_x = left_margin
            right_column_x = left_margin + column_width + column_gap

            def _draw_header_field(column_x, top_y, label, value):
                clean_value = _coerce_payload_text(value)
                if not clean_value:
                    return 0

                label_width = pdfmetrics.stringWidth(label, label_font, text_size)
                value_x = column_x + label_width + (2.2 * mm)
                value_width = max(18 * mm, column_width - (value_x - column_x))
                wrapped_lines = simpleSplit(clean_value, value_font, text_size, value_width) or [clean_value]

                canvas_obj.setFont(label_font, text_size)
                canvas_obj.drawString(column_x, top_y, label)
                canvas_obj.setFont(value_font, text_size)
                canvas_obj.drawString(value_x, top_y, wrapped_lines[0])

                for index, line in enumerate(wrapped_lines[1:], start=1):
                    canvas_obj.drawString(value_x, top_y - (index * line_height), line)

                return line_height * max(1, len(wrapped_lines))

            header_rows = [
                (
                    ("Paciente:", _coerce_payload_text(fields.get("patientName"))),
                    ("Same:", _coerce_payload_text(fields.get("patientId"))),
                ),
                (
                    ("Data do Exame:", study_date),
                    ("Idade:", patient_age),
                ),
                (
                    ("Médico solicitante:", _coerce_payload_text(fields.get("referrer"))),
                    ("Data de Nascimento:", birth_date),
                ),
            ]

            current_y = header_top
            for left_field, right_field in header_rows:
                left_height = _draw_header_field(left_column_x, current_y, left_field[0], left_field[1])
                right_height = _draw_header_field(right_column_x, current_y, right_field[0], right_field[1])
                consumed_height = max(left_height, right_height, line_height)
                current_y -= consumed_height + (1.5 * mm)

        canvas_obj.restoreState()

    def _draw_page_footer(canvas_obj):
        canvas_obj.saveState()
        disclaimer_y = footer_image_y + footer_image_height + 18 * mm
        canvas_obj.setFont("Helvetica-BoldOblique", 8.2)
        disclaimer_lines = simpleSplit(disclaimer_text, "Helvetica-BoldOblique", 8.2, page_width - left_margin - right_margin)
        for index, line in enumerate(disclaimer_lines):
            canvas_obj.drawString(left_margin, disclaimer_y - (index * 4.4 * mm), line)

        if footer_reader:
            canvas_obj.drawImage(
                footer_reader,
                footer_image_x,
                footer_image_y,
                width=footer_image_width,
                height=footer_image_height,
                preserveAspectRatio=False,
                mask="auto",
            )
        canvas_obj.restoreState()

    def _draw_page(canvas_obj, _doc, first_page=False):
        _draw_page_header(canvas_obj, first_page=first_page)
        _draw_page_footer(canvas_obj)

    class NumberedCanvas(pdf_canvas.Canvas):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved_page_states = []

        def showPage(self):
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            self._saved_page_states.append(dict(self.__dict__))
            total_pages = len(self._saved_page_states)
            for page_number, state in enumerate(self._saved_page_states, start=1):
                self.__dict__.update(state)
                self._draw_page_number_overlay(page_number, total_pages)
                pdf_canvas.Canvas.showPage(self)
            pdf_canvas.Canvas.save(self)

        def _draw_page_number_overlay(self, page_number, total_pages):
            self.saveState()
            overlay_x = page_width - right_margin - 12 * mm
            overlay_y = footer_image_y + 19 * mm
            self.setFillColor(colors.white)
            self.rect(overlay_x, overlay_y, 14 * mm, 6 * mm, fill=1, stroke=0)
            self.setFillColor(colors.black)
            self.setFont("Helvetica", 8.5)
            self.drawRightString(overlay_x + 13 * mm, overlay_y + 1.6 * mm, f"{page_number}/{total_pages}")
            if electronic_signature and signature_lines and page_number == total_pages:
                self.setFont("Helvetica-Bold", 9.2)
                self.drawCentredString(page_width / 2, footer_image_y + footer_image_height + 26 * mm, "Este laudo foi assinado eletronicamente.")
            self.restoreState()

    document = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=left_margin,
        rightMargin=right_margin,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title=exam_title,
    )

    first_frame = Frame(
        left_margin,
        footer_reserved,
        page_width - left_margin - right_margin,
        page_height - footer_reserved - first_header_reserved,
        id="first-frame",
    )
    later_frame = Frame(
        left_margin,
        footer_reserved,
        page_width - left_margin - right_margin,
        page_height - footer_reserved - later_header_reserved,
        id="later-frame",
    )
    document.addPageTemplates(
        [
            PageTemplate(
                id="First",
                frames=[first_frame],
                onPage=lambda c, d: _draw_page(c, d, first_page=True),
                autoNextPageTemplate="Later",
            ),
            PageTemplate(id="Later", frames=[later_frame], onPage=lambda c, d: _draw_page(c, d, first_page=False)),
        ]
    )

    def _section_html(label, text):
        content = _coerce_payload_text(text)
        if not content:
            return ""
        return f"<b>{escape(label)}</b><br/>{escape(content).replace(chr(10), '<br/>')}"

    story = []
    story.append(Paragraph(escape(exam_title), title_style))
    if _coerce_payload_text(fields.get("indication")):
        story.append(Paragraph(_section_html("Indicação clínica:", fields.get("indication")), section_style))
    if _coerce_payload_text(fields.get("extraInfo")):
        story.append(Paragraph(_section_html("Informações adicionais:", fields.get("extraInfo")), section_style))
    if _coerce_payload_text(fields.get("technique")):
        story.append(Paragraph(_section_html("Técnica:", fields.get("technique")), section_style))
    if _coerce_payload_text(fields.get("findings")):
        story.append(Paragraph(_section_html("Análise:", fields.get("findings")), section_style))
    if _coerce_payload_text(fields.get("impression")):
        story.append(Paragraph(_section_html("Impressão diagnóstica:", fields.get("impression")), section_style))
    if not any(
        _coerce_payload_text(fields.get(key))
        for key in ("indication", "extraInfo", "technique", "findings", "impression")
    ):
        story.append(Paragraph(escape(item["final_text"]).replace("\n", "<br/>"), section_style))

    if signature_lines:
        signature_flowables = [Spacer(1, 8 * mm), Paragraph("Assinatura", signature_label_style)]
        signature_text = "<br/>".join(escape(line) for line in signature_lines)
        signature_table = Table([[Paragraph(signature_text, signature_style)]], colWidths=[72 * mm], hAlign="RIGHT")
        signature_table.setStyle(
            TableStyle(
                [
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        signature_flowables.append(signature_table)
        story.append(KeepTogether(signature_flowables))

    document.build(story, canvasmaker=NumberedCanvas)
    buffer.seek(0)
    return buffer


def _normalize_provider(provider):
    return str(provider or "").strip().lower()


def _save_global_api_key(provider, api_key):
    clean_provider = _normalize_provider(provider)
    clean_key = str(api_key or "").strip()
    if clean_provider not in API_KEY_PROVIDERS:
        raise ValueError("Provedor inválido para chave global.")
    if not clean_key:
        raise ValueError("API key vazia.")

    now = _now_iso_utc()
    with _db_connect() as conn:
        conn.execute(
            """
            INSERT INTO api_keys (provider, api_key, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(provider) DO UPDATE SET
                api_key = excluded.api_key,
                updated_at = excluded.updated_at
            """,
            (clean_provider, clean_key, now),
        )


def _get_global_api_key(provider):
    clean_provider = _normalize_provider(provider)
    if clean_provider not in API_KEY_PROVIDERS:
        return ""
    with _db_connect() as conn:
        row = conn.execute(
            "SELECT api_key FROM api_keys WHERE provider = ?",
            (clean_provider,),
        ).fetchone()
    if not row:
        return ""
    return str(row["api_key"] or "").strip()


def _resolve_api_key(provider, request_api_key):
    provided = str(request_api_key or "").strip()
    if provided:
        return provided
    return _get_global_api_key(provider)


def _global_api_key_status():
    with _db_connect() as conn:
        rows = conn.execute("SELECT provider FROM api_keys").fetchall()
    providers = {str(row["provider"]).strip().lower() for row in rows}
    return {
        "openaiConfigured": "openai" in providers,
        "geminiConfigured": "gemini" in providers,
    }


def _default_models_for_provider(provider):
    if provider == "openai":
        return ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1", "gpt-4o"]
    if provider == "gemini":
        return ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"]
    return []


def _extract_provider_error(payload):
    if not isinstance(payload, dict):
        return {}
    err = payload.get("error")
    return err if isinstance(err, dict) else {}


def _requires_responses_api(error_payload):
    err = _extract_provider_error(error_payload)
    message = str(err.get("message", "") or "").lower()
    code = str(err.get("code", "") or "").lower()
    return (
        ("v1/responses" in message and "chat/completions" in message)
        or code == "unsupported_model"
        or "only supported in v1/responses" in message
    )


def _extract_content_from_responses_api(payload):
    if not isinstance(payload, dict):
        return ""

    output_text = payload.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    output = payload.get("output")
    collected = []
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if not isinstance(part, dict):
                    continue
                part_type = str(part.get("type", "") or "").strip().lower()
                if part_type not in ("output_text", "text"):
                    continue
                text_value = part.get("text")
                if isinstance(text_value, str) and text_value.strip():
                    collected.append(text_value.strip())
                    continue
                if isinstance(text_value, dict):
                    nested = text_value.get("value")
                    if isinstance(nested, str) and nested.strip():
                        collected.append(nested.strip())

    if collected:
        return "\n".join(collected).strip()
    return ""


def _upsert_template_with_connection(conn, payload):
    item = _clean_template_payload(payload)
    now = _now_iso_utc()

    existing = None
    if item["id"]:
        existing = conn.execute("SELECT * FROM templates WHERE id = ?", (item["id"],)).fetchone()
    if not existing:
        existing = conn.execute(
            "SELECT * FROM templates WHERE mode = ? AND region = ? AND title = ?",
            (item["mode"], item["region"], item["title"]),
        ).fetchone()

    created = existing is None
    template_id = existing["id"] if existing else (item["id"] or str(uuid.uuid4()))
    created_at = existing["created_at"] if existing else now

    conn.execute(
        """
        INSERT INTO templates (
            id, mode, region, title, technique, findings, impression, source_text, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            mode = excluded.mode,
            region = excluded.region,
            title = excluded.title,
            technique = excluded.technique,
            findings = excluded.findings,
            impression = excluded.impression,
            source_text = excluded.source_text,
            updated_at = excluded.updated_at
        """,
        (
            template_id,
            item["mode"],
            item["region"],
            item["title"],
            item["technique"],
            item["findings"],
            item["impression"],
            item["source_text"],
            created_at,
            now,
        ),
    )

    row = conn.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
    return _template_row_to_json(row), created


_init_templates_db()
_bootstrap_admin_user()


@app.route("/session", methods=["GET"])
def session_info():
    return jsonify(_session_payload())


@app.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = _normalize_username(data.get("username"))
    password = str(data.get("password", "") or "")
    if not username or not password:
        return jsonify({"error": "Informe login e senha."}), 400

    with _db_connect() as conn:
        user = _get_user_by_username_with_connection(conn, username)
        password_ok = _user_password_matches(conn, user, password)

    if not user or not password_ok:
        return jsonify({"error": "Login ou senha inválidos."}), 401

    session.clear()
    session["user_id"] = user["id"]
    return jsonify(_session_payload(user))


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/admin/users/manage", methods=["GET"])
@_page_auth_required("admin")
def manage_users_page(current_user):
    return render_template("admin_users.html", session_data=_session_payload(current_user))


@app.route("/admin/users", methods=["GET"])
@_json_auth_required("admin")
def list_admin_users(current_user):
    try:
        with _db_connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM users
                WHERE role = 'radiologist' AND is_active = 1
                ORDER BY full_name COLLATE NOCASE ASC
                """
            ).fetchall()
        return jsonify({"users": [_user_row_to_json(row) for row in rows]})
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao listar usuários: {exc}"}), 500


@app.route("/admin/users", methods=["POST"])
@_json_auth_required("admin")
def create_admin_user(current_user):
    data = request.get_json(silent=True) or {}
    try:
        with _db_connect() as conn:
            user, created = _create_or_update_radiologist_user(conn, data)
        return jsonify({"user": _user_row_to_json(user), "created": created})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao salvar usuário: {exc}"}), 500


@app.route("/admin/users/<user_id>", methods=["PUT"])
@_json_auth_required("admin")
def update_admin_user(user_id, current_user):
    data = request.get_json(silent=True) or {}
    try:
        with _db_connect() as conn:
            existing_user = _get_user_by_id_with_connection(conn, user_id)
            if not existing_user or str(existing_user["role"]).strip().lower() != "radiologist":
                return jsonify({"error": "Usuário não encontrado."}), 404
            user, _created = _create_or_update_radiologist_user(conn, data, existing_user=existing_user)
        return jsonify({"user": _user_row_to_json(user), "created": False})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao atualizar usuário: {exc}"}), 500


@app.route("/admin/users/<user_id>", methods=["DELETE"])
@_json_auth_required("admin")
def delete_admin_user(user_id, current_user):
    try:
        with _db_connect() as conn:
            existing_user = _get_user_by_id_with_connection(conn, user_id)
            if not existing_user or str(existing_user["role"]).strip().lower() != "radiologist":
                return jsonify({"error": "Usuário não encontrado."}), 404
            conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        return jsonify({"ok": True})
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao remover usuário: {exc}"}), 500


@app.route("/admin/ai-settings", methods=["GET"])
@_json_auth_required("admin")
def get_admin_ai_settings(current_user):
    try:
        with _db_connect() as conn:
            settings = _get_default_ai_settings_with_connection(conn)
        return jsonify({"settings": settings, "status": _global_api_key_status()})
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao carregar configurações de IA: {exc}"}), 500


@app.route("/admin/ai-settings", methods=["POST"])
@_json_auth_required("admin")
def save_admin_ai_settings(current_user):
    data = request.get_json(silent=True) or {}
    try:
        settings = _save_default_ai_settings(
            provider=data.get("provider"),
            model=data.get("model"),
            base_url=data.get("baseUrl"),
        )
        return jsonify({"ok": True, "settings": settings, "status": _global_api_key_status()})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao salvar configurações de IA: {exc}"}), 500


@app.route("/extract-template-text", methods=["POST"])
@_json_auth_required()
def extract_template_text(current_user):
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


@app.route("/templates", methods=["GET"])
@_json_auth_required()
def list_templates(current_user):
    try:
        with _db_connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM templates
                ORDER BY
                    CASE mode WHEN 'ct' THEN 0 WHEN 'mri' THEN 1 ELSE 9 END,
                    region COLLATE NOCASE ASC,
                    title COLLATE NOCASE ASC
                """
            ).fetchall()
        return jsonify({"templates": [_template_row_to_json(row) for row in rows]})
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao listar templates: {exc}"}), 500


@app.route("/templates", methods=["POST"])
@_json_auth_required()
def save_template(current_user):
    data = request.get_json(silent=True) or {}
    try:
        with _db_connect() as conn:
            template, created = _upsert_template_with_connection(conn, data)
        return jsonify({"template": template, "created": created})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao salvar template: {exc}"}), 500


@app.route("/templates/bulk", methods=["POST"])
@_json_auth_required()
def save_templates_bulk(current_user):
    data = request.get_json(silent=True) or {}
    items = data.get("templates")
    if not isinstance(items, list):
        return jsonify({"error": "Campo templates deve ser uma lista."}), 400
    if len(items) > 1000:
        return jsonify({"error": "Limite excedido. Envie no máximo 1000 templates por requisição."}), 413

    saved = []
    created_count = 0
    updated_count = 0
    invalid_count = 0
    errors = []

    try:
        with _db_connect() as conn:
            for index, item in enumerate(items):
                try:
                    template, created = _upsert_template_with_connection(conn, item)
                    saved.append(template)
                    if created:
                        created_count += 1
                    else:
                        updated_count += 1
                except ValueError as exc:
                    invalid_count += 1
                    errors.append({"index": index, "error": str(exc)})
                except sqlite3.Error as exc:
                    invalid_count += 1
                    errors.append({"index": index, "error": str(exc)})

        response = {
            "templates": saved,
            "created": created_count,
            "updated": updated_count,
            "invalid": invalid_count,
        }
        if errors:
            response["errors"] = errors[:25]
        return jsonify(response)
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao salvar templates em lote: {exc}"}), 500


@app.route("/reports", methods=["GET"])
@_json_auth_required()
def list_reports(current_user):
    try:
        raw_limit = request.args.get("limit", "20")
        try:
            limit = int(raw_limit)
        except (TypeError, ValueError):
            limit = 20
        limit = max(1, min(limit, 100))

        with _db_connect() as conn:
            if _is_admin_user(current_user):
                rows = conn.execute(
                    """
                    SELECT * FROM reports
                    ORDER BY updated_at DESC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM reports
                    WHERE created_by_user_id = ?
                    ORDER BY updated_at DESC
                    LIMIT ?
                    """,
                    (current_user["id"], limit),
                ).fetchall()
        return jsonify({"reports": [_report_row_to_json(row) for row in rows]})
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao listar laudos: {exc}"}), 500


@app.route("/reports", methods=["POST"])
@_json_auth_required()
def save_report(current_user):
    data = request.get_json(silent=True) or {}
    try:
        with _db_connect() as conn:
            report, created = _upsert_report_with_connection(conn, data, current_user=current_user)
        return jsonify({"report": report, "created": created})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao salvar laudo: {exc}"}), 500


@app.route("/reports/export-pdf", methods=["POST"])
@_json_auth_required()
def export_report_pdf(current_user):
    data = request.get_json(silent=True) or {}
    try:
        sanitized_payload = _clean_report_payload(data, current_user=current_user)
        pdf_payload = {
            "id": sanitized_payload["id"],
            "mode": sanitized_payload["mode"],
            "region": sanitized_payload["region"],
            "contrast": sanitized_payload["contrast"],
            "status": sanitized_payload["status"],
            "fields": sanitized_payload["fields"],
            "finalText": sanitized_payload["final_text"],
        }
        pdf_buffer = _build_report_pdf_bytes(pdf_payload)
        filename = _report_filename(pdf_payload)
        return send_file(
            pdf_buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=filename,
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao preparar PDF: {exc}"}), 500
    except Exception as exc:
        return jsonify({"error": f"Erro ao gerar PDF: {exc}"}), 500


@app.route("/api-keys", methods=["POST"])
@_json_auth_required("admin")
def save_global_api_key(current_user):
    data = request.get_json(silent=True) or {}
    provider = _normalize_provider(data.get("provider"))
    api_key = str(data.get("apiKey", "")).strip()
    if provider not in API_KEY_PROVIDERS:
        return jsonify({"error": "Provedor inválido. Use openai ou gemini."}), 400
    if not api_key:
        return jsonify({"error": "API key é obrigatória."}), 400

    try:
        _save_global_api_key(provider, api_key)
        status = _global_api_key_status()
        return jsonify({"ok": True, "status": status})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao salvar API key global: {exc}"}), 500


@app.route("/api-keys/status", methods=["GET"])
@_json_auth_required("admin")
def global_api_key_status(current_user):
    try:
        return jsonify(_global_api_key_status())
    except sqlite3.Error as exc:
        return jsonify({"error": f"Erro ao consultar status das API keys: {exc}"}), 500


@app.route("/generate", methods=["POST"])
@_json_auth_required()
def generate_report(current_user):
    try:
        data = request.get_json(silent=True) or {}
        saved_ai_settings = _get_default_ai_settings()
        if _is_admin_user(current_user):
            provider = _normalize_provider(data.get("provider") or saved_ai_settings["provider"])
            model = str(data.get("model", "") or saved_ai_settings["model"]).strip()
            base_url = str(data.get("baseUrl", "") or saved_ai_settings["baseUrl"]).strip()
            api_key = _resolve_api_key(provider, data.get("apiKey", ""))
        else:
            provider = saved_ai_settings["provider"]
            model = saved_ai_settings["model"]
            base_url = saved_ai_settings["baseUrl"]
            api_key = _get_global_api_key(provider) if provider in API_KEY_PROVIDERS else ""
        payload = data.get("payload", {}) or {}

        if not model:
            return jsonify({"error": "Modelo não informado."}), 400

        if provider in ("openai", "gemini") and not api_key:
            return jsonify({
                "error": "API Key é obrigatória para API externa.",
                "detail": "Salve a API key global no servidor para este provedor.",
            }), 400

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
        request_prompt = str(payload.get("requestPrompt", "") or "").strip()
        resolved_mode, resolved_region = _infer_mode_region_from_request(request_prompt, mode, region)

        system_prompt = (
            "Você é um radiologista senior experiente. Sua função é gerar laudos precisos e objetivos "
            "para as modalidades de TC e RM. Organize as frases para que o médico solicitante tenha "
            "clareza na descrição do laudo. "
            "Retorne APENAS um JSON válido com as chaves: technique, findings, impression. "
            "A chave findings representa o conteúdo da seção LAUDO. "
            "Cada valor deve conter apenas o conteúdo da sua seção, sem títulos ou rótulos. "
            "Mantenha o padrão em 3 seções: Técnica, Laudo e Impressão. "
            "A impressão deve ser coerente e derivada exclusivamente dos achados apresentados "
            "(se a impressão ditada estiver vazia ou incompleta, sintetize a partir dos achados). "
            "Evite inventar achados não mencionados; se faltar informação, use linguagem cautelosa. "
            "Quando houver solicitação explícita de laudo padrão/modelo, você pode gerar um texto-base "
            "coerente com a modalidade e com o cenário clínico solicitado. "
            "NÃO escreva frases metalinguísticas como 'laudo elaborado conforme solicitação'. "
            "NÃO use markdown, não use bloco de código, e não inclua texto fora do JSON."
        )

        request_block = ""
        if request_prompt:
            request_block = (
                "Solicitação específica do usuário para este laudo:\n"
                f"- {request_prompt}\n\n"
            )

        user_prompt = (
            "Contexto do exame:\n"
            f"- Modalidade: {resolved_mode}\n"
            f"- Região: {resolved_region}\n"
            f"- Contraste: {contrast}\n\n"
            f"{request_block}"
            "Frases ditadas pelo médico (podem estar incompletas):\n"
            f"- Indicação clínica: {dictation.get('indication', '')}\n"
            f"- Informações adicionais: {dictation.get('extraInfo', '')}\n"
            f"- Técnica ditada: {dictation.get('technique', '')}\n"
            f"- Laudo ditado: {dictation.get('findings', '')}\n"
            f"- Impressão ditada: {dictation.get('impression', '')}\n\n"
            "Transforme essas frases em um laudo coeso, preservando o conteúdo dito. "
            "Se houver solicitação específica acima, priorize-a na construção do laudo."
        )

        base_clean = base_url.rstrip("/")
        url = base_clean + "/chat/completions"
        responses_url = base_clean + "/responses"
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
        }
        if provider == "openai":
            body["max_completion_tokens"] = 900
        else:
            body["max_tokens"] = 900

        response = requests.post(url, headers=headers, json=body, timeout=90)
        response_mode = "chat_completions"
        if response.status_code == 400:
            retry_body = None
            try:
                error_payload = response.json()
            except ValueError:
                error_payload = {}

            error_obj = error_payload.get("error") if isinstance(error_payload, dict) else {}
            if isinstance(error_obj, dict):
                param_name = str(error_obj.get("param", "") or "").strip().lower()
                message = str(error_obj.get("message", "") or "").lower()
                unsupported_tokens = "unsupported parameter" in message and (
                    "max_tokens" in message or "max_completion_tokens" in message
                )

                if param_name == "max_tokens" or ("max_tokens" in message and unsupported_tokens):
                    retry_body = dict(body)
                    retry_body.pop("max_tokens", None)
                    retry_body["max_completion_tokens"] = 900
                elif param_name == "max_completion_tokens" or ("max_completion_tokens" in message and unsupported_tokens):
                    retry_body = dict(body)
                    retry_body.pop("max_completion_tokens", None)
                    retry_body["max_tokens"] = 900
                elif param_name == "temperature" or ("unsupported parameter" in message and "temperature" in message):
                    retry_body = dict(body)
                    retry_body.pop("temperature", None)

            if retry_body is not None:
                response = requests.post(url, headers=headers, json=retry_body, timeout=90)

        # Modelos mais novos da OpenAI (ex.: GPT-5.x) podem exigir o endpoint /responses.
        if provider == "openai" and not response.ok:
            try:
                chat_error_payload = response.json()
            except ValueError:
                chat_error_payload = {}

            if _requires_responses_api(chat_error_payload):
                responses_body = {
                    "model": model,
                    "input": [
                        {
                            "role": "system",
                            "content": [{"type": "input_text", "text": system_prompt}],
                        },
                        {
                            "role": "user",
                            "content": [{"type": "input_text", "text": user_prompt}],
                        },
                    ],
                    "max_output_tokens": 900,
                    "temperature": 0.2,
                }
                response = requests.post(responses_url, headers=headers, json=responses_body, timeout=90)
                response_mode = "responses"

                if response.status_code == 400:
                    retry_responses_body = None
                    try:
                        responses_error_payload = response.json()
                    except ValueError:
                        responses_error_payload = {}
                    responses_error = _extract_provider_error(responses_error_payload)
                    param_name = str(responses_error.get("param", "") or "").strip().lower()
                    message = str(responses_error.get("message", "") or "").lower()
                    if param_name == "temperature" or ("unsupported parameter" in message and "temperature" in message):
                        retry_responses_body = dict(responses_body)
                        retry_responses_body.pop("temperature", None)
                    elif param_name == "max_output_tokens" or ("unsupported parameter" in message and "max_output_tokens" in message):
                        retry_responses_body = dict(responses_body)
                        retry_responses_body.pop("max_output_tokens", None)

                    if retry_responses_body is not None:
                        response = requests.post(responses_url, headers=headers, json=retry_responses_body, timeout=90)

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
        if response_mode == "responses":
            content = _extract_content_from_responses_api(data_out)
        else:
            try:
                content = data_out["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError):
                content = ""

        parsed = _extract_json_block(content)
        if not parsed:
            parsed = _extract_sections_from_text(content)

        parsed = _normalize_sections(parsed, content)
        enforced = _ensure_required_sections(
            parsed_sections=parsed,
            raw_content=content,
            mode=resolved_mode,
            region=resolved_region,
            contrast=contrast,
            dictation=dictation,
            request_prompt=request_prompt,
        )

        return jsonify({
            "technique": enforced.get("technique", ""),
            "laudo": enforced.get("findings", ""),
            "findings": enforced.get("findings", ""),  # Compatibilidade com frontend existente
            "impression": enforced.get("impression", ""),
            "resolvedMode": resolved_mode,
            "resolvedRegion": resolved_region,
        })
    except requests.RequestException as exc:
        return jsonify({"error": f"Erro ao chamar modelo: {exc}"}), 502
    except Exception as exc:
        return jsonify({"error": f"Erro interno no servidor: {exc}"}), 500


@app.route("/models", methods=["POST"])
@_json_auth_required()
def list_models(current_user):
    data = request.get_json(silent=True) or {}
    saved_ai_settings = _get_default_ai_settings()
    if _is_admin_user(current_user):
        provider = _normalize_provider(data.get("provider") or saved_ai_settings["provider"])
        base_url = str(data.get("baseUrl", "") or saved_ai_settings["baseUrl"]).strip()
        api_key = _resolve_api_key(provider, data.get("apiKey", ""))
        loaded_only = bool(data.get("loadedOnly"))
    else:
        provider = saved_ai_settings["provider"]
        base_url = saved_ai_settings["baseUrl"]
        model = str(saved_ai_settings["model"] or "").strip()
        if not model:
            return jsonify({"models": [], "warning": "O administrador ainda não definiu o modelo padrão."})
        return jsonify({"models": [model]})

    if provider in ("openai", "gemini") and not api_key:
        return jsonify({
            "error": "API Key é obrigatória para listar modelos.",
            "detail": "Salve a API key global no servidor para este provedor.",
        }), 400

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
    last_error = None
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
        except requests.RequestException as exc:
            last_error = {"status": "network", "detail": str(exc)}
            continue
        if not response.ok:
            detail = ""
            try:
                err_payload = response.json()
                if isinstance(err_payload, dict) and "error" in err_payload:
                    detail = err_payload["error"]
                else:
                    detail = err_payload
            except ValueError:
                detail = response.text[:400]
            last_error = {"status": response.status_code, "detail": detail}
            continue
        try:
            payload = response.json()
            if payload:
                used_url = url
                break
        except ValueError:
            last_error = {"status": response.status_code, "detail": "Resposta não JSON do provedor."}
            continue

    if payload is None:
        fallback_models = _default_models_for_provider(provider)
        if fallback_models:
            warning = "Não foi possível listar modelos em tempo real; usando lista padrão."
            if last_error:
                warning += f" Detalhe: {last_error.get('detail')}"
            return jsonify({"models": fallback_models, "warning": warning})
        return jsonify({
            "error": "Resposta inválida ao listar modelos.",
            "detail": last_error.get("detail") if isinstance(last_error, dict) else "",
        }), 502

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
    if not models and provider in ("openai", "gemini"):
        models = _default_models_for_provider(provider)
        warning = warning or "Não foi possível listar modelos em tempo real; usando lista padrão."
    models = sorted(set([m for m in models if m]))
    response = {"models": models}
    if warning:
        response["warning"] = warning
    return jsonify(response)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0").strip().lower() in ("1", "true", "yes", "on")
    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=debug)

