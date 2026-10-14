from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.system import router as system_router
from app.api.network import router as network_router
from app.api.samba import router as samba_router
from app.api.dhcp import router as dhcp_router
from app.api.firewall import router as firewall_router
from app.api.tasks import router as tasks_router
from app.api.wizard import router as wizard_router, websocket_wizard_execute
from app.api.auth import router as auth_router
from app.api.monitor import router as monitor_router, websocket_monitor_telemetry

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    print(f"🚀 SGLinux Backend iniciado - Modo Simulação: {settings.SIMULATION_MODE}")
    yield
    # Shutdown actions
    print("🛑 SGLinux Backend finalizado")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="API de Provisionamento e Gestão de Serviços de Infraestrutura no Ubuntu Server (Samba 4 AD DC, DHCP, BIND9, UFW).",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Service Routers under /api
app.include_router(auth_router, prefix="/api")
app.include_router(monitor_router, prefix="/api")
app.include_router(system_router, prefix="/api")
app.include_router(network_router, prefix="/api")
app.include_router(samba_router, prefix="/api")
app.include_router(dhcp_router, prefix="/api")
app.include_router(firewall_router, prefix="/api")
app.include_router(wizard_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")

# Also include tasks router at root for direct ws://.../ws/... connections
app.include_router(tasks_router)

# Direct websocket routes
from app.api.dhcp import websocket_dhcp_apply
app.add_api_websocket_route("/ws/dhcp/apply", websocket_dhcp_apply)
app.add_api_websocket_route("/ws/wizard/execute", websocket_wizard_execute)
app.add_api_websocket_route("/ws/monitor", websocket_monitor_telemetry)


# Health check
@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "simulation_mode": settings.SIMULATION_MODE
    }

# Mount frontend static files if built
frontend_dist = settings.PROJECT_ROOT / "frontend" / "dist"
if frontend_dist.exists():
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    from starlette.exceptions import HTTPException as StarletteHTTPException

    @app.exception_handler(StarletteHTTPException)
    async def spa_fallback_exception_handler(request, exc):
        if exc.status_code == 404:
            # Rotas de API, WebSocket, Docs e Health retornam 404 JSON normal
            path = request.url.path
            if path.startswith(("/api", "/ws", "/health", "/docs", "/openapi.json")):
                return JSONResponse(status_code=404, content={"detail": exc.detail or "Not Found"})
            index_path = frontend_dist / "index.html"
            if index_path.exists():
                return FileResponse(index_path)
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
else:
    @app.get("/", tags=["Root"])
    def root():
        return JSONResponse(
            content={
                "app": settings.PROJECT_NAME,
                "version": settings.VERSION,
                "docs": "/docs",
                "simulation_mode": settings.SIMULATION_MODE,
                "endpoints": [
                    "/api/system/info",
                    "/api/system/services",
                    "/api/network/interfaces",
                    "/api/network/netplan",
                    "/api/samba/status",
                    "/api/samba/provision",
                    "/api/dhcp/status",
                    "/api/dhcp/leases",
                    "/api/firewall/status",
                    "/api/tasks"
                ]
            }
        )
