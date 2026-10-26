@echo off
set OLLAMA_API_BASE=http://127.0.0.1:11434
set OLLAMA_CONTEXT_LENGTH=8192
uv tool run --python 3.12 --from aider-chat aider --model ollama_chat/huihui_ai/qwen3-abliterated:8b --dark-mode --code-theme monokai
pause
