from typing import List, Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.core.executor import executor
from app.models.task import TaskInfo

router = APIRouter(prefix="/tasks", tags=["Tasks & Background Execution"])

@router.get("", response_model=List[TaskInfo])
def get_all_tasks(limit: int = 50):
    return executor.list_tasks(limit=limit)

@router.get("/{task_id}", response_model=TaskInfo)
def get_task_by_id(task_id: str):
    task = executor.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return task

@router.get("/{task_id}/log")
def get_task_raw_log(task_id: str):
    task = executor.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    if not task.log_file:
        raise HTTPException(status_code=404, detail="Nenhum arquivo de log associado a esta tarefa")
    
    from pathlib import Path
    from fastapi.responses import PlainTextResponse
    log_path = Path(task.log_file)
    if not log_path.exists():
        raise HTTPException(status_code=404, detail=f"Arquivo de log não encontrado em disco ({log_path})")

    try:
        content = log_path.read_text(encoding="utf-8")
        return PlainTextResponse(content=content, media_type="text/plain; charset=utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao ler arquivo de log: {e}")

@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str):
    success = await executor.cancel_task(task_id)
    if not success:
        raise HTTPException(status_code=400, detail="Não foi possível cancelar a tarefa (já terminada ou inexistente)")
    return {"message": "Tarefa cancelada com sucesso", "task_id": task_id}

@router.websocket("/ws/{task_id}")
async def websocket_task_logs(websocket: WebSocket, task_id: str):
    await websocket.accept()
    await executor.register_subscriber(websocket, task_id=task_id)
    try:
        while True:
            # Keep alive and receive any client ping
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        executor.unregister_subscriber(websocket, task_id=task_id)
    except Exception:
        executor.unregister_subscriber(websocket, task_id=task_id)

@router.websocket("/ws/stream/terminal")
async def websocket_global_terminal(websocket: WebSocket):
    await websocket.accept()
    await executor.register_subscriber(websocket, task_id=None)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        executor.unregister_subscriber(websocket, task_id=None)
    except Exception:
        executor.unregister_subscriber(websocket, task_id=None)
