# App de Laudos de Radiologia (TC/RM) - Web em Python

App web em Flask para laudos de tomografia e ressonancia com suporte a ditado por voz em pt-BR.

## Rodar local

1. Crie ambiente virtual e instale dependencias:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Inicie:
   ```bash
   python app.py
   ```

3. Acesse:
   `http://127.0.0.1:5000`

## Publicar na internet (Render)

Arquivos de deploy ja incluidos:
- `Procfile`
- `render.yaml`
- `requirements.txt` com `gunicorn`

Passo a passo:

1. Suba a pasta `radiologia_laudos_web_py` para um repositorio no GitHub.
2. No Render, clique em **New +** > **Blueprint**.
3. Conecte o repositorio.
4. O Render vai ler o `render.yaml` automaticamente.
5. Clique em **Apply** para criar o servico.
6. Ao finalizar o deploy, abra a URL publica gerada.

## Publicar com Docker (qualquer VPS/plataforma)

Arquivos de deploy Docker incluidos:
- `Dockerfile`
- `.dockerignore`

Build:
```bash
docker build -t radiologia-laudos-web .
```

Run:
```bash
docker run --rm -p 5000:5000 -e PORT=5000 radiologia-laudos-web
```

## Variaveis de ambiente

Use `.env.example` como base:

- `PORT` (padrao: `5000`)
- `FLASK_DEBUG` (padrao: `0`)
- `TEMPLATE_DB_PATH` (padrao: `templates.db`)

## Observacoes

- O reconhecimento de voz depende da Web Speech API do navegador (Chrome ou Edge).
- Se nao houver suporte, o app segue funcionando com digitacao manual.
- O rascunho fica salvo no `localStorage` do navegador.
- Templates personalizados agora sao persistidos no servidor (SQLite), ficando acessiveis de qualquer computador apontando para o mesmo app.
- API keys de provedores externos (OpenAI/Gemini) podem ser salvas globalmente no servidor; o valor nao e retornado para o frontend.
- Use o botao de tema para alternar claro/escuro; a preferencia fica salva.
