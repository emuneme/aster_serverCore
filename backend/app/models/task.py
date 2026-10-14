from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class TaskLogMessage(BaseModel):
    timestamp: str
    stream: str  # stdout, stderr, system
    message: str

class TaskInfo(BaseModel):
    id: str
    command: str
    command_args: List[str] = Field(default_factory=list, description="Lista segura de argumentos passada ao subprocess_exec")
    description: str
    status: TaskStatus = TaskStatus.PENDING
    exit_code: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    log_file: Optional[str] = Field(default=None, description="Caminho do arquivo de log dedicado em disco")
    logs: List[str] = Field(default_factory=list)
